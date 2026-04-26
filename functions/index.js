const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();

const NOTIFY_ADMIN_EMAIL = process.env.NOTIFY_ADMIN_EMAIL || "";
const MAIL_COLLECTION = process.env.MAIL_COLLECTION || "mail";
const FROM_ADDRESS = process.env.FROM_ADDRESS || "is0611xi@ed.ritsumei.ac.jp";
const FROM_NAME = process.env.FROM_NAME || "実験予約システム";
const REPLY_TO = process.env.REPLY_TO || "is0611xi@ed.ritsumei.ac.jp";
const APP_BASE_URL = process.env.APP_BASE_URL || "";
const PARTICIPANT_CONFIRM_ENDPOINT_URL = process.env.PARTICIPANT_CONFIRM_ENDPOINT_URL || "";
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || "";
const LINE_CHANGE_SESSION_TTL_MINUTES = 30;

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

const PERIOD_SHORT_LABELS = {
  p1: "1時限",
  p2: "2時限",
  p3: "3時限",
  p4: "4時限",
  p5: "5時限",
  p6: "6時限",
  p7: "7時限",
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

function formatDateShortJP(dateString) {
  if (!dateString) return "日付未定";

  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`;
}

function slotToShortText(slot) {
  if (!slot) return "未確定";

  const date = formatDateShortJP(slot.date);
  const period = PERIOD_SHORT_LABELS[slot.periodKey] || slot.periodKey || "時限未定";
  return `${date} ${period}`;
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

function buildParticipantResponseUrl(token, action) {
  if (!APP_BASE_URL || !token) return "";

  const normalizedBase = APP_BASE_URL.endsWith("/") ? APP_BASE_URL.slice(0, -1) : APP_BASE_URL;
  return `${normalizedBase}/?token=${encodeURIComponent(token)}&action=${encodeURIComponent(action)}`;
}

function buildParticipantDirectConfirmUrl(token) {
  if (PARTICIPANT_CONFIRM_ENDPOINT_URL && token) {
    const separator = PARTICIPANT_CONFIRM_ENDPOINT_URL.includes("?") ? "&" : "?";
    return `${PARTICIPANT_CONFIRM_ENDPOINT_URL}${separator}token=${encodeURIComponent(token)}`;
  }
  return buildParticipantResponseUrl(token, "confirm");
}

function buildParticipantResponseLinks(token) {
  return {
    confirmUrl: buildParticipantDirectConfirmUrl(token),
    changeUrl: buildParticipantResponseUrl(token, "change"),
  };
}

function responseLinksTextBlock(links) {
  if (!links.confirmUrl && !links.changeUrl) return "";

  return [
    "",
    "【ご対応のお願い】",
    "以下のURLから、日程を確認したことの登録、または変更希望の送信ができます。確認ボタンは押した時点で登録が完了します。",
    links.confirmUrl ? `この日程で確認しました: ${links.confirmUrl}` : null,
    links.changeUrl ? `変更を希望する: ${links.changeUrl}` : null,
    "",
  ].filter(Boolean).join("\n");
}

function responseLinksHtmlBlock(links) {
  if (!links.confirmUrl && !links.changeUrl) return "";

  return `
    <div style="margin-top: 20px; padding: 16px; border: 1px solid #bfdbfe; background: #eff6ff; border-radius: 16px;">
      <div style="font-weight: 700; color: #1e3a8a; margin-bottom: 10px;">【ご対応のお願い】</div>
      <p style="margin: 0 0 14px; color: #1e40af;">以下のボタンから、日程を確認したことの登録、または変更希望の送信ができます。青い確認ボタンは押した時点で登録が完了します。</p>
      <div style="display:flex; flex-wrap:wrap; gap:10px;">
        ${links.confirmUrl ? `<a href="${escapeHtml(links.confirmUrl)}" style="display:inline-block; padding:12px 16px; border-radius:12px; background:#2563eb; color:#ffffff; text-decoration:none; font-weight:700;">この日程で確認しました</a>` : ""}
        ${links.changeUrl ? `<a href="${escapeHtml(links.changeUrl)}" style="display:inline-block; padding:12px 16px; border-radius:12px; background:#ffffff; color:#b91c1c; border:1px solid #fecaca; text-decoration:none; font-weight:600;">変更を希望する</a>` : ""}
      </div>
      <p style="margin: 14px 0 0; font-size: 13px; line-height: 1.8; color: #475569;">連絡メールは迷惑メールに入る場合があります。受信箱だけでなく、迷惑メールもこまめに確認してください。</p>
    </div>
  `;
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

function verifyLineSignature(req) {
  if (!LINE_CHANNEL_SECRET) return false;

  const signature = req.get("x-line-signature") || "";
  if (!signature || !req.rawBody) return false;

  const hash = crypto
    .createHmac("sha256", LINE_CHANNEL_SECRET)
    .update(req.rawBody)
    .digest("base64");

  const expected = Buffer.from(hash);
  const received = Buffer.from(signature);

  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

function normalizeLineLinkCode(text = "") {
  return String(text)
    .trim()
    .replace(/^予約コード[:：]\s*/i, "")
    .replace(/^連携コード[:：]\s*/i, "")
    .replace(/^LINE連携コード[:：]\s*/i, "")
    .replace(/\s/g, "")
    .toUpperCase();
}

function isLikelyLineLinkCode(code = "") {
  return /^[A-Z2-9]{8}$/.test(String(code || ""));
}

function buildUnknownLineMessage() {
  return [
    "メッセージを確認しましたが、操作内容を判別できませんでした。",
    "以下のいずれかを送信してください。",
    "",
    "🗓️ 予約状況：連携中の申込を確認できます。",
    "🙋 変更希望：変更希望を送る申込を選べます。",
    "🔕 LINE連携解除：LINE通知を停止する申込を選べます。",
    "",
    "新しくLINE連携する場合は、予約サイトの申込完了画面に表示された8桁の連携コードを送信してください。",
  ].join("\n");
}


async function replyLineMessage(replyToken, messages) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !replyToken || !Array.isArray(messages) || messages.length === 0) return;

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("LINE reply failed:", response.status, errorText);
  }
}

async function pushLineMessage(lineUserId, messages) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !lineUserId || !Array.isArray(messages) || messages.length === 0) return;

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("LINE push failed:", response.status, errorText);
  }
}

async function getLineProfile(lineUserId) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !lineUserId) return null;

  const response = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("LINE profile failed:", response.status, errorText);
    return null;
  }

  return response.json();
}

function canSendLine(requestData) {
  return Boolean(requestData?.lineNotifyEnabled && requestData?.lineUserId);
}

function buildLinePostbackData({ action, requestId, token }) {
  const params = new URLSearchParams();
  params.set("action", action || "");
  params.set("requestId", requestId || "");
  params.set("token", token || "");
  return params.toString();
}

function parseLinePostbackData(data = "") {
  const params = new URLSearchParams(String(data || ""));
  return {
    action: params.get("action") || "",
    requestId: params.get("requestId") || "",
    token: params.get("token") || "",
  };
}

function getLineSessionExpiresAt() {
  return Timestamp.fromDate(new Date(Date.now() + LINE_CHANGE_SESSION_TTL_MINUTES * 60 * 1000));
}

function isExpiredLineSession(sessionData = {}) {
  const expiresAt = sessionData.expiresAt;
  return Boolean(expiresAt && typeof expiresAt.toMillis === "function" && expiresAt.toMillis() < Date.now());
}

async function markParticipantResponseInvalid(token) {
  if (!token) return;
  await db.collection("participantResponses").doc(token).set({
    participantConfirmationStatus: "invalid",
    participantResponseNote: "この申込は管理者により削除されたか、無効になりました。",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function getValidLineLinkedRequest({ requestId, token, lineUserId }) {
  if (!requestId || !token || !lineUserId) {
    return { ok: false, reason: "missing" };
  }

  const requestRef = db.collection("requests").doc(requestId);
  const requestSnap = await requestRef.get();

  if (!requestSnap.exists) {
    await markParticipantResponseInvalid(token);
    return { ok: false, reason: "deleted" };
  }

  const requestData = requestSnap.data() || {};

  if ((requestData.participantResponseToken || "") !== token) {
    return { ok: false, reason: "token_mismatch" };
  }

  if (!requestData.lineNotifyEnabled || !requestData.lineUserId) {
    return { ok: false, reason: "line_not_linked" };
  }

  if (requestData.lineUserId !== lineUserId) {
    return { ok: false, reason: "line_user_mismatch" };
  }

  const responseRef = db.collection("participantResponses").doc(token);
  const responseSnap = await responseRef.get();

  if (!responseSnap.exists) {
    return { ok: false, reason: "response_not_found" };
  }

  const responseData = responseSnap.data() || {};

  if ((responseData.requestId || "") !== requestId) {
    return { ok: false, reason: "response_request_mismatch" };
  }

  if ((responseData.participantConfirmationStatus || "pending") === "invalid") {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, requestRef, requestData, responseRef, responseData };
}

function lineInvalidRequestMessage(reason = "") {
  if (reason === "line_user_mismatch") {
    return "この操作は、別のLINEアカウントに連携されている申込には使用できません。心当たりがない場合は、実験担当者へメールでお問い合わせください。";
  }

  if (reason === "deleted" || reason === "invalid") {
    return "この申込はすでに無効になっています。確認や変更希望は登録されません。あらためて参加を希望する場合は、予約サイトから再度お申し込みください。";
  }

  return "この申込を確認できませんでした。古いLINE通知の可能性があります。最新の案内をご確認いただくか、実験担当者へメールでお問い合わせください。";
}

async function handleLineConfirmPostback({ lineUserId, replyToken, requestId, token }) {
  const valid = await getValidLineLinkedRequest({ requestId, token, lineUserId });

  if (!valid.ok) {
    await replyLineMessage(replyToken, [{ type: "text", text: lineInvalidRequestMessage(valid.reason) }]);
    return;
  }

  await valid.responseRef.set({
    participantConfirmationStatus: "confirmed",
    participantResponseNote: "",
    participantRespondedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection("lineSessions").doc(lineUserId).delete().catch(() => {});

  await replyLineMessage(replyToken, [
    {
      type: "text",
      text: "✅ この日程で確認済みとして登録しました。ご対応ありがとうございます。",
    },
  ]);
}

async function handleLineStartChangeRequestPostback({ lineUserId, replyToken, requestId, token }) {
  const valid = await getValidLineLinkedRequest({ requestId, token, lineUserId });

  if (!valid.ok) {
    await replyLineMessage(replyToken, [{ type: "text", text: lineInvalidRequestMessage(valid.reason) }]);
    return;
  }

  const assignedSlot = {
    id: valid.responseData.assignedSlotId || "",
    date: valid.responseData.assignedDate || "",
    periodKey: valid.responseData.assignedPeriodKey || "",
    location: valid.responseData.assignedLocation || "",
    note: valid.responseData.assignedNote || "",
  };

  await db.collection("lineSessions").doc(lineUserId).set({
    mode: "waiting_change_request_note",
    requestId,
    token,
    lineUserId,
    name: valid.requestData.name || "",
    assignedSlotText: slotToText(assignedSlot),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    expiresAt: getLineSessionExpiresAt(),
  }, { merge: true });

  await replyLineMessage(replyToken, [
    {
      type: "text",
      text: [
        "🙋 変更希望を受け付けます。",
        "",
        `対象日程：${slotToText(assignedSlot)}`,
        "",
        "変更を希望する理由や、参加できる候補日時をこのトークに送ってください。",
        "例：別日の午後を希望します。",
        `※${LINE_CHANGE_SESSION_TTL_MINUTES}分以内に送信してください。中止する場合は「キャンセル」と送ってください。`,
      ].join("\n"),
    },
  ]);
}

async function handleLineWaitingChangeRequestNote({ lineUserId, replyToken, text }) {
  if (!lineUserId) return false;

  const sessionRef = db.collection("lineSessions").doc(lineUserId);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) return false;

  const sessionData = sessionSnap.data() || {};

  if (sessionData.mode !== "waiting_change_request_note") {
    await sessionRef.delete().catch(() => {});
    return false;
  }

  const trimmedText = String(text || "").trim();

  if (isExpiredLineSession(sessionData)) {
    await sessionRef.delete().catch(() => {});
    await replyLineMessage(replyToken, [
      {
        type: "text",
        text: "変更希望の入力時間が過ぎたため、受付を中止しました。もう一度「変更希望」メニューからやり直してください。",
      },
    ]);
    return true;
  }

  if (["キャンセル", "中止", "cancel", "Cancel", "CANCEL"].includes(trimmedText)) {
    await sessionRef.delete().catch(() => {});
    await replyLineMessage(replyToken, [
      {
        type: "text",
        text: "変更希望の入力をキャンセルしました。",
      },
    ]);
    return true;
  }

  if (!trimmedText) {
    await replyLineMessage(replyToken, [
      {
        type: "text",
        text: "変更希望の内容が空になっています。変更を希望する理由や、参加できる候補日時を文章で送ってください。",
      },
    ]);
    return true;
  }

  const valid = await getValidLineLinkedRequest({
    requestId: sessionData.requestId || "",
    token: sessionData.token || "",
    lineUserId,
  });

  if (!valid.ok) {
    await sessionRef.delete().catch(() => {});
    await replyLineMessage(replyToken, [{ type: "text", text: lineInvalidRequestMessage(valid.reason) }]);
    return true;
  }

  const note = trimmedText.slice(0, 1000);

  await valid.responseRef.set({
    participantConfirmationStatus: "change_requested",
    participantResponseNote: note,
    participantRespondedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await sessionRef.delete().catch(() => {});

  await replyLineMessage(replyToken, [
    {
      type: "text",
      text: [
        "✅ 変更希望を受け付けました。",
        "管理者に内容を通知します。",
        "",
        "【送信内容】",
        note,
      ].join("\n"),
    },
  ]);

  return true;
}


function normalizeLineCommand(text = "") {
  return String(text || "")
    .trim()
    .replace(/\s/g, "")
    .toLowerCase();
}

function isLineStatusCommand(text = "") {
  const command = normalizeLineCommand(text);
  return ["予約状況", "状況", "予約確認", "日程確認", "status"].includes(command);
}

function isLineUnlinkCommand(text = "") {
  const command = normalizeLineCommand(text);
  return ["line連携解除", "連携解除", "解除", "通知解除", "line解除", "unlink"].includes(command);
}

function isLineHelpCommand(text = "") {
  const command = normalizeLineCommand(text);
  return ["ヘルプ", "help", "メニュー", "使い方", "問い合わせ", "問合せ"].includes(command);
}

function isLineChangeRequestCommand(text = "") {
  const command = normalizeLineCommand(text);
  return ["変更希望", "日程変更", "変更", "change"].includes(command);
}

function participantStatusLabel(status = "") {
  if (status === "confirmed") return "確認済み";
  if (status === "change_requested") return "変更希望あり";
  if (status === "invalid") return "無効";
  return "未確認";
}

function participantStatusGuide(status = "") {
  if (status === "confirmed") return "必要に応じて変更希望を送れます";
  if (status === "change_requested") return "変更希望を送信済みです";
  if (status === "invalid") return "この申込は無効です";
  return "確認待ちです";
}

function safeLineText(value = "", maxLength = 300) {
  const text = String(value || "").replace(/[\r\n]+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

async function getLineLinkedRequests(lineUserId) {
  if (!lineUserId) return [];

  const idSet = new Set();

  const lineUserSnap = await db.collection("lineUsers").doc(lineUserId).get();
  const lineUserData = lineUserSnap.exists ? (lineUserSnap.data() || {}) : {};
  const linkedRequestIds = Array.isArray(lineUserData.linkedRequestIds) ? lineUserData.linkedRequestIds : [];
  linkedRequestIds.filter(Boolean).forEach((id) => idSet.add(id));

  const byLineUserSnap = await db
    .collection("requests")
    .where("lineUserId", "==", lineUserId)
    .limit(30)
    .get();
  byLineUserSnap.docs.forEach((docSnap) => idSet.add(docSnap.id));

  const requestDocs = await Promise.all(
    [...idSet].map(async (requestId) => {
      const snap = await db.collection("requests").doc(requestId).get();
      return snap.exists ? { id: snap.id, data: snap.data() || {} } : null;
    })
  );

  const activeRequests = requestDocs
    .filter(Boolean)
    .filter((item) => item.data.lineUserId === lineUserId && item.data.lineNotifyEnabled === true);

  const slotIds = activeRequests.map((item) => item.data.assignedSlotId || "").filter(Boolean);
  const slotMap = await getSlotMap(slotIds);

  return activeRequests
    .map((item) => ({
      ...item,
      slot: item.data.assignedSlotId ? slotMap.get(item.data.assignedSlotId) : null,
    }))
    .sort((a, b) => {
      const aSlotDate = a.slot?.date || "9999-12-31";
      const bSlotDate = b.slot?.date || "9999-12-31";
      if (aSlotDate !== bSlotDate) return aSlotDate.localeCompare(bSlotDate);

      const aTime = a.data.createdAt?.toMillis?.() || 0;
      const bTime = b.data.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
}

function buildReservationStatusLines(items = []) {
  if (!items.length) {
    return [
      "現在、このLINEアカウントに連携されている申込はありません。",
      "予約サイトで申込後に表示される8桁のLINE連携コードを送信すると、LINE通知を受け取れるようになります。",
    ].join("\n");
  }

  return "🗓️ 現在、このLINEアカウントに連携されている申込は以下です。";
}

function buildRequestTitleForLine(item, mode = "status") {
  const data = item?.data || {};
  const name = data.name || "参加者";
  const shortSlot = data.assignedSlotId ? slotToShortText(item.slot) : "未確定";

  if (mode === "change") return safeLineText(`${shortSlot} / 変更希望`, 40);
  if (mode === "unlink") return safeLineText(`${shortSlot} / 連携解除`, 40);
  return safeLineText(`${shortSlot} / ${name}さん`, 40);
}

function buildRequestSummaryForLine(item, mode = "status") {
  const data = item?.data || {};
  const assignedText = data.assignedSlotId ? slotToText(item.slot) : "未確定";
  const status = data.participantConfirmationStatus || "pending";

  if (mode === "change") {
    return safeLineText(`対象：${data.name || "参加者"}さん\n日程：${assignedText}`, 58);
  }

  if (mode === "unlink") {
    return safeLineText(`対象：${data.name || "参加者"}さん\n解除してもメール通知は届きます`, 58);
  }

  return safeLineText(`状態：${participantStatusLabel(status)}（${participantStatusGuide(status)}）\n日程：${assignedText}`, 58);
}

function buildRequestActionColumns(items = [], mode = "status") {
  return items.slice(0, 10).map((item) => {
    const data = item.data || {};
    const token = data.participantResponseToken || "";
    const status = data.participantConfirmationStatus || "pending";
    const hasAssignedSlot = Boolean(data.assignedSlotId && token);
    const actions = [];

    if (mode === "unlink") {
      actions.push({
        type: "postback",
        label: "この連携を解除",
        data: buildLinePostbackData({ action: "unlink_confirm", requestId: item.id, token }),
        displayText: "この申込のLINE連携を解除します",
      });
    } else if (mode === "change") {
      if (hasAssignedSlot) {
        actions.push({
          type: "postback",
          label: "変更希望を送る",
          data: buildLinePostbackData({ action: "start_change_request", requestId: item.id, token }),
          displayText: "変更希望を送ります",
        });
      }
    } else {
      if (hasAssignedSlot && status !== "confirmed") {
        actions.push({
          type: "postback",
          label: "この日程で確認",
          data: buildLinePostbackData({ action: "confirm", requestId: item.id, token }),
          displayText: "この日程で確認します",
        });
      }

      if (hasAssignedSlot) {
        actions.push({
          type: "postback",
          label: status === "change_requested" ? "変更希望を再送" : "変更を希望する",
          data: buildLinePostbackData({ action: "start_change_request", requestId: item.id, token }),
          displayText: "変更希望を送ります",
        });
      }

      actions.push({
        type: "postback",
        label: "LINE連携解除",
        data: buildLinePostbackData({ action: "unlink_confirm", requestId: item.id, token }),
        displayText: "この申込のLINE連携を解除します",
      });
    }

    return {
      title: buildRequestTitleForLine(item, mode),
      text: buildRequestSummaryForLine(item, mode),
      actions: actions.slice(0, 3),
    };
  }).filter((column) => column.actions.length > 0);
}


async function handleLineReservationStatus({ lineUserId, replyToken }) {
  if (!lineUserId) return;

  const items = await getLineLinkedRequests(lineUserId);
  const messages = [
    {
      type: "text",
      text: buildReservationStatusLines(items),
    },
  ];

  const columns = buildRequestActionColumns(items, "status");
  if (columns.length > 0) {
    messages.push({
      type: "template",
      altText: "予約状況",
      template: {
        type: "carousel",
        columns,
      },
    });
  }

  await replyLineMessage(replyToken, messages);
}

async function handleLineHelp({ replyToken }) {
  await replyLineMessage(replyToken, [
    {
      type: "text",
      text: [
        "実験日程予約LINEで使える機能です。",
        "",
        "🗓️ 予約状況：連携中の申込を確認できます。",
        "🙋 変更希望：変更希望を送る申込を選べます。",
        "🔕 LINE連携解除：LINE通知を停止する申込を選べます。",
        "",
        "新しくLINE連携する場合は、予約サイトで申込後に表示される8桁の連携コードを送信してください。",
      ].join("\n"),
    },
  ]);
}

async function handleLineChangeRequestCommand({ lineUserId, replyToken }) {
  const items = await getLineLinkedRequests(lineUserId);

  if (!items.length) {
    await replyLineMessage(replyToken, [
      {
        type: "text",
        text: "現在、このLINEアカウントに連携されている申込はありません。予約サイトで申込後に表示される8桁のLINE連携コードを送信してください。",
      },
    ]);
    return;
  }

  const columns = buildRequestActionColumns(items.filter((item) => item.data?.assignedSlotId), "change");
  if (!columns.length) {
    await replyLineMessage(replyToken, [
      {
        type: "text",
        text: "現在、変更希望を送信できる確定済み日程はありません。日程が確定すると、LINEから変更希望を送れるようになります。",
      },
    ]);
    return;
  }

  await replyLineMessage(replyToken, [
    {
      type: "text",
      text: "🙋 変更希望を送る申込を選んでください。選択後、このトークに希望内容を送信できます。",
    },
    {
      type: "template",
      altText: "変更希望を送る申込の選択",
      template: {
        type: "carousel",
        columns,
      },
    },
  ]);
}

async function handleLineStartUnlink({ lineUserId, replyToken }) {
  const items = await getLineLinkedRequests(lineUserId);

  if (!items.length) {
    await replyLineMessage(replyToken, [
      {
        type: "text",
        text: "現在、このLINEアカウントに連携されている申込はありません。",
      },
    ]);
    return;
  }

  const columns = buildRequestActionColumns(items, "unlink");

  await replyLineMessage(replyToken, [
    {
      type: "text",
      text: "🔕 LINE通知を解除する申込を選んでください。解除しても、メール通知はこれまで通り届きます。",
    },
    {
      type: "template",
      altText: "LINE連携解除",
      template: {
        type: "carousel",
        columns,
      },
    },
  ]);
}


async function handleLineUnlinkConfirmPostback({ lineUserId, replyToken, requestId, token }) {
  const valid = await getValidLineLinkedRequest({ requestId, token, lineUserId });

  if (!valid.ok) {
    await replyLineMessage(replyToken, [{ type: "text", text: lineInvalidRequestMessage(valid.reason) }]);
    return;
  }

  await valid.requestRef.update({
    lineNotifyEnabled: false,
    lineUserId: FieldValue.delete(),
    lineDisplayName: FieldValue.delete(),
    lineLinkedAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db.collection("lineUsers").doc(lineUserId).set({
    linkedRequestIds: FieldValue.arrayRemove(requestId),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection("lineSessions").doc(lineUserId).delete().catch(() => {});

  await replyLineMessage(replyToken, [
    {
      type: "text",
      text: "🔕 この申込のLINE連携を解除しました。今後この申込に関するLINE通知は送信されません。メール通知は引き続き届きます。",
    },
  ]);
}

async function sendLineReservationNotice({ requestData, requestId = "", token = "", title, body, links, includeActions = true }) {
  if (!canSendLine(requestData)) return;

  const messages = [
    {
      type: "text",
      text: `${title}\n\n${body}`,
    },
  ];

  if (includeActions) {
    const responseToken = token || requestData.participantResponseToken || "";
    const actions = [];

    if (requestId && responseToken) {
      actions.push({
        type: "postback",
        label: "この日程で確認",
        data: buildLinePostbackData({ action: "confirm", requestId, token: responseToken }),
        displayText: "この日程で確認します",
      });
      actions.push({
        type: "postback",
        label: "変更を希望する",
        data: buildLinePostbackData({ action: "start_change_request", requestId, token: responseToken }),
        displayText: "変更を希望します",
      });
    } else {
      if (links?.confirmUrl) {
        actions.push({
          type: "uri",
          label: "この日程で確認",
          uri: links.confirmUrl,
        });
      }
      if (links?.changeUrl) {
        actions.push({
          type: "uri",
          label: "変更を希望する",
          uri: links.changeUrl,
        });
      }
    }

    if (actions.length > 0) {
      messages.push({
        type: "template",
        altText: title,
        template: {
          type: "buttons",
          title: "実験日程予約",
          text: "LINE上で確認・変更希望を送れます。",
          actions,
        },
      });
    }
  }

  await pushLineMessage(requestData.lineUserId, messages);
}


async function upsertParticipantResponseDoc({ token, requestId, requestData, assignedSlot, resetStatus = false }) {
  if (!token || !requestId) return;

  const payload = {
    requestId,
    name: requestData.name || "",
    email: requestData.email || "",
    affiliation: requestData.affiliation || "",
    assignedSlotId: assignedSlot?.id || "",
    assignedDate: assignedSlot?.date || "",
    assignedPeriodKey: assignedSlot?.periodKey || "",
    assignedLocation: assignedSlot?.location || "",
    assignedNote: assignedSlot?.note || "",
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (resetStatus) {
    payload.participantConfirmationStatus = "pending";
    payload.participantResponseNote = "";
    payload.participantRespondedAt = FieldValue.delete();
  }

  await db.collection("participantResponses").doc(token).set(payload, { merge: true });
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
  const responseToken = after.participantResponseToken || before.participantResponseToken || "";
  const links = buildParticipantResponseLinks(responseToken);
  const requestId = event.params.requestId;

  let subject = "";
  let text = "";
  let html = "";

  if (!beforeAssigned && afterAssigned) {
    await upsertParticipantResponseDoc({ token: responseToken, requestId, requestData: after, assignedSlot: afterSlot, resetStatus: true });
    subject = "【要確認】実験日程が確定しました";
    text = withSignatureText([
      `${recipientName} さん`,
      "",
      "このたびは実験へのご協力ありがとうございます。",
      "以下の通り、参加日程が確定しましたのでご連絡いたします。",
      "",
      `【確定日時】 ${slotToText(afterSlot)}`,
      "",
      "ご都合をご確認のうえ、ご参加をお願いいたします。",
      "下記URLから『この日程で確認しました』または『変更を希望する』を選択できます。『この日程で確認しました』は、リンクを押した時点で登録が完了します。",
      responseLinksTextBlock(links),
      "このような連絡メールは迷惑メールに入る場合があります。今後の連絡のため、受信箱だけでなく迷惑メールもご確認ください。",
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
        <p>ご都合をご確認のうえ、ご参加をお願いいたします。<br/>下のボタンから、確認したことの登録や変更希望の送信ができます。</p>
        ${responseLinksHtmlBlock(links)}
        <p>このような連絡メールは迷惑メールに入る場合があります。今後の連絡のため、受信箱だけでなく迷惑メールもご確認ください。</p>
        <p>ご不明な点やご都合の変更がありましたら、本メールへの返信にてご連絡ください。</p>
        <p>どうぞよろしくお願いいたします。</p>
      </div>
    `);
  } else if (beforeAssigned && afterAssigned) {
    await upsertParticipantResponseDoc({ token: responseToken, requestId, requestData: after, assignedSlot: afterSlot, resetStatus: true });
    subject = "【要確認】実験日程が変更されました";
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
      "下記URLから『この日程で確認しました』または『変更を希望する』を選択できます。『この日程で確認しました』は、リンクを押した時点で登録が完了します。",
      responseLinksTextBlock(links),
      "このような連絡メールは迷惑メールに入る場合があります。今後の連絡のため、受信箱だけでなく迷惑メールもご確認ください。",
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
        <p>お手数をおかけしますが、ご確認をお願いいたします。<br/>下のボタンから、確認したことの登録や変更希望の送信ができます。</p>
        ${responseLinksHtmlBlock(links)}
        <p>このような連絡メールは迷惑メールに入る場合があります。今後の連絡のため、受信箱だけでなく迷惑メールもご確認ください。</p>
        <p>ご都合が合わない場合やご不明点がある場合は、本メールへの返信にてご連絡ください。</p>
        <p>どうぞよろしくお願いいたします。</p>
      </div>
    `);
  } else if (beforeAssigned && !afterAssigned) {
    await upsertParticipantResponseDoc({ token: responseToken, requestId, requestData: after, assignedSlot: null, resetStatus: true });
    subject = "【要確認】参加日程の再調整について";
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

  try {
    let lineBody = "";

    if (!beforeAssigned && afterAssigned) {
      lineBody = [
        `${recipientName} さん`,
        "実験日程が確定しました。",
        "",
        `【確定日時】${slotToText(afterSlot)}`,
        "",
        "ご都合をご確認のうえ、問題なければ確認ボタンを押してください。",
        "変更を希望する場合も、下のボタンから送信できます。",
      ].join("\n");
    } else if (beforeAssigned && afterAssigned) {
      lineBody = [
        `${recipientName} さん`,
        "実験日程が変更されました。",
        "",
        `【変更前】${slotToText(beforeSlot)}`,
        `【変更後】${slotToText(afterSlot)}`,
        "",
        "新しい日程をご確認のうえ、問題なければ確認ボタンを押してください。",
        "変更を希望する場合も、下のボタンから送信できます。",
      ].join("\n");
    } else if (beforeAssigned && !afterAssigned) {
      lineBody = [
        `${recipientName} さん`,
        "実験日程の再調整が必要になりました。",
        "",
        `【直前の確定日時】${slotToText(beforeSlot)}`,
        "",
        "新しい日程が決まり次第、あらためてご連絡します。",
      ].join("\n");
    }

    await sendLineReservationNotice({
      requestData: after,
      requestId,
      token: responseToken,
      title: subject,
      body: lineBody,
      links,
      includeActions: Boolean(afterAssigned),
    });
  } catch (lineError) {
    console.error("LINE notification failed:", lineError);
  }
});




function renderInvalidParticipantResponsePage() {
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>この申込は無効です</title>
      </head>
      <body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
        <div style="max-width:720px;margin:0 auto;padding:40px 20px;">
          <div style="background:#ffffff;border:1px solid #fecaca;border-radius:24px;padding:28px;box-shadow:0 20px 60px rgba(15,23,42,0.08);">
            <div style="display:inline-block;padding:6px 12px;border-radius:9999px;background:#fee2e2;color:#b91c1c;font-size:12px;font-weight:700;letter-spacing:0.12em;">INVALID</div>
            <h1 style="margin:16px 0 0;font-size:28px;line-height:1.4;">すでにこの申し込みは無効になっています</h1>
            <p style="margin:16px 0 0;line-height:1.9;color:#334155;">
              この確認用リンクに対応する申込は、管理者側で削除されたか、現在は利用できない状態です。<br/>
              このボタンを押しても、日程確認や変更希望は登録されません。
            </p>
            <div style="margin-top:20px;padding:16px;border:1px solid #fecaca;background:#fff1f2;border-radius:16px;line-height:1.9;color:#991b1b;">
              あらためて参加を希望する場合は、予約サイトから再び日程を申し込んでください。
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

exports.acknowledgeParticipantResponse = onRequest(async (req, res) => {
  res.set("Cache-Control", "no-store");

  const token = String(req.query.token || "").trim();
  if (!token) {
    res.status(400).send(`
      <html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;line-height:1.8;color:#0f172a;">
        <h2>確認用URLが不正です</h2>
        <p>メールに記載された最新のボタンから、もう一度お試しください。</p>
      </body></html>
    `);
    return;
  }

  try {
    const responseRef = db.collection("participantResponses").doc(token);
    const snapshot = await responseRef.get();

    if (!snapshot.exists) {
      res.status(404).send(`
        <html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;line-height:1.8;color:#0f172a;">
          <h2>確認ページが見つかりませんでした</h2>
          <p>有効期限切れ、または古いメールの可能性があります。最新のメールから開き直してください。</p>
        </body></html>
      `);
      return;
    }

    const data = snapshot.data() || {};
    const currentStatus = data.participantConfirmationStatus || "pending";
    const requestId = data.requestId || "";

    if (currentStatus === "invalid") {
      res.status(410).send(renderInvalidParticipantResponsePage());
      return;
    }

    if (!requestId) {
      await responseRef.set({
        participantConfirmationStatus: "invalid",
        participantResponseNote: "この申込は管理者により削除されたか、無効になりました。",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      res.status(410).send(renderInvalidParticipantResponsePage());
      return;
    }

    const requestSnap = await db.collection("requests").doc(requestId).get();
    if (!requestSnap.exists) {
      await responseRef.set({
        participantConfirmationStatus: "invalid",
        participantResponseNote: "この申込は管理者により削除されたか、無効になりました。",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      res.status(410).send(renderInvalidParticipantResponsePage());
      return;
    }

    if (currentStatus !== "confirmed") {
      await responseRef.set({
        participantConfirmationStatus: "confirmed",
        participantRespondedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    const changeUrl = buildParticipantResponseUrl(token, "change");

    res.status(200).send(`
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>日程確認を受け付けました</title>
        </head>
        <body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
          <div style="max-width:720px;margin:0 auto;padding:40px 20px;">
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:28px;box-shadow:0 20px 60px rgba(15,23,42,0.08);">
              <div style="display:inline-block;padding:6px 12px;border-radius:9999px;background:#dbeafe;color:#1d4ed8;font-size:12px;font-weight:700;letter-spacing:0.12em;">CONFIRMED</div>
              <h1 style="margin:16px 0 0;font-size:28px;line-height:1.4;">日程確認を受け付けました</h1>
              <p style="margin:16px 0 0;line-height:1.9;color:#334155;">
                ご対応ありがとうございます。<br/>
                管理者にも確認済みとして通知されます。
              </p>
              <div style="margin-top:20px;padding:16px;border:1px solid #dbeafe;background:#eff6ff;border-radius:16px;line-height:1.9;color:#1e3a8a;">
                後から都合が悪くなった場合は、下のボタンから変更希望を送れます。
              </div>
              ${changeUrl ? `<div style="margin-top:20px;"><a href="${escapeHtml(changeUrl)}" style="display:inline-block;padding:12px 16px;border-radius:12px;background:#ffffff;color:#b91c1c;border:1px solid #fecaca;text-decoration:none;font-weight:600;">変更を希望する</a></div>` : ""}
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send(`
      <html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;line-height:1.8;color:#0f172a;">
        <h2>確認の登録に失敗しました</h2>
        <p>時間をおいて再度お試しいただくか、メールへの返信でご連絡ください。</p>
      </body></html>
    `);
  }
});

