"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp, firebaseReady } from "@/app/lib/firebase";

const SESSION_KEY = "lablink_mypage_session";

const PERIOD_LABELS = {
  p1: "09:00〜10:35",
  p2: "10:45〜12:20",
  p3: "13:10〜14:45",
  p4: "14:55〜16:30",
  p5: "16:40〜18:15",
  p6: "18:25〜20:00",
  p7: "20:10〜21:45",
};

const STATUS_LABEL = {
  requested: "申込中",
  assigned: "日程確定",
  cancelled: "キャンセル",
  rejected: "不採用",
};

const CONFIRMATION_LABEL = {
  pending: "確認待ち",
  confirmed: "参加確定",
  change_requested: "変更希望",
};

const CONFIRMATION_COLOR = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  change_requested: "bg-rose-100 text-rose-700",
};

function formatDateJP(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatCreatedAt(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
}

function StatusBadge({ status, confirmationStatus }) {
  if (status === "assigned" && confirmationStatus) {
    const label = CONFIRMATION_LABEL[confirmationStatus] || confirmationStatus;
    const color = CONFIRMATION_COLOR[confirmationStatus] || "bg-slate-100 text-slate-600";
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
        {label}
      </span>
    );
  }
  const label = STATUS_LABEL[status] || status;
  const color =
    status === "assigned"
      ? "bg-emerald-100 text-emerald-800"
      : status === "cancelled" || status === "rejected"
        ? "bg-slate-100 text-slate-500"
        : "bg-amber-100 text-amber-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {label}
    </span>
  );
}

function BookingCard({ request, study, slot }) {
  const studyTitle = study?.title || "（実験名不明）";
  const token = request.participantResponseToken;
  const responseUrl = token ? `/response?token=${encodeURIComponent(token)}` : null;

  const slotLine = slot
    ? `${formatDateJP(slot.date)}　${PERIOD_LABELS[slot.periodKey] || slot.periodKey || ""}${slot.location ? `　${slot.location}` : ""}`
    : null;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{studyTitle}</p>
          <p className="mt-0.5 text-xs text-slate-400">申込日: {formatCreatedAt(request.createdAt)}</p>
        </div>
        <StatusBadge status={request.status} confirmationStatus={request.participantConfirmationStatus} />
      </div>

      {slotLine && (
        <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <span className="mr-1.5 text-xs font-medium text-slate-400">日時</span>
          {slotLine}
        </div>
      )}

      {responseUrl ? (
        <a
          href={responseUrl}
          className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          詳細・変更・メッセージ
        </a>
      ) : (
        <p className="text-center text-xs text-slate-400">確定後にリンクが表示されます</p>
      )}
    </div>
  );
}

function getCallable(name) {
  const fns = getFunctions(firebaseApp);
  return httpsCallable(fns, name);
}

