const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const NOTIFY_ADMIN_EMAIL = process.env.NOTIFY_ADMIN_EMAIL || "";
const MAIL_COLLECTION = process.env.MAIL_COLLECTION || "mail";
const FROM_ADDRESS = process.env.FROM_ADDRESS || "is0611xi@ed.ritsumei.ac.jp";
const FROM_NAME = process.env.FROM_NAME || "実験予約システム";
const REPLY_TO = process.env.REPLY_TO || "is0611xi@ed.ritsumei.ac.jp";
const APP_BASE_URL = process.env.APP_BASE_URL || "";
const PARTICIPANT_CONFIRM_ENDPOINT_URL = process.env.PARTICIPANT_CONFIRM_ENDPOINT_URL || "";

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
    subject = "【要確認】実験日程が確定しました（立命館大学）";
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
    subject = "【要確認】実験日程が変更されました（立命館大学）";
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
    subject = "【要確認】参加日程の再調整について（立命館大学）";
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
