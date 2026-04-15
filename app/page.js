"use client";

import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

const PERIODS = [
  { key: "p1", label: "1時限", start: "09:00", end: "10:35" },
  { key: "p2", label: "2時限", start: "10:45", end: "12:20" },
  { key: "p3", label: "3時限", start: "13:10", end: "14:45" },
  { key: "p4", label: "4時限", start: "14:55", end: "16:30" },
  { key: "p5", label: "5時限", start: "16:40", end: "18:15" },
  { key: "p6", label: "6時限", start: "18:25", end: "20:00" },
  { key: "p7", label: "7時限", start: "20:10", end: "21:45" },
];

const PERIOD_MAP = Object.fromEntries(PERIODS.map((period) => [period.key, period]));
const WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const SAMPLE_SLOTS = [
  {
    id: "sample-slot-1",
    date: "2026-04-21",
    periodKey: "p3",
    capacity: 2,
    confirmedCount: 1,
    isPublished: true,
    location: "OIC 実験室A",
    note: "VR体験あり / 約30分",
  },
  {
    id: "sample-slot-2",
    date: "2026-04-21",
    periodKey: "p4",
    capacity: 2,
    confirmedCount: 0,
    isPublished: true,
    location: "OIC 実験室A",
    note: "VR体験あり / 約30分",
  },
  {
    id: "sample-slot-3",
    date: "2026-04-24",
    periodKey: "p3",
    capacity: 3,
    confirmedCount: 1,
    isPublished: true,
    location: "OIC 実験室B",
    note: "放課後参加しやすい枠",
  },
];

const SAMPLE_REQUESTS = [
  {
    id: "sample-request-1",
    name: "山田 太郎",
    email: "taro@example.com",
    affiliation: "情報理工学部 B3",
    note: "できれば午後希望",
    preferredSlotIds: ["sample-slot-1", "sample-slot-3"],
    assignedSlotId: "sample-slot-1",
    status: "confirmed",
  },
];

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const ALLOWED_ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const firebaseReady = Object.values(firebaseConfig).every(Boolean);

let firebaseApp;
let firebaseAuth;
let firestore;

if (firebaseReady) {
  firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  firebaseAuth = getAuth(firebaseApp);
  firestore = getFirestore(firebaseApp);
}

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatJapaneseDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatMonthTitle(date) {
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
  });
}

function sortSlots(slots) {
  return [...slots].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return PERIODS.findIndex((item) => item.key === a.periodKey) - PERIODS.findIndex((item) => item.key === b.periodKey);
  });
}

