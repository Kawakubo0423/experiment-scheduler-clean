const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const NOTIFY_ADMIN_EMAIL = process.env.NOTIFY_ADMIN_EMAIL || "";
const MAIL_COLLECTION = process.env.MAIL_COLLECTION || "mail";
const FROM_ADDRESS = process.env.FROM_ADDRESS || "is0611xi@ed.ritsumei.ac.jp";
const FROM_NAME = process.env.FROM_NAME || "実験予約システム";
const REPLY_TO = process.env.REPLY_TO || "is0611xi@ed.ritsumei.ac.jp";

const CONTACT_TEXT = [
  "----------------------------------------------------------------------------------------",
  "立命館大学大学院（OIC）情報理工学研究科 修士2年",
  "プレイフルインタラクション研究室",
  "実験責任者: 川久保 空真（Kuma Kawakubo）",
  "問い合わせ先: is0611xi@ed.ritsumei.ac.jp",
].join("\\n");

const CONTACT_HTML = `
  <div style="margin-top: 28px;">
    <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 0 0 16px;" />
    <div style="font-size: 14px; line-height: 1.9; color: #334155;">
      立命館大学大学院（OIC）情報理工学研究科 修士2年<br/>
      プレイフルインタラクション研究室<br/>
      実験責任者: 川久保 空真（Kuma Kawakubo）<br/>
      問い合わせ先: <a href="mailto:is0611xi@ed.ritsumei.ac.jp" style="color:#2563eb; text-decoration:none;">is0611xi@ed.ritsumei.ac.jp</a>
    </div>
  </div>
`;

function withSignatureText(body) {
  return `${body}\\n\\n${CONTACT_TEXT}`;
}

function withSignatureHtml(body) {
  return `${body}${CONTACT_HTML}`;
}

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
    from: `${FROM_NAME} <${FROM_ADDRESS}>`,
    replyTo: REPLY_TO,
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
  const recipientName = after.name || "参加者様";

  let subject = "";
  let text = "";
  let html = "";

  if (!beforeAssigned && afterAssigned) {
    subject = "【実験日程予約】実験日程確定のご連絡";
    text = withSignatureText([
      `${recipientName} さん`,
      "",
      "このたびは実験へのご協力ありがとうございます。",
      "以下の通り、参加日程が確定しましたのでご連絡いたします。",
      "",
      `【確定日時】 ${slotToText(afterSlot)}`,
      "",
      "ご都合をご確認のうえ、ご参加をお願いいたします。",
      "ご不明な点やご都合の変更がありましたら、本メールへの返信にてご連絡ください。",
      "",
      "どうぞよろしくお願いいたします。",
    ].join("\\n"));

    html = withSignatureHtml(`
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.8; color: #0f172a;">
        <p>${escapeHtml(recipientName)} さん</p>
        <p>このたびは実験へのご協力ありがとうございます。<br/>以下の通り、参加日程が確定しましたのでご連絡いたします。</p>
        <div style="margin: 16px 0; padding: 14px 16px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0;">
          <strong>【確定日時】</strong><br/>
          ${escapeHtml(slotToText(afterSlot))}
        </div>
        <p>ご都合をご確認のうえ、ご参加をお願いいたします。<br/>ご不明な点やご都合の変更がありましたら、本メールへの返信にてご連絡ください。</p>
        <p>どうぞよろしくお願いいたします。</p>
      </div>
    `);
  } else if (beforeAssigned && afterAssigned) {
    subject = "【実験日程予約】参加日程変更のご連絡";
    text = withSignatureText([
      `${recipientName} さん`,
      "",
      "実験日程について変更がありましたので、ご連絡いたします。",
      "以下の内容をご確認ください。",
      "",
      `【変更前】 ${slotToText(beforeSlot)}`,
      `【変更後】 ${slotToText(afterSlot)}`,
      "",
      "お手数をおかけしますが、ご確認をお願いいたします。",
      "ご都合が合わない場合やご不明点がある場合は、本メールへの返信にてご連絡ください。",
      "",
      "どうぞよろしくお願いいたします。",
    ].join("\\n"));

    html = withSignatureHtml(`
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.8; color: #0f172a;">
        <p>${escapeHtml(recipientName)} さん</p>
        <p>実験日程について変更がありましたので、ご連絡いたします。<br/>以下の内容をご確認ください。</p>
        <div style="margin: 16px 0; padding: 14px 16px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0;">
          <div><strong>【変更前】</strong> ${escapeHtml(slotToText(beforeSlot))}</div>
          <div style="margin-top: 8px;"><strong>【変更後】</strong> ${escapeHtml(slotToText(afterSlot))}</div>
        </div>
        <p>お手数をおかけしますが、ご確認をお願いいたします。<br/>ご都合が合わない場合やご不明点がある場合は、本メールへの返信にてご連絡ください。</p>
        <p>どうぞよろしくお願いいたします。</p>
      </div>
    `);
  } else if (beforeAssigned && !afterAssigned) {
    subject = "【実験日程予約】参加日程再調整のお願い";
    text = withSignatureText([
      `${recipientName} さん`,
      "",
      "実験日程について再調整が必要となりましたため、ご連絡いたします。",
      "現在、確定済みだった日程をいったん見直しております。",
      "",
      `【直前の確定日時】 ${slotToText(beforeSlot)}`,
      "",
      "新しい日程が決まり次第、あらためてご連絡いたします。",
      "ご迷惑をおかけして申し訳ありませんが、どうぞよろしくお願いいたします。",
    ].join("\\n"));

    html = withSignatureHtml(`
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.8; color: #0f172a;">
        <p>${escapeHtml(recipientName)} さん</p>
        <p>実験日程について再調整が必要となりましたため、ご連絡いたします。<br/>現在、確定済みだった日程をいったん見直しております。</p>
        <div style="margin: 16px 0; padding: 14px 16px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0;">
          <strong>【直前の確定日時】</strong><br/>
          ${escapeHtml(slotToText(beforeSlot))}
        </div>
        <p>新しい日程が決まり次第、あらためてご連絡いたします。<br/>ご迷惑をおかけして申し訳ありませんが、どうぞよろしくお願いいたします。</p>
      </div>
    `);
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
