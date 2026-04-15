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

const STORAGE_KEY = "experiment-scheduler-ui-v5";

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
    id: "slot-1",
    date: "2026-04-21",
    periodKey: "p3",
    capacity: 2,
    location: "OIC 実験室A",
    note: "VR体験あり / 約30分",
  },
  {
    id: "slot-2",
    date: "2026-04-21",
    periodKey: "p4",
    capacity: 2,
    location: "OIC 実験室A",
    note: "VR体験あり / 約30分",
  },
  {
    id: "slot-3",
    date: "2026-04-22",
    periodKey: "p2",
    capacity: 1,
    location: "OIC 実験室B",
    note: "短時間の予備枠",
  },
  {
    id: "slot-4",
    date: "2026-04-22",
    periodKey: "p5",
    capacity: 2,
    location: "OIC 実験室B",
    note: "放課後に参加しやすい枠",
  },
  {
    id: "slot-5",
    date: "2026-04-24",
    periodKey: "p3",
    capacity: 3,
    location: "OIC 実験室A",
    note: "友人同士の参加も可",
  },
  {
    id: "slot-6",
    date: "2026-04-28",
    periodKey: "p4",
    capacity: 2,
    location: "OIC 実験室C",
    note: "酔いやすい方向けに途中休憩あり",
  },
];