function getMonthGrid(baseMonth) {
  const firstDay = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function getSlotLabel(slot) {
  const period = PERIOD_MAP[slot.periodKey];
  return `${period.label} (${period.start}〜${period.end})`;
}

function getSlotMetrics(slot, requests = []) {
  const confirmed = typeof slot.confirmedCount === "number"
    ? slot.confirmedCount
    : requests.filter((request) => request.assignedSlotId === slot.id).length;
  const interested = requests.length
    ? requests.filter((request) => (request.preferredSlotIds || []).includes(slot.id)).length
    : 0;
  const remaining = Math.max(Number(slot.capacity || 1) - confirmed, 0);

  return {
    confirmed,
    interested,
    remaining,
    full: remaining <= 0,
  };
}

function getDaySummary(dateKey, slots) {
  const daySlots = slots.filter((slot) => slot.date === dateKey && slot.isPublished !== false);
  const slotCount = daySlots.length;
  const totalRemaining = daySlots.reduce((sum, slot) => sum + getSlotMetrics(slot).remaining, 0);
  const fullCount = daySlots.filter((slot) => getSlotMetrics(slot).full).length;

  return {
    slotCount,
    totalRemaining,
    fullCount,
  };
}

function downloadText(filename, text, mimeType = "application/json") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ tone = "slate", children }) {
  const tones = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    emerald: "border-emerald-200 bg-emerald-100 text-emerald-700",
    amber: "border-amber-200 bg-amber-100 text-amber-700",
    rose: "border-rose-200 bg-rose-100 text-rose-700",
    sky: "border-sky-200 bg-sky-100 text-sky-700",
  };

  return (
    <span className={classNames("inline-flex rounded-full border px-3 py-1 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

const Card = forwardRef(function Card({ className = "", children }, ref) {
  return (
    <div
      ref={ref}
      className={classNames(
        "rounded-[28px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur",
        className
      )}
    >
      {children}
    </div>
  );
});

function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{eyebrow}</div> : null}
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
        {description ? <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function IconButton({ children, ...props }) {
  return (
    <button
      {...props}
      className={classNames(
        "flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300",
        props.className || ""
      )}
    >
      {children}
    </button>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3.75l1.16 2.35a1 1 0 00.77.54l2.6.38-1.88 1.83a1 1 0 00-.29.88l.44 2.59-2.32-1.22a1 1 0 00-.93 0l-2.32 1.22.44-2.59a1 1 0 00-.29-.88L7.47 7.02l2.6-.38a1 1 0 00.77-.54L12 3.75z" />
      <circle cx="12" cy="12" r="2.75" />
      <path d="M3.75 12h2.1M18.15 12h2.1M12 18.15v2.1M12 3.75v2.1" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 118 0v3" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.3-1.9 3.1l3.1 2.4c1.8-1.7 2.9-4.1 2.9-6.9 0-.7-.1-1.4-.2-2.1H12z" />
      <path fill="#34A853" d="M6.6 14.3l-.7.6-2.5 1.9C5 20 8.2 22 12 22c2.7 0 5-.9 6.7-2.5l-3.1-2.4c-.9.6-2 .9-3.6.9-2.7 0-4.9-1.8-5.7-4.2z" />
      <path fill="#4A90E2" d="M3.4 7.8C2.8 9 2.5 10.5 2.5 12s.3 3 .9 4.2c0 0 3.2-2.5 3.2-2.5-.2-.6-.3-1.1-.3-1.7s.1-1.2.3-1.7L3.4 7.8z" />
      <path fill="#FBBC05" d="M12 6.1c1.8 0 3.3.6 4.5 1.7l2.7-2.7C17 3 14.7 2 12 2 8.2 2 5 4 3.4 7.8l3.2 2.5C7.1 7.9 9.3 6.1 12 6.1z" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9.2a2.45 2.45 0 014.4 1.5c0 1.7-1.8 2.2-2.2 3.4" />
      <circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20l4.5-1 9.7-9.7a1.8 1.8 0 000-2.6l-.7-.7a1.8 1.8 0 00-2.6 0L5.2 15.7 4 20z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} aria-label="閉じる" />
      <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-auto rounded-[32px] border border-white/70 bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">HELP</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
          </div>
          <IconButton onClick={onClose} aria-label="閉じる">×</IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

function HelpModal({ onClose }) {
  return (
    <ModalShell title="予約ページの使い方" onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["1", "日付を選ぶ", "空きがある日付をカレンダーで押すと、その日の詳細枠へ自動で移動します。"],
          ["2", "時間を選ぶ", "立命館大学の時限に合わせた枠から、希望する日時を最大3つまで選べます。"],
          ["3", "送信する", "氏名、メールアドレス、所属・学年を入力して送信すれば申込完了です。"],
        ].map(([number, title, text]) => (
          <div key={number} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white">{number}</div>
            <div className="text-base font-semibold text-slate-900">{title}</div>
            <div className="mt-2 text-sm leading-6 text-slate-500">{text}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-3xl border border-sky-200 bg-sky-50 p-5 text-sm leading-7 text-slate-700">
        入力した氏名やメールアドレスは、日程調整と連絡のための利用を想定しています。他の参加者には表示されません。
      </div>
    </ModalShell>
  );
}

function SetupNotice() {
  return (
    <Card className="border-amber-200 bg-amber-50">
      <SectionHeader
        eyebrow="SETUP"
        title="Firebase / Firestore の設定がまだです"
        description="リアルタイム共有のために、認証だけでなく Firestore を使います。下の環境変数を確認してください。"
      />
      <div className="space-y-3 text-sm text-slate-700">
        <p>`.env.local` と Vercel の Environment Variables に次を追加してください。</p>
        <pre className="overflow-auto rounded-2xl bg-slate-900 p-4 text-slate-100">NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_ADMIN_EMAILS=your-mail@example.com</pre>
        <p>Firebase Authentication で Google ログインを有効化し、Firestore の Rules で公開枠と管理者権限を分けてください。</p>
      </div>
    </Card>
  );
}

function PrivacyNote() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
      入力された個人情報は、実験日程の調整と連絡のための利用を想定しています。参加者同士には表示されず、管理者ページはログインした管理者のみが閲覧できます。
    </div>
  );
}

function LoadingCard({ title = "読み込み中..." }) {
  return (
    <Card>
      <div className="text-sm text-slate-500">{title}</div>
    </Card>
  );
}

function ActionToast({ toast, onClose }) {
  if (!toast) return null;

  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
    error: "border-rose-200 bg-rose-50 text-rose-800",
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
      <div className={classNames("rounded-2xl border px-4 py-3 text-sm shadow-lg", styles[toast.tone] || styles.info)}>
        <div className="flex items-start justify-between gap-3">
          <div>{toast.message}</div>
          <button onClick={onClose} className="font-medium opacity-70 hover:opacity-100">×</button>
        </div>
      </div>
    </div>
  );
}

function EditSlotModal({ form, setForm, onSave, onClose, saving }) {
  return (
    <ModalShell title="日程枠を編集" onClose={onClose}>
      <form onSubmit={onSave} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <div className="mb-1.5 text-slate-600">日付</div>
            <input
              type="date"
              value={form.date}
              onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1.5 text-slate-600">時限</div>
            <select
              value={form.periodKey}
              onChange={(event) => setForm((prev) => ({ ...prev, periodKey: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
            >
              {PERIODS.map((period) => (
                <option key={period.key} value={period.key}>
                  {period.label} ({period.start}〜{period.end})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <div className="mb-1.5 text-slate-600">定員</div>
            <input
              type="number"
              min="1"
              value={form.capacity}
              onChange={(event) => setForm((prev) => ({ ...prev, capacity: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
            />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(event) => setForm((prev) => ({ ...prev, isPublished: event.target.checked }))}
            />
            参加者に公開する
          </label>
        </div>
        <label className="block text-sm">
          <div className="mb-1.5 text-slate-600">場所</div>
          <input
            value={form.location}
            onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
          />
        </label>
        <label className="block text-sm">
          <div className="mb-1.5 text-slate-600">メモ</div>
          <textarea
            value={form.note}
            onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
          />
        </label>
        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" disabled={saving} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60">
            {saving ? "保存中..." : "変更を保存"}
          </button>
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            キャンセル
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ParticipantPage({
  sortedSlots,
  displayMonth,
  setDisplayMonth,
  selectedDate,
  handleSelectDate,
  monthSummary,
  days,
  selectedDaySlots,
  participantForm,
  setParticipantForm,
  togglePreferredSlot,
  handleSubmitRequest,
  message,
  detailsRef,
  onOpenAdmin,
  onOpenHelp,
  stats,
  isLoading,
  onRetry,
  setupMode,
}) {
  const mobileDateItems = days
    .filter((day) => day.getMonth() === displayMonth.getMonth())
    .map((day) => {
      const dateKey = formatDateKey(day);
      const summary = monthSummary[dateKey];
      return { day, dateKey, summary };
    })
    .filter(({ summary }) => (summary?.slotCount || 0) > 0);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe_0%,_#eff6ff_24%,_#f8fafc_58%,_#eef2ff_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="mb-6 flex items-start justify-between gap-4 rounded-[32px] border border-white/70 bg-white/70 px-5 py-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:px-7 sm:py-6">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-sky-700">
              RESERVATION PAGE
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              実験日程予約ページ
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
              カレンダーから空いている日を選び、詳細枠を見ながら希望日時を送信できます。必要な説明は右上のヘルプからいつでも確認できます。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <IconButton aria-label="使い方を開く" onClick={onOpenHelp} title="使い方">
              <HelpIcon />
            </IconButton>
            <IconButton aria-label="管理者ページへ" onClick={onOpenAdmin} title="管理者ページへ">
              <GearIcon />
            </IconButton>
          </div>
        </header>

        {setupMode ? <div className="mb-6"><SetupNotice /></div> : null}

        <section className="mb-6 grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
          <Card>
            <SectionHeader
              eyebrow="AT A GLANCE"
              title="今の受付状況"
              description="日程全体の空き具合をざっくり確認できます。"
              action={!setupMode ? (
                <button onClick={onRetry} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  最新状態を再取得
                </button>
              ) : null}
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
              <div className="rounded-3xl bg-slate-50 p-5">
                <div className="text-sm text-slate-500">公開中の枠</div>
                <div className="mt-2 text-3xl font-semibold text-slate-900">{sortedSlots.length}</div>
              </div>
              <div className="rounded-3xl bg-slate-50 p-5">
                <div className="text-sm text-slate-500">残り席数</div>
                <div className="mt-2 text-3xl font-semibold text-slate-900">{stats.openSeats}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
              <StatusBadge tone="emerald">空きあり</StatusBadge>
              <StatusBadge tone="amber">残りわずか</StatusBadge>
              <StatusBadge tone="rose">満枠</StatusBadge>
            </div>
          </Card>

          <PrivacyNote />
        </section>

        {isLoading ? (
          <LoadingCard title="公開中の日程を読み込んでいます..." />
        ) : (
          <section className="grid gap-6 xl:grid-cols-[1.28fr,0.92fr]">
            <Card>
              <SectionHeader
                eyebrow="CALENDAR"
                title="空いている日をカレンダーで選ぶ"
                description="日付を押すと、自動で下の詳細枠へ移動します。"
                action={
                  <div className="flex items-center gap-2">
                    <IconButton onClick={() => setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() - 1, 1))}>
                      <ChevronLeft />
                    </IconButton>
                    <div className="min-w-36 text-center text-sm font-semibold text-slate-700">{formatMonthTitle(displayMonth)}</div>
                    <IconButton onClick={() => setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1))}>
                      <ChevronRight />
                    </IconButton>
                  </div>
                }
              />

              <div className="hidden md:block">
                <div className="mb-3 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-400">
                  {WEEK_LABELS.map((label) => (
                    <div key={label} className="py-2">{label}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {days.map((day) => {
                    const dateKey = formatDateKey(day);
                    const summary = monthSummary[dateKey];
                    const inMonth = day.getMonth() === displayMonth.getMonth();
                    const selected = dateKey === selectedDate;
                    const hasSlots = summary?.slotCount > 0;
                    const onlyFewLeft = hasSlots && summary.totalRemaining <= 1;
                    const allFull = hasSlots && summary.fullCount === summary.slotCount;

                    return (
                      <button
                        key={dateKey}
                        onClick={() => handleSelectDate(dateKey)}
                        className={classNames(
                          "min-h-[114px] rounded-3xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                          inMonth ? "bg-white" : "bg-slate-50 text-slate-400",
                          selected ? "border-slate-900 shadow-md" : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold">{day.getDate()}</div>
                          {hasSlots ? (
                            allFull ? (
                              <StatusBadge tone="rose">満枠</StatusBadge>
                            ) : onlyFewLeft ? (
                              <StatusBadge tone="amber">残少</StatusBadge>
                            ) : (
                              <StatusBadge tone="emerald">空き</StatusBadge>
                            )
                          ) : null}
                        </div>
                        <div className="mt-4 space-y-1 text-xs leading-5 text-slate-500">
                          <div>{summary?.slotCount || 0} 枠</div>
                          <div>{hasSlots ? `残り ${summary.totalRemaining} 席` : "公開枠なし"}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 md:hidden">
                {mobileDateItems.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                    今月の公開中の枠はまだありません。
                  </div>
                ) : (
                  mobileDateItems.map(({ day, dateKey, summary }) => {
                    const selected = dateKey === selectedDate;
                    const allFull = summary.fullCount === summary.slotCount;
                    const few = !allFull && summary.totalRemaining <= 1;
                    return (
                      <button
                        key={dateKey}
                        onClick={() => handleSelectDate(dateKey)}
                        className={classNames(
                          "w-full rounded-3xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                          selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:border-slate-300"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className={classNames("text-lg font-semibold", selected ? "text-white" : "text-slate-900")}>
                              {day.getDate()}日（{WEEK_LABELS[day.getDay()]}）
                            </div>
                            <div className={classNames("mt-1 text-sm", selected ? "text-slate-200" : "text-slate-500")}>
                              {summary.slotCount}枠 / 残り {summary.totalRemaining}席
                            </div>
                          </div>
                          <StatusBadge tone={allFull ? "rose" : few ? "amber" : "emerald"}>
                            {allFull ? "満枠" : few ? "残少" : "空き"}
                          </StatusBadge>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </Card>

            <div className="space-y-6">
              <Card ref={detailsRef} tabIndex={-1} className="scroll-mt-6 focus:outline-none focus:ring-2 focus:ring-sky-300">
                <SectionHeader
                  eyebrow="DETAIL"
                  title={selectedDate ? `${formatJapaneseDate(selectedDate)} の詳細枠` : "日付を選択してください"}
                  description="気になる時間帯を選ぶと、右下の送信フォームに反映されます。"
                />
                <div className="space-y-3">
                  {selectedDaySlots.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                      この日は現在公開されている枠がありません。
                    </div>
                  ) : (
                    selectedDaySlots.map((slot) => {
                      const metrics = getSlotMetrics(slot);
                      const selected = participantForm.preferredSlotIds.includes(slot.id);
                      return (
                        <div key={slot.id} className={classNames("rounded-3xl border p-4 transition", selected ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-slate-50/80")}>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-base font-semibold text-slate-900">{getSlotLabel(slot)}</div>
                                <StatusBadge tone={metrics.full ? "rose" : metrics.remaining <= 1 ? "amber" : "emerald"}>
                                  {metrics.full ? "満枠" : `残り ${metrics.remaining} 席`}
                                </StatusBadge>
                              </div>
                              <div className="mt-2 text-sm text-slate-500">{slot.location || "場所未設定"}</div>
                              {slot.note ? <div className="mt-1 text-sm text-slate-500">{slot.note}</div> : null}
                              {selected ? <div className="mt-3 text-sm font-medium text-sky-700">この枠は希望一覧に追加されています。</div> : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => togglePreferredSlot(slot.id)}
                              disabled={metrics.full && !selected}
                              className={classNames(
                                "rounded-2xl px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                                selected
                                  ? "bg-slate-900 text-white"
                                  : metrics.full
                                  ? "cursor-not-allowed bg-slate-100 text-slate-400"
                                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                              )}
                            >
                              {selected ? "選択中" : "希望に追加"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>

              <Card>
                <SectionHeader
                  eyebrow="FORM"
                  title="希望日時を送信する"
                  description="氏名、メールアドレス、所属・学年、希望枠は必須です。"
                  action={<StatusBadge tone="sky">最大3枠まで</StatusBadge>}
                />

                <form onSubmit={handleSubmitRequest} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm">
                      <div className="mb-1.5 text-slate-600">氏名 <span className="text-rose-500">*</span></div>
                      <input
                        required
                        value={participantForm.name}
                        onChange={(event) => setParticipantForm((prev) => ({ ...prev, name: event.target.value }))}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200"
                        placeholder="例: 山田 太郎"
                        autoComplete="name"
                      />
                    </label>
                    <label className="text-sm">
                      <div className="mb-1.5 text-slate-600">メールアドレス <span className="text-rose-500">*</span></div>
                      <input
                        required
                        type="email"
                        value={participantForm.email}
                        onChange={(event) => setParticipantForm((prev) => ({ ...prev, email: event.target.value }))}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200"
                        placeholder="example@xxx.com"
                        autoComplete="email"
                      />
                    </label>
                  </div>

                  <label className="block text-sm">
                    <div className="mb-1.5 text-slate-600">所属・学年 <span className="text-rose-500">*</span></div>
                    <input
                      required
                      value={participantForm.affiliation}
                      onChange={(event) => setParticipantForm((prev) => ({ ...prev, affiliation: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200"
                      placeholder="例: 情報理工学部 B4"
                    />
                  </label>

                  <label className="block text-sm">
                    <div className="mb-1.5 text-slate-600">補足</div>
                    <textarea
                      value={participantForm.note}
                      onChange={(event) => setParticipantForm((prev) => ({ ...prev, note: event.target.value }))}
                      className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200"
                      placeholder="例: 放課後希望 / VR酔いしやすい など"
                    />
                  </label>

                  <div className="rounded-3xl bg-slate-50 p-4">
                    <div className="text-sm font-medium text-slate-700">選択中の希望枠 <span className="text-rose-500">*</span></div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {participantForm.preferredSlotIds.length === 0 ? (
                        <div className="text-sm text-slate-500">まだ選択されていません。</div>
                      ) : (
                        participantForm.preferredSlotIds.map((slotId) => {
                          const slot = sortedSlots.find((item) => item.id === slotId);
                          if (!slot) return null;
                          return (
                            <button
                              key={slotId}
                              type="button"
                              onClick={() => togglePreferredSlot(slotId)}
                              className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700"
                            >
                              {formatJapaneseDate(slot.date)} / {PERIOD_MAP[slot.periodKey].label} ×
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <PrivacyNote />

                  {message ? (
                    <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      {message}
                    </div>
                  ) : null}

                  <button className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300">
                    希望日時を送信する
                  </button>
                </form>
              </Card>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function AdminPage({
  adminTab,
  setAdminTab,
  stats,
  exportJson,
  resetAll,
  slotForm,
  setSlotForm,
  handleAddSlot,
  sortedSlots,
  requests,
  handleDeleteSlot,
  handleTogglePublished,
  onEditSlot,
  search,
  setSearch,
  filteredRequests,
  handleAssignRequest,
  handleDeleteRequest,
  onBack,
  onLogout,
  adminEmail,
  isLoading,
  onSeedSampleData,
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e2e8f0_0%,_#f8fafc_32%,_#eef2ff_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="mb-6 flex flex-col gap-4 rounded-[32px] border border-white/70 bg-white/80 px-5 py-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:px-7 sm:py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-slate-700">
              ADMIN PAGE
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              管理者ページ
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
              申込一覧の確認、日程枠の追加、確定処理をここでまとめて行えます。
            </p>
            {adminEmail ? <p className="mt-2 text-sm text-slate-500">ログイン中: {adminEmail}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeftIcon />
              予約ページへ戻る
            </button>
            <button
              onClick={onLogout}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ログアウト
            </button>
          </div>
        </header>

        {isLoading ? <LoadingCard title="管理データを読み込んでいます..." /> : null}

        <div className="mb-6 flex flex-wrap gap-2">
          {[
            ["dashboard", "概要"],
            ["slots", "日程管理"],
            ["requests", "申込一覧"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setAdminTab(key)}
              className={classNames(
                "rounded-2xl px-4 py-2 text-sm font-medium transition",
                adminTab === key ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {adminTab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">申込件数</div><div className="mt-2 text-3xl font-semibold">{stats.requestCount}</div></div>
              <div className="rounded-3xl bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">未確定</div><div className="mt-2 text-3xl font-semibold">{stats.pending}</div></div>
              <div className="rounded-3xl bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">確定済み</div><div className="mt-2 text-3xl font-semibold">{stats.confirmed}</div></div>
              <div className="rounded-3xl bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">残り席数</div><div className="mt-2 text-3xl font-semibold">{stats.openSeats}</div></div>
            </div>

            <Card className="p-5 shadow-none">
              <SectionHeader
                eyebrow="BACKUP"
                title="データの保存と初期化"
                description="個人情報を含むため、書き出しデータの取り扱いには注意してください。"
                action={
                  <button onClick={onSeedSampleData} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    デモ枠を追加
                  </button>
                }
              />
              <div className="flex flex-wrap gap-3">
                <button onClick={exportJson} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  JSONを書き出す
                </button>
                <button onClick={resetAll} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100">
                  データを初期化
                </button>
              </div>
            </Card>
          </div>
        )}

        {adminTab === "slots" && (
          <div className="space-y-6">
            <Card className="p-5 shadow-none">
              <SectionHeader
                eyebrow="SLOT FORM"
                title="実験枠を追加する"
                description="参加者に見せる候補枠をここで登録できます。"
              />
              <form onSubmit={handleAddSlot} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    <div className="mb-1.5 text-slate-600">日付</div>
                    <input
                      type="date"
                      value={slotForm.date}
                      onChange={(event) => setSlotForm((prev) => ({ ...prev, date: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="mb-1.5 text-slate-600">時限</div>
                    <select
                      value={slotForm.periodKey}
                      onChange={(event) => setSlotForm((prev) => ({ ...prev, periodKey: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
                    >
                      {PERIODS.map((period) => (
                        <option key={period.key} value={period.key}>{period.label} ({period.start}〜{period.end})</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    <div className="mb-1.5 text-slate-600">定員</div>
                    <input
                      type="number"
                      min="1"
                      value={slotForm.capacity}
                      onChange={(event) => setSlotForm((prev) => ({ ...prev, capacity: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
                    />
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={slotForm.isPublished}
                      onChange={(event) => setSlotForm((prev) => ({ ...prev, isPublished: event.target.checked }))}
                    />
                    参加者に公開する
                  </label>
                </div>
                <label className="block text-sm">
                  <div className="mb-1.5 text-slate-600">場所</div>
                  <input
                    value={slotForm.location}
                    onChange={(event) => setSlotForm((prev) => ({ ...prev, location: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
                  />
                </label>
                <label className="block text-sm">
                  <div className="mb-1.5 text-slate-600">メモ</div>
                  <textarea
                    value={slotForm.note}
                    onChange={(event) => setSlotForm((prev) => ({ ...prev, note: event.target.value }))}
                    className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
                  />
                </label>
                <button className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800">
                  日程枠を追加する
                </button>
              </form>
            </Card>

            <div className="space-y-3">
              {sortedSlots.map((slot) => {
                const metrics = getSlotMetrics(slot, requests);
                return (
                  <div key={slot.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-slate-900">{formatJapaneseDate(slot.date)} / {getSlotLabel(slot)}</div>
                          <StatusBadge tone={slot.isPublished === false ? "slate" : "sky"}>{slot.isPublished === false ? "非公開" : "公開中"}</StatusBadge>
                        </div>
                        <div className="mt-2 text-sm text-slate-500">{slot.location} / 定員 {slot.capacity} / 残り {metrics.remaining}</div>
                        {slot.note ? <div className="mt-1 text-sm text-slate-500">{slot.note}</div> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => onEditSlot(slot)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          <PencilIcon />
                          編集
                        </button>
                        <button onClick={() => handleTogglePublished(slot)} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          {slot.isPublished === false ? "公開にする" : "非公開にする"}
                        </button>
                        <button onClick={() => handleDeleteSlot(slot.id)} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100">
                          削除
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {adminTab === "requests" && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="氏名・メール・所属で検索"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              />
            </div>

            {filteredRequests.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                条件に一致する申込はありません。
              </div>
            ) : (
              filteredRequests.map((request) => {
                const preferredSlots = sortedSlots.filter((slot) => (request.preferredSlotIds || []).includes(slot.id));
                const assignedSlot = sortedSlots.find((slot) => slot.id === request.assignedSlotId);
                return (
                  <div key={request.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-lg font-semibold text-slate-900">{request.name}</div>
                          <StatusBadge tone={request.assignedSlotId ? "emerald" : "amber"}>
                            {request.assignedSlotId ? "確定済み" : "未確定"}
                          </StatusBadge>
                        </div>
                        <div className="mt-2 text-sm text-slate-500">{request.email}</div>
                        {request.affiliation ? <div className="mt-1 text-sm text-slate-500">{request.affiliation}</div> : null}
                        {request.note ? <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{request.note}</div> : null}

                        <div className="mt-4">
                          <div className="mb-2 text-sm font-medium text-slate-700">希望枠</div>
                          <div className="grid gap-3">
                            {preferredSlots.map((slot) => {
                              const metrics = getSlotMetrics(slot, requests);
                              const isAssigned = request.assignedSlotId === slot.id;
                              const disableConfirm = metrics.full && !isAssigned;
                              return (
                                <div key={slot.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="text-sm text-slate-700">
                                    {formatJapaneseDate(slot.date)} / {PERIOD_MAP[slot.periodKey].label}
                                    <div className="mt-1 text-xs text-slate-500">残り {metrics.remaining} 席</div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      disabled={disableConfirm}
                                      onClick={() => handleAssignRequest(request.id, slot.id)}
                                      className={classNames(
                                        "rounded-2xl px-4 py-2 text-sm font-medium transition",
                                        isAssigned
                                          ? "bg-slate-900 text-white"
                                          : disableConfirm
                                          ? "cursor-not-allowed bg-slate-100 text-slate-400"
                                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                                      )}
                                    >
                                      {isAssigned ? "確定済み" : "この枠で確定"}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="w-full xl:w-[300px]">
                        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                          {assignedSlot ? `確定: ${formatJapaneseDate(assignedSlot.date)} / ${PERIOD_MAP[assignedSlot.periodKey].label}` : "まだ日程は確定していません。"}
                        </div>
                        {assignedSlot ? (
                          <button
                            type="button"
                            onClick={() => handleAssignRequest(request.id, "")}
                            className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            確定を解除
                          </button>
                        ) : null}
                        <button onClick={() => handleDeleteRequest(request.id)} className="mt-3 w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 hover:bg-rose-100">
                          申込を削除
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminLoginPage({
  authUser,
  authReady,
  authError,
  firebaseEnabled,
  onBack,
  onGoogleLogin,
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e2e8f0_0%,_#f8fafc_30%,_#eef2ff_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex justify-between gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeftIcon />
            予約ページへ戻る
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr,0.95fr]">
          <Card className="bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(51,65,85,0.92))] text-white">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <LockIcon />
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight">管理者ページ</h1>
            <p className="mt-4 text-sm leading-7 text-slate-200">
              Googleログインで管理者を認証します。許可されたメールアドレスのみ、申込一覧と日程確定処理へアクセスできます。
            </p>
            <div className="mt-6 grid gap-3 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/10 p-4">申込一覧の閲覧</div>
              <div className="rounded-2xl bg-white/10 p-4">日程枠の追加・削除</div>
              <div className="rounded-2xl bg-white/10 p-4">希望枠からの日程確定</div>
            </div>
          </Card>

          <div className="space-y-6">
            {!firebaseEnabled ? <SetupNotice /> : null}
            <Card>
              <SectionHeader
                eyebrow="LOGIN"
                title="Googleでログイン"
                description="Firebase Authentication を使って管理者ログインを行います。"
              />

              <div className="space-y-4">
                {authUser ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    現在のログインアカウント: {authUser.email}
                  </div>
                ) : null}

                {authError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {authError}
                  </div>
                ) : null}

                <button
                  disabled={!firebaseEnabled || !authReady}
                  onClick={onGoogleLogin}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <GoogleIcon />
                  Googleでログインする
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExperimentParticipantScheduler() {
  const [slots, setSlots] = useState([]);
  const [requests, setRequests] = useState([]);
  const [displayMonth, setDisplayMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState("");
  const [page, setPage] = useState("participant");
  const [adminTab, setAdminTab] = useState("dashboard");
  const [authReady, setAuthReady] = useState(!firebaseReady);
  const [authUser, setAuthUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [editSlotForm, setEditSlotForm] = useState({
    date: "",
    periodKey: "p3",
    capacity: 1,
    location: "",
    note: "",
    isPublished: true,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [toast, setToast] = useState(null);
  const [participantForm, setParticipantForm] = useState({
    name: "",
    email: "",
    affiliation: "",
    note: "",
    preferredSlotIds: [],
  });
  const [slotForm, setSlotForm] = useState({
    date: "",
    periodKey: "p3",
    capacity: 1,
    location: "OIC 実験室A",
    note: "",
    isPublished: true,
  });
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(firebaseReady);
  const [requestsLoading, setRequestsLoading] = useState(firebaseReady);
  const [dataError, setDataError] = useState("");
  const detailsRef = useRef(null);
  const shouldFocusDetailsRef = useRef(false);

  useEffect(() => {
    document.title = "実験日程予約ページ";
  }, []);

  useEffect(() => {
    if (!firebaseReady) {
      setSlots(sortSlots(SAMPLE_SLOTS));
      setRequests(SAMPLE_REQUESTS);
      setSelectedDate("");
      setSlotsLoading(false);
      setRequestsLoading(false);
      return;
    }

    const publicSlotsQuery = query(collection(firestore, "slots"), where("isPublished", "==", true));
    const unsubscribePublicSlots = onSnapshot(
      publicSlotsQuery,
      (snapshot) => {
        if (page === "participant" || page === "admin-login") {
          const nextSlots = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
          if (page !== "admin") setSlots(sortSlots(nextSlots));
        }
        setSlotsLoading(false);
        setDataError("");
      },
      (error) => {
        console.error(error);
        setSlotsLoading(false);
        setDataError("日程データの取得に失敗しました。");
      }
    );

    return () => unsubscribePublicSlots();
  }, [page]);

  useEffect(() => {
    if (!firebaseReady) return undefined;
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!firebaseReady || page !== "admin" || !authUser) return undefined;

    const unsubscribeSlots = onSnapshot(
      collection(firestore, "slots"),
      (snapshot) => {
        const nextSlots = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        setSlots(sortSlots(nextSlots));
        setSlotsLoading(false);
        setDataError("");
      },
      (error) => {
        console.error(error);
        setSlotsLoading(false);
        setDataError("管理者用の日程データ取得に失敗しました。");
      }
    );

    const unsubscribeRequests = onSnapshot(
      collection(firestore, "requests"),
      (snapshot) => {
        const nextRequests = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
          });
        setRequests(nextRequests);
        setRequestsLoading(false);
      },
      (error) => {
        console.error(error);
        setRequestsLoading(false);
        setDataError("申込データの取得に失敗しました。");
      }
    );

    return () => {
      unsubscribeSlots();
      unsubscribeRequests();
    };
  }, [page, authUser]);

  useEffect(() => {
    if (!selectedDate || !detailsRef.current || page !== "participant" || !shouldFocusDetailsRef.current) return;
    const target = detailsRef.current;
    const handle = requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.focus({ preventScroll: true });
      shouldFocusDetailsRef.current = false;
    });
    return () => cancelAnimationFrame(handle);
  }, [selectedDate, page]);

  useEffect(() => {
    document.body.style.overflow = showHelp || !!editingSlot ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [showHelp, editingSlot]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const adminAuthorized = !!authUser?.email && ALLOWED_ADMIN_EMAILS.includes(authUser.email.toLowerCase());

  const sortedSlots = useMemo(() => sortSlots(slots), [slots]);
  const days = useMemo(() => getMonthGrid(displayMonth), [displayMonth]);
  const selectedDaySlots = useMemo(
    () => sortedSlots.filter((slot) => slot.date === selectedDate && slot.isPublished !== false),
    [sortedSlots, selectedDate]
  );

  const monthSummary = useMemo(() => {
    const summaryMap = {};
    days.forEach((day) => {
      summaryMap[formatDateKey(day)] = getDaySummary(formatDateKey(day), sortedSlots);
    });
    return summaryMap;
  }, [days, sortedSlots]);

  const stats = useMemo(() => {
    const confirmed = requests.filter((request) => request.assignedSlotId).length;
    const pending = requests.filter((request) => !request.assignedSlotId).length;
    const openSeats = sortedSlots
      .filter((slot) => slot.isPublished !== false || page === "admin")
      .reduce((sum, slot) => sum + getSlotMetrics(slot, requests).remaining, 0);

    return {
      requestCount: requests.length,
      confirmed,
      pending,
      openSeats,
    };
  }, [requests, sortedSlots, page]);

  const filteredRequests = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return requests;
    return requests.filter((request) => {
      const text = [request.name, request.email, request.affiliation, request.note].join(" ").toLowerCase();
      return text.includes(keyword);
    });
  }, [requests, search]);

  function showToast(messageText, tone = "info") {
    setToast({ message: messageText, tone, id: Date.now() });
  }

  function handleSelectDate(dateKey) {
    shouldFocusDetailsRef.current = true;
    setSelectedDate(dateKey);
  }

  function togglePreferredSlot(slotId) {
    const exists = participantForm.preferredSlotIds.includes(slotId);
    setParticipantForm((prev) => {
      if (exists) {
        return {
          ...prev,
          preferredSlotIds: prev.preferredSlotIds.filter((id) => id !== slotId),
        };
      }
      if (prev.preferredSlotIds.length >= 3) return prev;
      return {
        ...prev,
        preferredSlotIds: [...prev.preferredSlotIds, slotId],
      };
    });

    if (exists) {
      showToast("希望枠から外しました。", "info");
    } else if (participantForm.preferredSlotIds.length >= 3) {
      showToast("希望枠は最大3つまでです。", "error");
    } else {
      showToast("希望枠に追加しました。", "success");
    }
  }

  async function handleSubmitRequest(event) {
    event.preventDefault();
    if (
      !participantForm.name.trim() ||
      !participantForm.email.trim() ||
      !participantForm.affiliation.trim() ||
      participantForm.preferredSlotIds.length === 0
    ) {
      setMessage("氏名、メールアドレス、所属・学年、希望枠は必須です。");
      showToast("必須項目を入力してください。", "error");
      return;
    }

    try {
      if (firebaseReady) {
        await addDoc(collection(firestore, "requests"), {
          name: participantForm.name.trim(),
          email: participantForm.email.trim(),
          affiliation: participantForm.affiliation.trim(),
          note: participantForm.note.trim(),
          preferredSlotIds: participantForm.preferredSlotIds,
          assignedSlotId: "",
          status: "requested",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        setRequests((prev) => [
          {
            id: crypto.randomUUID(),
            name: participantForm.name.trim(),
            email: participantForm.email.trim(),
            affiliation: participantForm.affiliation.trim(),
            note: participantForm.note.trim(),
            preferredSlotIds: participantForm.preferredSlotIds,
            assignedSlotId: "",
            status: "requested",
          },
          ...prev,
        ]);
      }

      setParticipantForm({
        name: "",
        email: "",
        affiliation: "",
        note: "",
        preferredSlotIds: [],
      });
      setMessage("希望日時を送信しました。確認後に連絡します。");
      showToast("希望日時を送信しました。", "success");
    } catch (error) {
      console.error(error);
      setMessage("送信に失敗しました。時間をおいて再度お試しください。");
      showToast("送信に失敗しました。", "error");
    }
  }

  async function handleAddSlot(event) {
    event.preventDefault();
    if (!slotForm.date || !slotForm.periodKey) return;

    try {
      if (firebaseReady) {
        await addDoc(collection(firestore, "slots"), {
          date: slotForm.date,
          periodKey: slotForm.periodKey,
          capacity: Number(slotForm.capacity || 1),
          confirmedCount: 0,
          isPublished: Boolean(slotForm.isPublished),
          location: slotForm.location.trim(),
          note: slotForm.note.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        setSlots((prev) => sortSlots([
          ...prev,
          {
            id: crypto.randomUUID(),
            date: slotForm.date,
            periodKey: slotForm.periodKey,
            capacity: Number(slotForm.capacity || 1),
            confirmedCount: 0,
            isPublished: Boolean(slotForm.isPublished),
            location: slotForm.location.trim(),
            note: slotForm.note.trim(),
          },
        ]));
      }

      setSlotForm((prev) => ({ ...prev, note: "", isPublished: true }));
      showToast("日程枠を追加しました。", "success");
    } catch (error) {
      console.error(error);
      showToast("日程枠の追加に失敗しました。", "error");
    }
  }

  async function handleDeleteSlot(slotId) {
    const ok = window.confirm("この日程枠を削除しますか？ 関連する希望枠・確定情報も更新されます。");
    if (!ok) return;

    try {
      if (firebaseReady) {
        const batch = writeBatch(firestore);
        batch.delete(doc(firestore, "slots", slotId));

        requests.forEach((request) => {
          const preferred = (request.preferredSlotIds || []).filter((id) => id !== slotId);
          const assigned = request.assignedSlotId === slotId ? "" : request.assignedSlotId || "";
          if (preferred.length !== (request.preferredSlotIds || []).length || assigned !== (request.assignedSlotId || "")) {
            batch.update(doc(firestore, "requests", request.id), {
              preferredSlotIds: preferred,
              assignedSlotId: assigned,
              status: assigned ? "confirmed" : "requested",
              updatedAt: serverTimestamp(),
            });
          }
        });

        await batch.commit();
      } else {
        setSlots((prev) => prev.filter((slot) => slot.id !== slotId));
        setRequests((prev) =>
          prev.map((request) => ({
            ...request,
            preferredSlotIds: (request.preferredSlotIds || []).filter((id) => id !== slotId),
            assignedSlotId: request.assignedSlotId === slotId ? "" : request.assignedSlotId,
            status: request.assignedSlotId === slotId ? "requested" : request.status,
          }))
        );
      }
      showToast("日程枠を削除しました。", "success");
    } catch (error) {
      console.error(error);
      showToast("日程枠の削除に失敗しました。", "error");
    }
  }

  async function handleTogglePublished(slot) {
    try {
      if (firebaseReady) {
        await updateDoc(doc(firestore, "slots", slot.id), {
          isPublished: slot.isPublished === false ? true : false,
          updatedAt: serverTimestamp(),
        });
      } else {
        setSlots((prev) => prev.map((item) => item.id === slot.id ? { ...item, isPublished: item.isPublished === false ? true : false } : item));
      }
      showToast(slot.isPublished === false ? "公開にしました。" : "非公開にしました。", "success");
    } catch (error) {
      console.error(error);
      showToast("公開状態の変更に失敗しました。", "error");
    }
  }

  function openEditSlot(slot) {
    setEditingSlot(slot);
    setEditSlotForm({
      date: slot.date,
      periodKey: slot.periodKey,
      capacity: String(slot.capacity || 1),
      location: slot.location || "",
      note: slot.note || "",
      isPublished: slot.isPublished !== false,
    });
  }

  async function saveEditedSlot(event) {
    event.preventDefault();
    if (!editingSlot) return;

    try {
      setSavingEdit(true);
      const payload = {
        date: editSlotForm.date,
        periodKey: editSlotForm.periodKey,
        capacity: Number(editSlotForm.capacity || 1),
        location: editSlotForm.location.trim(),
        note: editSlotForm.note.trim(),
        isPublished: Boolean(editSlotForm.isPublished),
      };

      if (firebaseReady) {
        await updateDoc(doc(firestore, "slots", editingSlot.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
      } else {
        setSlots((prev) => prev.map((slot) => slot.id === editingSlot.id ? { ...slot, ...payload } : slot));
      }

      setEditingSlot(null);
      showToast("日程枠を更新しました。", "success");
    } catch (error) {
      console.error(error);
      showToast("日程枠の更新に失敗しました。", "error");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleAssignRequest(requestId, slotId) {
    const requestItem = requests.find((item) => item.id === requestId);
    if (!requestItem) return;

    try {
      if (firebaseReady) {
        await runTransaction(firestore, async (transaction) => {
          const requestRef = doc(firestore, "requests", requestId);
          const requestSnap = await transaction.get(requestRef);
          if (!requestSnap.exists()) throw new Error("request-not-found");
          const requestData = requestSnap.data();
          const previousSlotId = requestData.assignedSlotId || "";

          if (previousSlotId === slotId) return;

          if (previousSlotId) {
            const prevRef = doc(firestore, "slots", previousSlotId);
            const prevSnap = await transaction.get(prevRef);
            if (prevSnap.exists()) {
              const prevData = prevSnap.data();
              const nextCount = Math.max(Number(prevData.confirmedCount || 0) - 1, 0);
              transaction.update(prevRef, {
                confirmedCount: nextCount,
                updatedAt: serverTimestamp(),
              });
            }
          }

          if (slotId) {
            const nextRef = doc(firestore, "slots", slotId);
            const nextSnap = await transaction.get(nextRef);
            if (!nextSnap.exists()) throw new Error("slot-not-found");
            const nextData = nextSnap.data();
            const capacity = Number(nextData.capacity || 1);
            const confirmedCount = Number(nextData.confirmedCount || 0);
            if (confirmedCount >= capacity) throw new Error("slot-full");
            transaction.update(nextRef, {
              confirmedCount: confirmedCount + 1,
              updatedAt: serverTimestamp(),
            });
          }

          transaction.update(requestRef, {
            assignedSlotId: slotId,
            status: slotId ? "confirmed" : "requested",
            updatedAt: serverTimestamp(),
          });
        });
      } else {
        const previousSlotId = requestItem.assignedSlotId || "";
        setSlots((prev) => prev.map((slot) => {
          if (slot.id === previousSlotId) return { ...slot, confirmedCount: Math.max(Number(slot.confirmedCount || 0) - 1, 0) };
          if (slot.id === slotId) return { ...slot, confirmedCount: Number(slot.confirmedCount || 0) + 1 };
          return slot;
        }));
        setRequests((prev) => prev.map((item) => item.id === requestId ? { ...item, assignedSlotId: slotId, status: slotId ? "confirmed" : "requested" } : item));
      }
      showToast(slotId ? "日程を確定しました。" : "確定を解除しました。", "success");
    } catch (error) {
      console.error(error);
      if (String(error?.message).includes("slot-full")) {
        showToast("その枠はすでに満席です。最新状態を確認してください。", "error");
      } else {
        showToast("確定処理に失敗しました。", "error");
      }
    }
  }

  async function handleDeleteRequest(requestId) {
    const requestItem = requests.find((item) => item.id === requestId);
    if (!requestItem) return;
    const ok = window.confirm("この申込を削除しますか？");
    if (!ok) return;

    try {
      if (firebaseReady) {
        await runTransaction(firestore, async (transaction) => {
          const requestRef = doc(firestore, "requests", requestId);
          const requestSnap = await transaction.get(requestRef);
          if (!requestSnap.exists()) return;
          const requestData = requestSnap.data();
          const assignedSlotId = requestData.assignedSlotId || "";
          if (assignedSlotId) {
            const slotRef = doc(firestore, "slots", assignedSlotId);
            const slotSnap = await transaction.get(slotRef);
            if (slotSnap.exists()) {
              const slotData = slotSnap.data();
              transaction.update(slotRef, {
                confirmedCount: Math.max(Number(slotData.confirmedCount || 0) - 1, 0),
                updatedAt: serverTimestamp(),
              });
            }
          }
          transaction.delete(requestRef);
        });
      } else {
        if (requestItem.assignedSlotId) {
          setSlots((prev) => prev.map((slot) => slot.id === requestItem.assignedSlotId ? { ...slot, confirmedCount: Math.max(Number(slot.confirmedCount || 0) - 1, 0) } : slot));
        }
        setRequests((prev) => prev.filter((item) => item.id !== requestId));
      }
      showToast("申込を削除しました。", "success");
    } catch (error) {
      console.error(error);
      showToast("申込の削除に失敗しました。", "error");
    }
  }

  function exportJson() {
    downloadText(
      `experiment-scheduler-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ slots, requests }, null, 2)
    );
  }

  async function resetAll() {
    const ok = window.confirm("Firestore 上の申込と日程枠をすべて削除しますか？");
    if (!ok) return;

    try {
      if (firebaseReady) {
        const batch = writeBatch(firestore);
        slots.forEach((slot) => batch.delete(doc(firestore, "slots", slot.id)));
        requests.forEach((request) => batch.delete(doc(firestore, "requests", request.id)));
        await batch.commit();
      } else {
        setSlots(sortSlots(SAMPLE_SLOTS));
        setRequests(SAMPLE_REQUESTS);
      }
      setSelectedDate("");
      setPage("participant");
      showToast("データを初期化しました。", "success");
    } catch (error) {
      console.error(error);
      showToast("初期化に失敗しました。", "error");
    }
  }

  async function seedSampleData() {
    if (!firebaseReady) return;
    try {
      const batch = writeBatch(firestore);
      SAMPLE_SLOTS.forEach((slot) => {
        const newRef = doc(collection(firestore, "slots"));
        batch.set(newRef, {
          date: slot.date,
          periodKey: slot.periodKey,
          capacity: slot.capacity,
          confirmedCount: slot.confirmedCount,
          isPublished: slot.isPublished,
          location: slot.location,
          note: slot.note,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      showToast("デモ枠を追加しました。", "success");
    } catch (error) {
      console.error(error);
      showToast("デモ枠の追加に失敗しました。", "error");
    }
  }

  function openAdminPage() {
    setAuthError("");
    setPage(adminAuthorized ? "admin" : "admin-login");
  }

  async function handleGoogleLogin() {
    if (!firebaseReady) return;
    setAuthError("");

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(firebaseAuth, provider);
    } catch (error) {
      console.error(error);
      setAuthError("Googleログインに失敗しました。設定や許可ドメインを確認してください。");
    }
  }

  async function handleAdminLogout() {
    setAuthError("");
    if (firebaseReady && firebaseAuth) {
      await signOut(firebaseAuth);
    }
    setPage("participant");
  }

  function retryFetch() {
    showToast("最新状態は自動同期されています。必要ならページを再読み込みしてください。", "info");
  }

  useEffect(() => {
    if (page === "admin-login" && authUser) {
      if (adminAuthorized) {
        setPage("admin");
      } else {
        setAuthError("このGoogleアカウントは管理者として許可されていません。");
      }
    }
  }, [page, authUser, adminAuthorized]);

  return (
    <>
      {page === "admin-login" ? (
        <AdminLoginPage
          authUser={authUser}
          authReady={authReady}
          authError={authError}
          firebaseEnabled={firebaseReady}
          onBack={() => setPage("participant")}
          onGoogleLogin={handleGoogleLogin}
        />
      ) : page === "admin" ? (
        adminAuthorized ? (
          <AdminPage
            adminTab={adminTab}
            setAdminTab={setAdminTab}
            stats={stats}
            exportJson={exportJson}
            resetAll={resetAll}
            slotForm={slotForm}
            setSlotForm={setSlotForm}
            handleAddSlot={handleAddSlot}
            sortedSlots={sortedSlots}
            requests={requests}
            handleDeleteSlot={handleDeleteSlot}
            handleTogglePublished={handleTogglePublished}
            onEditSlot={openEditSlot}
            search={search}
            setSearch={setSearch}
            filteredRequests={filteredRequests}
            handleAssignRequest={handleAssignRequest}
            handleDeleteRequest={handleDeleteRequest}
            onBack={() => setPage("participant")}
            onLogout={handleAdminLogout}
            adminEmail={authUser?.email || ""}
            isLoading={slotsLoading || requestsLoading}
            onSeedSampleData={seedSampleData}
          />
        ) : (
          <AdminLoginPage
            authUser={authUser}
            authReady={authReady}
            authError={authError || "管理者ログインが必要です。"}
            firebaseEnabled={firebaseReady}
            onBack={() => setPage("participant")}
            onGoogleLogin={handleGoogleLogin}
          />
        )
      ) : (
        <ParticipantPage
          sortedSlots={sortedSlots.filter((slot) => slot.isPublished !== false)}
          displayMonth={displayMonth}
          setDisplayMonth={setDisplayMonth}
          selectedDate={selectedDate}
          handleSelectDate={handleSelectDate}
          monthSummary={monthSummary}
          days={days}
          selectedDaySlots={selectedDaySlots}
          participantForm={participantForm}
          setParticipantForm={setParticipantForm}
          togglePreferredSlot={togglePreferredSlot}
          handleSubmitRequest={handleSubmitRequest}
          message={message}
          detailsRef={detailsRef}
          onOpenAdmin={openAdminPage}
          onOpenHelp={() => setShowHelp(true)}
          stats={stats}
          isLoading={slotsLoading}
          onRetry={retryFetch}
          setupMode={!firebaseReady}
        />
      )}

      {showHelp ? <HelpModal onClose={() => setShowHelp(false)} /> : null}
      {editingSlot ? (
        <EditSlotModal
          form={editSlotForm}
          setForm={setEditSlotForm}
          onSave={saveEditedSlot}
          onClose={() => setEditingSlot(null)}
          saving={savingEdit}
        />
      ) : null}
      {toast ? <ActionToast toast={toast} onClose={() => setToast(null)} /> : null}
      {dataError ? (
        <div className="fixed bottom-4 right-4 z-40 max-w-sm rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700 shadow-lg">
          {dataError}
        </div>
      ) : null}
    </>
  );
}