exports.notifyAdminOnParticipantResponse = onDocumentUpdated("participantResponses/{token}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;

  const beforeStatus = before.participantConfirmationStatus || "pending";
  const afterStatus = after.participantConfirmationStatus || "pending";
  const beforeNote = before.participantResponseNote || "";
  const afterNote = after.participantResponseNote || "";

  if (beforeStatus === afterStatus && beforeNote === afterNote) return;
  if (afterStatus !== "confirmed" && afterStatus !== "change_requested") return;

  const requestId = after.requestId || before.requestId || "";
  if (!requestId) return;

  const requestRef = db.collection("requests").doc(requestId);
  const requestSnap = await requestRef.get();

  if (!requestSnap.exists) {
    await db.collection("participantResponses").doc(event.params.token).set({
      participantConfirmationStatus: "invalid",
      participantResponseNote: "この申込は管理者により削除されたか、無効になりました。",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.warn(`Participant response ignored because request was deleted: ${requestId}`);
    return;
  }

  await requestRef.update({
    participantConfirmationStatus: afterStatus,
    participantResponseNote: afterNote,
    participantRespondedAt: after.participantRespondedAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (!NOTIFY_ADMIN_EMAIL) return;

  const assignedSlot = {
    id: after.assignedSlotId || "",
    date: after.assignedDate || "",
    periodKey: after.assignedPeriodKey || "",
    location: after.assignedLocation || "",
    note: after.assignedNote || "",
  };

  const subject = afterStatus === "confirmed"
    ? `【実験日程予約】参加者が日程を確認しました（${after.name || "氏名未入力"}）`
    : `【実験日程予約】参加者から変更希望が届きました（${after.name || "氏名未入力"}）`;

  const text = [
    afterStatus === "confirmed" ? "参加者が確定日程を確認しました。" : "参加者から変更希望が届きました。",
    "",
    `氏名: ${after.name || ""}`,
    `メール: ${after.email || ""}`,
    `所属・学年: ${after.affiliation || ""}`,
    `現在の確定日程: ${slotToText(assignedSlot)}`,
    `参加者ステータス: ${afterStatus === "confirmed" ? "確認済み" : "変更希望"}`,
    `連絡内容: ${afterNote || "なし"}`,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.7; color: #0f172a;">
      <h2 style="margin: 0 0 16px;">${escapeHtml(afterStatus === "confirmed" ? "参加者が日程を確認しました" : "参加者から変更希望が届きました")}</h2>
      <p><strong>氏名:</strong> ${escapeHtml(after.name || "")}</p>
      <p><strong>メール:</strong> ${escapeHtml(after.email || "")}</p>
      <p><strong>所属・学年:</strong> ${escapeHtml(after.affiliation || "")}</p>
      <p><strong>現在の確定日程:</strong> ${escapeHtml(slotToText(assignedSlot))}</p>
      <p><strong>参加者ステータス:</strong> ${escapeHtml(afterStatus === "confirmed" ? "確認済み" : "変更希望")}</p>
      <p><strong>連絡内容:</strong><br/>${escapeHtml(afterNote || "なし").replaceAll("\n", "<br/>")}</p>
    </div>
  `;

  await enqueueMail({
    to: NOTIFY_ADMIN_EMAIL,
    subject,
    text,
    html,
  });
});

exports.lineWebhook = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    if (!verifyLineSignature(req)) {
      res.status(401).send("Invalid signature");
      return;
    }

    const events = Array.isArray(req.body?.events) ? req.body.events : [];

    for (const event of events) {
      const replyToken = event.replyToken || "";
      const lineUserId = event.source?.userId || "";

      if (event.type === "follow") {
        await replyLineMessage(replyToken, [
          {
            type: "text",
            text: "友だち追加ありがとうございます。予約サイトで申込後に表示された8桁のLINE連携コードを送ると、日程確定や変更の案内をLINEでも受け取れるようになります。",
          },
        ]);
        continue;
      }

      if (event.type === "postback") {
        const { action, requestId, token } = parseLinePostbackData(event.postback?.data || "");

        if (!lineUserId || !action) {
          await replyLineMessage(replyToken, [
            {
              type: "text",
              text: "操作内容を確認できませんでした。最新のLINE通知からもう一度お試しください。",
            },
          ]);
          continue;
        }

        if (action === "confirm") {
          await handleLineConfirmPostback({ lineUserId, replyToken, requestId, token });
          continue;
        }

        if (action === "start_change_request") {
          await handleLineStartChangeRequestPostback({ lineUserId, replyToken, requestId, token });
          continue;
        }

        if (action === "reservation_status") {
          await handleLineReservationStatus({ lineUserId, replyToken });
          continue;
        }

        if (action === "unlink_start") {
          await handleLineStartUnlink({ lineUserId, replyToken });
          continue;
        }

        if (action === "unlink_confirm") {
          await handleLineUnlinkConfirmPostback({ lineUserId, replyToken, requestId, token });
          continue;
        }

        if (action === "help") {
          await handleLineHelp({ replyToken });
          continue;
        }

        await replyLineMessage(replyToken, [
          {
            type: "text",
            text: "未対応の操作です。最新のLINE通知からもう一度お試しください。",
          },
        ]);
        continue;
      }

      if (event.type !== "message" || event.message?.type !== "text") continue;

      const messageText = event.message.text || "";

      const handledAsChangeRequest = await handleLineWaitingChangeRequestNote({
        lineUserId,
        replyToken,
        text: messageText,
      });
      if (handledAsChangeRequest) continue;

      if (isLineStatusCommand(messageText)) {
        await handleLineReservationStatus({ lineUserId, replyToken });
        continue;
      }

      if (isLineUnlinkCommand(messageText)) {
        await handleLineStartUnlink({ lineUserId, replyToken });
        continue;
      }

      if (isLineHelpCommand(messageText)) {
        await handleLineHelp({ replyToken });
        continue;
      }

      if (isLineChangeRequestCommand(messageText)) {
        await handleLineChangeRequestCommand({ lineUserId, replyToken });
        continue;
      }

      const code = normalizeLineLinkCode(messageText);
      if (!lineUserId) continue;

      if (!isLikelyLineLinkCode(code)) {
        await replyLineMessage(replyToken, [
          {
            type: "text",
            text: buildUnknownLineMessage(),
          },
        ]);
        continue;
      }

      const requestSnap = await db
        .collection("requests")
        .where("lineLinkCode", "==", code)
        .limit(1)
        .get();

      if (requestSnap.empty) {
        await replyLineMessage(replyToken, [
          {
            type: "text",
            text: "この連携コードは見つかりませんでした。予約サイトで申込後に表示された8桁のコードをもう一度確認して送信してください。",
          },
        ]);
        continue;
      }

      const requestDoc = requestSnap.docs[0];
      const requestData = requestDoc.data() || {};

      if (requestData.lineUserId && requestData.lineUserId !== lineUserId) {
        await replyLineMessage(replyToken, [
          {
            type: "text",
            text: "この連携コードは、すでに別のLINEアカウントと連携されています。心当たりがない場合は、実験担当者へメールでお問い合わせください。",
          },
        ]);
        continue;
      }

      const profile = await getLineProfile(lineUserId);
      const displayName = profile?.displayName || "";

      await requestDoc.ref.update({
        lineUserId,
        lineDisplayName: displayName,
        lineNotifyEnabled: true,
        lineLinkedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const lineUserRef = db.collection("lineUsers").doc(lineUserId);
      const lineUserSnap = await lineUserRef.get();
      const lineUserPayload = {
        lineUserId,
        displayName,
        linkedRequestIds: FieldValue.arrayUnion(requestDoc.id),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (!lineUserSnap.exists) {
        lineUserPayload.createdAt = FieldValue.serverTimestamp();
      }
      await lineUserRef.set(lineUserPayload, { merge: true });

      await replyLineMessage(replyToken, [
        {
          type: "text",
          text: `✅ ${requestData.name || "参加者"}さんの実験予約とLINEを連携しました。今後、日程の確定や変更があった場合は、メールに加えてLINEでもお知らせします。`,
        },
      ]);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("lineWebhook error:", error);
    res.status(500).send("Internal Server Error");
  }
});
