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
  const [responseNote, setResponseNote] = useState("");
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
    document.title = "変更希望ページ | LabLink";
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
        setResponseNote(data.participantResponseNote || "");
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

  async function handleSubmitChangeRequest() {
    if (!firebaseReady || !token) return;
    if (requestItem?.participantConfirmationStatus === "invalid") {
      setError("すでにこの申し込みは無効になっています。変更希望は登録できません。");
      showToast("この申し込みは無効です。", "error");
      return;
    }
    try {
      setSubmitting(true);
      await updateDoc(doc(firestore, "participantResponses", token), {
        participantConfirmationStatus: "change_requested",
        participantResponseNote: responseNote.trim(),
        participantRespondedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setRequestItem((prev) => ({ ...prev, participantConfirmationStatus: "change_requested", participantResponseNote: responseNote.trim() }));
      setSubmitMessage("変更希望を送信しました。管理者が内容を確認し、あらためてご連絡します。");
      showToast("変更希望を受け付けました。", "success");
    } catch (err) {
      console.error(err);
      if (err?.code === "permission-denied") {
        setError("すでにこの申し込みは無効になっている可能性があります。最新のメールから開き直すか、あらためて参加を希望する場合は、予約サイトから再び日程を申し込んでください。");
      } else {
        setError("送信に失敗しました。時間をおいて再度お試しください。");
      }
      showToast("送信に失敗しました。", "error");
    } finally {
      setSubmitting(false);
    }
  }

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
    if (!msgText.trim() || !token || msgSending) return;
    if (!firebaseReady) return;
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

  const confirmationStatus = requestItem?.participantConfirmationStatus || "pending";
  const assignedSlot = requestItem ? {
    date: requestItem.assignedDate || "",
    periodKey: requestItem.assignedPeriodKey || "",
    location: requestItem.assignedLocation || "",
    note: requestItem.assignedNote || "",
  } : null;
  const hasAssignedSlot = Boolean(assignedSlot?.date && assignedSlot?.periodKey);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0%,_#f8fafc_38%,_#eef2ff_100%)] text-slate-900">
      <ActionToast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
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
            <Card className="p-6">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xl font-semibold text-slate-900">{requestItem.name || "参加者様"}</div>
                <StatusBadge tone={getParticipantConfirmationTone(confirmationStatus)}>{getParticipantConfirmationLabel(confirmationStatus)}</StatusBadge>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <div><span className="font-medium text-slate-800">登録メール:</span> {requestItem.email || "未登録"}</div>
                <div><span className="font-medium text-slate-800">所属・学年:</span> {requestItem.affiliation || "未入力"}</div>
              </div>

              <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-medium text-slate-700">現在の確定日程</div>
                <div className="mt-3 text-base font-semibold text-slate-900">
                  {hasAssignedSlot ? (
                    <>
                      {formatJapaneseDate(assignedSlot.date)} / {PERIOD_MAP[assignedSlot.periodKey]?.label || assignedSlot.periodKey}
                      {assignedSlot.location ? " / " + assignedSlot.location : ""}
                    </>
                  ) : (
                    "現在、確定済みの日程はありません。"
                  )}
                </div>
                {assignedSlot?.note ? <div className="mt-2 whitespace-pre-line text-sm text-slate-500">{assignedSlot.note}</div> : null}
                {hasAssignedSlot ? (
                  <button
                    type="button"
                    onClick={() => downloadIcsFile("schedule.ics", [{ slot: assignedSlot, summary: "実験参加", uid: `lablink-${requestItem?.id || "unknown"}@lablink` }])}
                    className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-700 transition hover:bg-teal-100"
                  >
                    カレンダーに追加（.ics）
                  </button>
                ) : null}
              </div>

              {submitMessage ? (
                <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-7 text-emerald-800">{submitMessage}</div>
              ) : null}

              {requestItem.participantResponseNote ? (
                <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-medium text-slate-700">直近の連絡内容</div>
                  <div className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600">{requestItem.participantResponseNote}</div>
                </div>
              ) : null}
            </Card>

            <Card className="p-6">
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">変更希望を送信する</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    参加が難しい場合や再調整を希望する場合は、理由や参加可能な日時を入力して送信してください。
                  </p>
                </div>

                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
                  日程に問題がない場合は、このページではなく、メール内の青い「この日程で確認しました」ボタンから確認済みにしてください。
                </div>

                <div className="space-y-4 rounded-3xl border border-rose-200 bg-rose-50/60 p-5">
                  <div>
                    <h3 className="text-lg font-semibold text-rose-950">変更希望</h3>
                    <p className="mt-2 text-sm leading-7 text-rose-900/80">
                      できるだけ具体的に、参加できない理由や参加可能な日時を記入してください。
                    </p>
                  </div>

                  <label className="block text-sm">
                    <div className="mb-1.5 text-rose-900">変更内容・ご都合</div>
                    <textarea
                      value={responseNote}
                      onChange={(e) => setResponseNote(e.target.value)}
                      placeholder="例）この時間は授業があるため参加できません。来週火曜3〜5限なら参加できます。"
                      className="min-h-36 w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 outline-none transition focus:border-rose-400"
                    />
                  </label>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSubmitChangeRequest}
                      disabled={submitting || !hasAssignedSlot}
                      className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-rose-500 disabled:opacity-60"
                    >
                      {submitting ? "送信中..." : confirmationStatus === "change_requested" ? "もう一度、変更希望を送信する" : "変更希望を送信する"}
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push("/")}
                      className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      予約ページへ戻る
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ) : null}

        {!loading && !error && requestItem && requestItem.participantConfirmationStatus !== "invalid" ? (
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">管理者へのメッセージ</h2>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  日程調整の相談など、管理者に直接メッセージを送ることができます。
                </p>
              </div>

              <div className="min-h-[80px] max-h-80 overflow-y-auto space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                {msgLoading ? (
                  <div className="py-4 text-center text-sm text-slate-400">読み込み中...</div>
                ) : messages.length === 0 ? (
                  <div className="py-4 text-center text-sm text-slate-400">まだメッセージはありません。</div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className={classNames("flex", msg.sender === "participant" ? "justify-end" : "justify-start")}>
                      <div className={classNames(
                        "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6",
                        msg.sender === "participant"
                          ? "bg-teal-600 text-white"
                          : "border border-slate-200 bg-white text-slate-800"
                      )}>
                        <div className="mb-0.5 text-[11px] opacity-70">
                          {msg.senderLabel || (msg.sender === "participant" ? "あなた" : "管理者")}
                        </div>
                        <div className="whitespace-pre-line">{msg.text}</div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={msgBottomRef} />
              </div>

              <div className="flex gap-2">
                <textarea
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSendMessage(); }}
                  placeholder="メッセージを入力... (Ctrl+Enter で送信)"
                  rows={2}
                  className="flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-400"
                />
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={!msgText.trim() || msgSending}
                  className="self-end rounded-2xl bg-teal-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-teal-500 disabled:opacity-40"
                >
                  {msgSending ? "送信中..." : "送信"}
                </button>
              </div>
            </div>
          </Card>
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