export default function MyPage() {
  const [step, setStep] = useState("init"); // "init" | "email" | "otp" | "bookings"
  const [email, setEmail] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [code, setCode] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [participantEmail, setParticipantEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [requests, setRequests] = useState([]);
  const [slotMap, setSlotMap] = useState({});
  const [studyMap, setStudyMap] = useState({});
  const [loadingBookings, setLoadingBookings] = useState(false);

  const [cooldown, setCooldown] = useState(0);

  // localStorage からセッション復元
  useEffect(() => {
    if (!firebaseReady) { setStep("email"); return; }
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const { token, mail } = JSON.parse(saved);
        if (token && mail) {
          setSessionToken(token);
          setParticipantEmail(mail);
          setStep("bookings");
          return;
        }
      }
    } catch (_) {}
    setStep("email");
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function handleSendOtp(e) {
    e.preventDefault();
    if (!firebaseReady) return;
    setLoading(true);
    setError("");
    try {
      const result = await getCallable("sendParticipantOtp")({ email: email.trim().toLowerCase() });
      setSessionId(result.data.sessionId);
      setStep("otp");
      setCooldown(60);
    } catch (err) {
      setError(err.message || "送信に失敗しました。しばらく経ってから再試行してください。");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend(e) {
    e.preventDefault();
    if (cooldown > 0 || !firebaseReady) return;
    setLoading(true);
    setError("");
    try {
      const result = await getCallable("sendParticipantOtp")({ email: email.trim().toLowerCase() });
      setSessionId(result.data.sessionId);
      setCode("");
      setCooldown(60);
    } catch (err) {
      setError(err.message || "再送信に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    if (!firebaseReady) return;
    setLoading(true);
    setError("");
    try {
      const result = await getCallable("verifyParticipantOtp")({
        sessionId,
        code: code.trim(),
        email: email.trim().toLowerCase(),
      });
      const { sessionToken: token, email: mail } = result.data;
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token, mail }));
      setSessionToken(token);
      setParticipantEmail(mail);
      setStep("bookings");
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("正しくありません")) setError("確認コードが正しくありません。");
      else if (msg.includes("有効期限")) setError("コードの有効期限が切れています。再送信してください。");
      else if (msg.includes("使用済み")) setError("このコードはすでに使用されています。再送信してください。");
      else setError(`認証に失敗しました: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  const loadBookings = useCallback(async () => {
    if (!firebaseReady || !sessionToken) return;
    setLoadingBookings(true);
    try {
      const result = await getCallable("getMyBookings")({ sessionToken });
      const { requests: reqs, slots, studies } = result.data;
      setRequests(reqs || []);
      setSlotMap(slots || {});
      setStudyMap(studies || {});
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("セッション") || msg.includes("ログイン")) {
        localStorage.removeItem(SESSION_KEY);
        setStep("email");
        setError("セッションが切れました。再度ログインしてください。");
      }
    } finally {
      setLoadingBookings(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (step === "bookings" && sessionToken) loadBookings();
  }, [step, sessionToken, loadBookings]);

  function handleSignOut() {
    localStorage.removeItem(SESSION_KEY);
    setStep("email");
    setEmail("");
    setCode("");
    setSessionId("");
    setSessionToken("");
    setParticipantEmail("");
    setRequests([]);
    setSlotMap({});
    setStudyMap({});
  }

  if (step === "init") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="/" className="min-w-0 rounded-2xl text-left transition hover:opacity-85">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-black tracking-tight text-slate-900">LabLink</span>
              <span className="hidden text-xs font-medium text-slate-400 sm:inline">参加者マイページ</span>
            </div>
          </a>
          {step === "bookings" && (
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
            >
              ログアウト
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {step === "email" && (
          <div className="overflow-hidden rounded-3xl border border-white/80 bg-white/85 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="px-6 pb-6 pt-8 sm:px-8 sm:pt-10">
              <h1 className="mb-1 text-xl font-bold text-slate-900">予約の確認・変更</h1>
              <p className="mb-8 text-sm text-slate-500">
                実験申し込み時のメールアドレスを入力してください。確認コードをお送りします。
              </p>
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">メールアドレス</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="example@email.com"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  />
                </div>
                {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
                >
                  {loading ? "送信中..." : "確認コードを送信"}
                </button>
              </form>
            </div>
          </div>
        )}

        {step === "otp" && (
          <div className="overflow-hidden rounded-3xl border border-white/80 bg-white/85 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="px-6 pb-6 pt-8 sm:px-8 sm:pt-10">
              <h1 className="mb-1 text-xl font-bold text-slate-900">確認コードを入力</h1>
              <p className="mb-2 text-sm text-slate-500">
                <span className="font-medium text-slate-700">{email}</span> に6桁の確認コードを送信しました。
              </p>
              <p className="mb-8 text-xs text-slate-400">
                メールが届かない場合は迷惑メールフォルダをご確認ください。
              </p>
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">確認コード（6桁）</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                    required
                    autoFocus
                    placeholder="000000"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-2xl font-bold tracking-[0.3em] text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  />
                </div>
                {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || code.length < 6}
                  className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
                >
                  {loading ? "確認中..." : "ログイン"}
                </button>
                <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
                  <button
                    type="button"
                    onClick={() => { setStep("email"); setCode(""); setError(""); }}
                    className="underline underline-offset-2 transition hover:text-slate-600"
                  >
                    メールアドレスを変更
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={cooldown > 0 || loading}
                    className="underline underline-offset-2 transition hover:text-slate-600 disabled:opacity-50 disabled:no-underline"
                  >
                    {cooldown > 0 ? `再送信（${cooldown}秒後）` : "コードを再送信"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {step === "bookings" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-slate-900">あなたの予約</h1>
                <p className="text-xs text-slate-400">{participantEmail}</p>
              </div>
              <button
                type="button"
                onClick={loadBookings}
                disabled={loadingBookings}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingBookings ? "更新中..." : "更新"}
              </button>
            </div>

            {loadingBookings ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
              </div>
            ) : requests.length === 0 ? (
              <div className="rounded-3xl border border-white/80 bg-white/85 px-6 py-12 text-center shadow-sm backdrop-blur">
                <p className="text-sm text-slate-500">このメールアドレスの予約が見つかりません</p>
                <p className="mt-1 text-xs text-slate-400">
                  別のメールアドレスで申し込んだ場合はログアウトして再度お試しください
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((req) => (
                  <BookingCard
                    key={req.id}
                    request={req}
                    study={studyMap[req.studyId]}
                    slot={slotMap[req.assignedSlotId]}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
