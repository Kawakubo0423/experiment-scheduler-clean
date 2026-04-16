const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const NOTIFY_ADMIN_EMAIL = process.env.NOTIFY_ADMIN_EMAIL || "";
const MAIL_COLLECTION = process.env.MAIL_COLLECTION || "mail";

const PERIOD_LABELS = {
  p1: "1時限 09:00〜10:35",
  p2: "2時限 10:45〜12:20",
  p3: "3時限 13:10〜14:45",
  p4: "4時限 14:55〜16:30",
  p5: "5時限 16:40〜18:15",
  p6: "6時限 18:25〜20:00",
  p7: "7時限 20:10〜21:45",
};

function formatDateJP(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function getSlotMap(slotIds = []) {
  const uniqueIds = [...new Set(slotIds.filter(Boolean))];
  const docs = await Promise.all(uniqueIds.map((id) => db.collection("slots").doc(id).get()));
  const map = new Map();
  docs.forEach((snap) => {
    if (snap.exists) {
      map.set(snap.id, { id: snap.id, ...snap.data() });
    }
  });
  return map;
}

function slotToText(slot) {
  if (!slot) return "未設定の枠";
  const date = formatDateJP(slot.date);
  const period = PERIOD_LABELS[slot.periodKey] || slot.periodKey || "時限未設定";
  const location = slot.location ? ` / ${slot.location}` : "";
  return `${date} / ${period}${location}`;
}

async function enqueueMail({ to, subject, text, html }) {
  if (!to) return;

  await db.collection(MAIL_COLLECTION).add({
    to,
    message: {
      subject,
      text,
      html,
    },
    createdAt: FieldValue.serverTimestamp(),
  });
}

exports.notifyAdminOnNewRequest = onDocumentCreated("requests/{requestId}", async (event) => {
  const data = event.data?.data();
  if (!data || !NOTIFY_ADMIN_EMAIL) return;

  const preferredSlotIds = Array.isArray(data.preferredSlotIds) ? data.preferredSlotIds : [];
  const slotMap = await getSlotMap(preferredSlotIds);
  const preferredLines = preferredSlotIds.length
    ? preferredSlotIds.map((slotId, index) => `${index + 1}. ${slotToText(slotMap.get(slotId))}`)
    : ["希望枠なし"];

  const subject = `【実験日程予約】新しい申込が届きました（${data.name || "氏名未入力"}）`;

  const text = [
    "新しい申込が届きました。",
    "",
    `氏名: ${data.name || ""}`,
    `メール: ${data.email || ""}`,
    `所属・学年: ${data.affiliation || ""}`,
    `補足: ${data.note || "なし"}`,
    "",
    "希望枠:",
    ...preferredLines,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.7; color: #0f172a;">
      <h2 style="margin: 0 0 16px;">新しい申込が届きました</h2>
      <p><strong>氏名:</strong> ${escapeHtml(data.name || "")}</p>
      <p><strong>メール:</strong> ${escapeHtml(data.email || "")}</p>
      <p><strong>所属・学年:</strong> ${escapeHtml(data.affiliation || "")}</p>
      <p><strong>補足:</strong> ${escapeHtml(data.note || "なし")}</p>
      <div style="margin-top: 18px;">
        <strong>希望枠</strong>
        <ol style="margin-top: 8px; padding-left: 20px;">
          ${preferredLines.map((line) => `<li>${escapeHtml(line.replace(/^\d+\.\s*/, ""))}</li>`).join("")}
        </ol>
      </div>
    </div>
  `;

  await enqueueMail({
    to: NOTIFY_ADMIN_EMAIL,
    subject,
    text,
    html,
  });
});

exports.notifyParticipantOnAssignmentChanged = onDocumentUpdated("requests/{requestId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  if (!after.email) return;

  const beforeAssigned = before.assignedSlotId || "";
  const afterAssigned = after.assignedSlotId || "";

  if (beforeAssigned === afterAssigned) return;

  const slotMap = await getSlotMap([beforeAssigned, afterAssigned]);
  const beforeSlot = slotMap.get(beforeAssigned);
  const afterSlot = slotMap.get(afterAssigned);

  let subject = "";
  let text = "";
  let html = "";

  if (!beforeAssigned && afterAssigned) {
    subject = "【実験日程予約】日程が確定しました";
    text = [
      `${after.name || "参加者様"}`,
      "",
      "実験日程が確定しました。",
      `確定日時: ${slotToText(afterSlot)}`,
      "",
      "当日はお気をつけてお越しください。",
    ].join("\n");

    html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.7; color: #0f172a;">
        <p>${escapeHtml(after.name || "参加者様")}</p>
        <p>実験日程が確定しました。</p>
        <p><strong>確定日時:</strong> ${escapeHtml(slotToText(afterSlot))}</p>
        <p>当日はお気をつけてお越しください。</p>
      </div>
    `;
  } else if (beforeAssigned && afterAssigned) {
    subject = "【実験日程予約】日程が変更されました";
    text = [
      `${after.name || "参加者様"}`,
      "",
      "実験日程が変更されました。",
      `変更前: ${slotToText(beforeSlot)}`,
      `変更後: ${slotToText(afterSlot)}`,
      "",
      "ご確認をお願いします。",
    ].join("\n");

    html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.7; color: #0f172a;">
        <p>${escapeHtml(after.name || "参加者様")}</p>
        <p>実験日程が変更されました。</p>
        <p><strong>変更前:</strong> ${escapeHtml(slotToText(beforeSlot))}</p>
        <p><strong>変更後:</strong> ${escapeHtml(slotToText(afterSlot))}</p>
        <p>ご確認をお願いします。</p>
      </div>
    `;
  } else if (beforeAssigned && !afterAssigned) {
    subject = "【実験日程予約】日程を再調整しています";
    text = [
      `${after.name || "参加者様"}`,
      "",
      "現在、実験日程を再調整しています。",
      `直前の確定枠: ${slotToText(beforeSlot)}`,
      "新しい日程が決まり次第、あらためてご連絡します。",
    ].join("\n");

    html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.7; color: #0f172a;">
        <p>${escapeHtml(after.name || "参加者様")}</p>
        <p>現在、実験日程を再調整しています。</p>
        <p><strong>直前の確定枠:</strong> ${escapeHtml(slotToText(beforeSlot))}</p>
        <p>新しい日程が決まり次第、あらためてご連絡します。</p>
      </div>
    `;
  } else {
    return;
  }

  await enqueueMail({
    to: after.email,
    subject,
    text,
    html,
  });
});
