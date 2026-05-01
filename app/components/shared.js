"use client";

import React, { forwardRef, useState } from "react";
import { normalizeStudyInfo, getStudyStatusLabel, getStudyStatusTone } from "@/app/lib/study-utils";
import { DEFAULT_EXPERIMENT_INFO } from "@/app/lib/constants";

export const LINE_OFFICIAL_ACCOUNT_ID = process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_ID || "";
export const LINE_OFFICIAL_ACCOUNT_URL = process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL || "";
export const LINE_QR_IMAGE_URL = process.env.NEXT_PUBLIC_LINE_QR_IMAGE_URL || "";
export const LINE_ADD_FRIEND_URL =
  LINE_OFFICIAL_ACCOUNT_URL ||
  (LINE_OFFICIAL_ACCOUNT_ID
    ? `https://line.me/R/ti/p/${encodeURIComponent(LINE_OFFICIAL_ACCOUNT_ID)}`
    : "");

export const LABLINK_ICON_SRC = "/lablink-icon.png";
export const LABLINK_LOGO_SRC = "/lablink-logo.png";
export const BRAND_TAGLINE = "大学研究の実験日程予約サイト";

export function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

export function downloadText(filename, text, mimeType = "application/json") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function buildStudyPublicUrl(studyId) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/study/${encodeURIComponent(studyId)}`;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3.75l1.16 2.35a1 1 0 00.77.54l2.6.38-1.88 1.83a1 1 0 00-.29.88l.44 2.59-2.32-1.22a1 1 0 00-.93 0l-2.32 1.22.44-2.59a1 1 0 00-.29-.88L7.47 7.02l2.6-.38a1 1 0 00.77-.54L12 3.75z" />
      <circle cx="12" cy="12" r="2.75" />
      <path d="M3.75 12h2.1M18.15 12h2.1M12 18.15v2.1M12 3.75v2.1" />
    </svg>
  );
}

export function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 118 0v3" />
    </svg>
  );
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.3-1.9 3.1l3.1 2.4c1.8-1.7 2.9-4.1 2.9-6.9 0-.7-.1-1.4-.2-2.1H12z" />
      <path fill="#34A853" d="M6.6 14.3l-.7.6-2.5 1.9C5 20 8.2 22 12 22c2.7 0 5-.9 6.7-2.5l-3.1-2.4c-.9.6-2 .9-3.6.9-2.7 0-4.9-1.8-5.7-4.2z" />
      <path fill="#4A90E2" d="M3.4 7.8C2.8 9 2.5 10.5 2.5 12s.3 3 .9 4.2c0 0 3.2-2.5 3.2-2.5-.2-.6-.3-1.1-.3-1.7s.1-1.2.3-1.7L3.4 7.8z" />
      <path fill="#FBBC05" d="M12 6.1c1.8 0 3.3.6 4.5 1.7l2.7-2.7C17 3 14.7 2 12 2 8.2 2 5 4 3.4 7.8l3.2 2.5C7.1 7.9 9.3 6.1 12 6.1z" />
    </svg>
  );
}

export function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9.2a2.45 2.45 0 014.4 1.5c0 1.7-1.8 2.2-2.2 3.4" />
      <circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20l4.5-1 9.7-9.7a1.8 1.8 0 000-2.6l-.7-.7a1.8 1.8 0 00-2.6 0L5.2 15.7 4 20z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

export function TrashIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

export function LandingIcon({ type = "list" }) {
  if (type === "link") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M10 13a5 5 0 007.07 0l2.12-2.12a5 5 0 00-7.07-7.07L11 4.93" />
        <path d="M14 11a5 5 0 00-7.07 0L4.81 13.12a5 5 0 007.07 7.07L13 19.07" />
      </svg>
    );
  }
  if (type === "bell") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    );
  }
  if (type === "calendar") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" />
    </svg>
  );
}

// ── Primitives ─────────────────────────────────────────────────────────────────

export function StatusBadge({ tone = "slate", children }) {
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

export const Card = forwardRef(function Card({ className = "", children }, ref) {
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

export function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{eyebrow}</div> : null}
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h2>
        {description ? <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function IconButton({ children, ...props }) {
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

export function LoadingCard({ title = "読み込み中..." }) {
  return (
    <Card>
      <div className="text-sm text-slate-500">{title}</div>
    </Card>
  );
}

export function ActionToast({ toast, onClose }) {
  if (!toast) return null;
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
    error: "border-rose-200 bg-rose-50 text-rose-800",
  };
  return (
    <div className="fixed left-1/2 top-4 z-[60] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 sm:top-6">
      <div className={classNames("rounded-2xl border px-4 py-3 text-sm shadow-lg", styles[toast.tone] || styles.info)}>
        <div className="flex items-start justify-between gap-3">
          <div>{toast.message}</div>
          <button onClick={onClose} className="font-medium opacity-70 hover:opacity-100">×</button>
        </div>
      </div>
    </div>
  );
}

export function ModalShell({ title, onClose, children, eyebrow = "LabLink" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-5">
      <button className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} aria-label="閉じる" />
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-2xl sm:rounded-[30px]">
        <div className="max-h-[78dvh] overflow-y-auto p-4 sm:max-h-[84vh] sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{eyebrow}</div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h2>
            </div>
            <IconButton onClick={onClose} aria-label="閉じる">×</IconButton>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Brand ─────────────────────────────────────────────────────────────────────

export function LabLinkMark({ size = "md", className = "" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass = {
    sm: "h-10 w-10 rounded-2xl",
    md: "h-12 w-12 rounded-[20px]",
    lg: "h-16 w-16 rounded-[24px]",
    xl: "h-32 w-32 rounded-[34px] sm:h-40 sm:w-40 sm:rounded-[42px]",
  }[size] || "h-12 w-12 rounded-[20px]";
  return (
    <div className={classNames("relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.10)]", sizeClass, className)}>
      {!imageFailed ? (
        <img src={LABLINK_ICON_SRC} alt="LabLink" className="h-full w-full object-contain" onError={() => setImageFailed(true)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal-500 to-blue-600 text-sm font-black tracking-[-0.08em] text-white">LL</div>
      )}
    </div>
  );
}

export function LabLinkBrand({ subtitle = BRAND_TAGLINE, compact = false, className = "" }) {
  return (
    <div className={classNames("flex min-w-0 items-center gap-3", className)}>
      <LabLinkMark size={compact ? "sm" : "md"} />
      <div className="min-w-0">
        <div className={classNames("font-bold tracking-tight text-slate-900", compact ? "text-lg" : "text-xl")}>LabLink</div>
        {subtitle ? <div className="mt-0.5 truncate text-xs font-medium text-slate-500 sm:text-sm">{subtitle}</div> : null}
      </div>
    </div>
  );
}

// ── Headers ───────────────────────────────────────────────────────────────────

export function PublicSiteHeader({ onOpenHelp, onOpenAdmin, onOpenHome, onOpenReservation, activePage = "reservation" }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button type="button" onClick={onOpenHome} className="min-w-0 rounded-2xl text-left transition hover:opacity-85">
          <LabLinkBrand compact subtitle="大学研究の実験参加予約" />
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {LINE_ADD_FRIEND_URL ? (
            <a href={LINE_ADD_FRIEND_URL} target="_blank" rel="noreferrer"
              className="hidden rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 sm:inline-flex">
              公式LINE追加
            </a>
          ) : null}
          <button type="button" onClick={onOpenReservation}
            className="hidden rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 sm:inline-flex">
            募集中の実験
          </button>
          <button type="button" onClick={onOpenAdmin}
            className="hidden rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 sm:inline-flex">
            管理者
          </button>
          {LINE_ADD_FRIEND_URL ? (
            <a href={LINE_ADD_FRIEND_URL} target="_blank" rel="noreferrer"
              className="inline-flex h-10 items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 shadow-sm sm:hidden"
              aria-label="公式LINEを追加する">
              LINE
            </a>
          ) : null}
          <IconButton aria-label="募集中の実験を見る" onClick={onOpenReservation} title="募集中の実験" className="sm:hidden">
            <LandingIcon type="list" />
          </IconButton>
          <IconButton aria-label="管理者ページへ" onClick={onOpenAdmin} title="管理者ページへ" className="sm:hidden">
            <GearIcon />
          </IconButton>
        </div>
      </div>
    </header>
  );
}

export function ResponsePageHeader({ tone = "rose" }) {
  const toneClass = tone === "rose" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-teal-200 bg-teal-50 text-teal-700";
  return (
    <div className="mb-6 rounded-[32px] border border-white/70 bg-white/80 px-6 py-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
      <LabLinkBrand compact />
      <div className={classNames("mt-5 inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.16em]", toneClass)}>
        CHANGE REQUEST
      </div>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">変更希望ページ</h1>
      <p className="mt-3 text-sm leading-7 text-slate-600">
        このページでは、確定済みの日程に対する変更希望を送信できます。
      </p>
    </div>
  );
}

// ── Content ───────────────────────────────────────────────────────────────────

export function TinyFeature({ title, text, tone = "teal" }) {
  const tones = {
    teal: "border-teal-200 bg-teal-50 text-teal-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    slate: "border-slate-200 bg-slate-50 text-slate-800",
  };
  return (
    <div className={classNames("rounded-3xl border px-4 py-3", tones[tone])}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs leading-5 opacity-75">{text}</div>
    </div>
  );
}

export function LandingStat({ label, value, note }) {
  return (
    <div className="rounded-[28px] border border-white/80 bg-white/80 p-5 shadow-[0_14px_45px_rgba(15,23,42,0.08)]">
      <div className="text-xs font-semibold tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value}</div>
      {note ? <div className="mt-1 text-xs leading-5 text-slate-500">{note}</div> : null}
    </div>
  );
}

export function LandingFeatureCard({ title, text, icon, tone = "teal" }) {
  const tones = {
    teal: "from-teal-50 to-white text-teal-700 border-teal-100",
    blue: "from-blue-50 to-white text-blue-700 border-blue-100",
    slate: "from-slate-50 to-white text-slate-700 border-slate-200",
  };
  return (
    <div className={classNames("rounded-[30px] border bg-gradient-to-br p-5", tones[tone])}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">{icon}</div>
      <h3 className="mt-4 text-base font-bold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

// ── Study list ────────────────────────────────────────────────────────────────

const CARD_ACCENT_GRADIENTS = [
  "from-teal-400 to-emerald-400",
  "from-indigo-400 to-violet-400",
  "from-amber-400 to-orange-400",
  "from-sky-400 to-blue-400",
  "from-rose-400 to-pink-400",
];

export function StudyPreviewCard({ study, openSlotCount, openSeats, onOpenReservation, showLegacyStats = false, colorIndex = 0 }) {
  const safeStudy = study || normalizeStudyInfo({});
  const statusTone = getStudyStatusTone(safeStudy.status);
  const accentGradient = CARD_ACCENT_GRADIENTS[colorIndex % CARD_ACCENT_GRADIENTS.length];
  const hasReward = safeStudy.reward && safeStudy.reward !== "未設定" && safeStudy.reward.trim() !== "";
  return (
    <div className="group flex flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_65px_rgba(15,23,42,0.13)]">
      <div className={`h-1.5 w-full shrink-0 bg-gradient-to-r ${accentGradient}`} />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={statusTone}>{getStudyStatusLabel(safeStudy.status)}</StatusBadge>
          {hasReward ? (
            <StatusBadge tone="emerald">謝礼あり</StatusBadge>
          ) : null}
        </div>
        <h3 className="mt-3 text-xl font-bold leading-snug tracking-tight text-slate-950">{safeStudy.title || "研究実験 参加者募集"}</h3>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{safeStudy.description || "公開中の日程から希望日時を選んで申し込めます。"}</p>
        <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 px-4 py-3"><span className="font-semibold text-slate-900">所要時間：</span>{safeStudy.duration || "未設定"}</div>
          {hasReward ? (
            <div className="rounded-2xl bg-teal-50 px-4 py-3 text-teal-900"><span className="font-semibold">謝礼：</span>{safeStudy.reward}</div>
          ) : (
            <div className="rounded-2xl bg-slate-50 px-4 py-3"><span className="font-semibold text-slate-900">謝礼：</span>なし</div>
          )}
          <div className="rounded-2xl bg-slate-50 px-4 py-3"><span className="font-semibold text-slate-900">場所：</span>{safeStudy.location || safeStudy.organization || "未設定"}</div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3"><span className="font-semibold text-slate-900">実施組織：</span>{safeStudy.organization || "未設定"}</div>
          {showLegacyStats ? (
            <>
              <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900"><span className="font-semibold">公開枠：</span>{openSlotCount}枠</div>
              <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900"><span className="font-semibold">残り席数：</span>{openSeats}席</div>
            </>
          ) : null}
        </div>
        <div className="mt-auto pt-5">
          <button
            type="button"
            onClick={() => onOpenReservation?.(safeStudy)}
            disabled={safeStudy.status === "closed" || safeStudy.status === "draft"}
            className="w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,0.20)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {safeStudy.status === "closed" ? "募集は終了しました" : "この実験の日程を見る"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StudyListEmptyState({ studiesError }) {
  return (
    <div className="rounded-[32px] border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-slate-400 shadow-sm">
        <LandingIcon type="list" />
      </div>
      <h3 className="mt-4 text-base font-bold text-slate-900">現在表示できる実験がありません</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        {studiesError || "公開中の実験が登録されると、ここに実験カードが表示されます。"}
      </p>
    </div>
  );
}

export function StudyListSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[0, 1].map((item) => (
        <div key={item} className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
          <div className="h-6 w-32 animate-pulse rounded-full bg-slate-100" />
          <div className="mt-5 h-7 w-3/4 animate-pulse rounded-full bg-slate-100" />
          <div className="mt-4 space-y-2">
            <div className="h-4 animate-pulse rounded-full bg-slate-100" />
            <div className="h-4 w-5/6 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Modals / Help ──────────────────────────────────────────────────────────────

export function HelpModal({ onClose }) {
  return (
    <ModalShell title="予約ページの使い方" onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["1", "日付を選ぶ", "空きがある日付をカレンダーで押すと、その日の詳細枠へ自動で移動します。"],
          ["2", "時間を選ぶ", "立命館大学の時限に合わせた枠から、希望する日時を最大5つまで選べます。"],
          ["3", "送信する", "氏名、メールアドレス、所属・学年を入力して送信すれば申込完了です。確定連絡は迷惑メールに入る場合もあるため、送信後は受信箱と迷惑メールを両方確認してください。"],
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

export function SetupNotice() {
  return (
    <Card className="border-amber-200 bg-amber-50">
      <SectionHeader
        eyebrow="SETUP"
        title="Firebase / Firestore の設定がまだです"
        description="リアルタイム共有のために、認証だけでなく Firestore を使います。下の環境変数を確認してください。"
      />
      <div className="space-y-3 text-sm text-slate-700">
        <p>`.env.local` と Vercel の Environment Variables に次を追加してください。</p>
        <pre className="overflow-auto rounded-2xl bg-slate-900 p-4 text-slate-100">{`NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_ADMIN_EMAILS=your-mail@example.com`}</pre>
        <p>Firebase Authentication で Google ログインを有効化し、Firestore の Rules で公開枠と管理者権限を分けてください。</p>
      </div>
    </Card>
  );
}

export function PrivacyNote() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
      入力された個人情報は、実験日程の調整と連絡のための利用を想定しています。参加者同士には表示されず、管理者ページはログインした管理者のみが閲覧できます。
    </div>
  );
}

export function ExperimentInfoCard({ info, compact = false, stats = null, openSlotCount = null, onRetry, setupMode = false }) {
  const detailItems = [
    ["所要時間", info.duration],
    ["謝礼", info.reward],
    ["場所", info.location],
    ["実施組織", info.organization],
    ["実験担当者", info.managerName],
    ["連絡先", info.contactEmail],
  ].filter(([, value]) => String(value || "").trim());

  return (
    <Card className={compact ? "p-5 shadow-none" : ""}>
      <SectionHeader
        eyebrow="STUDY INFO"
        title={info.title || DEFAULT_EXPERIMENT_INFO.title}
        description="参加前に確認してほしい実験内容です。日程選択の前にご確認ください。"
      />
      <div className="space-y-5">
        {String(info.description || "").trim() ? (
          <div className="rounded-3xl bg-slate-50 p-5 text-sm leading-7 text-slate-700">{info.description}</div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {detailItems.map(([label, value]) => (
            <div key={label} className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
              <div className="mt-2 text-sm font-medium leading-6 text-slate-800 break-words">{value}</div>
            </div>
          ))}
        </div>
        {String(info.notes || "").trim() ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-sm font-medium text-slate-700">補足事項</div>
            <div className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{info.notes}</div>
          </div>
        ) : null}
        {stats ? (
          <div className="rounded-3xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-blue-50 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-teal-600">RECEPTION STATUS</div>
                <h3 className="mt-1 text-base font-bold text-slate-950">現在の受付状況</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">公開中の日程枠と残り席数を確認できます。</p>
              </div>
              {!setupMode && typeof onRetry === "function" ? (
                <button onClick={onRetry} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  最新状態を再取得
                </button>
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
              <div className="rounded-2xl bg-white/85 p-3 sm:rounded-3xl sm:p-5">
                <div className="text-[11px] font-semibold text-slate-500 sm:text-sm sm:font-normal">公開中の枠</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900 sm:mt-2 sm:text-3xl">{openSlotCount ?? 0}</div>
              </div>
              <div className="rounded-2xl bg-white/85 p-3 sm:rounded-3xl sm:p-5">
                <div className="text-[11px] font-semibold text-slate-500 sm:text-sm sm:font-normal">残り席数</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900 sm:mt-2 sm:text-3xl">{stats.openSeats}</div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