const SAMPLE_REQUESTS = [
  {
    id: "request-1",
    name: "山田 太郎",
    email: "taro@example.com",
    affiliation: "情報理工学部 B3",
    note: "できれば午後希望",
    preferredSlotIds: ["slot-1", "slot-5"],
    assignedSlotId: "slot-1",
    status: "confirmed",
  },
  {
    id: "request-2",
    name: "佐藤 花子",
    email: "hanako@example.com",
    affiliation: "情報理工学部 B4",
    note: "VR酔いしやすいです",
    preferredSlotIds: ["slot-4", "slot-6"],
    assignedSlotId: "",
    status: "requested",
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

if (firebaseReady) {
  firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  firebaseAuth = getAuth(firebaseApp);
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

function getSlotMetrics(slot, requests) {
  const confirmed = requests.filter((request) => request.assignedSlotId === slot.id).length;
  const interested = requests.filter((request) => (request.preferredSlotIds || []).includes(slot.id)).length;
  const remaining = Math.max(Number(slot.capacity || 1) - confirmed, 0);

  return {
    confirmed,
    interested,
    remaining,
    full: remaining <= 0,
  };
}

function getDaySummary(dateKey, slots, requests) {
  const daySlots = slots.filter((slot) => slot.date === dateKey);
  const slotCount = daySlots.length;
  const totalRemaining = daySlots.reduce((sum, slot) => sum + getSlotMetrics(slot, requests).remaining, 0);
  const fullCount = daySlots.filter((slot) => getSlotMetrics(slot, requests).full).length;

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
        入力した氏名やメールアドレスは、日程調整と連絡のためにのみ利用される想定です。他の参加者には表示されません。
      </div>
    </ModalShell>
  );
}

function SetupNotice() {
  return (
    <Card className="mb-6 border-amber-200 bg-amber-50">
      <SectionHeader
        eyebrow="SETUP"
        title="管理者ログインの設定がまだです"
        description="Googleログインを使うために、Firebase の環境変数が必要です。参加者ページはそのまま使えます。"
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
        <p>Firebase Authentication で Google ログインを有効化し、許可したい管理者メールを `NEXT_PUBLIC_ADMIN_EMAILS` に入れてください。</p>
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

function ParticipantPage({
  sortedSlots,
  requests,
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
}) {
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

        <section className="mb-6 grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
          <Card>
            <SectionHeader
              eyebrow="AT A GLANCE"
              title="今の受付状況"
              description="日程全体の空き具合をざっくり確認できます。"
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
                    const metrics = getSlotMetrics(slot, requests);
                    const selected = participantForm.preferredSlotIds.includes(slot.id);
                    return (
                      <div key={slot.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
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
  search,
  setSearch,
  filteredRequests,
  handleAssignRequest,
  handleDeleteRequest,
  onBack,
  onLogout,
  adminEmail,
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
                  <label className="text-sm">
                    <div className="mb-1.5 text-slate-600">場所</div>
                    <input
                      value={slotForm.location}
                      onChange={(event) => setSlotForm((prev) => ({ ...prev, location: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
                    />
                  </label>
                </div>
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
                        <div className="text-base font-semibold text-slate-900">{formatJapaneseDate(slot.date)} / {getSlotLabel(slot)}</div>
                        <div className="mt-2 text-sm text-slate-500">{slot.location} / 定員 {slot.capacity} / 残り {metrics.remaining}</div>
                        {slot.note ? <div className="mt-1 text-sm text-slate-500">{slot.note}</div> : null}
                      </div>
                      <button onClick={() => handleDeleteSlot(slot.id)} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100">
                        削除
                      </button>
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

          <Card>
            <SectionHeader
              eyebrow="LOGIN"
              title="Googleでログイン"
              description="Firebase Authentication を使って管理者ログインを行います。"
            />

            {!firebaseEnabled ? <SetupNotice /> : null}

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
  });
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const detailsRef = useRef(null);

  useEffect(() => {
    document.title = "実験日程予約ページ";
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSlots(sortSlots(parsed.slots || []));
        setRequests(parsed.requests || []);
        setSelectedDate(parsed.selectedDate || "");
      } catch (error) {
        console.error(error);
      }
    } else {
      setSlots(sortSlots(SAMPLE_SLOTS));
      setRequests(SAMPLE_REQUESTS);
      setSelectedDate(SAMPLE_SLOTS[0].date);
    }
  }, []);

  useEffect(() => {
    if (!firebaseReady) return undefined;
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!slots.length) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        slots,
        requests,
        selectedDate,
      })
    );
  }, [slots, requests, selectedDate]);

  useEffect(() => {
    if (!selectedDate || !detailsRef.current || page !== "participant") return;
    const target = detailsRef.current;
    const handle = requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(handle);
  }, [selectedDate, page]);

  useEffect(() => {
    if (!selectedDate && slots.length) {
      setSelectedDate(sortSlots(slots)[0].date);
    }
  }, [selectedDate, slots]);

  useEffect(() => {
    document.body.style.overflow = showHelp ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [showHelp]);

  const adminAuthorized = !!authUser?.email && ALLOWED_ADMIN_EMAILS.includes(authUser.email.toLowerCase());

  const sortedSlots = useMemo(() => sortSlots(slots), [slots]);
  const days = useMemo(() => getMonthGrid(displayMonth), [displayMonth]);

  const selectedDaySlots = useMemo(
    () => sortedSlots.filter((slot) => slot.date === selectedDate),
    [sortedSlots, selectedDate]
  );

  const monthSummary = useMemo(() => {
    const summaryMap = {};
    days.forEach((day) => {
      summaryMap[formatDateKey(day)] = getDaySummary(formatDateKey(day), sortedSlots, requests);
    });
    return summaryMap;
  }, [days, sortedSlots, requests]);

  const stats = useMemo(() => {
    const confirmed = requests.filter((request) => request.assignedSlotId).length;
    const pending = requests.filter((request) => !request.assignedSlotId).length;
    const openSeats = sortedSlots.reduce((sum, slot) => sum + getSlotMetrics(slot, requests).remaining, 0);

    return {
      requestCount: requests.length,
      confirmed,
      pending,
      openSeats,
    };
  }, [requests, sortedSlots]);

  const filteredRequests = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return requests;
    return requests.filter((request) => {
      const text = [request.name, request.email, request.affiliation, request.note].join(" ").toLowerCase();
      return text.includes(keyword);
    });
  }, [requests, search]);

  function handleSelectDate(dateKey) {
    setSelectedDate(dateKey);
  }

  function togglePreferredSlot(slotId) {
    setParticipantForm((prev) => {
      const exists = prev.preferredSlotIds.includes(slotId);
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
  }

  function handleSubmitRequest(event) {
    event.preventDefault();
    if (
      !participantForm.name.trim() ||
      !participantForm.email.trim() ||
      !participantForm.affiliation.trim() ||
      participantForm.preferredSlotIds.length === 0
    ) {
      setMessage("氏名、メールアドレス、所属・学年、希望枠は必須です。");
      return;
    }

    const newRequest = {
      id: crypto.randomUUID(),
      name: participantForm.name.trim(),
      email: participantForm.email.trim(),
      affiliation: participantForm.affiliation.trim(),
      note: participantForm.note.trim(),
      preferredSlotIds: participantForm.preferredSlotIds,
      assignedSlotId: "",
      status: "requested",
    };

    setRequests((prev) => [newRequest, ...prev]);
    setParticipantForm({
      name: "",
      email: "",
      affiliation: "",
      note: "",
      preferredSlotIds: [],
    });
    setMessage("希望日時を送信しました。確認後に連絡します。");
  }

  function handleAddSlot(event) {
    event.preventDefault();
    if (!slotForm.date || !slotForm.periodKey) return;

    const newSlot = {
      id: crypto.randomUUID(),
      date: slotForm.date,
      periodKey: slotForm.periodKey,
      capacity: Number(slotForm.capacity || 1),
      location: slotForm.location.trim(),
      note: slotForm.note.trim(),
    };

    const nextSlots = sortSlots([...slots, newSlot]);
    setSlots(nextSlots);
    if (!selectedDate) setSelectedDate(newSlot.date);
    setSlotForm((prev) => ({ ...prev, note: "" }));
  }

  function handleDeleteSlot(slotId) {
    setSlots((prev) => prev.filter((slot) => slot.id !== slotId));
    setRequests((prev) =>
      prev.map((request) => ({
        ...request,
        preferredSlotIds: (request.preferredSlotIds || []).filter((id) => id !== slotId),
        assignedSlotId: request.assignedSlotId === slotId ? "" : request.assignedSlotId,
      }))
    );
  }

  function handleAssignRequest(requestId, slotId) {
    setRequests((prev) =>
      prev.map((request) =>
        request.id === requestId
          ? { ...request, assignedSlotId: slotId, status: slotId ? "confirmed" : "requested" }
          : request
      )
    );
  }

  function handleDeleteRequest(requestId) {
    setRequests((prev) => prev.filter((request) => request.id !== requestId));
  }

  function exportJson() {
    downloadText(
      `experiment-scheduler-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ slots, requests }, null, 2)
    );
  }

  function resetAll() {
    if (!window.confirm("保存データをすべて初期化しますか？")) return;
    localStorage.removeItem(STORAGE_KEY);
    setSlots(sortSlots(SAMPLE_SLOTS));
    setRequests(SAMPLE_REQUESTS);
    setSelectedDate(SAMPLE_SLOTS[0].date);
    setPage("participant");
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
            search={search}
            setSearch={setSearch}
            filteredRequests={filteredRequests}
            handleAssignRequest={handleAssignRequest}
            handleDeleteRequest={handleDeleteRequest}
            onBack={() => setPage("participant")}
            onLogout={handleAdminLogout}
            adminEmail={authUser?.email || ""}
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
          sortedSlots={sortedSlots}
          requests={requests}
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
        />
      )}

      {showHelp ? <HelpModal onClose={() => setShowHelp(false)} /> : null}
    </>
  );
}
