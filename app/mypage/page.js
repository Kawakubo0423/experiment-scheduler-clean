"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp, firebaseReady } from "@/app/lib/firebase";
import { Card, MypageHeader, StatusBadge, LoadingCard, classNames } from "@/app/components/shared";

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

function getStatusTone(status, confirmationStatus) {
  if (status === "assigned" || status === "confirmed") {
    if (confirmationStatus === "confirmed") return "emerald";
    if (confirmationStatus === "change_requested") return "rose";
    if (confirmationStatus === "pending") return "amber";
    return "emerald";
  }
  if (status === "cancelled" || status === "rejected") return "slate";
  return "amber";
}

function getStatusLabel(status, confirmationStatus) {
  if (status === "assigned" || status === "confirmed") {
    if (confirmationStatus === "confirmed") return "参加確定";
    if (confirmationStatus === "change_requested") return "変更希望";
    if (confirmationStatus === "pending") return "確認待ち";
    return "参加確定";
  }
  const map = { requested: "申込中", cancelled: "キャンセル", rejected: "不採用" };
  return map[status] || status;
}

function formatDateJP(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}

function formatCreatedAt(isoStr) {
  if (!isoStr) return "";
  return new Date(isoStr).toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
}

function BookingCard({ request, study, slot }) {
  const studyTitle = study?.title || "（実験名不明）";
  const token = request.participantResponseToken;
  const responseUrl = token ? `/response?token=${encodeURIComponent(token)}` : null;
  const tone = getStatusTone(request.status, request.participantConfirmationStatus);
  const label = getStatusLabel(request.status, request.participantConfirmationStatus);

  const slotLine = slot
    ? `${formatDateJP(slot.date)}　${PERIOD_LABELS[slot.periodKey] || slot.periodKey || ""}${slot.location ? `　${slot.location}` : ""}`
    : null;

  const accentClass =
    tone === "emerald" ? "bg-gradient-to-r from-emerald-400 to-teal-400"
    : tone === "rose" ? "bg-gradient-to-r from-rose-400 to-orange-400"
    : tone === "amber" ? "bg-gradient-to-r from-amber-400 to-yellow-400"
    : "bg-gradient-to-r from-slate-300 to-slate-400";

  return (
    <Card className="overflow-hidden p-0">
      <div className={classNames("h-1.5 w-full", accentClass)} />
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">BOOKING</div>
            <div className="mt-1.5 truncate text-lg font-bold text-slate-900">{studyTitle}</div>
            <div className="mt-0.5 text-xs text-slate-400">申込日: {formatCreatedAt(request.createdAt)}</div>
          </div>
          <StatusBadge tone={tone}>{label}</StatusBadge>
        </div>

        {slotLine ? (
          <div className="mt-4 rounded-2xl border border-teal-100 bg-teal-50/70 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">確定日程</div>
            <div className="mt-1 text-sm font-medium text-slate-900">{slotLine}</div>
          </div>
        ) : request.status === "requested" ? (
          <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            まだ日程は確定していません。管理者が確認後、ご連絡します。
          </div>
        ) : null}

        {responseUrl ? (
          <a
            href={responseUrl}
            className="mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-700 transition hover:bg-teal-100"
          >
            詳細・変更希望・メッセージ →
          </a>
        ) : null}
      </div>
    </Card>
  );
}

function getCallable(name) {
  return httpsCallable(getFunctions(firebaseApp), name);
}

export default function MyPage() {
  const [step, setStep] = useState("init");
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
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0%,_#f8fafc_38%,_#eef2ff_100%)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0%,_#f8fafc_38%,_#eef2ff_100%)] text-slate-900">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <MypageHeader
          email={step === "bookings" ? participantEmail : null}
          onSignOut={step === "bookings" ? handleSignOut : null}
        />

        {step === "email" && (
          <Card>
            <h2 className="mb-1 text-base font-semibold text-slate-800">メールアドレスで認証</h2>
            <p className="mb-6 text-sm leading-6 text-slate-500">
              実験申し込み時に使ったメールアドレスを入力してください。確認コードをお送りします。
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
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                />
              </div>
              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
              )}
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full rounded-2xl bg-teal-600 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
              >
                {loading ? "送信中..." : "確認コードを送信"}
              </button>
            </form>
          </Card>
        )}

        {step === "otp" && (
          <Card>
            <h2 className="mb-1 text-base font-semibold text-slate-800">確認コードを入力</h2>
            <p className="mb-1 text-sm text-slate-500">
              <span className="font-medium text-slate-700">{email}</span> に6桁のコードを送信しました。
            </p>
            <p className="mb-6 text-xs text-slate-400">
              届かない場合は迷惑メールフォルダをご確認ください（有効期限: 10分）
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
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-2xl font-bold tracking-[0.3em] text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                />
              </div>
              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
              )}
              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="w-full rounded-2xl bg-teal-600 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
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
          </Card>
        )}

        {step === "bookings" && (
          <div className="space-y-4">
            {loadingBookings ? (
              <LoadingCard title="予約情報を読み込んでいます..." />
            ) : requests.length === 0 ? (
              <Card>
                <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-800">
                  このメールアドレスの予約が見つかりません。別のメールアドレスで申し込んだ場合はログアウトして再度お試しください。
                </div>
              </Card>
            ) : (
              <>
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={loadBookings}
                    disabled={loadingBookings}
                    className="rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-500 backdrop-blur transition hover:bg-white disabled:opacity-50"
                  >
                    更新
                  </button>
                </div>
                {requests.map((req) => (
                  <BookingCard
                    key={req.id}
                    request={req}
                    study={studyMap[req.studyId]}
                    slot={slotMap[req.assignedSlotId]}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
