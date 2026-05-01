"use client";

import React, { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { addDoc, collection, doc, getDoc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { firestore, firebaseReady } from "@/app/lib/firebase";
import { PERIOD_MAP } from "@/app/lib/constants";
import { formatJapaneseDate } from "@/app/lib/date-utils";
import { getParticipantConfirmationLabel, getParticipantConfirmationTone } from "@/app/lib/request-utils";
import { downloadIcsFile } from "@/app/lib/ics-utils";
import {
  Card,
  StatusBadge,
  ResponsePageHeader,
  LoadingCard,
  ActionToast,
  classNames,
} from "@/app/components/shared";

function ResponseContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestItem, setRequestItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [toast, setToast] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const msgBottomRef = useRef(null);

  function showToast(message, tone = "info") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    document.title = "連絡・確認ページ | LabLink";
  }, []);

  useEffect(() => {
    if (!token) {
      setError("確認用URLが不正です。");
      setLoading(false);
      return;
    }
    if (!firebaseReady) {
      setError("Firebase が設定されていません。");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    getDoc(doc(firestore, "participantResponses", token))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          setError("対象の確認ページが見つかりませんでした。最新のメールから開き直してください。");
          setRequestItem(null);
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        setRequestItem(data);
        if (data.participantConfirmationStatus === "invalid") {
          setError("すでにこの申し込みは無効になっています。管理者側で申込が削除された、または現在は利用できない状態です。あらためて参加を希望する場合は、予約サイトから再び日程を申し込んでください。");
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setError("確認情報の取得に失敗しました。時間をおいて再度お試しください。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!firebaseReady || !token) return;
    setMsgLoading(true);
    const unsub = onSnapshot(
      collection(firestore, "participantResponses", token, "messages"),
      (snap) => {
        const msgs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        setMessages(msgs);
        setMsgLoading(false);
      },
      () => setMsgLoading(false)
    );
    return () => unsub();
  }, [token]);

  useEffect(() => {
    if (!msgLoading) msgBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, msgLoading]);

  async function handleSendMessage() {
    if (!msgText.trim() || !token || msgSending || !firebaseReady) return;
    setMsgSending(true);
    try {
      await addDoc(collection(firestore, "participantResponses", token, "messages"), {
        text: msgText.trim(),
        sender: "participant",
        senderLabel: requestItem?.name || "参加者",
        createdAt: serverTimestamp(),
      });
      setMsgText("");
    } catch (err) {
      console.error(err);
      showToast("送信に失敗しました。", "error");
    } finally {
      setMsgSending(false);
    }
  }

  async function handleSubmitChangeRequest() {
    if (!firebaseReady || !token) return;
    if (!msgText.trim()) {
      showToast("メッセージを入力してください。", "error");
      return;
    }
    if (requestItem?.participantConfirmationStatus === "invalid") {
      showToast("この申し込みは無効です。", "error");
      return;
    }
    try {
      setSubmitting(true);
      await addDoc(collection(firestore, "participantResponses", token, "messages"), {
        text: msgText.trim(),
        sender: "participant",
        senderLabel: requestItem?.name || "参加者",
        isChangeRequest: true,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(firestore, "participantResponses", token), {
        participantConfirmationStatus: "change_requested",
        participantResponseNote: msgText.trim(),
        participantRespondedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setRequestItem((prev) => ({
        ...prev,
        participantConfirmationStatus: "change_requested",
        participantResponseNote: msgText.trim(),
      }));
      setMsgText("");
      setSubmitMessage("変更希望を申請しました。管理者が確認後、あらためてご連絡します。");
      showToast("変更希望を受け付けました。", "success");
    } catch (err) {
      console.error(err);
      if (err?.code === "permission-denied") {
        setError("すでにこの申し込みは無効になっている可能性があります。最新のメールから開き直すか、あらためて参加を希望する場合は、予約サイトから再び日程を申し込んでください。");
      } else {
        showToast("送信に失敗しました。時間をおいて再度お試しください。", "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const confirmationStatus = requestItem?.participantConfirmationStatus || "pending";
  const assignedSlot = requestItem ? {
    date: requestItem.assignedDate || "",
    periodKey: requestItem.assignedPeriodKey || "",
    location: requestItem.assignedLocation || "",
    note: requestItem.assignedNote || "",
  } : null;
  const hasAssignedSlot = Boolean(assignedSlot?.date && assignedSlot?.periodKey);
  const isInvalid = requestItem?.participantConfirmationStatus === "invalid";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0%,_#f8fafc_38%,_#eef2ff_100%)] text-slate-900">
      <ActionToast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <ResponsePageHeader />

        {loading ? <LoadingCard title="確認情報を読み込んでいます..." /> : null}

        {error ? (
          <Card className="p-6">
            <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm leading-7 text-rose-700">{error}</div>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              予約ページへ戻る
            </button>
          </Card>
        ) : null}

        {!loading && !error && requestItem ? (
          <div className="space-y-5">

            {/* ── 申込情報カード ── */}
            <Card className="overflow-hidden p-0">
              <div className={classNames(
                "h-1.5 w-full",
                confirmationStatus === "change_requested"
                  ? "bg-gradient-to-r from-rose-400 to-orange-400"
                  : confirmationStatus === "confirmed"
                  ? "bg-gradient-to-r from-emerald-400 to-teal-400"
                  : "bg-gradient-to-r from-teal-400 to-indigo-400"
              )} />
              <div className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">MY APPLICATION</div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">{requestItem.name || "参加者様"}</div>
                  </div>
                  <StatusBadge tone={getParticipantConfirmationTone(confirmationStatus)}>
                    {getParticipantConfirmationLabel(confirmationStatus)}
                  </StatusBadge>
                </div>

                <div className="mt-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">確定日程</div>
                  {hasAssignedSlot ? (
                    <div className="mt-2 rounded-2xl border border-teal-100 bg-teal-50/70 p-4">
                      <div className="text-base font-bold text-slate-900">
                        {formatJapaneseDate(assignedSlot.date)}
                        <span className="mx-1.5 font-normal text-slate-400">/</span>
                        {PERIOD_MAP[assignedSlot.periodKey]?.label || assignedSlot.periodKey}
                        {assignedSlot.location ? (
                          <span className="ml-1 font-normal text-slate-600"> / {assignedSlot.location}</span>
                        ) : null}
                      </div>
                      {assignedSlot.note ? (
                        <div className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-500">{assignedSlot.note}</div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => downloadIcsFile("schedule.ics", [{ slot: assignedSlot, summary: "実験参加", uid: `lablink-${requestItem?.id || "unknown"}@lablink` }])}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-2xl border border-teal-200 bg-white px-4 py-2 text-sm font-medium text-teal-700 transition hover:bg-teal-50"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        カレンダーに追加（.ics）
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      まだ日程は確定していません。管理者が確認後、ご連絡します。
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
                  <div><span className="font-medium text-slate-700">メール:</span> {requestItem.email || "—"}</div>
                  <div><span className="font-medium text-slate-700">所属・学年:</span> {requestItem.affiliation || "—"}</div>
                </div>

                {requestItem.participantResponseNote ? (
                  <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                    <div className="text-xs font-semibold text-slate-400">直近の変更希望の内容</div>
                    <div className="mt-1 whitespace-pre-line leading-6 text-slate-600">{requestItem.participantResponseNote}</div>
                  </div>
                ) : null}

                {submitMessage ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                    {submitMessage}
                  </div>
                ) : null}
              </div>
            </Card>

            {/* ── 日程確認の案内 ── */}
            {hasAssignedSlot && !isInvalid ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
                <span className="font-semibold">日程に問題がない場合</span>は、このページではなくメール内の「この日程で確認しました」ボタンから確認済みにしてください。
              </div>
            ) : null}

            {/* ── 管理者に連絡するカード ── */}
            {!isInvalid ? (
              <Card className="overflow-hidden p-0">
                <div className="border-b border-slate-100 px-6 py-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">MESSAGE</div>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">管理者に連絡する</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    日程の変更・質問など、管理者に直接メッセージを送れます。
                    日程を変更したい場合は「<span className="font-medium text-rose-600">変更希望として送信</span>」を使ってください。
                  </p>
                </div>

                {/* チャットエリア */}
                <div className="min-h-[80px] max-h-72 overflow-y-auto bg-slate-50/60 px-6 py-4">
                  {msgLoading ? (
                    <div className="py-4 text-center text-sm text-slate-400">読み込み中...</div>
                  ) : messages.length === 0 ? (
                    <div className="py-6 text-center text-sm text-slate-400">まだメッセージはありません。</div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((msg) => (
                        <div key={msg.id} className={classNames("flex", msg.sender === "participant" ? "justify-end" : "justify-start")}>
                          <div className={classNames(
                            "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6",
                            msg.sender === "participant"
                              ? "bg-teal-600 text-white"
                              : "border border-slate-200 bg-white text-slate-800"
                          )}>
                            <div className="mb-0.5 flex items-center gap-1.5 text-[11px] opacity-70">
                              <span>{msg.senderLabel || (msg.sender === "participant" ? "あなた" : "管理者")}</span>
                              {msg.isChangeRequest ? (
                                <span className={classNames(
                                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                  msg.sender === "participant" ? "bg-white/20 text-white" : "bg-rose-100 text-rose-700"
                                )}>変更希望</span>
                              ) : null}
                            </div>
                            <div className="whitespace-pre-line">{msg.text}</div>
                          </div>
                        </div>
                      ))}
                      <div ref={msgBottomRef} />
                    </div>
                  )}
                </div>

                {/* 入力エリア */}
                <div className="border-t border-slate-100 px-6 py-5">
                  <textarea
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSendMessage(); }}
                    placeholder="メッセージを入力... (Ctrl+Enter で送信)"
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-400"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSendMessage}
                      disabled={!msgText.trim() || msgSending}
                      className="rounded-2xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-500 disabled:opacity-40"
                    >
                      {msgSending ? "送信中..." : "送信"}
                    </button>
                    {hasAssignedSlot ? (
                      <button
                        type="button"
                        onClick={handleSubmitChangeRequest}
                        disabled={!msgText.trim() || submitting}
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-2.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-40"
                      >
                        {submitting ? "送信中..." : "変更希望として送信"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => router.push("/")}
                      className="ml-auto rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      予約ページへ戻る
                    </button>
                  </div>
                </div>
              </Card>
            ) : null}

          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ResponsePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-500">読み込み中...</div>}>
      <ResponseContent />
    </Suspense>
  );
}
