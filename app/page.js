"use client";

import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  PERIODS,
  PERIOD_MAP,
  WEEK_LABELS,
  MAX_PREFERRED_SLOTS,
  DEFAULT_STUDY_ID,
  DEFAULT_EXPERIMENT_INFO,
  SAMPLE_SLOTS,
  SAMPLE_REQUESTS,
  SAMPLE_STUDIES,
} from "./lib/constants";
import {
  formatDateKey,
  formatJapaneseDate,
  formatMonthTitle,
  getJapaneseHolidayName,
  getMonthGrid,
} from "./lib/date-utils";
import {
  normalizeExperimentInfo,
  normalizeStudyInfo,
  normalizeCustomField,
  normalizeNotificationTemplates,
  studyToExperimentInfo,
  getStudyStatusLabel,
  getStudyStatusTone,
  buildStudyFormFromStudy,
  buildStudyFormFromExperimentInfo,
  buildStudyFormFromTemplate,
  normalizeStudyId,
  createAutoStudyId,
  getRecordStudyId,
  isRecordInStudy,
  withStudyId,
  parseAdminEmails,
  buildStudyPayloadFromForm,
  buildStudyTemplatePayload,
} from "./lib/study-utils";
import {
  getPeriodLabel,
  sortSlots,
  getSlotLabel,
  getSlotMetrics,
  getSlotEndDate,
  hasSlotEnded,
  getDaySummary,
  getAdminDaySummary,
} from "./lib/slot-utils";
import {
  generateLineLinkCode,
  getParticipantConfirmationLabel,
  getParticipantConfirmationTone,
  getLineLinkLabel,
  getLineLinkTone,
  getLineLinkDetail,
  isRequestCompleted,
  isPastScheduledRequest,
  getRequestTimestampValue,
  getRequestAssignedSlotOrder,
  getRequestDefaultPriority,
} from "./lib/request-utils";
import { downloadIcsFile } from "./lib/ics-utils";
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
  deleteField,
  deleteDoc,
  doc,
  getFirestore,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

function buildParticipantResponseUrl(token, action = "confirm") {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("token", token);
  url.searchParams.set("action", action);
  url.searchParams.delete("request");
  url.searchParams.delete("study");
  return url.toString();
}

function buildStudyPublicUrl(studyId) {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("study", studyId);
  url.searchParams.delete("token");
  url.searchParams.delete("action");
  url.searchParams.delete("request");
  return url.toString();
}

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

const LINE_OFFICIAL_ACCOUNT_ID = process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_ID || "";
const LINE_OFFICIAL_ACCOUNT_URL = process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL || "";
const LINE_QR_IMAGE_URL = process.env.NEXT_PUBLIC_LINE_QR_IMAGE_URL || "";
const LINE_ADD_FRIEND_URL =
  LINE_OFFICIAL_ACCOUNT_URL ||
  (LINE_OFFICIAL_ACCOUNT_ID
    ? `https://line.me/R/ti/p/${encodeURIComponent(LINE_OFFICIAL_ACCOUNT_ID)}`
    : "");

const LABLINK_ICON_SRC = "/lablink-icon.png";
const LABLINK_LOGO_SRC = "/lablink-logo.png";

const BRAND_TAGLINE = "大学研究の実験日程予約サイト";

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
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h2>
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


function LabLinkMark({ size = "md", className = "" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass = {
    sm: "h-10 w-10 rounded-2xl",
    md: "h-12 w-12 rounded-[20px]",
    lg: "h-16 w-16 rounded-[24px]",
    xl: "h-32 w-32 rounded-[34px] sm:h-40 sm:w-40 sm:rounded-[42px]",
  }[size] || "h-12 w-12 rounded-[20px]";

  return (
    <div
      className={classNames(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.10)]",
        sizeClass,
        className
      )}
    >
      {!imageFailed ? (
        <img
          src={LABLINK_ICON_SRC}
          alt="LabLink"
          className="h-full w-full object-contain"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal-500 to-blue-600 text-sm font-black tracking-[-0.08em] text-white">
          LL
        </div>
      )}
    </div>
  );
}

function LabLinkBrand({ subtitle = BRAND_TAGLINE, compact = false, className = "" }) {
  return (
    <div className={classNames("flex min-w-0 items-center gap-3", className)}>
      <LabLinkMark size={compact ? "sm" : "md"} />
      <div className="min-w-0">
        <div className={classNames("font-bold tracking-tight text-slate-900", compact ? "text-lg" : "text-xl")}>
          LabLink
        </div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-xs font-medium text-slate-500 sm:text-sm">
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PublicSiteHeader({ onOpenHelp, onOpenAdmin, onOpenHome, onOpenReservation, activePage = "reservation" }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button type="button" onClick={onOpenHome} className="min-w-0 rounded-2xl text-left transition hover:opacity-85">
          <LabLinkBrand compact subtitle="大学研究の実験参加予約" />
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {LINE_ADD_FRIEND_URL ? (
            <a
              href={LINE_ADD_FRIEND_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 sm:inline-flex"
            >
              公式LINE追加
            </a>
          ) : null}
          <button
            type="button"
            onClick={onOpenReservation}
            className="hidden rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 sm:inline-flex"
          >
            募集中の実験
          </button>
          <a
            href="/mypage" target="_blank" rel="noreferrer"
            className="hidden rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 sm:inline-flex"
          >
            予約確認
          </a>
          <button
            type="button"
            onClick={onOpenAdmin}
            className="hidden rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 sm:inline-flex"
          >
            管理者
          </button>
          {LINE_ADD_FRIEND_URL ? (
            <a
              href={LINE_ADD_FRIEND_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 shadow-sm sm:hidden"
              aria-label="公式LINEを追加する"
            >
              LINE
            </a>
          ) : null}
          <IconButton aria-label="募集中の実験を見る" onClick={onOpenReservation} title="募集中の実験" className="sm:hidden">
            <LandingIcon type="list" />
          </IconButton>
          <a href="/mypage" target="_blank" rel="noreferrer" aria-label="予約確認ページへ" title="予約確認ページへ" className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 sm:hidden">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          </a>
          <IconButton aria-label="管理者ページへ" onClick={onOpenAdmin} title="管理者ページへ" className="sm:hidden">
            <GearIcon />
          </IconButton>
        </div>
      </div>
    </header>
  );
}

function AdminSiteHeader({ onBack, onLogoClick, onLogout, adminEmail, backLabel = "トップへ戻る", onOpenProfile }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button type="button" onClick={onLogoClick || onBack} className="min-w-0 rounded-2xl text-left transition hover:opacity-85">
          <LabLinkBrand compact subtitle="実験者向け管理画面" />
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {adminEmail && onOpenProfile ? (
            <button
              type="button"
              onClick={onOpenProfile}
              className="hidden max-w-[280px] truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 lg:inline-flex"
            >
              {adminEmail}
            </button>
          ) : adminEmail ? (
            <span className="hidden max-w-[280px] truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500 lg:inline-flex">
              {adminEmail}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeftIcon />
            <span className="hidden sm:inline">{backLabel}</span>
            <span className="sm:hidden">戻る</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            ログアウト
          </button>
        </div>
      </div>
    </header>
  );
}

function TinyFeature({ title, text, tone = "teal" }) {
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

function ParticipantHero({ onOpenHelp, onScrollToDetails, stats, openSlotCount }) {
  return (
    <section className="mb-6 overflow-hidden rounded-[34px] border border-white/80 bg-white/85 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
      <div className="grid gap-0 lg:grid-cols-[1.14fr,0.86fr]">
        <div className="p-5 sm:p-7 lg:p-8">
          <div className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-teal-700">
            LABLINK RESERVATION
          </div>
          <h1 className="mt-5 text-[clamp(2rem,7vw,4rem)] font-bold leading-[1.04] tracking-tight text-slate-950">
            実験日程の予約
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-7 text-slate-600 sm:text-base">
            LabLinkは、大学研究の実験募集と参加者をつなぐ予約ページです。公開中の日程から希望枠を選び、実験担当者からの確定連絡をお待ちください。
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onScrollToDetails}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,0.22)] transition hover:bg-slate-800"
            >
              日程を選ぶ
            </button>
            <button
              type="button"
              onClick={onOpenHelp}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              参加の流れを見る
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-gradient-to-br from-teal-50 via-white to-blue-50 p-5 sm:p-7 lg:border-l lg:border-t-0 lg:p-8">
          <div className="flex items-center gap-3">
            <LabLinkMark size="lg" />
            <div>
              <div className="text-sm font-semibold tracking-[0.16em] text-slate-400">SERVICE CONCEPT</div>
              <div className="mt-1 text-xl font-bold text-slate-900">実験者と参加者をつなぐ</div>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            <TinyFeature title="公開枠から選択" text="空いている日程をカレンダー・一覧から確認できます。" tone="teal" />
            <TinyFeature title="最大5枠まで希望提出" text="都合のよい候補を複数送信し、担当者が日程を確定します。" tone="blue" />
            <TinyFeature title="メール・LINEで連絡" text="確定・変更・確認案内を受け取れます。LINE連携は任意です。" tone="slate" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-3xl border border-white/80 bg-white/80 p-4">
              <div className="text-xs font-semibold text-slate-400">公開中の枠</div>
              <div className="mt-1 text-3xl font-bold text-slate-950">{openSlotCount}</div>
            </div>
            <div className="rounded-3xl border border-white/80 bg-white/80 p-4">
              <div className="text-xs font-semibold text-slate-400">残り席数</div>
              <div className="mt-1 text-3xl font-bold text-slate-950">{stats.openSeats}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ParticipantFlowCard({ onOpenHelp }) {
  return (
    <Card className="border-teal-100 bg-gradient-to-br from-white via-white to-teal-50">
      <SectionHeader
        eyebrow="HOW IT WORKS"
        title="申込から参加まで"
        description="希望枠を送信したあと、実験担当者が確認して日程を確定します。"
        action={
          <button
            type="button"
            onClick={onOpenHelp}
            className="rounded-2xl border border-teal-200 bg-white px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
          >
            詳しく見る
          </button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        {[
          ["01", "希望枠を選択", "空いている日程から最大5枠まで選びます。"],
          ["02", "担当者が確定", "申込内容を確認し、参加日時を決定します。"],
          ["03", "メールで確認", "確定案内を確認し、必要に応じてLINE連携できます。"],
        ].map(([number, title, text]) => (
          <div key={number} className="rounded-3xl border border-slate-200 bg-white/85 p-4">
            <div className="text-xs font-bold tracking-[0.18em] text-teal-500">{number}</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{title}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">{text}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AdminHero({ adminEmail }) {
  return (
    <header className="mb-6 overflow-hidden rounded-[34px] border border-white/80 bg-white/85 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur sm:p-7 lg:p-8">
      <div className="min-w-0">
        <div className="inline-flex rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-teal-700">
          LabLink 管理
        </div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          実験募集を作成・編集する
        </h1>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600 sm:text-base">
          LabLinkのトップページや「募集中の実験」に表示する募集情報を管理します。登録済みの募集カード右上の「日程・申込管理」から、各募集の予約運営ページへ進めます。
        </p>
        {adminEmail ? <p className="mt-3 text-sm text-slate-500">ログイン中: {adminEmail}</p> : null}
      </div>
    </header>
  );
}

function ResponsePageHeader({ tone = "rose" }) {
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



function LandingStat({ label, value, note }) {
  return (
    <div className="rounded-[28px] border border-white/80 bg-white/80 p-5 shadow-[0_14px_45px_rgba(15,23,42,0.08)]">
      <div className="text-xs font-semibold tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value}</div>
      {note ? <div className="mt-1 text-xs leading-5 text-slate-500">{note}</div> : null}
    </div>
  );
}

function LandingFeatureCard({ title, text, icon, tone = "teal" }) {
  const tones = {
    teal: "from-teal-50 to-white text-teal-700 border-teal-100",
    blue: "from-blue-50 to-white text-blue-700 border-blue-100",
    slate: "from-slate-50 to-white text-slate-700 border-slate-200",
  };

  return (
    <div className={classNames("rounded-[30px] border bg-gradient-to-br p-5", tones[tone])}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-bold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function LandingIcon({ type = "list" }) {
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
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" />
    </svg>
  );
}

function StudyPreviewCard({ study, openSlotCount, openSeats, onOpenReservation, showLegacyStats = false }) {
  const safeStudy = study || normalizeStudyInfo({});
  const statusTone = getStudyStatusTone(safeStudy.status);

  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={statusTone}>{getStudyStatusLabel(safeStudy.status)}</StatusBadge>
        <StatusBadge tone="sky">日程予約受付中</StatusBadge>
      </div>
      <h3 className="mt-4 text-xl font-bold tracking-tight text-slate-950">{safeStudy.title || "研究実験 参加者募集"}</h3>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
        {safeStudy.description || "公開中の日程から希望日時を選んで申し込めます。"}
      </p>
      <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <span className="font-semibold text-slate-900">所要時間：</span>{safeStudy.duration || "未設定"}
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <span className="font-semibold text-slate-900">謝礼：</span>{safeStudy.reward || "未設定"}
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <span className="font-semibold text-slate-900">場所：</span>{safeStudy.location || safeStudy.organization || "未設定"}
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <span className="font-semibold text-slate-900">実施組織：</span>{safeStudy.organization || "未設定"}
        </div>
        {showLegacyStats ? (
          <>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900">
              <span className="font-semibold">公開枠：</span>{openSlotCount}枠
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900">
              <span className="font-semibold">残り席数：</span>{openSeats}席
            </div>
          </>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onOpenReservation?.(safeStudy)}
        disabled={safeStudy.status === "closed" || safeStudy.status === "draft"}
        className="mt-5 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,0.20)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
      >
        {safeStudy.status === "closed" ? "募集は終了しました" : "この実験の日程を見る"}
      </button>
    </div>
  );
}

function StudyListEmptyState({ studiesError }) {
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

function StudyListSkeleton() {
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


function LabLinkLandingPage({
  studies,
  studiesLoading,
  onOpenStudies,
  onOpenAdmin,
  onOpenHelp,
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0%,_#eff6ff_30%,_#f8fafc_60%,_#eef2ff_100%)] text-slate-900">
      <PublicSiteHeader
        onOpenHelp={onOpenHelp}
        onOpenAdmin={onOpenAdmin}
        onOpenHome={() => {}}
        onOpenReservation={onOpenStudies}
        activePage="home"
      />

      <style jsx global>{`
        @keyframes lablink-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lablink-logo-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes lablink-soft-glow {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.06); }
        }
      `}</style>

      <main className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[42px] border border-white/80 bg-white/88 px-5 py-10 shadow-[0_30px_100px_rgba(15,23,42,0.12)] backdrop-blur sm:px-8 sm:py-12 lg:px-12 lg:py-14">
          <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-teal-200/55 blur-3xl" style={{ animation: "lablink-soft-glow 6s ease-in-out infinite" }} />
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-blue-200/55 blur-3xl" style={{ animation: "lablink-soft-glow 7s ease-in-out 0.8s infinite" }} />

          <div className="relative mx-auto max-w-5xl text-center" style={{ animation: "lablink-fade-up 0.7s ease-out both" }}>
            <div className="mx-auto flex justify-center">
              <div
                className="rounded-[28px] bg-white/82 px-5 py-4 shadow-[0_22px_70px_rgba(15,23,42,0.12)] ring-1 ring-white/90 sm:px-7 sm:py-5"
                style={{ animation: "lablink-logo-float 5.2s ease-in-out 0.9s infinite" }}
              >
                <img
                  src={LABLINK_LOGO_SRC}
                  alt="LabLink"
                  className="h-auto w-[170px] object-contain sm:w-[225px] lg:w-[270px]"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              </div>
            </div>

            <div className="mt-7 inline-flex rounded-full border border-teal-200 bg-teal-50/90 px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-teal-700">
              立命館大学 研究参加プラットフォーム
            </div>

            <h1 className="mx-auto mt-5 max-w-3xl bg-gradient-to-r from-slate-950 via-teal-800 to-blue-800 bg-clip-text text-[clamp(1.45rem,3.1vw,2.55rem)] font-semibold leading-[1.22] tracking-[-0.04em] text-transparent">
              研究参加を、もっと身近に。
            </h1>

            <p className="mx-auto mt-5 max-w-3xl text-sm leading-8 text-slate-600 sm:text-base">
              LabLinkは、大学で行われる研究実験の募集・予約・連絡をつなぐサービスです。参加者は募集中の実験を探して申し込み、実験者は募集情報や申込状況をまとめて管理できます。
            </p>

            <p className="mt-3 text-xs text-slate-400">本サービスは立命館大学の研究者・学生を対象としています。</p>

          </div>

          <div className="relative mt-10 grid gap-4 lg:grid-cols-2" style={{ animation: "lablink-fade-up 0.7s ease-out 0.12s both" }}>
            <button
              type="button"
              onClick={onOpenStudies}
              className="group rounded-[30px] border border-teal-100 bg-white/86 p-6 text-left shadow-[0_18px_55px_rgba(15,23,42,0.07)] transition hover:-translate-y-1 hover:border-teal-200 hover:bg-white"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                  <LandingIcon type="list" />
                </div>
                <div>
                  <div className="text-xs font-semibold tracking-[0.18em] text-teal-700">FOR PARTICIPANTS</div>
                  <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">実験に参加したい方</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    募集中の実験を一覧で確認し、内容や日程を見て参加申込へ進めます。
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-700">
                    募集中の実験を見る
                    <span className="transition group-hover:translate-x-1">→</span>
                  </div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={onOpenAdmin}
              className="group rounded-[30px] border border-blue-100 bg-white/86 p-6 text-left shadow-[0_18px_55px_rgba(15,23,42,0.07)] transition hover:-translate-y-1 hover:border-blue-200 hover:bg-white"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <LandingIcon type="link" />
                </div>
                <div>
                  <div className="text-xs font-semibold tracking-[0.18em] text-blue-700">FOR ORGANIZERS</div>
                  <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">実験を募集・管理する方</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    募集ページの作成、候補日程の追加、申込者の確認・確定を行えます。
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
                    管理者ページへ
                    <span className="transition group-hover:translate-x-1">→</span>
                  </div>
                </div>
              </div>
            </button>
          </div>

          <a
            href="/mypage" target="_blank" rel="noreferrer"
            className="group mt-4 flex w-full items-center justify-between rounded-[24px] border border-slate-200/80 bg-white/70 px-6 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
            style={{ animation: "lablink-fade-up 0.7s ease-out 0.18s both" }}
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">予約の確認・変更</p>
                <p className="text-xs text-slate-400">申込済みの予約内容の確認、変更希望の連絡</p>
              </div>
            </div>
            <span className="text-slate-400 transition group-hover:translate-x-1">→</span>
          </a>
        </section>

        <section className="mt-5 rounded-[34px] border border-white/80 bg-white/72 p-5 shadow-sm backdrop-blur sm:p-6" style={{ animation: "lablink-fade-up 0.7s ease-out 0.2s both" }}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">ABOUT LABLINK</div>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">LabLinkでできること</h2>
            </div>
            <p className="max-w-2xl text-sm leading-7 text-slate-500">
              参加者は実験を探して申し込み、実験者は募集ページ・日程・申込状況をまとめて管理できます。
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-[26px] border border-teal-100 bg-teal-50/70 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-teal-700 shadow-sm">
                <LandingIcon type="list" />
              </div>
              <h3 className="mt-4 font-bold text-slate-950">参加者は実験を探しやすく</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                募集中の実験を一覧で確認し、内容に合う実験の予約ページへ進めます。
              </p>
            </div>
            <div className="rounded-[26px] border border-blue-100 bg-blue-50/70 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
                <LandingIcon type="calendar" />
              </div>
              <h3 className="mt-4 font-bold text-slate-950">実験者は運営を管理しやすく</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                募集情報の作成、候補日程の公開、申込者の確定・変更を管理できます。
              </p>
            </div>
            <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
                <LandingIcon type="link" />
              </div>
              <h3 className="mt-4 font-bold text-slate-950">連絡はメールとLINEで確認</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                確定・変更の案内はメールを基本に、希望者は公式LINEでも受け取れます。
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/60 bg-white/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-slate-400 sm:flex-row sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} LabLink — 立命館大学 研究参加プラットフォーム</span>
          <span>本サービスは立命館大学の研究者・学生を対象としています。</span>
        </div>
      </footer>
    </div>
  );
}

function StudyBrowsePage({
  studies,
  studiesLoading,
  studiesError,
  onOpenReservation,
  onOpenAdmin,
  onOpenHelp,
  onOpenHome,
}) {
  const studyList = Array.isArray(studies) ? studies : [];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0%,_#eff6ff_30%,_#f8fafc_60%,_#eef2ff_100%)] text-slate-900">
      <PublicSiteHeader
        onOpenHelp={onOpenHelp}
        onOpenAdmin={onOpenAdmin}
        onOpenHome={onOpenHome}
        onOpenReservation={() => {}}
        activePage="studies"
      />

      <main className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <section className="mb-8 rounded-[34px] border border-white/80 bg-white/85 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-teal-700">
                STUDIES
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">募集中の実験</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                現在公開されている実験募集です。参加したい実験を選ぶと、その実験専用の予約ページに進みます。
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenHome}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              トップへ戻る
            </button>
          </div>
        </section>

        {studiesLoading ? (
          <StudyListSkeleton />
        ) : studyList.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {studyList.map((study) => (
              <StudyPreviewCard
                key={study.id}
                study={study}
                onOpenReservation={onOpenReservation}
              />
            ))}
          </div>
        ) : (
          <StudyListEmptyState studiesError={studiesError} />
        )}
      </main>
    </div>
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

function TrashIcon({ className = "h-4 w-4" }) {
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

function ModalShell({ title, onClose, children, eyebrow = "LabLink" }) {
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

function HelpModal({ onClose }) {
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


function ExperimentInfoCard({ info, compact = false, stats = null, openSlotCount = null, onRetry, setupMode = false }) {
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
          <div className="rounded-3xl bg-slate-50 p-5 text-sm leading-7 text-slate-700">
            {info.description}
          </div>
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
            <div className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">
              {info.notes}
            </div>
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

function ExperimentInfoEditor({
  experimentInfoForm,
  setExperimentInfoForm,
  onSaveExperimentInfo,
  savingExperimentInfo,
}) {
  function updateField(key, value) {
    setExperimentInfoForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Card className="p-5 shadow-none">
      <SectionHeader
        eyebrow="EXPERIMENT SETTINGS"
        title="参加者ページの実験情報を編集"
        description="ここで保存した内容が、参加者ページ上部の説明カードに反映されます。"
      />

      <form onSubmit={onSaveExperimentInfo} className="space-y-4">
        <label className="block text-sm">
          <div className="mb-1.5 text-slate-600">実験タイトル</div>
          <input
            value={experimentInfoForm.title}
            onChange={(event) => updateField("title", event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
          />
        </label>

        <label className="block text-sm">
          <div className="mb-1.5 text-slate-600">実験概要</div>
          <textarea
            value={experimentInfoForm.description}
            onChange={(event) => updateField("description", event.target.value)}
            className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <div className="mb-1.5 text-slate-600">所要時間</div>
            <input
              value={experimentInfoForm.duration}
              onChange={(event) => updateField("duration", event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
            />
          </label>

          <label className="text-sm">
            <div className="mb-1.5 text-slate-600">報酬</div>
            <input
              value={experimentInfoForm.reward}
              onChange={(event) => updateField("reward", event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <div className="mb-1.5 text-slate-600">募集組織・研究室</div>
            <input
              value={experimentInfoForm.organization}
              onChange={(event) => updateField("organization", event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
            />
          </label>

          <label className="text-sm">
            <div className="mb-1.5 text-slate-600">実験責任者の表示</div>
            <input
              value={experimentInfoForm.managerName}
              onChange={(event) => updateField("managerName", event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
            />
          </label>
        </div>

        <label className="block text-sm">
          <div className="mb-1.5 text-slate-600">連絡先メール</div>
          <input
            type="email"
            value={experimentInfoForm.contactEmail}
            onChange={(event) => updateField("contactEmail", event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
          />
        </label>

        <label className="block text-sm">
          <div className="mb-1.5 text-slate-600">補足事項</div>
          <textarea
            value={experimentInfoForm.notes}
            onChange={(event) => updateField("notes", event.target.value)}
            className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
            placeholder="複数行で入力できます"
          />
        </label>

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="submit"
            disabled={savingExperimentInfo}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {savingExperimentInfo ? "保存中..." : "実験情報を保存"}
          </button>
        </div>
      </form>
    </Card>
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


function LineLinkCodeHelpModal({ onClose }) {
  return (
    <ModalShell title="LINE連携コードの使い方" onClose={onClose} eyebrow="LINE LINK">
      <div className="space-y-4 text-sm leading-7 text-slate-600">
        <p>
          参加者がLINE連携を希望する場合は、公式LINEを友だち追加したあと、この連携コードをLINEのトーク画面に送信してもらってください。
        </p>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-950">
          <div className="font-semibold">参加者へ送る案内文の例</div>
          <p className="mt-1">
            LabLinkの公式LINEを友だち追加し、連携コードを送信してください。日程の確定・変更案内をLINEでも受け取れます。
          </p>
        </div>
        <p className="text-xs leading-6 text-slate-500">
          メール連絡はこれまで通り行われます。LINE連携は参加者が希望する場合のみ利用します。
        </p>
      </div>
    </ModalShell>
  );
}

function EditSlotModal({ form, setForm, onSave, onClose, saving }) {
  return (
    <ModalShell title="日程枠を編集" onClose={onClose} eyebrow="SLOT EDIT">
      <form onSubmit={onSave} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <div className="mb-1.5 text-slate-600">日付</div>
            <input
              type="date"
              value={form.date}
              onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1.5 text-slate-600">時限</div>
            <select
              value={form.periodKey}
              onChange={(event) => setForm((prev) => ({ ...prev, periodKey: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
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
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
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
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
          />
        </label>
        <label className="block text-sm">
          <div className="mb-1.5 text-slate-600">メモ</div>
          <textarea
            value={form.note}
            onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
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


function AssignmentConfirmModal({ dialog, onConfirm, onClose, loading }) {
  if (!dialog) return null;

  const { mode, requestName, currentLabel, nextLabel } = dialog;

  return (
    <ModalShell
      title={mode === "change" ? "確定日程を変更しますか？" : mode === "assign" ? "この日程で確定しますか？" : "確定を解除しますか？"}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
          <div><span className="font-medium">対象者:</span> {requestName}</div>

          {mode === "assign" ? (
            <div className="mt-2">
              <span className="font-medium">確定先:</span> {nextLabel}
            </div>
          ) : null}

          {mode === "change" ? (
            <div className="mt-2 space-y-1">
              <div><span className="font-medium">現在:</span> {currentLabel}</div>
              <div><span className="font-medium">変更後:</span> {nextLabel}</div>
            </div>
          ) : null}

          {mode === "unassign" ? (
            <div className="mt-2">
              <span className="font-medium">解除対象:</span> {currentLabel}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "処理中..." : mode === "change" ? "変更を確定する" : mode === "assign" ? "この日程で確定する" : "確定を解除する"}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    </ModalShell>
  );
}


function ParticipantRequestConfirmModal({ open, participantForm, sortedSlots, onConfirm, onClose, loading }) {
  if (!open) return null;

  const selectedSlots = participantForm.preferredSlotIds
    .map((slotId) => sortedSlots.find((slot) => slot.id === slotId))
    .filter(Boolean);

  return (
    <ModalShell title="この内容で申し込みますか？" onClose={onClose}>
      <div className="space-y-5">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
          <div><span className="font-medium">氏名:</span> {participantForm.name}</div>
          <div className="mt-1 break-all"><span className="font-medium">メールアドレス:</span> {participantForm.email}</div>
          <div className="mt-1"><span className="font-medium">所属・学年:</span> {participantForm.affiliation}</div>
          {participantForm.note.trim() ? (
            <div className="mt-3">
              <div className="font-medium">補足</div>
              <div className="mt-1 whitespace-pre-line rounded-2xl bg-white px-3 py-2 text-slate-600">{participantForm.note.trim()}</div>
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-medium text-slate-700">希望枠</div>
          <div className="mt-3 space-y-2">
            {selectedSlots.map((slot) => (
              <div key={slot.id} className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {formatJapaneseDate(slot.date)} / {PERIOD_MAP[slot.periodKey]?.label || slot.periodKey}
                {slot.location ? ` / ${slot.location}` : ""}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
          送信後、日程の確定や変更に関する重要な連絡を、登録したメールアドレス宛にお送りします。
          通常の受信箱ではなく迷惑メールに入る場合もあるため、受信箱と迷惑メールの両方を必ず確認してください。
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "送信中..." : "この内容で送信する"}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            入力内容を修正する
          </button>
        </div>
      </div>
    </ModalShell>
  );
}


function LineLinkGuideModal({ lineLinkInfo, onClose, onToast }) {
  const [copied, setCopied] = useState(false);

  if (!lineLinkInfo?.code) return null;

  const showCopiedFeedback = () => {
    setCopied(true);
    onToast?.({ tone: "success", message: "連携コードをコピーしました。公式LINEのトーク画面に貼り付けて送信してください。" });
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleCopyCode = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(lineLinkInfo.code);
        showCopiedFeedback();
        return;
      }
    } catch (error) {
      console.error("Failed to copy LINE link code:", error);
    }

    try {
      const textArea = document.createElement("textarea");
      textArea.value = lineLinkInfo.code;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "absolute";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      showCopiedFeedback();
    } catch (error) {
      console.error("Fallback copy failed:", error);
      onToast?.({ tone: "error", message: "コピーに失敗しました。連携コードを手動で選択してコピーしてください。" });
    }
  };

  const LineIcon = ({ className = "" }) => (
    <span className={classNames("inline-flex items-center justify-center rounded-full bg-[#06C755] text-white", className)}>
      <span className="rounded-full bg-white px-1.5 py-1 text-[10px] font-black leading-none tracking-tight text-[#06C755]">
        LINE
      </span>
    </span>
  );

  const CopyIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M8 7.5A2.5 2.5 0 0 1 10.5 5H17a2.5 2.5 0 0 1 2.5 2.5V14a2.5 2.5 0 0 1-2.5 2.5h-1.5v-2H17a.5.5 0 0 0 .5-.5V7.5A.5.5 0 0 0 17 7h-6.5a.5.5 0 0 0-.5.5V9H8V7.5Z"
        fill="currentColor"
      />
      <path
        d="M4.5 10A2.5 2.5 0 0 1 7 7.5h6.5A2.5 2.5 0 0 1 16 10v6.5A2.5 2.5 0 0 1 13.5 19H7a2.5 2.5 0 0 1-2.5-2.5V10Zm2.5-.5a.5.5 0 0 0-.5.5v6.5a.5.5 0 0 0 .5.5h6.5a.5.5 0 0 0 .5-.5V10a.5.5 0 0 0-.5-.5H7Z"
        fill="currentColor"
      />
    </svg>
  );

  return (
    <ModalShell title="LINEでも通知を受け取る（オススメ）" onClose={onClose}>
      <div className="space-y-5 text-sm leading-7 text-slate-700">
        <div className="rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 text-emerald-950 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <div className="text-xl font-bold text-slate-900">申込が完了しました</div>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                日程の確定・変更・確認の案内をLINEでも受け取りたい方は、以下の手順で公式LINEと申込情報を連携してください。
              </p>
              <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-6 text-emerald-800 sm:text-sm">
                LINE連携は任意です。連携しない場合でも、これまで通りメールで日程のご連絡をお送りします。
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-base font-bold text-white shadow-sm">
                1
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-slate-900">公式LINEを追加</div>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  QRコードを読み取るか、友だち追加ボタンから公式LINEを追加してください。
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)] lg:items-center">
              {LINE_QR_IMAGE_URL ? (
                <div className="rounded-3xl border border-emerald-200 bg-white p-4 text-center shadow-sm sm:p-5">
                  <img
                    src={LINE_QR_IMAGE_URL}
                    alt="公式LINE友だち追加用QRコード"
                    className="mx-auto h-36 w-36 rounded-2xl object-contain sm:h-52 sm:w-52"
                  />
                  <div className="mt-3 text-sm font-medium text-emerald-800">QRコードで友だち追加</div>
                </div>
              ) : null}

              <div className={classNames("space-y-3", !LINE_QR_IMAGE_URL && "lg:col-span-2")}>
                {LINE_ADD_FRIEND_URL ? (
                  <a
                    href={LINE_ADD_FRIEND_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-emerald-200 bg-white px-4 py-4 shadow-sm transition hover:bg-emerald-50 active:scale-[0.99] sm:w-auto sm:min-w-[260px]"
                    aria-label="公式LINEを友だち追加する"
                  >
                    <img
                      src="https://scdn.line-apps.com/n/line_add_friends/btn/ja.png"
                      alt="友だち追加"
                      className="h-11 w-auto sm:h-12"
                    />
                  </a>
                ) : null}


                {LINE_OFFICIAL_ACCOUNT_ID ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-6 text-emerald-900 sm:text-sm">
                    LINEアプリでID検索する場合：
                    <span className="ml-1 font-semibold">{LINE_OFFICIAL_ACCOUNT_ID}</span>
                  </div>
                ) : null}

                {!LINE_QR_IMAGE_URL && !LINE_ADD_FRIEND_URL ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900 sm:text-sm">
                    公式LINEのQRコードまたは友だち追加ボタンがまだ設定されていません。管理者側で
                    <span className="mx-1 font-semibold">NEXT_PUBLIC_LINE_QR_IMAGE_URL</span>
                    または
                    <span className="mx-1 font-semibold">NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL</span>
                    を設定してください。
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-base font-bold text-white shadow-sm">
                2
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-slate-900">連携コードを送信</div>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  公式LINEを追加したあと、以下の8桁の連携コードをそのまま送信してください。
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 sm:p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_132px] md:items-stretch">
                  <div className="min-w-0 overflow-hidden rounded-2xl bg-white/60 px-3 py-4 text-center text-[2rem] font-bold tracking-[0.14em] text-emerald-800 md:flex md:items-center md:justify-center md:px-3 md:text-[2.05rem] md:tracking-[0.08em] lg:text-[2.25rem]">
                    <span className="block max-w-full whitespace-nowrap leading-none">{lineLinkInfo.code}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    title="連携コードをコピー"
                    aria-label="連携コードをコピー"
                    className={classNames(
                      "inline-flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white shadow-sm transition md:h-full md:min-h-16 md:w-[132px] md:px-3",
                      copied ? "bg-emerald-700" : "bg-emerald-600 hover:bg-emerald-500"
                    )}
                  >
                    <CopyIcon />
                    <span>{copied ? "コピー済み" : "コピー"}</span>
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs leading-6 text-slate-500 sm:text-sm">
                連携コードをコピーし、公式LINEのトーク画面に貼り付けて送信してください。
              </p>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-base font-bold text-white shadow-sm">
                3
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-slate-900">連携完了</div>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  LINEに連携完了メッセージが届けば設定は完了です。以後、日程の確定や変更の案内もLINEで受け取れます。
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center pt-1 sm:justify-start">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-w-[180px] items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            閉じる
          </button>
        </div>
      </div>
    </ModalShell>
  );
}


function ParticipantResponsePage({
  loading,
  error,
  requestItem,
  assignedSlot,
  studyTitle,
  responseNote,
  setResponseNote,
  onSubmitChangeRequest,
  submitting,
  submitMessage,
  onBackToTop,
}) {
  const confirmationStatus = requestItem?.participantConfirmationStatus || "pending";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0%,_#f8fafc_38%,_#eef2ff_100%)] text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <ResponsePageHeader />

        {loading ? <LoadingCard title="確認情報を読み込んでいます..." /> : null}

        {error ? (
          <Card className="p-6">
            <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm leading-7 text-rose-700">
              {error}
            </div>
            <button
              type="button"
              onClick={onBackToTop}
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
                  {assignedSlot ? (
                    <>
                      {formatJapaneseDate(assignedSlot.date)} / {PERIOD_MAP[assignedSlot.periodKey]?.label || assignedSlot.periodKey}
                      {assignedSlot.location ? " / " + assignedSlot.location : ""}
                    </>
                  ) : (
                    "現在、確定済みの日程はありません。"
                  )}
                </div>
                {assignedSlot?.note ? <div className="mt-2 whitespace-pre-line text-sm text-slate-500">{assignedSlot.note}</div> : null}
                {assignedSlot?.date && assignedSlot?.periodKey ? (
                  <button
                    type="button"
                    onClick={() =>
                      downloadIcsFile(
                        "schedule.ics",
                        [{ slot: assignedSlot, summary: studyTitle || "実験参加", uid: `lablink-${requestItem?.id || "unknown"}@lablink` }]
                      )
                    }
                    className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-700 transition hover:bg-teal-100"
                  >
                    カレンダーに追加（.ics）
                  </button>
                ) : null}
              </div>

              {submitMessage ? (
                <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-7 text-emerald-800">
                  {submitMessage}
                </div>
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
                      onChange={(event) => setResponseNote(event.target.value)}
                      placeholder="例）この時間は授業があるため参加できません。来週火曜3〜5限なら参加できます。"
                      className="min-h-36 w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 outline-none transition focus:border-rose-400"
                    />
                  </label>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={onSubmitChangeRequest}
                      disabled={submitting || !assignedSlot}
                      className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-rose-500 disabled:opacity-60"
                    >
                      {submitting ? "送信中..." : confirmationStatus === "change_requested" ? "もう一度、変更希望を送信する" : "変更希望を送信する"}
                    </button>

                    <button
                      type="button"
                      onClick={onBackToTop}
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
      </div>
    </div>
  );
}

function SelectedStudyContextCard({ study, onOpenHelp }) {
  if (!study) return null;

  const steps = [
    ["01", "希望枠を選択", "空いている日程から最大5枠まで選びます。"],
    ["02", "担当者が確定", "申込内容を確認し、参加日時を決定します。"],
    ["03", "案内を確認", "確定案内をメールで確認し、必要に応じてLINE連携できます。"],
  ];

  return (
    <div className="mb-5 rounded-[30px] border border-white/80 bg-white/88 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-[0.16em] text-teal-600">RESERVATION PAGE</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">実験日程の予約</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            「{study.title}」の内容を確認し、下のカレンダーまたは一覧から希望日時を選択してください。
          </p>
        </div>
        <StatusBadge tone={getStudyStatusTone(study.status)}>{getStudyStatusLabel(study.status)}</StatusBadge>
      </div>

      <div className="mt-5 rounded-[26px] border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-blue-50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold tracking-[0.16em] text-teal-600">HOW IT WORKS</div>
            <h2 className="mt-1 text-base font-bold text-slate-950">申込から参加まで</h2>
          </div>
          {typeof onOpenHelp === "function" ? (
            <button
              type="button"
              onClick={onOpenHelp}
              className="rounded-2xl border border-teal-200 bg-white px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
            >
              詳しく見る
            </button>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {steps.map(([number, title, text]) => (
            <div key={number} className="rounded-3xl border border-white/80 bg-white/85 p-4">
              <div className="text-xs font-bold tracking-[0.18em] text-teal-500">{number}</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{title}</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">{text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
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
  participantSubmitLoading,
  message,
  lineLinkInfo,
  onOpenLineGuide,
  detailsRef,
  onOpenAdmin,
  onOpenHelp,
  onOpenHome,
  onOpenStudies,
  stats,
  isLoading,
  onRetry,
  setupMode,
  calendarView,
  setCalendarView,
  experimentInfo,
  activeStudy,
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0%,_#eff6ff_30%,_#f8fafc_60%,_#eef2ff_100%)] text-slate-900">
      <PublicSiteHeader onOpenHelp={onOpenHelp} onOpenAdmin={onOpenAdmin} onOpenHome={onOpenHome} onOpenReservation={onOpenStudies || onOpenHome} activePage="studies" />
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7">
        <SelectedStudyContextCard study={activeStudy} onOpenHelp={onOpenHelp} />

        {setupMode ? <div className="mb-6"><SetupNotice /></div> : null}


        <section className="mb-6">
          <ExperimentInfoCard
            info={experimentInfo}
            stats={stats}
            openSlotCount={sortedSlots.length}
            onRetry={onRetry}
            setupMode={setupMode}
          />
        </section>

        {isLoading ? (
          <LoadingCard title="公開中の日程を読み込んでいます..." />
        ) : (
          <section className="grid gap-6 xl:grid-cols-[1.28fr,0.92fr]">
            <Card>
              <SectionHeader
                eyebrow="CALENDAR"
                title="空いている日をカレンダーで選ぶ"
                description="表示方法を切り替えながら、見やすい形で日程を確認できます。色の意味は下の凡例で確認できます。"
                action={
                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
                    <div className="inline-flex w-full rounded-2xl border border-slate-200 bg-white p-1 sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setCalendarView("calendar")}
                        className={classNames(
                          "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition sm:flex-none",
                          calendarView === "calendar" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        カレンダー表示
                      </button>
                      <button
                        type="button"
                        onClick={() => setCalendarView("list")}
                        className={classNames(
                          "flex-1 rounded-xl border-l border-slate-200 px-3 py-2 text-sm font-medium transition sm:flex-none sm:border-l-0",
                          calendarView === "list" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        一覧表示
                      </button>
                    </div>
                    <div className="grid w-full grid-cols-[56px_1fr_56px] items-center gap-2 sm:w-auto sm:min-w-[260px]">
                      <IconButton onClick={() => setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() - 1, 1))}>
                        <ChevronLeft />
                      </IconButton>
                      <div className="text-center text-sm font-semibold text-slate-700">{formatMonthTitle(displayMonth)}</div>
                      <IconButton onClick={() => setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1))}>
                        <ChevronRight />
                      </IconButton>
                    </div>
                  </div>
                }
              />

              <div className="mb-4 hidden flex-wrap gap-2 text-xs text-slate-500 md:flex">
                <StatusBadge tone="emerald">空きあり</StatusBadge>
                <StatusBadge tone="amber">残りわずか</StatusBadge>
                <StatusBadge tone="rose">満席</StatusBadge>
                <StatusBadge tone="slate">公開枠なし</StatusBadge>
              </div>

              <div className="mb-4 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto pb-1 text-xs text-slate-500 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <span className="inline-flex shrink-0 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">空きあり</span>
                <span className="inline-flex shrink-0 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">残りわずか</span>
                <span className="inline-flex shrink-0 rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700">満席</span>
                <span className="inline-flex shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">公開枠なし</span>
              </div>

              {calendarView === "calendar" ? (
                <>
                  <div className="mb-3 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-400">
                    {WEEK_LABELS.map((label, index) => (
                      <div
                        key={label}
                        className={classNames(
                          "py-2",
                          index === 0 ? "text-rose-500" : index === 6 ? "text-sky-500" : "text-slate-400"
                        )}
                      >
                        {label}
                      </div>
                    ))}
                  </div>

                  <div className="hidden md:grid md:grid-cols-7 md:gap-2">
                    {days.map((day) => {
                      const dateKey = formatDateKey(day);
                      const summary = monthSummary[dateKey];
                      const inMonth = day.getMonth() === displayMonth.getMonth();
                      const selected = dateKey === selectedDate;
                      const hasSlots = summary?.slotCount > 0;
                      const onlyFewLeft = hasSlots && summary.totalRemaining <= 1;
                      const allFull = hasSlots && summary.fullCount === summary.slotCount;
                      const holidayName = getJapaneseHolidayName(day);
                      const isHoliday = Boolean(holidayName);
                      const isSunday = day.getDay() === 0;
                      const isSaturday = day.getDay() === 6;

                      return (
                        <button
                          key={dateKey}
                          onClick={() => handleSelectDate(dateKey)}
                          className={classNames(
                            "min-h-[114px] rounded-3xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                            selected
                              ? "border-slate-900 bg-slate-900 text-white shadow-lg"
                              : !inMonth
                              ? "bg-slate-50 text-slate-400 border-slate-200"
                              : hasSlots
                              ? allFull
                                ? "border-rose-300 bg-rose-50 hover:border-rose-400 hover:shadow-sm"
                                : onlyFewLeft
                                ? "border-amber-300 bg-amber-50 hover:border-amber-400 hover:shadow-sm"
                                : "border-emerald-300 bg-emerald-50 hover:border-emerald-400 hover:shadow-sm"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                            <div
                              className={classNames(
                                "font-semibold",
                                hasSlots ? "text-lg" : "text-sm",
                                selected
                                  ? "text-white"
                                  : isHoliday || isSunday
                                  ? "text-rose-600"
                                  : isSaturday
                                  ? "text-sky-600"
                                  : "text-slate-900"
                              )}
                            >
                              {day.getDate()}
                            </div>
                            {holidayName && inMonth ? (
                              <span className={classNames("rounded-full px-2 py-0.5 text-[10px] font-medium", selected ? "bg-white/15 text-white" : "bg-rose-100 text-rose-700")}>
                                祝
                              </span>
                            ) : null}
                          </div>
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
                          <div className={classNames("mt-4 space-y-1 text-xs leading-5", selected ? "text-slate-200" : "text-slate-500")}>
                            <div>{summary?.slotCount || 0} 枠</div>
                            <div>{hasSlots ? `残り ${summary.totalRemaining} 席` : "公開枠なし"}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-7 gap-2 md:hidden">
                    {days.map((day) => {
                      const dateKey = formatDateKey(day);
                      const summary = monthSummary[dateKey];
                      const inMonth = day.getMonth() === displayMonth.getMonth();
                      const selected = dateKey === selectedDate;
                      const hasSlots = summary?.slotCount > 0;
                      const allFull = hasSlots && summary.fullCount === summary.slotCount;
                      const few = hasSlots && !allFull && summary.totalRemaining <= 1;
                      const holidayName = getJapaneseHolidayName(day);
                      const isHoliday = Boolean(holidayName);
                      const isSunday = day.getDay() === 0;
                      const isSaturday = day.getDay() === 6;

                      return (
                        <button
                          key={dateKey}
                          onClick={() => handleSelectDate(dateKey)}
                          className={classNames(
                            "aspect-square rounded-2xl border text-center transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                            selected
                              ? "border-slate-900 bg-slate-900 text-white shadow-md"
                              : !inMonth
                              ? "border-slate-200 bg-slate-50 text-slate-300"
                              : hasSlots
                              ? allFull
                                ? "border-rose-200 bg-rose-100 text-rose-700"
                                : few
                                ? "border-amber-200 bg-amber-100 text-amber-700"
                                : "border-emerald-200 bg-emerald-100 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                          )}
                        >
                          <div
                            className={classNames(
                              "flex h-full items-center justify-center text-base font-semibold",
                              selected
                                ? "text-white"
                                : isHoliday || isSunday
                                ? "text-rose-600"
                                : isSaturday
                                ? "text-sky-600"
                                : inMonth
                                ? "text-slate-800"
                                : "text-slate-300"
                            )}
                          >
                            {day.getDate()}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
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
              )}
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

              {participantForm.preferredSlotIds.length > 0 ? (
              <Card>
                <SectionHeader
                  eyebrow="FORM"
                  title="希望日時を送信する"
                  description="氏名、メールアドレス、所属・学年、希望枠は必須です。確定連絡は迷惑メールに入る場合があるため、受信箱と迷惑メールの両方を確認してください。"
                  action={<StatusBadge tone="sky">最大{MAX_PREFERRED_SLOTS}枠まで</StatusBadge>}
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
                      <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
                        送信後は、受信箱と迷惑メールの両方を必ず確認してください。
                      </div>
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

                  {(activeStudy?.customFields || []).map((field) => {
                    const val = (participantForm.customFieldValues || {})[field.id] ?? (field.type === "checkbox" ? [] : "");
                    const setVal = (newVal) => setParticipantForm((prev) => ({
                      ...prev,
                      customFieldValues: { ...(prev.customFieldValues || {}), [field.id]: newVal },
                    }));
                    return (
                      <div key={field.id} className="block text-sm">
                        <div className="mb-1.5 text-slate-600">
                          {field.label}
                          {field.required ? <span className="ml-1 text-rose-500">*</span> : null}
                        </div>
                        {field.type === "text" && (
                          <input
                            required={field.required}
                            value={val}
                            onChange={(e) => setVal(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200"
                          />
                        )}
                        {field.type === "textarea" && (
                          <textarea
                            required={field.required}
                            value={val}
                            onChange={(e) => setVal(e.target.value)}
                            className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200"
                          />
                        )}
                        {field.type === "select" && (
                          <select
                            required={field.required}
                            value={val}
                            onChange={(e) => setVal(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200"
                          >
                            <option value="">選択してください</option>
                            {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        )}
                        {field.type === "radio" && (
                          <div className="flex flex-wrap gap-3">
                            {(field.options || []).map((opt) => (
                              <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="radio"
                                  name={`custom_${field.id}`}
                                  value={opt}
                                  checked={val === opt}
                                  onChange={() => setVal(opt)}
                                  className="h-4 w-4"
                                />
                                {opt}
                              </label>
                            ))}
                          </div>
                        )}
                        {field.type === "checkbox" && (
                          <div className="flex flex-wrap gap-3">
                            {(field.options || []).map((opt) => (
                              <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="checkbox"
                                  value={opt}
                                  checked={Array.isArray(val) && val.includes(opt)}
                                  onChange={(e) => {
                                    const next = Array.isArray(val) ? [...val] : [];
                                    setVal(e.target.checked ? [...next, opt] : next.filter((v) => v !== opt));
                                  }}
                                  className="h-4 w-4 rounded"
                                />
                                {opt}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

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

                  {lineLinkInfo?.code ? (
                    <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-900">
                      <div className="font-semibold text-emerald-950">LINE連携コードを発行しました</div>
                      <p className="mt-1">
                        公式LINEで通知を受け取りたい場合は、申込完了後に表示された案内に従って連携してください。
                      </p>
                      <button
                        type="button"
                        onClick={onOpenLineGuide}
                        className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
                      >
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-[8px] font-black tracking-tight text-[#06C755]">
                          LINE
                        </span>
                        公式LINEの案内をもう一度見る
                      </button>
                    </div>
                  ) : null}

                  <button
                    disabled={participantSubmitLoading}
                    className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-60"
                  >
                    {participantSubmitLoading ? "送信中..." : "希望日時を送信する"}
                  </button>
                </form>
              </Card>
              ) : (
                <Card className="border-dashed border-slate-200 bg-white/75">
                  <SectionHeader
                    eyebrow="FORM"
                    title="希望日時を選択すると申込フォームが表示されます"
                    description="まず左側のカレンダーまたは詳細枠から参加できる日程を選択してください。選択後に氏名やメールアドレスの入力フォームが表示されます。"
                  />
                  <div className="rounded-3xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                    選択中の希望枠はまだありません。参加したい時間帯の「希望に追加」を押してください。
                  </div>
                </Card>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}


function AdminStudyManager({
  adminStudies,
  adminStudiesLoading,
  studyForm,
  setStudyForm,
  editingStudyId,
  savingStudy,
  deletingStudyId,
  onSaveStudy,
  onEditStudy,
  onResetStudyForm,
  onDeleteStudy,
  onToggleStudyPublished,
  onRepairLegacyData,
  repairingLegacyData,
  selectedStudyId,
  onSelectStudyScope,
  mode = "list",
  onOpenReservationPage,
  onCreateStudy,
  onManageSlots,
  onManageRequests,
  onBackToStudyList,
  studyTemplates = [],
  savingTemplate,
  onSaveAsTemplate,
  onDeleteTemplate,
  onLoadTemplate,
}) {
  const [templateNameInput, setTemplateNameInput] = useState("");
  const [fieldHelp, setFieldHelp] = useState(null); // "ownerEmail" | "adminEmails" | null
  const [copiedStudyId, setCopiedStudyId] = useState("");
  const sortedStudies = Array.isArray(adminStudies) ? adminStudies : [];

  function handleCopyStudyUrl(studyId) {
    const url = buildStudyPublicUrl(studyId);
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedStudyId(studyId);
      window.setTimeout(() => setCopiedStudyId(""), 2000);
    });
  }

  const showForm = mode === "form" || mode === "all" || (mode === "list" && Boolean(editingStudyId));
  const showList = mode === "list" || mode === "all";

  return (
    <div className="space-y-6">
      {showForm ? (
      <Card className="p-5 shadow-none">
        <SectionHeader
          eyebrow="STUDY FORM"
          title={editingStudyId ? "募集情報を編集する" : "新しい募集を作成する"}
          description={editingStudyId ? "登録済みの募集情報を編集しています。日程や申込は、この募集を選んだ後の募集運営で管理します。" : "LabLinkに掲載する募集ページを作成します。作成後に、募集運営から日程管理・申込管理へ進めます。"}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {editingStudyId ? <StatusBadge tone="blue">編集中</StatusBadge> : <StatusBadge tone="emerald">新規作成</StatusBadge>}
              {onBackToStudyList ? (
                <button
                  type="button"
                  onClick={onBackToStudyList}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  募集一覧へ戻る
                </button>
              ) : null}
            </div>
          }
        />

        <form onSubmit={onSaveStudy} className="space-y-5">
          <label className="block text-sm">
            <div className="mb-1.5 text-slate-600">実験タイトル <span className="text-rose-500">*</span></div>
            <input
              required
              value={studyForm.title}
              onChange={(event) => setStudyForm((prev) => ({ ...prev, title: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
              placeholder="例: VR通知配置に関する実験"
            />
            <p className="mt-2 text-xs leading-5 text-slate-500">
              管理用IDは自動で作成されます。管理者がIDを考える必要はありません。
            </p>
          </label>

          <label className="block text-sm">
            <div className="mb-1.5 text-slate-600">実験概要 <span className="text-rose-500">*</span></div>
            <textarea
              required
              value={studyForm.description}
              onChange={(event) => setStudyForm((prev) => ({ ...prev, description: event.target.value }))}
              className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
              placeholder="参加者が内容を理解できるよう、短く分かりやすく記入してください。"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <div className="mb-1.5 text-slate-600">所要時間 <span className="text-rose-500">*</span></div>
              <input
                required
                value={studyForm.duration}
                onChange={(event) => setStudyForm((prev) => ({ ...prev, duration: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
                placeholder="約60分"
              />
            </label>
            <label className="text-sm">
              <div className="mb-1.5 text-slate-600">謝礼 <span className="text-rose-500">*</span></div>
              <input
                required
                value={studyForm.reward}
                onChange={(event) => setStudyForm((prev) => ({ ...prev, reward: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
                placeholder="謝礼あり"
              />
            </label>
            <label className="text-sm">
              <div className="mb-1.5 text-slate-600">実施組織 <span className="text-rose-500">*</span></div>
              <input
                required
                value={studyForm.organization}
                onChange={(event) => setStudyForm((prev) => ({ ...prev, organization: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
                placeholder="立命館大学"
              />
            </label>
            <label className="text-sm">
              <div className="mb-1.5 text-slate-600">場所 <span className="text-rose-500">*</span></div>
              <input
                required
                value={studyForm.location}
                onChange={(event) => setStudyForm((prev) => ({ ...prev, location: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
                placeholder="立命館大学 OIC"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <div className="mb-1.5 text-slate-600">実験担当者 <span className="text-rose-500">*</span></div>
              <input
                required
                value={studyForm.managerName}
                onChange={(event) => setStudyForm((prev) => ({ ...prev, managerName: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
                placeholder="担当者名"
              />
            </label>
            <label className="text-sm">
              <div className="mb-1.5 text-slate-600">連絡先メール <span className="text-rose-500">*</span></div>
              <input
                required
                type="email"
                value={studyForm.contactEmail}
                onChange={(event) => setStudyForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
                placeholder="example@ed.ritsumei.ac.jp"
              />
            </label>
          </div>

          <label className="block text-sm">
            <div className="mb-1.5 text-slate-600">補足事項</div>
            <textarea
              value={studyForm.notes}
              onChange={(event) => setStudyForm((prev) => ({ ...prev, notes: event.target.value }))}
              className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
              placeholder="参加条件、注意事項、持ち物など"
            />
          </label>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_220px]">
            <label className="text-sm">
              <div className="mb-1.5 flex items-center gap-1.5 text-slate-600">
                オーナーメール <span className="text-rose-500">*</span>
                <button
                  type="button"
                  onClick={() => setFieldHelp("ownerEmail")}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-500 hover:bg-slate-300"
                  aria-label="オーナーメールの説明"
                >?</button>
              </div>
              <input
                required
                type="email"
                value={studyForm.ownerEmail}
                onChange={(event) => setStudyForm((prev) => ({ ...prev, ownerEmail: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
              />
            </label>
            <label className="text-sm">
              <div className="mb-1.5 flex items-center gap-1.5 text-slate-600">
                管理者メール
                <button
                  type="button"
                  onClick={() => setFieldHelp("adminEmails")}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-500 hover:bg-slate-300"
                  aria-label="管理者メールの説明"
                >?</button>
              </div>
              <textarea
                value={studyForm.adminEmailsText}
                onChange={(event) => setStudyForm((prev) => ({ ...prev, adminEmailsText: event.target.value }))}
                className="min-h-[52px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                placeholder="1行に1つ、またはカンマ区切り"
              />
            </label>
            <label className="text-sm">
              <div className="mb-1.5 text-slate-600">募集状態</div>
              <select
                value={studyForm.status}
                onChange={(event) => setStudyForm((prev) => ({ ...prev, status: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
              >
                <option value="draft">準備中</option>
                <option value="recruiting">募集中</option>
                <option value="paused">一時停止中</option>
                <option value="closed">募集終了</option>
              </select>
            </label>
          </div>

          <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={studyForm.isPublished}
              onChange={(event) => setStudyForm((prev) => ({ ...prev, isPublished: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-sky-300"
            />
            トップページに公開する
          </label>

          <details className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <summary className="cursor-pointer select-none text-sm font-semibold text-slate-700">
              申込フォームのカスタム項目
              <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">
                {(studyForm.customFields || []).length} 項目
              </span>
            </summary>
            <div className="mt-4 space-y-3">
              {(studyForm.customFields || []).map((field, idx) => (
                <div key={field.id || idx} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0 grid gap-2 sm:grid-cols-[1fr_140px_100px_80px]">
                      <input
                        value={field.label}
                        onChange={(e) => setStudyForm((prev) => {
                          const next = [...prev.customFields];
                          next[idx] = { ...next[idx], label: e.target.value };
                          return { ...prev, customFields: next };
                        })}
                        placeholder="項目名"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                      />
                      <select
                        value={field.type}
                        onChange={(e) => setStudyForm((prev) => {
                          const next = [...prev.customFields];
                          next[idx] = { ...next[idx], type: e.target.value };
                          return { ...prev, customFields: next };
                        })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                      >
                        <option value="text">テキスト</option>
                        <option value="textarea">テキスト（複数行）</option>
                        <option value="select">ドロップダウン</option>
                        <option value="radio">ラジオボタン</option>
                        <option value="checkbox">チェックボックス</option>
                      </select>
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => setStudyForm((prev) => {
                            const next = [...prev.customFields];
                            next[idx] = { ...next[idx], required: e.target.checked };
                            return { ...prev, customFields: next };
                          })}
                          className="h-3.5 w-3.5 rounded"
                        />
                        必須
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => setStudyForm((prev) => {
                            const next = [...prev.customFields];
                            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                            return { ...prev, customFields: next };
                          })}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 disabled:opacity-30 hover:bg-slate-50"
                        >↑</button>
                        <button
                          type="button"
                          disabled={idx === (studyForm.customFields || []).length - 1}
                          onClick={() => setStudyForm((prev) => {
                            const next = [...prev.customFields];
                            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                            return { ...prev, customFields: next };
                          })}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 disabled:opacity-30 hover:bg-slate-50"
                        >↓</button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStudyForm((prev) => ({ ...prev, customFields: prev.customFields.filter((_, i) => i !== idx) }))}
                      className="shrink-0 rounded-xl border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100"
                    >
                      削除
                    </button>
                  </div>
                  {["select", "radio", "checkbox"].includes(field.type) && (
                    <div className="mt-3">
                      <div className="mb-1 text-xs text-slate-500">選択肢（1行に1つ）</div>
                      <textarea
                        value={(field.options || []).join("\n")}
                        onChange={(e) => setStudyForm((prev) => {
                          const next = [...prev.customFields];
                          next[idx] = { ...next[idx], options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) };
                          return { ...prev, customFields: next };
                        })}
                        rows={3}
                        placeholder={"選択肢A\n選択肢B\n選択肢C"}
                        className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                      />
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setStudyForm((prev) => ({
                  ...prev,
                  customFields: [...(prev.customFields || []), { id: `field_${Date.now()}`, label: "", type: "text", required: false, options: [] }],
                }))}
                className="w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
              >
                + 項目を追加
              </button>
            </div>
          </details>

          <details className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <summary className="cursor-pointer select-none text-sm font-semibold text-slate-700">
              メール・LINE通知テンプレート
            </summary>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              空欄の場合はシステムのデフォルト文言が使われます。変数: {"{{name}}"} {"{{studyTitle}}"} {"{{date}}"} {"{{period}}"} {"{{location}}"}
            </p>
            <div className="mt-4 space-y-4">
              {[
                { key: "onAssigned", label: "日程確定時" },
                { key: "onChanged", label: "日程変更時" },
                { key: "onUnassigned", label: "日程解除時" },
                { key: "onNewRequest", label: "新規申込時（管理者宛）" },
              ].map(({ key, label }) => {
                const tpl = (studyForm.notificationTemplates || {})[key] || { subject: "", body: "" };
                return (
                  <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                    <input
                      value={tpl.subject}
                      onChange={(e) => setStudyForm((prev) => ({
                        ...prev,
                        notificationTemplates: {
                          ...(prev.notificationTemplates || {}),
                          [key]: { ...(prev.notificationTemplates?.[key] || {}), subject: e.target.value },
                        },
                      }))}
                      placeholder="件名（空欄=デフォルト）"
                      className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                    <textarea
                      value={tpl.body}
                      onChange={(e) => setStudyForm((prev) => ({
                        ...prev,
                        notificationTemplates: {
                          ...(prev.notificationTemplates || {}),
                          [key]: { ...(prev.notificationTemplates?.[key] || {}), body: e.target.value },
                        },
                      }))}
                      rows={4}
                      placeholder="本文（空欄=デフォルト）"
                      className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                  </div>
                );
              })}
            </div>
          </details>

          {onSaveAsTemplate && (
            <details className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <summary className="cursor-pointer select-none text-sm font-semibold text-emerald-800">
                募集テンプレート
              </summary>
              <div className="mt-4 space-y-3">
                <div className="flex gap-2">
                  <input
                    value={templateNameInput}
                    onChange={(e) => setTemplateNameInput(e.target.value)}
                    placeholder="テンプレート名"
                    className="flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  />
                  <button
                    type="button"
                    disabled={savingTemplate || !templateNameInput.trim()}
                    onClick={() => {
                      onSaveAsTemplate(templateNameInput.trim());
                      setTemplateNameInput("");
                    }}
                    className="shrink-0 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {savingTemplate ? "保存中..." : "現在の入力を保存"}
                  </button>
                </div>
                {studyTemplates.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-emerald-700">保存済みテンプレート</div>
                    {studyTemplates.map((tpl) => (
                      <div key={tpl.id} className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2.5">
                        <div className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate">{tpl.name}</div>
                        <button
                          type="button"
                          onClick={() => onLoadTemplate(tpl)}
                          className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          読み込む
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTemplate(tpl.id)}
                          className="shrink-0 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                        >
                          削除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={savingStudy}
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {savingStudy ? "保存中..." : editingStudyId ? "募集情報を更新" : "募集を作成"}
            </button>
            <button
              type="button"
              onClick={onResetStudyForm}
              disabled={savingStudy}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              入力をリセット
            </button>
          </div>
        </form>
      </Card>
      ) : null}

      {showList ? (
      <Card className="p-5 shadow-none">
        <SectionHeader
          eyebrow="STUDY LIST"
          title="登録済みの募集"
          description="トップページや募集中の実験一覧に表示する募集情報を管理します。各募集カード右上の「日程・申込管理」から、個別の運営ページへ進めます。"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="sky">{sortedStudies.length}件</StatusBadge>
              {onCreateStudy ? (
                <button
                  type="button"
                  onClick={onCreateStudy}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  新規募集を作成
                </button>
              ) : null}
            </div>
          }
        />

        {adminStudiesLoading ? (
          <StudyListSkeleton />
        ) : sortedStudies.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
            まだ実験が登録されていません。右上の「新規募集を作成」から、最初の募集ページを作成してください。
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {sortedStudies.map((study) => (
              <div key={study.id} className="relative rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={study.isPublished ? "emerald" : "slate"}>{study.isPublished ? "公開中" : "非公開"}</StatusBadge>
                      <StatusBadge tone={getStudyStatusTone(study.status)}>{getStudyStatusLabel(study.status)}</StatusBadge>
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-slate-950">{study.title}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => onManageSlots?.(study)}
                    className="shrink-0 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-emerald-700 hover:to-teal-700 sm:px-5"
                  >
                    日程・申込管理
                  </button>
                </div>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{study.description}</p>
                <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">所要時間：{study.duration || "未設定"}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">謝礼：{study.reward || "未設定"}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">場所：{study.location || "未設定"}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">組織：{study.organization || "未設定"}</div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenReservationPage?.(study)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    予約ページを開く
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyStudyUrl(study.id)}
                    className={classNames(
                      "rounded-2xl border px-4 py-2 text-sm font-medium transition",
                      copiedStudyId === study.id
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    {copiedStudyId === study.id ? "コピーしました" : "URLをコピー"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditStudy(study)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <PencilIcon />
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleStudyPublished(study)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {study.isPublished ? "非公開にする" : "公開する"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteStudy(study)}
                    disabled={deletingStudyId === study.id}
                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    {deletingStudyId === study.id ? "削除中..." : <><TrashIcon /> 削除</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      ) : null}

      {fieldHelp === "ownerEmail" && (
        <ModalShell title="オーナーメールとは" onClose={() => setFieldHelp(null)} eyebrow="HELP">
          <div className="space-y-4 text-sm text-slate-700">
            <p>この募集の<strong>管理責任者</strong>のメールアドレスです。</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>募集の作成者・オーナーとして記録されます。</li>
              <li>他の研究者には自分の募集として表示されます。</li>
              <li>テンプレートの所有者判定にも使われます。</li>
            </ul>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              通常はログイン中のメールアドレスが自動入力されます。
            </div>
          </div>
        </ModalShell>
      )}

      {fieldHelp === "adminEmails" && (
        <ModalShell title="管理者メールとは" onClose={() => setFieldHelp(null)} eyebrow="HELP">
          <div className="space-y-4 text-sm text-slate-700">
            <p>この募集の<strong>管理画面にアクセスできるメールアドレス</strong>の一覧です。</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>ここに登録されたメールアドレスでログインすると、この募集の日程・申込を管理できます。</li>
              <li>複数人で共同管理したい場合は、複数のアドレスを入力してください。</li>
              <li>オーナーのメールは自動的に含まれます。</li>
            </ul>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              1行に1つ、またはカンマ区切りで入力してください。
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function AdminStudyScopeSelector({ adminStudies, selectedStudyId, onOpenReservationPage, onBackToStudyList, stats, confirmedScheduleGroups, onFocusRequest }) {
  const studyOptions = Array.isArray(adminStudies) && adminStudies.length > 0
    ? adminStudies
    : SAMPLE_STUDIES;
  const activeStudy = studyOptions.find((study) => study.id === selectedStudyId) || studyOptions[0];
  const scheduleGroups = Array.isArray(confirmedScheduleGroups) ? confirmedScheduleGroups : [];
  const [summaryOpen, setSummaryOpen] = useState(false);

  return (
    <Card className="mb-6 p-5 shadow-none">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold tracking-[0.18em] text-teal-600">SELECTED STUDY</div>
          <h2 className="mt-1 break-words text-2xl font-bold text-slate-950">
            {activeStudy?.title || "選択中の募集"}
          </h2>
          {activeStudy?.description ? (
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600">{activeStudy.description}</p>
          ) : (
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-500">この募集の日程管理と申込管理を行います。</p>
          )}

          <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">所要時間：{activeStudy?.duration || "未設定"}</div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">謝礼：{activeStudy?.reward || "未設定"}</div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">場所：{activeStudy?.location || "未設定"}</div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">組織：{activeStudy?.organization || "未設定"}</div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge tone={activeStudy?.isPublished ? "emerald" : "slate"}>{activeStudy?.isPublished ? "公開中" : "非公開"}</StatusBadge>
            <StatusBadge tone={getStudyStatusTone(activeStudy?.status)}>{getStudyStatusLabel(activeStudy?.status)}</StatusBadge>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[220px]">
          <button
            type="button"
            onClick={() => onOpenReservationPage?.(activeStudy)}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            予約ページを開く
          </button>
          <button
            type="button"
            onClick={onBackToStudyList}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            募集管理へ戻る
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:rounded-3xl sm:p-4">
          <div className="text-[11px] font-semibold text-slate-500 sm:text-xs">申込件数</div>
          <div className="mt-1 text-xl font-bold text-slate-950 sm:mt-2 sm:text-2xl">{stats?.requestCount ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:rounded-3xl sm:p-4">
          <div className="text-[11px] font-semibold text-slate-500 sm:text-xs">未確定</div>
          <div className="mt-1 text-xl font-bold text-slate-950 sm:mt-2 sm:text-2xl">{stats?.pending ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:rounded-3xl sm:p-4">
          <div className="text-[11px] font-semibold text-slate-500 sm:text-xs">確定済み</div>
          <div className="mt-1 text-xl font-bold text-slate-950 sm:mt-2 sm:text-2xl">{stats?.confirmed ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:rounded-3xl sm:p-4">
          <div className="text-[11px] font-semibold text-slate-500 sm:text-xs">残り席数</div>
          <div className="mt-1 text-xl font-bold text-slate-950 sm:mt-2 sm:text-2xl">{stats?.openSeats ?? 0}</div>
        </div>
      </div>

      <details open={summaryOpen} onToggle={(event) => setSummaryOpen(event.currentTarget.open)} className="mt-5 rounded-3xl border border-teal-100 bg-white/90 p-3 shadow-sm">
        <summary className="cursor-pointer list-none text-base font-bold text-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-100 bg-gradient-to-r from-teal-50 via-white to-sky-50 px-4 py-3 transition hover:border-teal-200 hover:shadow-sm">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg sm:text-xl">確定済みの日程サマリー</span>
                <StatusBadge tone={scheduleGroups.length > 0 ? "emerald" : "slate"}>{scheduleGroups.length}枠</StatusBadge>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500">
                日程ごとの確定状況を開いて確認できます。申込カードを押すと該当申込へ移動します。
              </p>
            </div>
            <div className="flex items-center gap-2">
              {scheduleGroups.length > 0 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    downloadIcsFile(
                      "confirmed-schedule.ics",
                      scheduleGroups.map((group) => ({
                        slot: group.slot,
                        summary: activeStudy?.title || "実験",
                        uid: `lablink-${group.slot.id}@lablink`,
                      })),
                      activeStudy?.title || "LabLink"
                    );
                  }}
                  className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-700 shadow-sm transition hover:bg-teal-50"
                >
                  .ics エクスポート
                </button>
              ) : null}
              <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-teal-700 shadow-sm">
                {summaryOpen ? "閉じる" : "開く"}
              </span>
            </div>
          </div>
        </summary>
        <div className="mt-4 px-1 pb-1">
          {scheduleGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              まだ確定済みの申込はありません。
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {scheduleGroups.map((group) => (
                <div key={group.slot.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-900">
                        {formatJapaneseDate(group.slot.date)} / {PERIOD_MAP[group.slot.periodKey]?.label}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">{group.slot.location || "場所未設定"}</div>
                    </div>
                    <StatusBadge tone={group.remaining <= 0 ? "rose" : group.remaining <= 1 ? "amber" : "emerald"}>
                      {group.confirmedCount}/{group.slot.capacity} 名
                    </StatusBadge>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {(group.requests || []).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onFocusRequest?.(item.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-teal-300 hover:bg-teal-50 hover:shadow-sm"
                      >
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{item.name}</div>
                          <div className="mt-0.5 text-xs text-slate-500">申込カードへ移動</div>
                        </div>
                        <span className="text-xs font-semibold text-teal-700">表示する</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>
    </Card>
  );
}

function AdminOperationSubNav({ adminTab, setAdminTab, selectedStudyTitle }) {
  const items = [
    {
      key: "slots",
      label: "日程管理",
      title: "候補日時を追加・調整する",
      description: "参加者に表示する日程枠、定員、公開状態、メモを管理します。",
      tone: "blue",
    },
    {
      key: "requests",
      label: "申込一覧",
      title: "申込者を確認・確定する",
      description: "申込者の確認、日程確定、変更、LINE連携状況を管理します。",
      tone: "emerald",
    },
  ];

  return (
    <Card className="mb-6 p-4 shadow-none">
      <div className="mb-3">
        <div className="text-xs font-semibold tracking-[0.18em] text-blue-600">MANAGE MENU</div>
        <h2 className="mt-1 text-lg font-bold text-slate-950">{selectedStudyTitle ? `${selectedStudyTitle} の管理メニュー` : "管理メニュー"}</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => {
          const active = adminTab === item.key;
          const activeClass = item.tone === "blue"
            ? "border-blue-200 bg-blue-50 text-blue-950 ring-2 ring-blue-100"
            : "border-emerald-200 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-100";
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setAdminTab(item.key)}
              className={classNames(
                "rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md",
                active ? activeClass : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-bold">{item.label}</div>
                {active ? <StatusBadge tone={item.tone}>表示中</StatusBadge> : null}
              </div>
              <div className="mt-2 text-sm font-semibold">{item.title}</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
            </button>
          );
        })}
      </div>
    </Card>
  );
}



function AdminOperationLanding({
  selectedStudy,
  adminStudies,
  selectedStudyId,
  onSelectStudyScope,
  onOpenReservationPage,
  onOpenStudyList,
  onOpenStudyEdit,
  onOpenSlots,
  onOpenRequests,
  stats,
}) {
  const studyOptions = Array.isArray(adminStudies) && adminStudies.length > 0 ? adminStudies : SAMPLE_STUDIES;
  const activeStudy = selectedStudy || studyOptions.find((study) => study.id === selectedStudyId) || studyOptions[0];

  return (
    <div className="space-y-6">
      <Card className="p-5 shadow-none">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-blue-600">OPERATION PAGE</div>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">募集運営ページ</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              ここでは、選択した募集に対する候補日程の追加・調整と、申込者の確認・確定を行います。
              募集タイトルや概要の編集は「募集ページ管理」に分けています。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenStudyList}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              募集ページ管理へ
            </button>
            <button
              type="button"
              onClick={() => onOpenReservationPage?.(activeStudy)}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              予約ページを開く
            </button>
          </div>
        </div>
      </Card>

      <Card className="p-5 shadow-none">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-slate-400">SELECTED STUDY</div>
            <h3 className="mt-2 text-xl font-bold text-slate-950">{activeStudy?.title || "運営する募集を選択してください"}</h3>
            {activeStudy?.description ? (
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{activeStudy.description}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge tone={activeStudy?.isPublished ? "emerald" : "slate"}>{activeStudy?.isPublished ? "公開中" : "非公開"}</StatusBadge>
              <StatusBadge tone={getStudyStatusTone(activeStudy?.status)}>{getStudyStatusLabel(activeStudy?.status)}</StatusBadge>
            </div>
          </div>
          <div>
            <label className="block text-sm">
              <div className="mb-1.5 text-slate-600">運営する募集</div>
              <select
                value={selectedStudyId}
                onChange={(event) => onSelectStudyScope(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-slate-400"
              >
                {studyOptions.map((study) => (
                  <option key={study.id} value={study.id}>
                    {study.title || study.id}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => onOpenStudyEdit?.(activeStudy)}
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              募集情報を編集する
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <button
          type="button"
          onClick={onOpenSlots}
          className="rounded-[30px] border border-blue-100 bg-blue-50 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-100 hover:shadow-md"
        >
          <div className="text-xs font-semibold tracking-[0.18em] text-blue-600">SCHEDULE</div>
          <h3 className="mt-2 text-xl font-bold text-blue-950">日程管理</h3>
          <p className="mt-2 text-sm leading-6 text-blue-900/80">
            参加者に表示する候補日時を追加・編集し、定員や公開状態を調整します。
          </p>
          <div className="mt-4 rounded-2xl bg-white/70 px-4 py-3 text-sm font-semibold text-blue-900">
            残り席数：{stats.openSeats}
          </div>
        </button>
        <button
          type="button"
          onClick={onOpenRequests}
          className="rounded-[30px] border border-emerald-100 bg-emerald-50 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-md"
        >
          <div className="text-xs font-semibold tracking-[0.18em] text-emerald-600">REQUESTS</div>
          <h3 className="mt-2 text-xl font-bold text-emerald-950">申込一覧</h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900/80">
            申込者を確認し、日程の確定・変更・解除やLINE連携状況の確認を行います。
          </p>
          <div className="mt-4 rounded-2xl bg-white/70 px-4 py-3 text-sm font-semibold text-emerald-900">
            申込件数：{stats.requestCount} / 確定済み：{stats.confirmed}
          </div>
        </button>
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
  requestStatusFilter,
  setRequestStatusFilter,
  participantConfirmationFilter,
  setParticipantConfirmationFilter,
  requestSortMode,
  setRequestSortMode,
  filteredRequests,
  confirmedScheduleGroups,
  handleAssignRequest,
  handleDeleteRequest,
  onToggleRequestCompleted,
  onBack,
  onLogout,
  onOpenProfile,
  adminEmail,
  isLoading,
  onSeedSampleData,
  onPrepareAssignRequest,
  experimentInfo,
  experimentInfoForm,
  setExperimentInfoForm,
  onSaveExperimentInfo,
  savingExperimentInfo,
  selectedSlotIds,
  allSlotsSelected,
  onToggleSlotSelection,
  onToggleSelectAllSlots,
  onClearSlotSelection,
  bulkNote,
  setBulkNote,
  bulkActionLoading,
  onBulkUpdateNote,
  onBulkPublish,
  onBulkUnpublish,
  onBulkDelete,
  onImportSlotsCSV,
  adminStudies,
  adminStudiesLoading,
  studyForm,
  setStudyForm,
  editingStudyId,
  savingStudy,
  deletingStudyId,
  onSaveStudy,
  onEditStudy,
  onResetStudyForm,
  onDeleteStudy,
  onToggleStudyPublished,
  onRepairLegacyData,
  repairingLegacyData,
  selectedStudyId,
  onSelectStudyScope,
  onOpenReservationPage,
  onOpenLineCodeHelp,
  onExportCsv,
  studyTemplates,
  savingTemplate,
  onSaveAsTemplate,
  onDeleteTemplate,
  onLoadTemplate,
  isSuperAdmin,
  researchers,
  researchersLoading,
  onApproveResearcher,
  onRejectResearcher,
}) {
  const operationStudies = Array.isArray(adminStudies) && adminStudies.length > 0 ? adminStudies : SAMPLE_STUDIES;
  const selectedOperationStudy = operationStudies.find((study) => study.id === selectedStudyId) || operationStudies[0];

  const [adminSlotMonth, setAdminSlotMonth] = useState(new Date());
  const [adminSelectedSlotDate, setAdminSelectedSlotDate] = useState("");
  const [showAdminSlotForm, setShowAdminSlotForm] = useState(false);
  const [bulkFocusedSlotDate, setBulkFocusedSlotDate] = useState("");
  const [expandedRequestIds, setExpandedRequestIds] = useState(() => new Set());
  const [expandedNearbySlotKeys, setExpandedNearbySlotKeys] = useState(() => new Set());
  const [pendingFocusRequestId, setPendingFocusRequestId] = useState("");
  const requestCardRefs = useRef({});

  const adminSlotDays = useMemo(() => getMonthGrid(adminSlotMonth), [adminSlotMonth]);
  const adminSlotMonthSummary = useMemo(() => {
    return Object.fromEntries(
      adminSlotDays.map((day) => {
        const dateKey = formatDateKey(day);
        return [dateKey, getAdminDaySummary(dateKey, sortedSlots, requests)];
      })
    );
  }, [adminSlotDays, sortedSlots, requests]);

  const adminSelectedDaySlots = useMemo(
    () => sortSlots(sortedSlots.filter((slot) => slot.date === adminSelectedSlotDate)),
    [sortedSlots, adminSelectedSlotDate]
  );

  useEffect(() => {
    if (adminTab !== "slots") return;
    if (sortedSlots.length === 0) return;

    const firstDate = sortedSlots[0].date;

    if (!adminSelectedSlotDate) {
      setAdminSelectedSlotDate(firstDate);
      setAdminSlotMonth(new Date(`${firstDate}T00:00:00`));
    }
  }, [adminTab, sortedSlots, adminSelectedSlotDate]);

  useEffect(() => {
    if (adminTab !== "requests" || !pendingFocusRequestId) return;

    const timer = window.setTimeout(() => {
      const target = requestCardRefs.current[pendingFocusRequestId];
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        setExpandedRequestIds((prev) => {
          const next = new Set(prev);
          next.add(pendingFocusRequestId);
          return next;
        });
      }
      setPendingFocusRequestId("");
    }, 120);

    return () => window.clearTimeout(timer);
  }, [adminTab, pendingFocusRequestId]);

  const toggleRequestExpanded = (requestId) => {
    setExpandedRequestIds((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  };

  const toggleNearbySlots = (requestId, slotId) => {
    const key = `${requestId}:${slotId}`;
    setExpandedNearbySlotKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelectAdminSlotDate = (dateKey) => {
    setAdminSelectedSlotDate(dateKey);
    setShowAdminSlotForm(false);
  };

  const handleOpenAdminSlotForm = () => {
    const targetDate = adminSelectedSlotDate || formatDateKey(new Date());
    setAdminSelectedSlotDate(targetDate);
    setBulkFocusedSlotDate(targetDate);
    setSlotForm((prev) => ({
      ...prev,
      date: targetDate,
      bulkSlotPlan: prev.bulkMode
        ? {
            ...(prev.bulkSlotPlan || {}),
            [targetDate]: prev.bulkSlotPlan?.[targetDate]?.length
              ? prev.bulkSlotPlan[targetDate]
              : [],
          }
        : prev.bulkSlotPlan || {},
    }));
    setShowAdminSlotForm(true);
  };

  const bulkSlotPlan = slotForm.bulkSlotPlan || {};
  const bulkSelectedDates = Object.keys(bulkSlotPlan)
    .filter((dateKey) => (bulkSlotPlan[dateKey] || []).length > 0)
    .sort();
  const bulkFocusedDate = bulkFocusedSlotDate || Object.keys(bulkSlotPlan).sort()[0] || "";
  const bulkPlannedCount = bulkSelectedDates.reduce((sum, dateKey) => sum + (bulkSlotPlan[dateKey]?.length || 0), 0);

  const getExistingSlotsForDate = (dateKey) => sortSlots(sortedSlots.filter((slot) => slot.date === dateKey));

  const toggleBulkSlotDate = (dateKey) => {
    setBulkFocusedSlotDate(dateKey);
    setSlotForm((prev) => {
      const currentPlan = { ...(prev.bulkSlotPlan || {}) };
      if (!currentPlan[dateKey]) {
        currentPlan[dateKey] = [];
      }
      return { ...prev, bulkSlotPlan: currentPlan };
    });
  };

  const removeBulkSlotDate = (dateKey) => {
    setSlotForm((prev) => {
      const currentPlan = { ...(prev.bulkSlotPlan || {}) };
      delete currentPlan[dateKey];
      return { ...prev, bulkSlotPlan: currentPlan };
    });
    setBulkFocusedSlotDate((current) => (current === dateKey ? "" : current));
  };

  const toggleBulkSlotPeriod = (dateKey, periodKey) => {
    setBulkFocusedSlotDate(dateKey);
    setSlotForm((prev) => {
      const currentPlan = { ...(prev.bulkSlotPlan || {}) };
      const currentPeriods = currentPlan[dateKey] || [];
      const nextPeriods = currentPeriods.includes(periodKey)
        ? currentPeriods.filter((key) => key !== periodKey)
        : [...currentPeriods, periodKey];
      currentPlan[dateKey] = nextPeriods;
      return { ...prev, bulkSlotPlan: currentPlan };
    });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0%,_#f8fafc_34%,_#eef2ff_100%)] text-slate-900">
      <AdminSiteHeader
        onBack={adminTab === "slots" || adminTab === "requests" ? () => setAdminTab("studies") : onBack}
        onLogoClick={onBack}
        onLogout={onLogout}
        onOpenProfile={onOpenProfile}
        adminEmail={adminEmail}
        backLabel={adminTab === "slots" || adminTab === "requests" ? "募集管理へ戻る" : "トップへ戻る"}
      />
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7">
        {adminTab === "studies" || adminTab === "study-new" ? <AdminHero adminEmail={adminEmail} /> : null}

        {isSuperAdmin && (
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setAdminTab("studies")}
              className={classNames(
                "rounded-2xl px-4 py-2 text-sm font-medium transition",
                adminTab === "studies" || adminTab === "study-new" || adminTab === "operation" || adminTab === "slots" || adminTab === "requests" || adminTab === "dashboard"
                  ? adminTab === "researchers"
                    ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    : "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              募集・運営管理
            </button>
            <button
              type="button"
              onClick={() => setAdminTab("researchers")}
              className={classNames(
                "relative rounded-2xl px-4 py-2 text-sm font-medium transition",
                adminTab === "researchers"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              研究者管理
              {(researchers || []).some((r) => r.status === "pending") ? (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                  {(researchers || []).filter((r) => r.status === "pending").length}
                </span>
              ) : null}
            </button>
          </div>
        )}

        {isLoading ? <LoadingCard title="管理データを読み込んでいます..." /> : null}

        {adminTab === "slots" || adminTab === "requests" ? (
          <>
            <AdminStudyScopeSelector
              adminStudies={adminStudies}
              selectedStudyId={selectedStudyId}
              onOpenReservationPage={onOpenReservationPage}
              onBackToStudyList={() => setAdminTab("studies")}
              stats={stats}
              confirmedScheduleGroups={confirmedScheduleGroups}
              onFocusRequest={(requestId) => {
                setAdminTab("requests");
                setPendingFocusRequestId(requestId);
              }}
            />
            <AdminOperationSubNav adminTab={adminTab} setAdminTab={setAdminTab} selectedStudyTitle={selectedOperationStudy?.title || ""} />
          </>
        ) : null}

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
                eyebrow="GUIDE"
                title="管理機能を目的ごとに分けています"
                description="募集ページを作る・直す場所と、作成済み募集の日程や申込を運営する場所を分けています。"
              />
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setAdminTab("studies")}
                  className="rounded-3xl border border-teal-100 bg-teal-50 p-4 text-left text-sm leading-6 text-teal-900 transition hover:bg-teal-100"
                >
                  <div className="font-semibold">募集ページ管理</div>
                  <p className="mt-1 text-xs leading-5">トップページに表示する募集を作成・編集し、公開状態を管理します。</p>
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab("operation")}
                  className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-left text-sm leading-6 text-blue-900 transition hover:bg-blue-100"
                >
                  <div className="font-semibold">募集運営</div>
                  <p className="mt-1 text-xs leading-5">対象の募集を選び、候補日程の追加や申込者の確認・確定を行います。</p>
                </button>
              </div>
            </Card>

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
                <button onClick={resetAll} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100">
                  データを初期化
                </button>
              </div>
            </Card>
          </div>
        )}

        {adminTab === "studies" && (
          <AdminStudyManager
            adminStudies={adminStudies}
            adminStudiesLoading={adminStudiesLoading}
            studyForm={studyForm}
            setStudyForm={setStudyForm}
            editingStudyId={editingStudyId}
            savingStudy={savingStudy}
            deletingStudyId={deletingStudyId}
            onSaveStudy={onSaveStudy}
            onEditStudy={onEditStudy}
            onResetStudyForm={onResetStudyForm}
            onDeleteStudy={onDeleteStudy}
            onToggleStudyPublished={onToggleStudyPublished}
            onRepairLegacyData={onRepairLegacyData}
            repairingLegacyData={repairingLegacyData}
            mode="list"
            onOpenReservationPage={onOpenReservationPage}
            studyTemplates={studyTemplates}
            savingTemplate={savingTemplate}
            onSaveAsTemplate={onSaveAsTemplate}
            onDeleteTemplate={onDeleteTemplate}
            onLoadTemplate={onLoadTemplate}
            onCreateStudy={() => {
              onResetStudyForm();
              setAdminTab("study-new");
            }}
            onManageSlots={(study) => {
              onSelectStudyScope(study.id);
              setAdminTab("slots");
            }}
            onManageRequests={(study) => {
              onSelectStudyScope(study.id);
              setAdminTab("requests");
            }}
          />
        )}

        {adminTab === "study-new" && (
          <AdminStudyManager
            adminStudies={adminStudies}
            adminStudiesLoading={adminStudiesLoading}
            studyForm={studyForm}
            setStudyForm={setStudyForm}
            editingStudyId={editingStudyId}
            savingStudy={savingStudy}
            deletingStudyId={deletingStudyId}
            onSaveStudy={onSaveStudy}
            onEditStudy={onEditStudy}
            onResetStudyForm={onResetStudyForm}
            onDeleteStudy={onDeleteStudy}
            onToggleStudyPublished={onToggleStudyPublished}
            mode="form"
            onOpenReservationPage={onOpenReservationPage}
            onBackToStudyList={() => setAdminTab("studies")}
            studyTemplates={studyTemplates}
            savingTemplate={savingTemplate}
            onSaveAsTemplate={onSaveAsTemplate}
            onDeleteTemplate={onDeleteTemplate}
            onLoadTemplate={onLoadTemplate}
          />
        )}

        {adminTab === "operation" && (
          <AdminOperationLanding
            selectedStudy={selectedOperationStudy}
            adminStudies={adminStudies}
            selectedStudyId={selectedStudyId}
            onSelectStudyScope={onSelectStudyScope}
            onOpenReservationPage={onOpenReservationPage}
            onOpenStudyList={() => setAdminTab("studies")}
            onOpenStudyEdit={(study) => {
              if (study) {
                onEditStudy(study);
              }
              setAdminTab("studies");
            }}
            onOpenSlots={() => setAdminTab("slots")}
            onOpenRequests={() => setAdminTab("requests")}
            stats={stats}
          />
        )}

        {adminTab === "slots" && (
          <div className="space-y-6">
            <Card className="p-5 shadow-none">
              <SectionHeader
                eyebrow="SCHEDULE CALENDAR"
                title="登録済み日程をカレンダーで確認"
                description="日付を選択すると、その日の登録済み日程枠だけを下に表示します。新しい日程は、選択した日の詳細から追加できます。"
                action={
                  <div className="grid w-full grid-cols-[56px_1fr_56px] items-center gap-2 sm:w-auto sm:min-w-[260px]">
                    <IconButton onClick={() => setAdminSlotMonth(new Date(adminSlotMonth.getFullYear(), adminSlotMonth.getMonth() - 1, 1))}>
                      <ChevronLeft />
                    </IconButton>
                    <div className="text-center text-sm font-semibold text-slate-700">{formatMonthTitle(adminSlotMonth)}</div>
                    <IconButton onClick={() => setAdminSlotMonth(new Date(adminSlotMonth.getFullYear(), adminSlotMonth.getMonth() + 1, 1))}>
                      <ChevronRight />
                    </IconButton>
                  </div>
                }
              />

              <div className="mb-4 flex flex-wrap gap-2 text-xs text-slate-500">
                <StatusBadge tone="sky">登録あり</StatusBadge>
                <StatusBadge tone="emerald">公開中あり</StatusBadge>
                <StatusBadge tone="slate">非公開のみ</StatusBadge>
                <StatusBadge tone="rose">満席あり</StatusBadge>
              </div>

              <div className="mb-2 hidden grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-400 md:grid">
                {WEEK_LABELS.map((label) => (
                  <div key={label}>{label}</div>
                ))}
              </div>

              <div className="hidden grid-cols-7 gap-2 md:grid">
                {adminSlotDays.map((day) => {
                  const dateKey = formatDateKey(day);
                  const summary = adminSlotMonthSummary[dateKey];
                  const inMonth = day.getMonth() === adminSlotMonth.getMonth();
                  const selected = dateKey === adminSelectedSlotDate;
                  const hasSlots = summary?.slotCount > 0;
                  const onlyHidden = hasSlots && summary.publishedCount === 0;
                  const hasFullSlot = hasSlots && summary.fullCount > 0;
                  const holidayName = getJapaneseHolidayName(day);
                  const isHoliday = Boolean(holidayName);
                  const isSunday = day.getDay() === 0;
                  const isSaturday = day.getDay() === 6;

                  return (
                    <button
                      type="button"
                      key={dateKey}
                      onClick={() => handleSelectAdminSlotDate(dateKey)}
                      className={classNames(
                        "min-h-[118px] rounded-3xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                        selected
                          ? "border-slate-900 bg-slate-900 text-white shadow-md"
                          : !inMonth
                          ? "border-slate-100 bg-slate-50 text-slate-300"
                          : hasSlots
                          ? onlyHidden
                            ? "border-slate-200 bg-slate-100 hover:border-slate-300"
                            : "border-sky-200 bg-sky-50 hover:border-sky-300"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className={classNames(
                            "text-lg font-semibold",
                            selected
                              ? "text-white"
                              : isHoliday || isSunday
                              ? "text-rose-600"
                              : isSaturday
                              ? "text-sky-600"
                              : inMonth
                              ? "text-slate-900"
                              : "text-slate-300"
                          )}
                        >
                          {day.getDate()}
                        </div>
                        {hasSlots ? (
                          <StatusBadge tone={onlyHidden ? "slate" : hasFullSlot ? "rose" : "sky"}>
                            {summary.slotCount}枠
                          </StatusBadge>
                        ) : null}
                      </div>
                      <div className={classNames("mt-4 space-y-1 text-xs leading-5", selected ? "text-slate-200" : "text-slate-500")}>
                        {hasSlots ? (
                          <>
                            <div>公開 {summary.publishedCount} / 非公開 {summary.hiddenCount}</div>
                            <div>確定 {summary.totalConfirmed} / 残り {summary.totalRemaining}</div>
                          </>
                        ) : (
                          <div>登録なし</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-7 gap-2 md:hidden">
                {adminSlotDays.map((day) => {
                  const dateKey = formatDateKey(day);
                  const summary = adminSlotMonthSummary[dateKey];
                  const inMonth = day.getMonth() === adminSlotMonth.getMonth();
                  const selected = dateKey === adminSelectedSlotDate;
                  const hasSlots = summary?.slotCount > 0;
                  const onlyHidden = hasSlots && summary.publishedCount === 0;
                  const hasFullSlot = hasSlots && summary.fullCount > 0;
                  const holidayName = getJapaneseHolidayName(day);
                  const isHoliday = Boolean(holidayName);
                  const isSunday = day.getDay() === 0;
                  const isSaturday = day.getDay() === 6;

                  return (
                    <button
                      type="button"
                      key={dateKey}
                      onClick={() => handleSelectAdminSlotDate(dateKey)}
                      className={classNames(
                        "aspect-square rounded-2xl border text-center transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                        selected
                          ? "border-slate-900 bg-slate-900 text-white shadow-md"
                          : !inMonth
                          ? "border-slate-200 bg-slate-50 text-slate-300"
                          : hasSlots
                          ? onlyHidden
                            ? "border-slate-200 bg-slate-100 text-slate-700"
                            : hasFullSlot
                            ? "border-rose-200 bg-rose-100 text-rose-700"
                            : "border-sky-200 bg-sky-100 text-sky-700"
                          : "border-slate-200 bg-white text-slate-800"
                      )}
                    >
                      <div
                        className={classNames(
                          "flex h-full items-center justify-center text-base font-semibold",
                          selected
                            ? "text-white"
                            : isHoliday || isSunday
                            ? "text-rose-600"
                            : isSaturday
                            ? "text-sky-600"
                            : inMonth
                            ? "text-slate-800"
                            : "text-slate-300"
                        )}
                      >
                        {day.getDate()}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>

            <div className="px-1 space-y-2">
              <button
                type="button"
                onClick={handleOpenAdminSlotForm}
                disabled={!adminSelectedSlotDate}
                className={classNames(
                  "inline-flex w-full items-center justify-center rounded-3xl border px-6 py-4 text-base font-bold shadow-sm transition",
                  adminSelectedSlotDate
                    ? "border-sky-200 bg-white text-slate-800 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:shadow-md"
                    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                )}
              >
                <span className="mr-2 flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-lg leading-none text-sky-700">＋</span>
                新しい日程を追加
              </button>
              <div className="flex items-center gap-2">
                <label className="flex-1 cursor-pointer inline-flex items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700 transition">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) { onImportSlotsCSV?.(f); e.target.value = ""; }
                    }}
                  />
                  CSVで一括インポート
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const header = "日付,時限,定員,場所,メモ";
                    const example = "2025-06-01,p3,1,立命館大学 OIC,";
                    const blob = new Blob(["﻿" + header + "\n" + example], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = "slots_template.csv"; a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-medium text-slate-500 hover:bg-slate-50 transition"
                  title="CSVテンプレートをダウンロード"
                >
                  テンプレート
                </button>
              </div>
            </div>

              {showAdminSlotForm ? (
                <form onSubmit={handleAddSlot} className="rounded-[2rem] border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-slate-900">新しい日程を追加</div>
                      <div className="mt-1 text-xs text-slate-500">選択中の日付を初期値として入力しています。</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAdminSlotForm(false)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      閉じる
                    </button>
                  </div>

                  <label className="mb-4 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(slotForm.bulkMode)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        const nextFocusDate = slotForm.date || adminSelectedSlotDate || formatDateKey(new Date());
                        setBulkFocusedSlotDate(checked ? nextFocusDate : "");
                        setSlotForm((prev) => ({
                          ...prev,
                          bulkMode: checked,
                          bulkDates: "",
                          bulkPeriodKeys: prev.bulkPeriodKeys?.length ? prev.bulkPeriodKeys : [prev.periodKey || "p3"],
                          bulkSlotPlan: checked
                            ? (Object.keys(prev.bulkSlotPlan || {}).length > 0
                                ? prev.bulkSlotPlan
                                : { [nextFocusDate]: [] })
                            : prev.bulkSlotPlan || {},
                        }));
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-sky-300"
                    />
                    <span>
                      <span className="block font-semibold text-slate-900">複数日程をまとめて追加する</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">複数の日付と時限を選ぶと、同じ定員・場所・メモでまとめて日程枠を作成できます。</span>
                    </span>
                  </label>

                  {slotForm.bulkMode ? (
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">追加する日付をカレンダーから選択</div>
                            <p className="mt-1 text-xs leading-5 text-slate-500">日付を選ぶと下にその日のカードだけが表示されます。日付ごとに追加する時限を選択してください。</p>
                          </div>
                          <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                            追加予定 {bulkPlannedCount}件
                          </div>
                        </div>

                        <div className="mb-3 flex items-center justify-between">
                          <IconButton onClick={() => setAdminSlotMonth(new Date(adminSlotMonth.getFullYear(), adminSlotMonth.getMonth() - 1, 1))}>
                            <ChevronLeft size={16} />
                          </IconButton>
                          <div className="text-sm font-bold text-slate-900">{adminSlotMonth.getFullYear()}年 {adminSlotMonth.getMonth() + 1}月</div>
                          <IconButton onClick={() => setAdminSlotMonth(new Date(adminSlotMonth.getFullYear(), adminSlotMonth.getMonth() + 1, 1))}>
                            <ChevronRight size={16} />
                          </IconButton>
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400">
                          {["日", "月", "火", "水", "木", "金", "土"].map((day) => <div key={day}>{day}</div>)}
                        </div>
                        <div className="mt-2 grid grid-cols-7 gap-1.5 sm:gap-2">
                          {adminSlotDays.map((day) => {
                            const dateKey = formatDateKey(day);
                            const summary = adminSlotMonthSummary[dateKey];
                            const inMonth = day.getMonth() === adminSlotMonth.getMonth();
                            const plannedForBulk = (bulkSlotPlan[dateKey] || []).length > 0;
                            const focusedForBulk = dateKey === bulkFocusedDate;
                            const hasSlots = summary?.slotCount > 0;
                            const onlyHidden = hasSlots && summary.publishedCount === 0;
                            const holidayName = getJapaneseHolidayName(day);
                            const isHoliday = Boolean(holidayName);
                            const isSunday = day.getDay() === 0;
                            const isSaturday = day.getDay() === 6;

                            return (
                              <button
                                type="button"
                                key={dateKey}
                                onClick={() => toggleBulkSlotDate(dateKey)}
                                className={classNames(
                                  "min-h-[54px] rounded-2xl border p-1.5 text-center transition focus:outline-none focus:ring-2 focus:ring-sky-300 sm:min-h-[74px] sm:p-2",
                                  plannedForBulk
                                    ? "border-emerald-400 bg-emerald-50 text-emerald-900 shadow-sm"
                                    : focusedForBulk
                                    ? "border-slate-400 bg-white text-slate-900 shadow-sm"
                                    : !inMonth
                                    ? "border-slate-100 bg-slate-50 text-slate-300"
                                    : hasSlots
                                    ? onlyHidden
                                      ? "border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300"
                                      : "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300"
                                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                                )}
                              >
                                <div
                                  className={classNames(
                                    "text-sm font-bold sm:text-base",
                                    plannedForBulk
                                      ? "text-emerald-900"
                                      : isHoliday || isSunday
                                      ? "text-rose-600"
                                      : isSaturday
                                      ? "text-sky-600"
                                      : inMonth
                                      ? "text-slate-800"
                                      : "text-slate-300"
                                  )}
                                >
                                  {day.getDate()}
                                </div>
                                <div className="mt-1 flex items-center justify-center gap-1">
                                  {hasSlots ? <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> : null}
                                  {plannedForBulk ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> : null}
                                </div>
                                {hasSlots ? <div className="mt-1 hidden text-[10px] text-slate-500 sm:block">{summary.slotCount}枠</div> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {!bulkFocusedDate ? (
                        <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-5 text-center text-sm text-slate-500">
                          カレンダーから確認・追加したい日付を選択してください。
                        </div>
                      ) : (() => {
                        const dateKey = bulkFocusedDate;
                        const existingSlots = getExistingSlotsForDate(dateKey);
                        const existingPeriodKeys = new Set(existingSlots.map((slot) => slot.periodKey));
                        const selectedPeriods = bulkSlotPlan[dateKey] || [];
                        return (
                          <div className="rounded-3xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="text-sm font-bold text-slate-900">{formatJapaneseDate(dateKey)}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  追加予定：{selectedPeriods.length > 0 ? selectedPeriods.map((key) => getPeriodLabel(key)).join("、") : "未選択"}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeBulkSlotDate(dateKey)}
                                className="self-start rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                              >
                                日付を外す
                              </button>
                            </div>

                            <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                              <div className="mb-2 text-xs font-semibold text-slate-500">既存の日程</div>
                              {existingSlots.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {existingSlots.map((slot) => {
                                    const remaining = Math.max(Number(slot.capacity || 0) - Number(slot.confirmedCount || 0), 0);
                                    return (
                                      <span key={slot.id} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
                                        {getPeriodLabel(slot.periodKey)} / 残り{remaining} / {slot.isPublished ? "公開" : "非公開"}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-xs text-slate-400">この日の登録済み日程はありません。</div>
                              )}
                            </div>

                            <div className="mt-3">
                              <div className="mb-2 text-xs font-semibold text-slate-500">追加する時限</div>
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {PERIODS.map((period) => {
                                  const alreadyExists = existingPeriodKeys.has(period.key);
                                  const checked = selectedPeriods.includes(period.key);
                                  return (
                                    <button
                                      type="button"
                                      key={period.key}
                                      disabled={alreadyExists}
                                      onClick={() => toggleBulkSlotPeriod(dateKey, period.key)}
                                      className={classNames(
                                        "rounded-2xl border px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                                        alreadyExists
                                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                          : checked
                                          ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm"
                                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                                      )}
                                    >
                                      <span className="flex items-center justify-between gap-2">
                                        <span className="font-semibold">{period.label}</span>
                                        {alreadyExists ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">登録済み</span> : null}
                                        {!alreadyExists && checked ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">追加</span> : null}
                                      </span>
                                      <span className="mt-0.5 block text-xs opacity-70">{period.start}〜{period.end}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })()}                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="text-sm">
                        <div className="mb-1.5 text-slate-600">日付</div>
                        <input
                          type="date"
                          value={slotForm.date}
                          onChange={(event) => {
                            const nextDate = event.target.value;
                            setSlotForm((prev) => ({ ...prev, date: nextDate }));
                            if (nextDate) {
                              setAdminSelectedSlotDate(nextDate);
                              setAdminSlotMonth(new Date(`${nextDate}T00:00:00`));
                            }
                          }}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
                        />
                      </label>
                      <label className="text-sm">
                        <div className="mb-1.5 text-slate-600">時限</div>
                        <select
                          value={slotForm.periodKey}
                          onChange={(event) => setSlotForm((prev) => ({ ...prev, periodKey: event.target.value, bulkPeriodKeys: [event.target.value] }))}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
                        >
                          {PERIODS.map((period) => (
                            <option key={period.key} value={period.key}>{period.label} ({period.start}〜{period.end})</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm">
                      <div className="mb-1.5 text-slate-600">定員</div>
                      <input
                        type="number"
                        min="1"
                        value={slotForm.capacity}
                        onChange={(event) => setSlotForm((prev) => ({ ...prev, capacity: event.target.value }))}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
                      />
                    </label>
                    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={slotForm.isPublished}
                        onChange={(event) => setSlotForm((prev) => ({ ...prev, isPublished: event.target.checked }))}
                      />
                      参加者に公開する
                    </label>
                  </div>

                  <label className="mt-4 block text-sm">
                    <div className="mb-1.5 text-slate-600">場所</div>
                    <input
                      value={slotForm.location}
                      onChange={(event) => setSlotForm((prev) => ({ ...prev, location: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
                    />
                  </label>

                  <label className="mt-4 block text-sm">
                    <div className="mb-1.5 text-slate-600">メモ</div>
                    <textarea
                      value={slotForm.note}
                      onChange={(event) => setSlotForm((prev) => ({ ...prev, note: event.target.value }))}
                      className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400"
                    />
                  </label>

                  <button className="mt-4 w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800">
                    {slotForm.bulkMode ? `${bulkPlannedCount}件の日程枠を追加する` : "日程枠を追加する"}
                  </button>
                </form>
              ) : null}


            <Card className="p-5 shadow-none">
              <SectionHeader
                eyebrow="SELECTED DATE"
                title={adminSelectedSlotDate ? `${formatJapaneseDate(adminSelectedSlotDate)} の日程枠` : "日付を選択してください"}
                description="この日に登録されている日程枠を確認できます。日程が登録されていない日付も選択できます。"
              />

              <div className="space-y-3">
                {adminSelectedDaySlots.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                    この日にはまだ日程枠がありません。新しく追加する場合は、上の「＋ 新しい日程を追加」ボタンから登録してください。
                  </div>
                ) : (
                  adminSelectedDaySlots.map((slot) => {
                    const metrics = getSlotMetrics(slot, requests);
                    const selected = selectedSlotIds.includes(slot.id);
                    return (
                      <div
                        key={slot.id}
                        className={classNames(
                          "rounded-3xl border bg-white p-4 shadow-sm transition",
                          selected ? "border-sky-300 ring-2 ring-sky-100" : "border-slate-200"
                        )}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex gap-3">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => onToggleSlotSelection(slot.id)}
                              className="mt-1 h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-sky-300"
                              aria-label={`${formatJapaneseDate(slot.date)} ${getSlotLabel(slot)} を選択`}
                            />
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-base font-semibold text-slate-900">{getSlotLabel(slot)}</div>
                                <StatusBadge tone={slot.isPublished === false ? "slate" : "sky"}>{slot.isPublished === false ? "非公開" : "公開中"}</StatusBadge>
                                <StatusBadge tone={metrics.full ? "rose" : metrics.remaining <= 1 ? "amber" : "emerald"}>
                                  {metrics.full ? "満席" : `残り ${metrics.remaining}`}
                                </StatusBadge>
                                {selected ? <StatusBadge tone="emerald">選択中</StatusBadge> : null}
                              </div>
                              <div className="mt-2 text-sm text-slate-500">{slot.location || "場所未設定"} / 定員 {slot.capacity} / 確定 {metrics.confirmed}</div>
                              {slot.note ? <div className="mt-1 whitespace-pre-line text-sm text-slate-500">{slot.note}</div> : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => onEditSlot(slot)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                              <PencilIcon />
                              編集
                            </button>
                            <button onClick={() => handleTogglePublished(slot)} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                              {slot.isPublished === false ? "公開にする" : "非公開にする"}
                            </button>
                            <button onClick={() => handleDeleteSlot(slot.id)} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100">
                              <TrashIcon />
                              削除
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            <Card className="p-5 shadow-none">
              <SectionHeader
                eyebrow="BULK ACTIONS"
                title="選択した日程枠を一括操作"
                description="チェックした枠をまとめて公開・非公開・削除したり、メモを同じ内容にそろえられます。"
              />

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge tone={selectedSlotIds.length > 0 ? "sky" : "slate"}>
                    選択中 {selectedSlotIds.length} 件
                  </StatusBadge>
                  <button
                    type="button"
                    onClick={onToggleSelectAllSlots}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {allSlotsSelected ? "すべて解除" : "すべて選択"}
                  </button>
                  <button
                    type="button"
                    onClick={onClearSlotSelection}
                    disabled={selectedSlotIds.length === 0 || bulkActionLoading}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    選択解除
                  </button>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.15fr,0.85fr]">
                  <div>
                    <label className="block text-sm">
                      <div className="mb-1.5 text-slate-600">一括更新するメモ</div>
                      <textarea
                        value={bulkNote}
                        onChange={(event) => setBulkNote(event.target.value)}
                        className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
                        placeholder="選択した枠のメモをこの内容で上書きします。空欄で保存するとメモを空にできます。"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={onBulkUpdateNote}
                      disabled={selectedSlotIds.length === 0 || bulkActionLoading}
                      className="mt-3 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                    >
                      {bulkActionLoading ? "処理中..." : "選択枠のメモを一括更新"}
                    </button>
                  </div>

                  <div className="grid content-start gap-3">
                    <button
                      type="button"
                      onClick={onBulkPublish}
                      disabled={selectedSlotIds.length === 0 || bulkActionLoading}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      選択枠を一括公開
                    </button>
                    <button
                      type="button"
                      onClick={onBulkUnpublish}
                      disabled={selectedSlotIds.length === 0 || bulkActionLoading}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      選択枠を一括非公開
                    </button>
                    <button
                      type="button"
                      onClick={onBulkDelete}
                      disabled={selectedSlotIds.length === 0 || bulkActionLoading}
                      className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                    >
                      <span className="inline-flex items-center justify-center gap-2"><TrashIcon /> 選択枠を一括削除</span>
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {adminTab === "requests" && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_220px_220px_220px]">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="氏名・メール・所属・参加者連絡で検索"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                />
                <select
                  value={requestStatusFilter}
                  onChange={(event) => setRequestStatusFilter(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                >
                  <option value="all">申込状態: すべて</option>
                  <option value="pending">申込状態: 未確定のみ</option>
                  <option value="assigned">申込状態: 確定済みのみ</option>
                </select>
                <select
                  value={participantConfirmationFilter}
                  onChange={(event) => setParticipantConfirmationFilter(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                >
                  <option value="all">参加者確認: すべて</option>
                  <option value="pending">参加者確認: 未確認のみ</option>
                  <option value="confirmed">参加者確認: 確認済みのみ</option>
                  <option value="change_requested">参加者確認: 変更希望のみ</option>
                </select>
                <select
                  value={requestSortMode}
                  onChange={(event) => setRequestSortMode(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                >
                  <option value="default">並び替え: おすすめ順</option>
                  <option value="createdDesc">申込日時: 新しい順</option>
                  <option value="createdAsc">申込日時: 古い順</option>
                  <option value="assignedAsc">確定日程: 早い順</option>
                  <option value="assignedDesc">確定日程: 遅い順</option>
                  <option value="status">対応状況順</option>
                  <option value="nameAsc">氏名順</option>
                  <option value="updatedDesc">更新日時: 新しい順</option>
                </select>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={onExportCsv}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  CSVエクスポート ({filteredRequests.length}件)
                </button>
              </div>
            </div>

            {filteredRequests.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                条件に一致する申込はありません。
              </div>
            ) : (
              <>
                {filteredRequests.some((request) => (request.participantConfirmationStatus || "pending") === "change_requested") ? (
                  <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm leading-7 text-rose-900">
                    変更希望の申込は一覧の上側に表示しています。赤系のカードを優先して確認してください。
                  </div>
                ) : null}
                {filteredRequests.map((request, requestIndex) => {
                const isFirstCompletedRequest =
                  isRequestCompleted(request) &&
                  !filteredRequests.slice(0, requestIndex).some((item) => isRequestCompleted(item));
                const preferredSlotIdSet = new Set(request.preferredSlotIds || []);
                const preferredSlots = sortedSlots.filter((slot) => preferredSlotIdSet.has(slot.id));
                const otherAssignableSlots = sortedSlots.filter((slot) => !preferredSlotIdSet.has(slot.id));
                const assignedSlot = sortedSlots.find((slot) => slot.id === request.assignedSlotId);
                const requestCompleted = isRequestCompleted(request);
                const requestPastCandidate = isPastScheduledRequest(request, sortedSlots);
                const operationLabel = requestCompleted ? "実施済み" : requestPastCandidate ? "予定日超過" : "未実施";
                const operationTone = requestCompleted ? "emerald" : requestPastCandidate ? "amber" : "sky";
                const lineLinkCode = request.lineLinkCode || "未発行";
                const isExpanded = expandedRequestIds.has(request.id);
                return (
                  <React.Fragment key={request.id}>
                    {isFirstCompletedRequest ? (
                      <div className="my-6 flex items-center gap-3">
                        <div className="h-px flex-1 bg-slate-200" />
                        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-bold tracking-[0.12em] text-slate-500">
                          実施済みの申込
                        </div>
                        <div className="h-px flex-1 bg-slate-200" />
                      </div>
                    ) : null}
                  <div
                    ref={(node) => {
                      if (node) requestCardRefs.current[request.id] = node;
                    }}
                    id={`request-${request.id}`}
                    className={classNames(
                      "scroll-mt-28 rounded-3xl p-5 shadow-sm transition",
                      pendingFocusRequestId === request.id ? "ring-4 ring-teal-200" : "",
                      (request.participantConfirmationStatus || "pending") === "change_requested"
                        ? "border-2 border-rose-300 bg-rose-50/70 shadow-[0_16px_40px_rgba(244,63,94,0.12)]"
                        : requestCompleted
                        ? "border border-slate-200 bg-slate-50/80"
                        : "border border-slate-200 bg-white"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleRequestExpanded(request.id)}
                      className="flex w-full items-start justify-between gap-3 text-left md:hidden"
                    >
                      <div className="min-w-0">
                        <div className="text-base font-bold text-slate-900">{request.name}</div>
                        <div className="mt-2 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge tone={request.assignedSlotId ? "emerald" : "amber"}>
                              {request.assignedSlotId ? "確定済み" : "未確定"}
                            </StatusBadge>
                            <StatusBadge tone={getParticipantConfirmationTone(request.participantConfirmationStatus || "pending")}>
                              {getParticipantConfirmationLabel(request.participantConfirmationStatus || "pending")}
                            </StatusBadge>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge tone={getLineLinkTone(request)}>
                              {getLineLinkLabel(request)}
                            </StatusBadge>
                            <StatusBadge tone={operationTone}>{operationLabel}</StatusBadge>
                          </div>
                        </div>
                        <div
                          className={classNames(
                            "mt-3 rounded-2xl border px-3 py-2 text-sm font-medium",
                            requestCompleted
                              ? "border-slate-200 bg-slate-50 text-slate-700"
                              : requestPastCandidate
                              ? "border-amber-200 bg-amber-50 text-amber-900"
                              : "border-teal-100 bg-teal-50/60 text-slate-700"
                          )}
                        >
                          <div className="text-xs font-bold text-slate-400">確定日程</div>
                          {assignedSlot ? (
                            <div className="mt-1 text-sm font-bold text-slate-900">
                              {formatJapaneseDate(assignedSlot.date)} / {PERIOD_MAP[assignedSlot.periodKey]?.label || assignedSlot.periodKey}
                            </div>
                          ) : (
                            <div className="mt-1 text-sm text-slate-500">まだ日程は確定していません</div>
                          )}
                          {requestCompleted ? (
                            <div className="mt-1 text-xs font-semibold text-slate-600">実施済みとして記録されています。</div>
                          ) : requestPastCandidate ? (
                            <div className="mt-1 text-xs font-semibold text-amber-700">予定日を過ぎています。</div>
                          ) : null}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                        {isExpanded ? "閉じる" : "詳細"}
                      </span>
                    </button>

                    <div className={classNames("md:mt-0", isExpanded ? "block" : "hidden md:block")}>
                    <div className="hidden">
                      <button
                        type="button"
                        onClick={() => toggleRequestExpanded(request.id)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500"
                      >
                        閉じる
                      </button>
                    </div>
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="hidden flex-wrap items-center gap-2 md:flex">
                          <div className="text-xl font-semibold text-slate-900">{request.name}</div>
                          <StatusBadge tone={request.assignedSlotId ? "emerald" : "amber"}>
                            {request.assignedSlotId ? "確定済み" : "未確定"}
                          </StatusBadge>
                          <StatusBadge tone={getParticipantConfirmationTone(request.participantConfirmationStatus || "pending")}>
                            {getParticipantConfirmationLabel(request.participantConfirmationStatus || "pending")}
                          </StatusBadge>
                          <StatusBadge tone={getLineLinkTone(request)}>
                            {getLineLinkLabel(request)}
                          </StatusBadge>
                          <StatusBadge tone={operationTone}>{operationLabel}</StatusBadge>
                        </div>
                        <div
                          className={classNames(
                            "mt-3 hidden rounded-2xl border px-4 py-3 text-sm md:block",
                            requestCompleted
                              ? "border-slate-200 bg-slate-50 text-slate-700"
                              : requestPastCandidate
                              ? "border-amber-200 bg-amber-50 text-amber-900"
                              : "border-teal-100 bg-teal-50/60 text-slate-700"
                          )}
                        >
                          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">確定日程</div>
                          {assignedSlot ? (
                            <div className="mt-1 font-semibold text-slate-900">
                              {formatJapaneseDate(assignedSlot.date)} / {PERIOD_MAP[assignedSlot.periodKey]?.label || assignedSlot.periodKey}
                            </div>
                          ) : (
                            <div className="mt-1 text-slate-500">まだ日程は確定していません。</div>
                          )}
                          {requestCompleted ? (
                            <div className="mt-1 text-xs font-semibold text-slate-600">実施済みとして記録されています。</div>
                          ) : requestPastCandidate ? (
                            <div className="mt-1 text-xs font-semibold text-amber-700">予定日を過ぎています。</div>
                          ) : null}
                        </div>
                        <div className="mt-3 text-sm text-slate-500 md:mt-2">{request.email}</div>
                        {request.affiliation ? <div className="mt-1 text-sm text-slate-500">{request.affiliation}</div> : null}

                        <div className="mt-3 grid gap-3">
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">LINE連携コード</div>
                                <div className="mt-1 font-mono text-lg font-bold tracking-[0.16em] text-slate-900">{lineLinkCode}</div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                                  参加者送信用
                                </span>
                                <button
                                  type="button"
                                  onClick={onOpenLineCodeHelp}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                                  aria-label="LINE連携コードの使い方"
                                >
                                  <HelpIcon />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {request.note ? <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{request.note}</div> : null}
                        {(() => {
                          const cfv = request.customFieldValues;
                          const fields = selectedOperationStudy?.customFields || [];
                          if (!cfv || fields.length === 0) return null;
                          const entries = fields.filter((f) => cfv[f.id] !== undefined && cfv[f.id] !== "" && !(Array.isArray(cfv[f.id]) && cfv[f.id].length === 0));
                          if (entries.length === 0) return null;
                          return (
                            <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">カスタム項目</div>
                              <div className="space-y-1">
                                {entries.map((f) => (
                                  <div key={f.id} className="flex flex-wrap gap-1 text-slate-700">
                                    <span className="font-medium text-slate-500">{f.label}:</span>
                                    <span>{Array.isArray(cfv[f.id]) ? cfv[f.id].join(", ") : String(cfv[f.id])}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                        {request.participantResponseNote ? (
                          <div
                            className={classNames(
                              "mt-3 rounded-2xl px-4 py-3 text-sm",
                              (request.participantConfirmationStatus || "pending") === "change_requested"
                                ? "border border-rose-200 bg-rose-100 text-rose-900"
                                : "border border-sky-200 bg-sky-50 text-sky-900"
                            )}
                          >
                            <div className="font-medium">参加者からの連絡</div>
                            <div className="mt-1 whitespace-pre-line">{request.participantResponseNote}</div>
                          </div>
                        ) : null}

                        <div className="mt-4">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium text-slate-700">希望枠</div>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                              {preferredSlots.length} 件
                            </span>
                          </div>
                          <div className="grid gap-3">
                            {preferredSlots.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                                参加者が選択した希望枠はありません。
                              </div>
                            ) : (
                              preferredSlots.map((slot) => {
                                const metrics = getSlotMetrics(slot, requests);
                                const isAssigned = request.assignedSlotId === slot.id;
                                const disableConfirm = metrics.full && !isAssigned;
                                const nearbyKey = `${request.id}:${slot.id}`;
                                const nearbyExpanded = expandedNearbySlotKeys.has(nearbyKey);
                                const sameDaySlots = sortSlots(sortedSlots.filter((candidate) => candidate.date === slot.date));
                                return (
                                  <div key={slot.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                      <div className="min-w-0 text-sm text-slate-700">
                                        <div className="font-medium text-slate-900">
                                          {formatJapaneseDate(slot.date)} / {PERIOD_MAP[slot.periodKey]?.label || slot.periodKey}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">
                                          残り {metrics.remaining} 席{slot.isPublished ? "" : " / 非公開"}
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                        <button
                                          type="button"
                                          onClick={() => toggleNearbySlots(request.id, slot.id)}
                                          className={classNames(
                                            "rounded-2xl border px-3.5 py-2 text-xs font-semibold transition",
                                            nearbyExpanded
                                              ? "border-slate-200 bg-slate-50 text-slate-700"
                                              : "border-slate-200 bg-white/80 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                          )}
                                        >
                                          {nearbyExpanded ? "周辺日程を閉じる" : "周辺日程を見る"}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={disableConfirm}
                                          onClick={() => onPrepareAssignRequest(request, slot.id)}
                                          className={classNames(
                                            "rounded-2xl px-4 py-2 text-sm font-medium transition",
                                            isAssigned
                                              ? "bg-slate-900 text-white"
                                              : disableConfirm
                                              ? "cursor-not-allowed bg-slate-100 text-slate-400"
                                              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                                          )}
                                        >
                                          {isAssigned ? "確定済み" : request.assignedSlotId ? "この枠へ変更" : "この枠で確定"}
                                        </button>
                                      </div>
                                    </div>

                                    {nearbyExpanded ? (
                                      <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                            同じ日の登録済み日程
                                          </div>
                                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                                            {sameDaySlots.length} 件
                                          </span>
                                        </div>
                                        <div className="grid gap-2">
                                          {sameDaySlots.map((daySlot) => {
                                            const dayMetrics = getSlotMetrics(daySlot, requests);
                                            const isCurrentPreferredSlot = daySlot.id === slot.id;
                                            const isCurrentAssignedSlot = request.assignedSlotId === daySlot.id;
                                            return (
                                              <div
                                                key={daySlot.id}
                                                className={classNames(
                                                  "flex items-start justify-between gap-3 rounded-2xl px-3 py-2 text-xs",
                                                  isCurrentPreferredSlot
                                                    ? "border border-teal-200 bg-teal-50 text-teal-950"
                                                    : "border border-slate-100 bg-slate-50 text-slate-600"
                                                )}
                                              >
                                                <div>
                                                  <div className="font-semibold">
                                                    {PERIOD_MAP[daySlot.periodKey]?.label || daySlot.periodKey}
                                                  </div>
                                                  <div className="mt-0.5 text-slate-500">
                                                    残り {dayMetrics.remaining} 席 / 定員 {daySlot.capacity} / 確定 {daySlot.confirmedCount || 0}
                                                    {daySlot.isPublished ? "" : " / 非公開"}
                                                  </div>
                                                  {daySlot.location ? <div className="mt-0.5 text-slate-500">{daySlot.location}</div> : null}
                                                </div>
                                                <div className="flex shrink-0 flex-col items-end gap-1">
                                                  {isCurrentPreferredSlot ? (
                                                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                                                      この希望枠
                                                    </span>
                                                  ) : null}
                                                  {isCurrentAssignedSlot ? (
                                                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                                                      確定中
                                                    </span>
                                                  ) : dayMetrics.full ? (
                                                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                                      満席
                                                    </span>
                                                  ) : null}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })
                            )}
                          </div>

                          <details className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-slate-700">
                            <summary className="cursor-pointer select-none font-semibold text-sky-900">
                              希望枠以外の日程を割り当てる
                              <span className="ml-2 rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-sky-700">
                                {otherAssignableSlots.length} 件
                              </span>
                            </summary>
                            <p className="mt-2 text-xs leading-5 text-sky-800/80">
                              参加者から個別の要望があった場合などに、希望枠以外の日程も管理者判断で割り当てられます。
                            </p>

                            <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto pr-1">
                              {otherAssignableSlots.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-sky-200 bg-white/70 px-4 py-3 text-slate-500">
                                  割り当て可能な他の日程はありません。
                                </div>
                              ) : (
                                otherAssignableSlots.map((slot) => {
                                  const metrics = getSlotMetrics(slot, requests);
                                  const isAssigned = request.assignedSlotId === slot.id;
                                  const disableConfirm = metrics.full && !isAssigned;
                                  return (
                                    <div key={slot.id} className="flex flex-col gap-3 rounded-2xl border border-sky-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                      <div className="text-sm text-slate-700">
                                        <span className="font-medium">
                                          {formatJapaneseDate(slot.date)} / {PERIOD_MAP[slot.periodKey]?.label || slot.periodKey}
                                        </span>
                                        <div className="mt-1 text-xs text-slate-500">
                                          残り {metrics.remaining} 席 / 定員 {slot.capacity} / 確定 {slot.confirmedCount || 0}
                                          {slot.location ? ` / ${slot.location}` : ""}
                                          {slot.isPublished ? "" : " / 非公開"}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        disabled={disableConfirm}
                                        onClick={() => onPrepareAssignRequest(request, slot.id)}
                                        className={classNames(
                                          "rounded-2xl px-4 py-2 text-sm font-medium transition",
                                          isAssigned
                                            ? "bg-slate-900 text-white"
                                            : disableConfirm
                                            ? "cursor-not-allowed bg-slate-100 text-slate-400"
                                            : "border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100"
                                        )}
                                      >
                                        {isAssigned ? "確定済み" : request.assignedSlotId ? "この枠へ変更" : "この枠で確定"}
                                      </button>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </details>
                        </div>
                      </div>
                      <div className="w-full xl:w-[300px]">
                        {assignedSlot ? (
                          <button
                            type="button"
                            onClick={() => onToggleRequestCompleted(request, !requestCompleted)}
                            className={classNames(
                              "mt-3 w-full rounded-2xl px-4 py-3 text-sm font-medium transition",
                              requestCompleted
                                ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                : "bg-slate-900 text-white hover:bg-slate-800"
                            )}
                          >
                            {requestCompleted ? "実施済みを解除" : "実施済みにする"}
                          </button>
                        ) : null}
                        {assignedSlot ? (
                          <button
                            type="button"
                            onClick={() => onPrepareAssignRequest(request, "")}
                            className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            確定を解除
                          </button>
                        ) : null}
                        <button onClick={() => handleDeleteRequest(request.id)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 hover:bg-rose-100">
                          <span className="inline-flex items-center justify-center gap-2"><TrashIcon /> 申込を削除</span>
                        </button>
                      </div>
                    </div>
                    </div>
                  </div>
                  </React.Fragment>
                );
              })}
              </>
            )}
          </div>
        )}

        {adminTab === "researchers" && (
          <div className="space-y-4">
            <Card className="p-5 shadow-none">
              <SectionHeader
                eyebrow="RESEARCHERS"
                title="研究者アカウント管理"
                description="登録申請中・承認済み・拒否済みの研究者アカウントを管理します。"
                action={<StatusBadge tone="sky">{(researchers || []).length}件</StatusBadge>}
              />
              {researchersLoading ? (
                <div className="py-6 text-center text-sm text-slate-500">読み込み中...</div>
              ) : (researchers || []).length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                  登録申請はまだありません。
                </div>
              ) : (
                <div className="space-y-3">
                  {["pending", "approved", "rejected"].map((statusGroup) => {
                    const group = (researchers || []).filter((r) => r.status === statusGroup);
                    if (group.length === 0) return null;
                    const groupLabel = { pending: "承認待ち", approved: "承認済み", rejected: "拒否済み" }[statusGroup];
                    const groupTone = { pending: "amber", approved: "emerald", rejected: "slate" }[statusGroup];
                    return (
                      <div key={statusGroup}>
                        <div className="mb-2 flex items-center gap-2">
                          <StatusBadge tone={groupTone}>{groupLabel}</StatusBadge>
                          <span className="text-xs text-slate-400">{group.length}件</span>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-2">
                          {group.map((researcher) => (
                            <div key={researcher.id} className="rounded-3xl border border-slate-200 bg-white p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900">{researcher.name}</div>
                                  <div className="mt-1 text-sm text-slate-500">{researcher.affiliation}</div>
                                  <div className="mt-1 text-xs text-slate-400">Googleアカウント: {researcher.email}</div>
                                  <div className="mt-0.5 text-xs text-slate-400">連絡先: {researcher.contactEmail}</div>
                                  {researcher.approvedBy ? (
                                    <div className="mt-0.5 text-xs text-slate-400">承認者: {researcher.approvedBy}</div>
                                  ) : null}
                                </div>
                                <StatusBadge tone={groupTone}>{groupLabel}</StatusBadge>
                              </div>
                              {statusGroup === "pending" ? (
                                <div className="mt-4 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => onApproveResearcher(researcher.id)}
                                    className="flex-1 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                                  >
                                    承認する
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onRejectResearcher(researcher.id)}
                                    className="flex-1 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                                  >
                                    拒否する
                                  </button>
                                </div>
                              ) : statusGroup === "approved" ? (
                                <div className="mt-4">
                                  <button
                                    type="button"
                                    onClick={() => onRejectResearcher(researcher.id)}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                                  >
                                    承認を取り消す
                                  </button>
                                </div>
                              ) : (
                                <div className="mt-4">
                                  <button
                                    type="button"
                                    onClick={() => onApproveResearcher(researcher.id)}
                                    className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
                                  >
                                    承認に変更する
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function ResearcherRegisterPage({ authUser, onGoogleLogin, onBack, registerForm, setRegisterForm, onSubmit, loading, error }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0%,_#f8fafc_34%,_#eef2ff_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-3 rounded-[28px] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <LabLinkBrand compact subtitle="研究者登録" />
          <button onClick={onBack} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ArrowLeftIcon />
            LabLinkトップへ戻る
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr,0.95fr]">
          <Card className="bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(51,65,85,0.92))] text-white">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <LockIcon />
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight">研究者として登録する</h1>
            <p className="mt-4 text-sm leading-7 text-slate-200">
              LabLinkで実験参加者の募集を行うためには、研究者アカウントの登録が必要です。申請後、管理者が内容を確認して承認します。
            </p>
            <div className="mt-6 grid gap-3 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/10 p-4">自分の実験募集ページを作成</div>
              <div className="rounded-2xl bg-white/10 p-4">申込の日程確定・管理</div>
              <div className="rounded-2xl bg-white/10 p-4">メール・LINE通知の活用</div>
            </div>
          </Card>

          <div className="space-y-6">
            {!authUser ? (
              <Card>
                <SectionHeader eyebrow="STEP 1" title="Googleでログイン" description="まず研究者として使用するGoogleアカウントでログインしてください。" />
                <button onClick={onGoogleLogin} className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50">
                  <GoogleIcon />
                  Googleでログインする
                </button>
              </Card>
            ) : (
              <Card>
                <SectionHeader eyebrow="STEP 2" title="登録情報を入力" description="申請内容を記入してください。管理者が確認後に承認します。" />
                <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  ログイン中: {authUser.email}
                </div>
                {error ? (
                  <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
                ) : null}
                <form onSubmit={onSubmit} className="space-y-4">
                  <label className="block text-sm">
                    <div className="mb-1.5 text-slate-600">氏名 <span className="text-rose-500">*</span></div>
                    <input required value={registerForm.name} onChange={(e) => setRegisterForm((p) => ({ ...p, name: e.target.value }))} placeholder="山田 太郎" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400" />
                  </label>
                  <label className="block text-sm">
                    <div className="mb-1.5 text-slate-600">所属・職位 <span className="text-rose-500">*</span></div>
                    <input required value={registerForm.affiliation} onChange={(e) => setRegisterForm((p) => ({ ...p, affiliation: e.target.value }))} placeholder="例: 立命館大学 情報理工学部 助教" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400" />
                  </label>
                  <label className="block text-sm">
                    <div className="mb-1.5 text-slate-600">連絡用メールアドレス <span className="text-rose-500">*</span></div>
                    <input required type="email" value={registerForm.contactEmail} onChange={(e) => setRegisterForm((p) => ({ ...p, contactEmail: e.target.value }))} placeholder="例: yamada@ed.ritsumei.ac.jp" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400" />
                    <p className="mt-1.5 text-xs text-slate-500">管理者からの連絡先として使用します。Googleアカウントと異なっていても構いません。</p>
                  </label>
                  <button type="submit" disabled={loading} className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50">
                    {loading ? "申請中..." : "研究者登録を申請する"}
                  </button>
                </form>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResearcherPendingPage({ authUser, onBack, onLogout }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0%,_#f8fafc_34%,_#eef2ff_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex flex-col gap-3 rounded-[28px] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <LabLinkBrand compact subtitle="承認待ち" />
          <button onClick={onBack} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ArrowLeftIcon />
            トップへ戻る
          </button>
        </div>
        <Card className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">⏳</div>
          <h1 className="mt-5 text-2xl font-bold text-slate-900">承認をお待ちください</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            研究者登録の申請を受け付けました。管理者が内容を確認後、登録メールアドレスへご連絡します。
          </p>
          {authUser ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              申請アカウント: {authUser.email}
            </div>
          ) : null}
          <button onClick={onLogout} className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            ログアウト
          </button>
        </Card>
      </div>
    </div>
  );
}

function ResearcherProfilePage({ authUser, profile, onBack, onLogout, onSave, onDelete, saving, deleting }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: profile?.name || "", affiliation: profile?.affiliation || "", contactEmail: profile?.contactEmail || "" });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setForm({ name: profile?.name || "", affiliation: profile?.affiliation || "", contactEmail: profile?.contactEmail || "" });
  }, [profile]);

  function handleSubmit(event) {
    event.preventDefault();
    onSave(form, () => setEditing(false));
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0%,_#f8fafc_34%,_#eef2ff_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-col gap-3 rounded-[28px] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <LabLinkBrand compact subtitle="プロフィール" />
          <div className="flex gap-2">
            <button onClick={onBack} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <ArrowLeftIcon />
              管理画面へ戻る
            </button>
            <button onClick={onLogout} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              ログアウト
            </button>
          </div>
        </div>

        <Card className="space-y-5">
          <SectionHeader eyebrow="PROFILE" title="登録者プロフィール" description="LabLinkに登録されているあなたの情報を確認・編集できます。" />

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Googleアカウント</span>
            <div className="mt-1 font-medium text-slate-900">{authUser?.email || "—"}</div>
          </div>

          {!editing ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">氏名</div>
                  <div className="mt-1 text-slate-900">{profile?.name || "—"}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">所属・職位</div>
                  <div className="mt-1 text-slate-900">{profile?.affiliation || "—"}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">連絡用メールアドレス</div>
                <div className="mt-1 text-slate-900">{profile?.contactEmail || "—"}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">ステータス</div>
                <div className="mt-1">
                  {profile?.status === "approved" ? (
                    <StatusBadge tone="emerald">承認済み</StatusBadge>
                  ) : profile?.status === "pending" ? (
                    <StatusBadge tone="amber">承認待ち</StatusBadge>
                  ) : (
                    <StatusBadge tone="slate">{profile?.status || "不明"}</StatusBadge>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  プロフィールを編集
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm">
                <div className="mb-1.5 text-slate-600">氏名 <span className="text-rose-500">*</span></div>
                <input required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400" />
              </label>
              <label className="block text-sm">
                <div className="mb-1.5 text-slate-600">所属・職位 <span className="text-rose-500">*</span></div>
                <input required value={form.affiliation} onChange={(e) => setForm((p) => ({ ...p, affiliation: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400" />
              </label>
              <label className="block text-sm">
                <div className="mb-1.5 text-slate-600">連絡用メールアドレス <span className="text-rose-500">*</span></div>
                <input required type="email" value={form.contactEmail} onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400" />
              </label>
              <div className="flex gap-3">
                <button type="submit" disabled={saving} className="flex-1 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                  {saving ? "保存中..." : "変更を保存"}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  キャンセル
                </button>
              </div>
            </form>
          )}

          <div className="border-t border-slate-200 pt-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">登録の解除</h3>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
              >
                <TrashIcon />
                研究者登録を解除する
              </button>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  本当に研究者登録を解除しますか？この操作は取り消せません。作成済みの募集データは残ります。
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={deleting}
                    className="rounded-2xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {deleting ? "解除中..." : "解除する"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>
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
  onOpenResearcherRegister,
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0%,_#f8fafc_34%,_#eef2ff_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-3 rounded-[28px] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <LabLinkBrand compact subtitle="実験者向けログイン" />
          <button
            onClick={onBack}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeftIcon />
            LabLinkトップへ戻る
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr,0.95fr]">
          <Card className="bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(51,65,85,0.92))] text-white">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <LockIcon />
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight">LabLink 実験者ページ</h1>
            <p className="mt-4 text-sm leading-7 text-slate-200">
              Googleアカウントでログインします。管理者は申込一覧・日程確定へ、承認済みの研究者は自分の募集を管理できます。
            </p>
            <div className="mt-6 grid gap-3 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/10 p-4">申込一覧の閲覧・管理</div>
              <div className="rounded-2xl bg-white/10 p-4">日程枠の追加・削除</div>
              <div className="rounded-2xl bg-white/10 p-4">希望枠からの日程確定</div>
            </div>
          </Card>

          <div className="space-y-4">
            {!firebaseEnabled ? <SetupNotice /> : null}
            <Card>
              <SectionHeader
                eyebrow="LOGIN"
                title="Googleでログイン"
                description="ログイン後、管理者または研究者として利用できます。"
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
            <div className="rounded-3xl border border-teal-100 bg-teal-50 px-5 py-4 text-sm">
              <div className="font-semibold text-teal-900">はじめてご利用の研究者の方</div>
              <p className="mt-1 text-xs leading-5 text-teal-800">
                Googleログイン後に研究者登録を申請できます。管理者の承認後、実験募集を作成・管理できるようになります。
              </p>
              {onOpenResearcherRegister ? (
                <button
                  type="button"
                  onClick={onOpenResearcherRegister}
                  className="mt-3 rounded-2xl border border-teal-200 bg-white px-4 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-100"
                >
                  研究者登録ページへ
                </button>
              ) : null}
            </div>
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
  const [page, setPage] = useState("landing");
  const [adminTab, setAdminTab] = useState("studies");
  const [authReady, setAuthReady] = useState(!firebaseReady);
  const [calendarView, setCalendarView] = useState("calendar");
  const [authUser, setAuthUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [showLineCodeHelp, setShowLineCodeHelp] = useState(false);
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
  const [experimentInfo, setExperimentInfo] = useState(() => normalizeExperimentInfo(DEFAULT_EXPERIMENT_INFO));
  const [experimentInfoForm, setExperimentInfoForm] = useState(() => normalizeExperimentInfo(DEFAULT_EXPERIMENT_INFO));
  const [studies, setStudies] = useState([]);
  const [studiesLoading, setStudiesLoading] = useState(firebaseReady);
  const [studiesError, setStudiesError] = useState("");
  const [selectedStudyId, setSelectedStudyId] = useState(DEFAULT_STUDY_ID);
  const [adminStudies, setAdminStudies] = useState([]);
  const [adminStudiesLoading, setAdminStudiesLoading] = useState(firebaseReady);
  const [studyForm, setStudyForm] = useState(() => buildStudyFormFromExperimentInfo(DEFAULT_EXPERIMENT_INFO));
  const [editingStudyId, setEditingStudyId] = useState("");
  const [savingStudy, setSavingStudy] = useState(false);
  const [deletingStudyId, setDeletingStudyId] = useState("");
  const [repairingLegacyData, setRepairingLegacyData] = useState(false);
  const [savingExperimentInfo, setSavingExperimentInfo] = useState(false);
  const [selectedSlotIds, setSelectedSlotIds] = useState([]);
  const [bulkNote, setBulkNote] = useState("");
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [participantForm, setParticipantForm] = useState({
    name: "",
    email: "",
    affiliation: "",
    note: "",
    preferredSlotIds: [],
    customFieldValues: {},
  });
  const [studyTemplates, setStudyTemplates] = useState([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [researcherProfile, setResearcherProfile] = useState(null);
  const [researcherProfileLoading, setResearcherProfileLoading] = useState(false);
  const [researchers, setResearchers] = useState([]);
  const [researchersLoading, setResearchersLoading] = useState(false);
  const [researcherRegisterForm, setResearcherRegisterForm] = useState({ name: "", affiliation: "", contactEmail: "" });
  const [researcherRegisterLoading, setResearcherRegisterLoading] = useState(false);
  const [researcherRegisterError, setResearcherRegisterError] = useState("");
  const [slotForm, setSlotForm] = useState({
    date: "",
    extraDates: "",
    bulkMode: false,
    bulkDates: "",
    bulkPeriodKeys: ["p3"],
    bulkSlotPlan: {},
    periodKey: "p3",
    capacity: 1,
    location: "OIC 実験室A",
    note: "",
    isPublished: true,
  });
  const [search, setSearch] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState("all");
  const [participantConfirmationFilter, setParticipantConfirmationFilter] = useState("all");
  const [requestSortMode, setRequestSortMode] = useState("default");
  const [message, setMessage] = useState("");
  const [lastLineLinkInfo, setLastLineLinkInfo] = useState(null);
  const [lineGuideOpen, setLineGuideOpen] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(firebaseReady);
  const [requestsLoading, setRequestsLoading] = useState(firebaseReady);
  const [dataError, setDataError] = useState("");
  const [assignmentDialog, setAssignmentDialog] = useState(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [participantConfirmOpen, setParticipantConfirmOpen] = useState(false);
  const [participantSubmitLoading, setParticipantSubmitLoading] = useState(false);
  const [participantResponseContext, setParticipantResponseContext] = useState({ token: "", action: "change" });
  const [participantResponseLoading, setParticipantResponseLoading] = useState(false);
  const [participantResponseSubmitting, setParticipantResponseSubmitting] = useState(false);
  const [participantResponseError, setParticipantResponseError] = useState("");
  const [participantResponseRequest, setParticipantResponseRequest] = useState(null);
  const [participantResponseNote, setParticipantResponseNote] = useState("");
  const [participantResponseMessage, setParticipantResponseMessage] = useState("");
  const detailsRef = useRef(null);
  const shouldFocusDetailsRef = useRef(false);

  useEffect(() => {
    document.title = "LabLink | 実験日程予約ページ";
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";

    if (token) {
      window.location.replace(`/response?token=${encodeURIComponent(token)}`);
      return;
    }

    const studyId = normalizeStudyId(params.get("study") || "");
    if (studyId) {
      window.location.replace(`/study/${encodeURIComponent(studyId)}`);
    }
  }, []);

  useEffect(() => {
    if (!firebaseReady) {
      setSlots(sortSlots(SAMPLE_SLOTS.filter((slot) => isRecordInStudy(slot, selectedStudyId))));
      setRequests(SAMPLE_REQUESTS.filter((request) => isRecordInStudy(request, selectedStudyId)));
      setStudies(SAMPLE_STUDIES);
      setAdminStudies(SAMPLE_STUDIES);
      setStudiesLoading(false);
      setAdminStudiesLoading(false);
      setSelectedDate("");
      setSlotsLoading(false);
      setRequestsLoading(false);
      return;
    }

    const publicSlotsQuery = query(
      collection(firestore, "slots"),
      where("studyId", "==", selectedStudyId),
      where("isPublished", "==", true)
    );
    const unsubscribePublicSlots = onSnapshot(
      publicSlotsQuery,
      (snapshot) => {
        if (page === "participant" || page === "admin-login") {
          const nextSlots = snapshot.docs
            .map((item) => withStudyId({ id: item.id, ...item.data() }));
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
  }, [page, selectedStudyId]);

  useEffect(() => {
    if (!firebaseReady) return undefined;
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!firebaseReady) {
      const fallback = normalizeExperimentInfo(DEFAULT_EXPERIMENT_INFO);
      setExperimentInfo(fallback);
      setExperimentInfoForm(fallback);
      return;
    }

    const settingsRef = doc(firestore, "settings", "experimentInfo");
    const unsubscribe = onSnapshot(
      settingsRef,
      (snapshot) => {
        const nextInfo = snapshot.exists()
          ? normalizeExperimentInfo(snapshot.data())
          : normalizeExperimentInfo(DEFAULT_EXPERIMENT_INFO);
        setExperimentInfo(nextInfo);
        setExperimentInfoForm(nextInfo);
      },
      (error) => {
        console.error(error);
        const fallback = normalizeExperimentInfo(DEFAULT_EXPERIMENT_INFO);
        setExperimentInfo(fallback);
        setExperimentInfoForm(fallback);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!firebaseReady) {
      setStudies(SAMPLE_STUDIES);
      setStudiesLoading(false);
      setStudiesError("");
      return;
    }

    setStudiesLoading(true);
    const studiesQuery = query(collection(firestore, "studies"), where("isPublished", "==", true));
    const unsubscribe = onSnapshot(
      studiesQuery,
      (snapshot) => {
        const nextStudies = snapshot.docs
          .map((item) => normalizeStudyInfo(item.data(), item.id))
          .sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            if (aTime !== bTime) return bTime - aTime;
            return (a.title || "").localeCompare(b.title || "", "ja");
          });

        setStudies(nextStudies);
        setStudiesLoading(false);
        setStudiesError("");
      },
      (error) => {
        console.error(error);
        setStudies([]);
        setStudiesLoading(false);
        setStudiesError("実験一覧の取得に失敗しました。Firestore Rules と studies コレクションを確認してください。");
      }
    );

    return () => unsubscribe();
  }, []);


  useEffect(() => {
    if (!firebaseReady) {
      setAdminStudies(SAMPLE_STUDIES);
      setAdminStudiesLoading(false);
      return undefined;
    }

    if (page !== "admin" || !authUser) return undefined;

    setAdminStudiesLoading(true);
    const userEmail = (authUser.email || "").toLowerCase();
    const isSuperAdmin = ALLOWED_ADMIN_EMAILS.includes(userEmail);
    // スーパー管理者は全募集、それ以外は自分が管理者の募集のみ
    const studiesQuery = isSuperAdmin
      ? collection(firestore, "studies")
      : query(
          collection(firestore, "studies"),
          where("adminEmails", "array-contains", userEmail)
        );
    const unsubscribe = onSnapshot(
      studiesQuery,
      (snapshot) => {
        const nextStudies = snapshot.docs
          .map((item) => normalizeStudyInfo(item.data(), item.id))
          .sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            if (aTime !== bTime) return bTime - aTime;
            return (a.title || "").localeCompare(b.title || "", "ja");
          });
 
        setAdminStudies(nextStudies);
        setAdminStudiesLoading(false);
      },
      (error) => {
        console.error(error);
        setAdminStudies([]);
        setAdminStudiesLoading(false);
        showToast("実験一覧の取得に失敗しました。", "error");
      }
    );
 
    return () => unsubscribe();
  }, [page, authUser]);   // ← selectedStudyId を削除

  useEffect(() => {
    if (!firebaseReady || page !== "admin" || !authUser) return undefined;

    const userEmail = (authUser.email || "").toLowerCase();
    const templatesQuery = query(
      collection(firestore, "studyTemplates"),
      where("ownerEmail", "==", userEmail)
    );
    const unsubscribe = onSnapshot(
      templatesQuery,
      (snapshot) => {
        const items = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ja"));
        setStudyTemplates(items);
      },
      (error) => {
        console.error("studyTemplates fetch error", error);
      }
    );

    return () => unsubscribe();
  }, [page, authUser]);

  // 自分の researcher プロファイルをロード（ログイン中は常に監視）
  useEffect(() => {
    if (!firebaseReady || !authUser) {
      setResearcherProfile(null);
      setResearcherProfileLoading(false);
      return undefined;
    }
    if (ALLOWED_ADMIN_EMAILS.includes((authUser.email || "").toLowerCase())) {
      setResearcherProfile(null);
      setResearcherProfileLoading(false);
      return undefined;
    }

    setResearcherProfileLoading(true);
    const unsubscribe = onSnapshot(
      doc(firestore, "researchers", authUser.uid),
      (snapshot) => {
        setResearcherProfile(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
        setResearcherProfileLoading(false);
      },
      (error) => {
        console.error("researcher profile fetch error", error);
        setResearcherProfileLoading(false);
      }
    );
    return () => unsubscribe();
  }, [authUser]);

  // 全研究者一覧（スーパー管理者のみ、管理ページ表示中）
  useEffect(() => {
    if (!firebaseReady || page !== "admin" || !authUser) return undefined;
    if (!ALLOWED_ADMIN_EMAILS.includes((authUser.email || "").toLowerCase())) return undefined;

    setResearchersLoading(true);
    const unsubscribe = onSnapshot(
      collection(firestore, "researchers"),
      (snapshot) => {
        const items = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => {
            const order = { pending: 0, approved: 1, rejected: 2 };
            return (order[a.status] ?? 9) - (order[b.status] ?? 9);
          });
        setResearchers(items);
        setResearchersLoading(false);
      },
      (error) => {
        console.error("researchers fetch error", error);
        setResearchersLoading(false);
      }
    );
    return () => unsubscribe();
  }, [page, authUser]);

  useEffect(() => {
    if (page !== "participant-response") return;

    if (!firebaseReady) {
      setParticipantResponseLoading(false);
      setParticipantResponseError("この機能は Firebase 接続時のみ利用できます。");
      return;
    }

    const { token } = participantResponseContext;
    if (!token) {
      setParticipantResponseError("確認用URLが不正です。");
      setParticipantResponseLoading(false);
      return;
    }

    let cancelled = false;
    setParticipantResponseLoading(true);
    setParticipantResponseError("");
    setParticipantResponseMessage("");

    getDoc(doc(firestore, "participantResponses", token))
      .then((snapshot) => {
        if (cancelled) return;
        if (!snapshot.exists()) {
          setParticipantResponseError("対象の確認ページが見つかりませんでした。最新のメールから開き直してください。");
          setParticipantResponseRequest(null);
          return;
        }

        const data = { id: snapshot.id, ...snapshot.data() };
        setParticipantResponseRequest(data);
        setParticipantResponseNote(data.participantResponseNote || "");

        if (data.participantConfirmationStatus === "invalid") {
          setParticipantResponseError(
            "すでにこの申し込みは無効になっています。管理者側で申込が削除された、または現在は利用できない状態です。あらためて参加を希望する場合は、予約サイトから再び日程を申し込んでください。"
          );
        }
      })
      .catch((error) => {
        console.error(error);
        if (cancelled) return;
        setParticipantResponseError("確認情報の取得に失敗しました。時間をおいて再度お試しください。");
        setParticipantResponseRequest(null);
      })
      .finally(() => {
        if (!cancelled) setParticipantResponseLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, participantResponseContext]);

  useEffect(() => {
    if (!firebaseReady || page !== "admin" || !authUser) return undefined;

    const unsubscribeSlots = onSnapshot(
      query(collection(firestore, "slots"), where("studyId", "==", selectedStudyId)),
      (snapshot) => {
        const nextSlots = snapshot.docs
          .map((item) => withStudyId({ id: item.id, ...item.data() }));
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
      query(collection(firestore, "requests"), where("studyId", "==", selectedStudyId)),
      (snapshot) => {
        const nextRequests = snapshot.docs
          .map((item) => withStudyId({ id: item.id, ...item.data() }))
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
  }, [page, authUser, selectedStudyId]);

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
    document.body.style.overflow = showHelp || showLineCodeHelp || !!editingSlot || !!assignmentDialog || participantConfirmOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [showHelp, showLineCodeHelp, editingSlot, assignmentDialog, participantConfirmOpen]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    const handle = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(handle);
  }, [page, adminTab, selectedStudyId]);

  useEffect(() => {
    setSelectedSlotIds((prev) => prev.filter((id) => slots.some((slot) => slot.id === id)));
  }, [slots]);

  useEffect(() => {
    setSelectedDate("");
    setSelectedSlotIds([]);
    setParticipantForm((prev) => ({ ...prev, preferredSlotIds: [] }));
  }, [selectedStudyId]);

  const isSuperAdmin = !!authUser?.email && ALLOWED_ADMIN_EMAILS.includes(authUser.email.toLowerCase());
  const isApprovedResearcher = !isSuperAdmin && researcherProfile?.status === "approved";
  const isPendingResearcher = !isSuperAdmin && researcherProfile?.status === "pending";
  const adminAuthorized = isSuperAdmin || isApprovedResearcher;

  useEffect(() => {
    if (!authUser?.email || editingStudyId) return;
    const emailLower = authUser.email.toLowerCase();
    const contactDefault = researcherProfile?.contactEmail || emailLower;
    setStudyForm((prev) => ({
      ...prev,
      ownerEmail: prev.ownerEmail || emailLower,
      adminEmailsText: prev.adminEmailsText || emailLower,
      contactEmail: prev.contactEmail || contactDefault,
    }));
  }, [authUser, editingStudyId, researcherProfile]);

  const sortedSlots = useMemo(() => sortSlots(slots), [slots]);
  const allSlotsSelected = sortedSlots.length > 0 && selectedSlotIds.length === sortedSlots.length;
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

  const activeStudy = useMemo(() => {
    const candidateStudies = [...studies, ...adminStudies];
    const found = candidateStudies.find((study) => study.id === selectedStudyId);

    if (found) return found;

    if (selectedStudyId === DEFAULT_STUDY_ID) {
      return normalizeStudyInfo({ ...experimentInfo, location: "" }, DEFAULT_STUDY_ID);
    }

    return normalizeStudyInfo(
      {
        title: "選択中の実験",
        description: "この実験の情報を読み込んでいます。表示が変わらない場合は、トップページから実験を選び直してください。",
        duration: experimentInfo.duration,
        reward: experimentInfo.reward,
        organization: experimentInfo.organization,
        managerName: experimentInfo.managerName,
        contactEmail: experimentInfo.contactEmail,
        notes: experimentInfo.notes,
        isPublished: true,
        status: "recruiting",
      },
      selectedStudyId
    );
  }, [studies, adminStudies, selectedStudyId, experimentInfo]);

  const activeExperimentInfo = useMemo(
    () => studyToExperimentInfo(activeStudy, experimentInfo),
    [activeStudy, experimentInfo]
  );

  const filteredRequests = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return [...requests]
      .filter((request) => {
        if (requestStatusFilter === "pending") return !request.assignedSlotId;
        if (requestStatusFilter === "assigned") return !!request.assignedSlotId;
        return true;
      })
      .filter((request) => {
        const confirmationStatus = request.participantConfirmationStatus || "pending";
        if (participantConfirmationFilter === "pending") return confirmationStatus === "pending";
        if (participantConfirmationFilter === "confirmed") return confirmationStatus === "confirmed";
        if (participantConfirmationFilter === "change_requested") return confirmationStatus === "change_requested";
        return true;
      })
      .filter((request) => {
        if (!keyword) return true;
        const text = [
          request.name,
          request.email,
          request.affiliation,
          request.note,
          request.participantResponseNote,
          request.lineLinkCode,
          request.lineDisplayName,
          request.lineUserId,
        ].join(" ").toLowerCase();
        return text.includes(keyword);
      })
      .sort((a, b) => {
        const aCompleted = isRequestCompleted(a) ? 1 : 0;
        const bCompleted = isRequestCompleted(b) ? 1 : 0;
        if (aCompleted !== bCompleted) return aCompleted - bCompleted;

        const aAssignedOrder = getRequestAssignedSlotOrder(a, sortedSlots);
        const bAssignedOrder = getRequestAssignedSlotOrder(b, sortedSlots);
        const aCreated = getRequestTimestampValue(a.createdAt);
        const bCreated = getRequestTimestampValue(b.createdAt);
        const aUpdated = getRequestTimestampValue(a.updatedAt);
        const bUpdated = getRequestTimestampValue(b.updatedAt);

        if (requestSortMode === "createdAsc") return aCreated - bCreated;
        if (requestSortMode === "createdDesc") return bCreated - aCreated;
        if (requestSortMode === "updatedDesc") return bUpdated - aUpdated;
        if (requestSortMode === "assignedAsc") {
          if (aAssignedOrder !== bAssignedOrder) return aAssignedOrder - bAssignedOrder;
          return aCreated - bCreated;
        }
        if (requestSortMode === "assignedDesc") {
          if (aAssignedOrder !== bAssignedOrder) return bAssignedOrder - aAssignedOrder;
          return aCreated - bCreated;
        }
        if (requestSortMode === "nameAsc") {
          const nameCompare = String(a.name || "").localeCompare(String(b.name || ""), "ja");
          if (nameCompare !== 0) return nameCompare;
          return aCreated - bCreated;
        }
        if (requestSortMode === "status") {
          const aPriority = getRequestDefaultPriority(a);
          const bPriority = getRequestDefaultPriority(b);
          if (aPriority !== bPriority) return aPriority - bPriority;
          const aAssigned = a.assignedSlotId ? 1 : 0;
          const bAssigned = b.assignedSlotId ? 1 : 0;
          if (aAssigned !== bAssigned) return aAssigned - bAssigned;
          return aCreated - bCreated;
        }

        if (aCompleted && bCompleted) {
          if (aAssignedOrder !== bAssignedOrder) return aAssignedOrder - bAssignedOrder;
        }

        const aPriority = getRequestDefaultPriority(a);
        const bPriority = getRequestDefaultPriority(b);
        if (aPriority !== bPriority) return aPriority - bPriority;

        const aAssigned = a.assignedSlotId ? 1 : 0;
        const bAssigned = b.assignedSlotId ? 1 : 0;
        if (aAssigned !== bAssigned) return aAssigned - bAssigned;

        return bUpdated - aUpdated;
      });
  }, [requests, search, requestStatusFilter, participantConfirmationFilter, requestSortMode, sortedSlots]);

  const confirmedScheduleGroups = useMemo(() => {
    return sortSlots(
      sortedSlots.filter((slot) => Number(slot.confirmedCount || 0) > 0)
    ).map((slot) => {
      const groupedRequests = requests.filter((request) => request.assignedSlotId === slot.id);
      return {
        slot,
        confirmedCount: Number(slot.confirmedCount || 0),
        remaining: Math.max(Number(slot.capacity || 1) - Number(slot.confirmedCount || 0), 0),
        names: groupedRequests.map((request) => request.name),
        requests: groupedRequests.map((request) => ({ id: request.id, name: request.name })),
      };
    });
  }, [sortedSlots, requests]);

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
      if (prev.preferredSlotIds.length >= MAX_PREFERRED_SLOTS) return prev;
      return {
        ...prev,
        preferredSlotIds: [...prev.preferredSlotIds, slotId],
      };
    });

    if (exists) {
      showToast("希望枠から外しました。", "info");
    } else if (participantForm.preferredSlotIds.length >= MAX_PREFERRED_SLOTS) {
      showToast(`希望枠は最大${MAX_PREFERRED_SLOTS}つまでです。`, "error");
    } else {
      showToast("希望枠に追加しました。", "success");
    }
  }


  function navigateToParticipantTop() {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("request");
      url.searchParams.delete("token");
      url.searchParams.delete("action");
      url.searchParams.delete("study");
      window.history.replaceState({}, "", url.toString());
    }
    setPage("landing");
    setParticipantResponseError("");
    setParticipantResponseMessage("");
    setParticipantResponseRequest(null);
    setParticipantResponseNote("");
  }

  async function submitParticipantChangeRequest() {
    const { token } = participantResponseContext;
    if (!firebaseReady || !token) return;

    if (participantResponseRequest?.participantConfirmationStatus === "invalid") {
      setParticipantResponseError(
        "すでにこの申し込みは無効になっています。変更希望は登録できません。"
      );
      showToast("この申し込みは無効です。", "error");
      return;
    }

    try {
      setParticipantResponseSubmitting(true);
      const nextStatus = "change_requested";
      const payload = {
        participantConfirmationStatus: nextStatus,
        participantResponseNote: participantResponseNote.trim(),
        participantRespondedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(firestore, "participantResponses", token), payload);

      const nextRequest = {
        ...(participantResponseRequest || {}),
        participantConfirmationStatus: nextStatus,
        participantResponseNote: participantResponseNote.trim(),
      };
      setParticipantResponseRequest(nextRequest);
      setParticipantResponseMessage(
        "変更希望を送信しました。管理者が内容を確認し、あらためてご連絡します。"
      );
      showToast("変更希望を受け付けました。", "success");
    } catch (error) {
      console.error(error);
      if (error?.code === "permission-denied") {
        setParticipantResponseError(
          "すでにこの申し込みは無効になっている可能性があります。最新のメールから開き直すか、あらためて参加を希望する場合は、予約サイトから再び日程を申し込んでください。"
        );
      } else {
        setParticipantResponseError("送信に失敗しました。時間をおいて再度お試しください。");
      }
      showToast("送信に失敗しました。", "error");
    } finally {
      setParticipantResponseSubmitting(false);
    }
  }

  function validateParticipantForm() {
    if (
      !participantForm.name.trim() ||
      !participantForm.email.trim() ||
      !participantForm.affiliation.trim() ||
      participantForm.preferredSlotIds.length === 0
    ) {
      setMessage("氏名、メールアドレス、所属・学年、希望枠は必須です。");
      showToast("必須項目を入力してください。", "error");
      return false;
    }

    if (!participantForm.email.trim().includes("@") || !participantForm.email.trim().includes(".")) {
      setMessage("メールアドレスの形式が正しくありません。");
      showToast("メールアドレスを確認してください。", "error");
      return false;
    }

    const customFields = activeStudy?.customFields || [];
    for (const field of customFields) {
      if (!field.required) continue;
      const val = (participantForm.customFieldValues || {})[field.id];
      const empty = !val || (Array.isArray(val) ? val.length === 0 : !String(val).trim());
      if (empty) {
        setMessage(`「${field.label}」は必須項目です。`);
        showToast(`「${field.label}」を入力してください。`, "error");
        return false;
      }
    }

    return true;
  }

  function handleSubmitRequest(event) {
    event.preventDefault();
    if (!validateParticipantForm()) return;
    setParticipantConfirmOpen(true);
  }

  async function confirmSubmitRequest() {
    if (!validateParticipantForm()) return;

    try {
      setParticipantSubmitLoading(true);
      const lineLinkCode = generateLineLinkCode();

      if (firebaseReady) {
        const responseToken = crypto.randomUUID();
        await addDoc(collection(firestore, "requests"), {
          studyId: selectedStudyId,
          name: participantForm.name.trim(),
          email: participantForm.email.trim(),
          affiliation: participantForm.affiliation.trim(),
          note: participantForm.note.trim(),
          preferredSlotIds: participantForm.preferredSlotIds,
          customFieldValues: participantForm.customFieldValues || {},
          assignedSlotId: "",
          status: "requested",
          participantResponseToken: responseToken,
          participantConfirmationStatus: "pending",
          participantResponseNote: "",
          operationStatus: "active",
          lineLinkCode,
          lineUserId: "",
          lineDisplayName: "",
          lineNotifyEnabled: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        setRequests((prev) => [
          (() => {
            const responseToken = crypto.randomUUID();
            return {
              id: crypto.randomUUID(),
              studyId: selectedStudyId,
              name: participantForm.name.trim(),
              email: participantForm.email.trim(),
              affiliation: participantForm.affiliation.trim(),
              note: participantForm.note.trim(),
              preferredSlotIds: participantForm.preferredSlotIds,
              assignedSlotId: "",
              status: "requested",
              participantResponseToken: responseToken,
              participantConfirmationStatus: "pending",
              participantResponseNote: "",
              operationStatus: "active",
              lineLinkCode,
              lineUserId: "",
              lineDisplayName: "",
              lineNotifyEnabled: false,
            };
          })(),
          ...prev,
        ]);
      }

      setParticipantConfirmOpen(false);
      setParticipantForm({
        name: "",
        email: "",
        affiliation: "",
        note: "",
        preferredSlotIds: [],
        customFieldValues: {},
      });
      setLastLineLinkInfo({ code: lineLinkCode });
      setLineGuideOpen(true);
      //setMessage("日時を送信しました。日程の確定や変更については、登録したメールアドレス宛に連絡します。通常の受信箱だけでなく迷惑メールにも入る場合があるため、受信箱と迷惑メールの両方を必ず確認してください。LINE通知を希望する場合は、表示された案内に従って公式LINEと連携してください。");
      showToast("希望日時を送信しました。", "success");
    } catch (error) {
      console.error(error);
      setMessage("送信に失敗しました。時間をおいて再度お試しください。");
      showToast("送信に失敗しました。", "error");
    } finally {
      setParticipantSubmitLoading(false);
    }
  }

  async function handleAddSlot(event) {
    event.preventDefault();

    const isBulkMode = Boolean(slotForm.bulkMode);
    const bulkPlan = slotForm.bulkSlotPlan || {};

    const newSlots = isBulkMode
      ? Object.entries(bulkPlan).flatMap(([date, periodKeys]) =>
          (periodKeys || []).map((periodKey) => ({
            studyId: selectedStudyId,
            date,
            periodKey,
            capacity: Number(slotForm.capacity || 1),
            confirmedCount: 0,
            isPublished: Boolean(slotForm.isPublished),
            location: slotForm.location.trim(),
            note: slotForm.note.trim(),
          }))
        )
      : [{
          studyId: selectedStudyId,
          date: slotForm.date,
          periodKey: slotForm.periodKey,
          capacity: Number(slotForm.capacity || 1),
          confirmedCount: 0,
          isPublished: Boolean(slotForm.isPublished),
          location: slotForm.location.trim(),
          note: slotForm.note.trim(),
        }].filter((slot) => slot.date && slot.periodKey);

    if (newSlots.length === 0) {
      showToast(isBulkMode ? "追加する日付と時限を選択してください。" : "追加する日付と時限を入力してください。", "error");
      return;
    }

    try {
      if (firebaseReady) {
        const batch = writeBatch(firestore);
        newSlots.forEach((slot) => {
          const newRef = doc(collection(firestore, "slots"));
          batch.set(newRef, {
            ...slot,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      } else {
        setSlots((prev) => sortSlots([
          ...prev,
          ...newSlots.map((slot) => ({
            id: crypto.randomUUID(),
            ...slot,
          })),
        ]));
      }

      setSlotForm((prev) => ({
        ...prev,
        capacity: prev.capacity || 1,
        location: prev.location,
        note: prev.note,
        extraDates: "",
        bulkDates: "",
        bulkSlotPlan: {},
        isPublished: prev.isPublished,
      }));
      showToast(
        newSlots.length === 1
          ? "日程枠を追加しました。次の追加にも直前の定員・場所・メモを引き継ぎます。"
          : `${newSlots.length}件の日程枠を追加しました。次の追加にも直前の定員・場所・メモを引き継ぎます。`,
        "success"
      );
    } catch (error) {
      console.error(error);
      showToast("日程枠の追加に失敗しました。", "error");
    }
  }

  async function handleImportSlotsCSV(file) {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      showToast("CSVにデータ行がありません。", "error");
      return;
    }

    const validPeriodKeys = new Set(["p1","p2","p3","p4","p5","p6","p7"]);
    const errors = [];
    const newSlots = [];

    lines.slice(1).forEach((line, i) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
      const [date, periodKey, capacityStr, location = "", note = ""] = cols;
      const rowNum = i + 2;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push(`行${rowNum}: 日付が無効です（YYYY-MM-DD形式）`);
        return;
      }
      if (!periodKey || !validPeriodKeys.has(periodKey)) {
        errors.push(`行${rowNum}: 時限が無効です（p1〜p7）`);
        return;
      }
      const capacity = parseInt(capacityStr, 10);
      if (isNaN(capacity) || capacity < 1) {
        errors.push(`行${rowNum}: 定員が無効です（1以上の整数）`);
        return;
      }
      newSlots.push({
        studyId: selectedStudyId,
        date,
        periodKey,
        capacity,
        confirmedCount: 0,
        isPublished: false,
        location: location || "",
        note: note || "",
      });
    });

    if (errors.length > 0) {
      showToast(`CSVエラー:\n${errors.slice(0, 5).join("\n")}${errors.length > 5 ? `\n他${errors.length - 5}件` : ""}`, "error");
      return;
    }
    if (newSlots.length === 0) {
      showToast("インポートできる行がありませんでした。", "error");
      return;
    }

    try {
      if (firebaseReady) {
        const batchSize = 400;
        for (let i = 0; i < newSlots.length; i += batchSize) {
          const batch = writeBatch(firestore);
          newSlots.slice(i, i + batchSize).forEach((slot) => {
            const newRef = doc(collection(firestore, "slots"));
            batch.set(newRef, { ...slot, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          });
          await batch.commit();
        }
      } else {
        setSlots((prev) => sortSlots([
          ...prev,
          ...newSlots.map((slot) => ({ id: crypto.randomUUID(), ...slot })),
        ]));
      }
      showToast(`${newSlots.length}件の日程枠をインポートしました（すべて非公開）。`, "success");
    } catch (error) {
      console.error(error);
      showToast("インポートに失敗しました。", "error");
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
      setSelectedSlotIds((prev) => prev.filter((id) => id !== slotId));
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

  function prepareAssignRequest(request, slotId) {
    const currentSlotId = request.assignedSlotId || "";

    if (!slotId && !currentSlotId) return;

    const mode = !slotId
      ? "unassign"
      : currentSlotId && currentSlotId !== slotId
      ? "change"
      : "assign";

    setAssignmentDialog({
      requestId: request.id,
      slotId,
      mode,
      requestName: request.name,
      currentLabel: currentSlotId ? buildSlotDisplayLabel(currentSlotId) : "",
      nextLabel: slotId ? buildSlotDisplayLabel(slotId) : "",
    });
  }

  async function handleAssignRequest(requestId, slotId) {
    const requestItem = requests.find((item) => item.id === requestId);
    const previousSlotId = requestItem?.assignedSlotId || "";
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

          const prevRef = previousSlotId ? doc(firestore, "slots", previousSlotId) : null;
          const nextRef = slotId ? doc(firestore, "slots", slotId) : null;

          // 先に全部読む
          const prevSnap = prevRef ? await transaction.get(prevRef) : null;
          const nextSnap = nextRef ? await transaction.get(nextRef) : null;

          if (nextRef && !nextSnap?.exists()) {
            throw new Error("slot-not-found");
          }

          // 変更先が満席か確認
          if (nextSnap?.exists()) {
            const nextData = nextSnap.data();
            const capacity = Number(nextData.capacity || 1);
            const confirmedCount = Number(nextData.confirmedCount || 0);

            if (confirmedCount >= capacity) {
              throw new Error("slot-full");
            }
          }

          // ここから書き込み
          if (prevRef && prevSnap?.exists()) {
            const prevData = prevSnap.data();
            const nextCount = Math.max(Number(prevData.confirmedCount || 0) - 1, 0);
            transaction.update(prevRef, {
              confirmedCount: nextCount,
              updatedAt: serverTimestamp(),
            });
          }

          if (nextRef && nextSnap?.exists()) {
            const nextData = nextSnap.data();
            transaction.update(nextRef, {
              confirmedCount: Number(nextData.confirmedCount || 0) + 1,
              updatedAt: serverTimestamp(),
            });
          }

          transaction.update(requestRef, {
            assignedSlotId: slotId,
            status: slotId ? "confirmed" : "requested",
            participantConfirmationStatus: "pending",
            participantResponseNote: "",
            participantRespondedAt: deleteField(),
            operationStatus: "active",
            completedAt: deleteField(),
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
        setRequests((prev) =>
          prev.map((item) => {
            if (item.id !== requestId) return item;
            const nextItem = {
              ...item,
              assignedSlotId: slotId,
              status: slotId ? "confirmed" : "requested",
              participantConfirmationStatus: "pending",
              participantResponseNote: "",
              operationStatus: "active",
            };
            delete nextItem.participantRespondedAt;
            delete nextItem.completedAt;
            return nextItem;
          })
        );
      }
      if (!previousSlotId && slotId) {
        showToast("日程を確定しました。", "success");
      } else if (previousSlotId && slotId && previousSlotId !== slotId) {
        showToast("確定日程を変更しました。", "success");
      } else if (previousSlotId && !slotId) {
        showToast("確定を解除しました。", "success");
      }
    } catch (error) {
      console.error("handleAssignRequest error:", error);
      showToast(
        `確定処理に失敗しました: ${error?.code || ""} ${error?.message || "unknown error"}`,
        "error"
      );
    }
  }

  async function handleToggleRequestCompleted(requestItem, shouldComplete) {
    if (!requestItem?.id) return;
    const message = shouldComplete
      ? "この申込を実施済みにしますか？"
      : "この申込の実施済み状態を解除しますか？";
    const ok = window.confirm(message);
    if (!ok) return;

    try {
      if (firebaseReady) {
        const payload = shouldComplete
          ? {
              operationStatus: "completed",
              completedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }
          : {
              operationStatus: "active",
              completedAt: deleteField(),
              updatedAt: serverTimestamp(),
            };
        await updateDoc(doc(firestore, "requests", requestItem.id), payload);
      } else {
        setRequests((prev) =>
          prev.map((item) => {
            if (item.id !== requestItem.id) return item;
            const nextItem = {
              ...item,
              operationStatus: shouldComplete ? "completed" : "active",
              updatedAt: { seconds: Math.floor(Date.now() / 1000) },
            };
            if (shouldComplete) {
              nextItem.completedAt = { seconds: Math.floor(Date.now() / 1000) };
            } else {
              delete nextItem.completedAt;
            }
            return nextItem;
          })
        );
      }
      showToast(shouldComplete ? "実施済みにしました。" : "実施済みを解除しました。", "success");
    } catch (error) {
      console.error(error);
      showToast("実施済み状態の更新に失敗しました。", "error");
    }
  }

  async function confirmAssignmentDialog() {
    if (!assignmentDialog) return;

    try {
      setAssignmentLoading(true);
      await handleAssignRequest(assignmentDialog.requestId, assignmentDialog.slotId);
      setAssignmentDialog(null);
    } finally {
      setAssignmentLoading(false);
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

          const responseToken = requestData.participantResponseToken || "";
          if (responseToken) {
            transaction.set(doc(firestore, "participantResponses", responseToken), {
              participantConfirmationStatus: "invalid",
              participantResponseNote: "この申込は管理者により削除されたか、無効になりました。",
              updatedAt: serverTimestamp(),
            }, { merge: true });
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
      JSON.stringify({ selectedStudyId, activeStudy, slots, requests, experimentInfo }, null, 2)
    );
  }

  async function resetAll() {
    const ok = window.confirm("現在選択している実験の申込と日程枠をすべて削除しますか？");
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
      setSelectedSlotIds([]);
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
          studyId: selectedStudyId,
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

  function buildSlotDisplayLabel(slotId) {
    const slot = sortedSlots.find((item) => item.id === slotId);
    if (!slot) return "未設定の枠";
    return `${formatJapaneseDate(slot.date)} / ${PERIOD_MAP[slot.periodKey]?.label || slot.periodKey}`;
  }

  async function handleSaveExperimentInfo(event) {
    event.preventDefault();

    const payload = {
      title: experimentInfoForm.title.trim(),
      description: experimentInfoForm.description.trim(),
      duration: experimentInfoForm.duration.trim(),
      reward: experimentInfoForm.reward.trim(),
      organization: experimentInfoForm.organization.trim(),
      managerName: experimentInfoForm.managerName.trim(),
      contactEmail: experimentInfoForm.contactEmail.trim(),
      notes: experimentInfoForm.notes,
    };

    try {
      setSavingExperimentInfo(true);

      if (firebaseReady) {
        await setDoc(
          doc(firestore, "settings", "experimentInfo"),
          {
            ...payload,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        const nextInfo = normalizeExperimentInfo(payload);
        setExperimentInfo(nextInfo);
        setExperimentInfoForm(nextInfo);
      }

      showToast("実験情報を保存しました。", "success");
    } catch (error) {
      console.error(error);
      showToast("実験情報の保存に失敗しました。", "error");
    } finally {
      setSavingExperimentInfo(false);
    }
  }

  function toggleSlotSelection(slotId) {
    setSelectedSlotIds((prev) =>
      prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId]
    );
  }

  function toggleSelectAllSlots() {
    setSelectedSlotIds((prev) =>
      prev.length === sortedSlots.length ? [] : sortedSlots.map((slot) => slot.id)
    );
  }

  function clearSlotSelection() {
    setSelectedSlotIds([]);
  }

  async function handleBulkUpdateNote() {
    if (selectedSlotIds.length === 0) {
      showToast("一括更新する枠を選択してください。", "error");
      return;
    }

    try {
      setBulkActionLoading(true);

      if (firebaseReady) {
        const batch = writeBatch(firestore);
        selectedSlotIds.forEach((slotId) => {
          batch.update(doc(firestore, "slots", slotId), {
            note: bulkNote,
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      } else {
        setSlots((prev) =>
          prev.map((slot) =>
            selectedSlotIds.includes(slot.id) ? { ...slot, note: bulkNote } : slot
          )
        );
      }

      showToast("選択した枠のメモを更新しました。", "success");
    } catch (error) {
      console.error(error);
      showToast("メモの一括更新に失敗しました。", "error");
    } finally {
      setBulkActionLoading(false);
    }
  }

  async function handleBulkPublishState(nextPublished) {
    if (selectedSlotIds.length === 0) {
      showToast("一括操作する枠を選択してください。", "error");
      return;
    }

    try {
      setBulkActionLoading(true);

      if (firebaseReady) {
        const batch = writeBatch(firestore);
        selectedSlotIds.forEach((slotId) => {
          batch.update(doc(firestore, "slots", slotId), {
            isPublished: nextPublished,
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      } else {
        setSlots((prev) =>
          prev.map((slot) =>
            selectedSlotIds.includes(slot.id) ? { ...slot, isPublished: nextPublished } : slot
          )
        );
      }

      showToast(nextPublished ? "選択した枠を公開しました。" : "選択した枠を非公開にしました。", "success");
    } catch (error) {
      console.error(error);
      showToast("一括公開設定の更新に失敗しました。", "error");
    } finally {
      setBulkActionLoading(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedSlotIds.length === 0) {
      showToast("削除する枠を選択してください。", "error");
      return;
    }

    const ok = window.confirm(`選択した ${selectedSlotIds.length} 件の日程枠を削除しますか？ 関連する希望枠・確定情報も更新されます。`);
    if (!ok) return;

    const selectedSet = new Set(selectedSlotIds);

    try {
      setBulkActionLoading(true);

      if (firebaseReady) {
        const batch = writeBatch(firestore);

        selectedSlotIds.forEach((slotId) => {
          batch.delete(doc(firestore, "slots", slotId));
        });

        requests.forEach((request) => {
          const nextPreferred = (request.preferredSlotIds || []).filter((id) => !selectedSet.has(id));
          const assignedRemoved = selectedSet.has(request.assignedSlotId || "");
          const nextAssigned = assignedRemoved ? "" : request.assignedSlotId || "";

          if (nextPreferred.length !== (request.preferredSlotIds || []).length || assignedRemoved) {
            batch.update(doc(firestore, "requests", request.id), {
              preferredSlotIds: nextPreferred,
              assignedSlotId: nextAssigned,
              status: nextAssigned ? "confirmed" : "requested",
              updatedAt: serverTimestamp(),
            });
          }
        });

        await batch.commit();
      } else {
        setSlots((prev) => prev.filter((slot) => !selectedSet.has(slot.id)));
        setRequests((prev) =>
          prev.map((request) => {
            const nextPreferred = (request.preferredSlotIds || []).filter((id) => !selectedSet.has(id));
            const assignedRemoved = selectedSet.has(request.assignedSlotId || "");
            return {
              ...request,
              preferredSlotIds: nextPreferred,
              assignedSlotId: assignedRemoved ? "" : request.assignedSlotId,
              status: assignedRemoved ? "requested" : request.status,
            };
          })
        );
      }

      setSelectedSlotIds([]);
      showToast("選択した日程枠を削除しました。", "success");
    } catch (error) {
      console.error(error);
      showToast("日程枠の一括削除に失敗しました。", "error");
    } finally {
      setBulkActionLoading(false);
    }
  }

  function resetStudyForm() {
    setEditingStudyId("");
    setStudyForm(buildStudyFormFromExperimentInfo(experimentInfo, authUser?.email || ""));
  }

  function editStudy(study) {
    setEditingStudyId(study.id);
    setStudyForm(buildStudyFormFromStudy(study, authUser?.email || ""));
    setAdminTab("studies");
  }

  async function handleSaveStudy(event) {
    event.preventDefault();

    const studyId = editingStudyId
      ? normalizeStudyId(editingStudyId)
      : createAutoStudyId();

    const payload = buildStudyPayloadFromForm(studyForm, authUser?.email || "");
    if (!payload.title || !payload.description || !payload.duration || !payload.reward || !payload.organization || !payload.location || !payload.managerName || !payload.contactEmail || !payload.ownerEmail) {
      showToast("必須項目を入力してください。", "error");
      return;
    }

    if (payload.adminEmails.length === 0) {
      showToast("管理者メールを1件以上入力してください。", "error");
      return;
    }

    try {
      setSavingStudy(true);

      if (firebaseReady) {
        const studyRef = doc(firestore, "studies", studyId);

        if (editingStudyId) {
          await updateDoc(studyRef, {
            ...payload,
            updatedAt: serverTimestamp(),
          });
        } else {
          const existing = await getDoc(studyRef);
          if (existing.exists()) {
            showToast("同じ募集IDがすでにあります。もう一度作成してください。", "error");
            return;
          }

          await setDoc(studyRef, {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        const nextStudy = normalizeStudyInfo(payload, studyId);
        setAdminStudies((prev) => {
          const rest = prev.filter((item) => item.id !== studyId);
          return [nextStudy, ...rest];
        });
        setStudies((prev) => {
          const rest = prev.filter((item) => item.id !== studyId);
          return payload.isPublished ? [nextStudy, ...rest] : rest;
        });
      }

      setSelectedStudyId(studyId);
      showToast(editingStudyId ? "募集情報を更新しました。" : "募集を作成しました。", "success");
      setEditingStudyId("");
      setStudyForm(buildStudyFormFromExperimentInfo(experimentInfo, authUser?.email || ""));
      setAdminTab("studies");
    } catch (error) {
      console.error(error);
      showToast("実験情報の保存に失敗しました。Rulesと入力内容を確認してください。", "error");
    } finally {
      setSavingStudy(false);
    }
  }

  async function toggleStudyPublished(study) {
    const nextPublished = !study.isPublished;
    const nextStatus = nextPublished && study.status === "draft" ? "recruiting" : study.status;

    try {
      if (firebaseReady) {
        await updateDoc(doc(firestore, "studies", study.id), {
          isPublished: nextPublished,
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
      } else {
        setAdminStudies((prev) => prev.map((item) => item.id === study.id ? { ...item, isPublished: nextPublished, status: nextStatus } : item));
        setStudies((prev) => {
          const updated = { ...study, isPublished: nextPublished, status: nextStatus };
          const rest = prev.filter((item) => item.id !== study.id);
          return nextPublished ? [updated, ...rest] : rest;
        });
      }

      showToast(nextPublished ? "実験を公開しました。" : "実験を非公開にしました。", "success");
    } catch (error) {
      console.error(error);
      showToast("公開状態の更新に失敗しました。", "error");
    }
  }

  async function deleteStudy(study) {
    const ok = window.confirm(`「${study.title}」を削除しますか？\nこのPhaseでは実験一覧のカードのみ削除され、既存の予約枠や申込データは削除されません。`);
    if (!ok) return;

    try {
      setDeletingStudyId(study.id);

      if (firebaseReady) {
        await deleteDoc(doc(firestore, "studies", study.id));
      } else {
        setAdminStudies((prev) => prev.filter((item) => item.id !== study.id));
        setStudies((prev) => prev.filter((item) => item.id !== study.id));
      }

      if (editingStudyId === study.id) resetStudyForm();
      showToast("実験を削除しました。", "success");
    } catch (error) {
      console.error(error);
      showToast("実験の削除に失敗しました。", "error");
    } finally {
      setDeletingStudyId("");
    }
  }

  async function repairLegacyData() {
    if (!firebaseReady) {
      showToast("Firebase接続時のみ補修できます。", "error");
      return;
    }

    const ok = window.confirm(
      "リニューアル前の古い requests / slots に不足している studyId や確認フロー用フィールドを追加します。\n\n現在の古いデータは vr-notification-2026 の募集として補修します。実行しますか？"
    );
    if (!ok) return;

    try {
      setRepairingLegacyData(true);

      const requestsSnapshot = await getDocs(collection(firestore, "requests"));
      const slotsSnapshot = await getDocs(collection(firestore, "slots"));

      const batches = [];
      let batch = writeBatch(firestore);
      let operationCount = 0;
      let repairedRequests = 0;
      let repairedSlots = 0;

      const queueUpdate = (ref, payload) => {
        batch.update(ref, payload);
        operationCount += 1;
        if (operationCount >= 400) {
          batches.push(batch);
          batch = writeBatch(firestore);
          operationCount = 0;
        }
      };

      requestsSnapshot.forEach((requestDoc) => {
        const data = requestDoc.data() || {};
        const updatePayload = {};

        if (typeof data.studyId !== "string" || !data.studyId.trim()) {
          updatePayload.studyId = DEFAULT_STUDY_ID;
        }
        if (typeof data.participantResponseToken !== "string" || data.participantResponseToken.length <= 10) {
          const token = typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `legacy-${requestDoc.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          updatePayload.participantResponseToken = token;
        }
        if (!["pending", "confirmed", "change_requested"].includes(data.participantConfirmationStatus)) {
          updatePayload.participantConfirmationStatus = "pending";
        }
        if (typeof data.participantResponseNote !== "string") {
          updatePayload.participantResponseNote = "";
        }
        if (typeof data.lineLinkCode !== "string" || !data.lineLinkCode.trim()) {
          updatePayload.lineLinkCode = generateLineLinkCode();
        }
        if (typeof data.lineUserId !== "string") {
          updatePayload.lineUserId = "";
        }
        if (typeof data.lineDisplayName !== "string") {
          updatePayload.lineDisplayName = "";
        }
        if (typeof data.lineNotifyEnabled !== "boolean") {
          updatePayload.lineNotifyEnabled = false;
        }

        if (Object.keys(updatePayload).length > 0) {
          updatePayload.updatedAt = serverTimestamp();
          queueUpdate(requestDoc.ref, updatePayload);
          repairedRequests += 1;
        }
      });

      slotsSnapshot.forEach((slotDoc) => {
        const data = slotDoc.data() || {};
        if (typeof data.studyId !== "string" || !data.studyId.trim()) {
          queueUpdate(slotDoc.ref, {
            studyId: DEFAULT_STUDY_ID,
            updatedAt: serverTimestamp(),
          });
          repairedSlots += 1;
        }
      });

      if (operationCount > 0) {
        batches.push(batch);
      }

      for (const queuedBatch of batches) {
        await queuedBatch.commit();
      }

      showToast(
        `古いデータを補修しました。requests: ${repairedRequests}件 / slots: ${repairedSlots}件`,
        "success"
      );
    } catch (error) {
      console.error(error);
      showToast("古いデータの補修に失敗しました。Rulesとデータ形式を確認してください。", "error");
    } finally {
      setRepairingLegacyData(false);
    }
  }


  function handleExportCsv() {
    const studyForExport = adminStudies.find((s) => s.id === selectedStudyId) || adminStudies[0];
    const customFields = studyForExport?.customFields || [];
    const baseHeaders = ["申込ID", "氏名", "メール", "所属・学年", "補足", "申込日時", "申込状態", "参加者確認", "確定日程", "確定日", "確定時間帯", "LINE連携", "実施状態"];
    const customHeaders = customFields.map((f) => f.label || f.id);
    const headers = [...baseHeaders, ...customHeaders];

    const rows = filteredRequests.map((request) => {
      const assignedSlot = sortedSlots.find((s) => s.id === request.assignedSlotId);
      const assignedDate = assignedSlot ? formatJapaneseDate(assignedSlot.date) : "";
      const assignedPeriod = assignedSlot ? (PERIOD_MAP[assignedSlot.periodKey]?.label || assignedSlot.periodKey) : "";
      const assignedLabel = assignedSlot ? `${assignedDate} / ${assignedPeriod}` : "";
      const createdAt = request.createdAt?.seconds ? new Date(request.createdAt.seconds * 1000).toLocaleString("ja-JP") : "";
      const statusLabel = request.assignedSlotId ? "確定済み" : "未確定";
      const confirmLabel = { pending: "未確認", confirmed: "確認済み", change_requested: "変更希望", invalid: "無効" }[request.participantConfirmationStatus || "pending"] || "未確認";
      const lineLabel = request.lineNotifyEnabled && request.lineUserId ? "連携済み" : request.lineUserId ? "通知OFF" : "未連携";
      const operationLabel = isRequestCompleted(request) ? "実施済み" : isPastScheduledRequest(request, sortedSlots) ? "予定日超過" : "未実施";
      const baseRow = [request.id, request.name, request.email, request.affiliation, request.note, createdAt, statusLabel, confirmLabel, assignedLabel, assignedDate, assignedPeriod, lineLabel, operationLabel];
      const customValues = customFields.map((f) => {
        const val = (request.customFieldValues || {})[f.id];
        if (Array.isArray(val)) return val.join(", ");
        return val ?? "";
      });
      return [...baseRow, ...customValues];
    });

    const escape = (v) => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const csvContent = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const bom = "﻿";
    const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `requests_${selectedStudyId}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSaveAsTemplate(templateName) {
    if (!templateName.trim()) return;
    if (!firebaseReady) {
      showToast("Firebase接続時のみ利用できます。", "error");
      return;
    }

    try {
      setSavingTemplate(true);
      const payload = buildStudyTemplatePayload(studyForm, templateName, authUser?.email || "");
      await addDoc(collection(firestore, "studyTemplates"), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      showToast("テンプレートを保存しました。", "success");
    } catch (error) {
      console.error(error);
      showToast("テンプレートの保存に失敗しました。", "error");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate(templateId) {
    if (!firebaseReady) return;
    if (!window.confirm("このテンプレートを削除しますか？")) return;

    try {
      await deleteDoc(doc(firestore, "studyTemplates", templateId));
      showToast("テンプレートを削除しました。", "success");
    } catch (error) {
      console.error(error);
      showToast("テンプレートの削除に失敗しました。", "error");
    }
  }

  async function handleResearcherRegister(event) {
    event.preventDefault();
    if (!authUser) return;
    if (!researcherRegisterForm.name.trim() || !researcherRegisterForm.affiliation.trim() || !researcherRegisterForm.contactEmail.trim()) {
      setResearcherRegisterError("すべての項目を入力してください。");
      return;
    }
    try {
      setResearcherRegisterLoading(true);
      setResearcherRegisterError("");
      await setDoc(doc(firestore, "researchers", authUser.uid), {
        uid: authUser.uid,
        email: (authUser.email || "").toLowerCase(),
        name: researcherRegisterForm.name.trim(),
        affiliation: researcherRegisterForm.affiliation.trim(),
        contactEmail: researcherRegisterForm.contactEmail.trim().toLowerCase(),
        status: "pending",
        createdAt: serverTimestamp(),
      });
      showToast("登録申請を送信しました。管理者の承認をお待ちください。", "success");
    } catch (error) {
      console.error(error);
      setResearcherRegisterError("申請の送信に失敗しました。しばらくしてから再度お試しください。");
    } finally {
      setResearcherRegisterLoading(false);
    }
  }

  async function handleApproveResearcher(researcherId) {
    if (!firebaseReady) return;
    try {
      await updateDoc(doc(firestore, "researchers", researcherId), {
        status: "approved",
        approvedAt: serverTimestamp(),
        approvedBy: authUser?.email || "",
        updatedAt: serverTimestamp(),
      });
      showToast("研究者を承認しました。", "success");
    } catch (error) {
      console.error(error);
      showToast("承認に失敗しました。", "error");
    }
  }

  async function handleRejectResearcher(researcherId) {
    if (!firebaseReady) return;
    const reason = window.prompt("拒否理由（任意）:");
    if (reason === null) return;
    try {
      await updateDoc(doc(firestore, "researchers", researcherId), {
        status: "rejected",
        rejectionReason: reason.trim(),
        updatedAt: serverTimestamp(),
      });
      showToast("拒否しました。", "success");
    } catch (error) {
      console.error(error);
      showToast("拒否処理に失敗しました。", "error");
    }
  }

  const [savingResearcherProfile, setSavingResearcherProfile] = useState(false);
  const [deletingResearcherProfile, setDeletingResearcherProfile] = useState(false);

  async function handleUpdateResearcherProfile(form, onSuccess) {
    if (!authUser || !firebaseReady) return;
    try {
      setSavingResearcherProfile(true);
      await updateDoc(doc(firestore, "researchers", authUser.uid), {
        name: form.name.trim(),
        affiliation: form.affiliation.trim(),
        contactEmail: form.contactEmail.trim().toLowerCase(),
        updatedAt: serverTimestamp(),
      });
      showToast("プロフィールを更新しました。", "success");
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error(error);
      showToast("更新に失敗しました。", "error");
    } finally {
      setSavingResearcherProfile(false);
    }
  }

  async function handleDeleteResearcherRegistration() {
    if (!authUser || !firebaseReady) return;
    try {
      setDeletingResearcherProfile(true);
      await deleteDoc(doc(firestore, "researchers", authUser.uid));
      showToast("研究者登録を解除しました。", "success");
      setPage("landing");
    } catch (error) {
      console.error(error);
      showToast("解除に失敗しました。", "error");
    } finally {
      setDeletingResearcherProfile(false);
    }
  }

  function handleLoadTemplate(template) {
    const newForm = buildStudyFormFromTemplate(template, authUser?.email || "");
    setStudyForm(newForm);
    setEditingStudyId("");
    showToast(`テンプレート「${template.name}」を読み込みました。`, "success");
  }

  function navigateToLanding() {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("study");
      url.searchParams.delete("request");
      url.searchParams.delete("token");
      url.searchParams.delete("action");
      window.history.replaceState({}, "", url.toString());
    }
    setPage("landing");
  }

  function navigateToStudies() {
    window.location.href = "/studies";
  }

  function openStudyReservation(study) {
    const safeStudy = study ? normalizeStudyInfo(study, study.id || DEFAULT_STUDY_ID) : activeStudy;
    const studyId = normalizeStudyId(safeStudy?.id || DEFAULT_STUDY_ID) || DEFAULT_STUDY_ID;
    window.location.href = `/study/${encodeURIComponent(studyId)}`;
  }

  function selectStudyScope(studyId) {
    const nextStudyId = normalizeStudyId(studyId || "") || DEFAULT_STUDY_ID;
    setSelectedStudyId(nextStudyId);
    setSelectedDate("");
    setSelectedSlotIds([]);
    setParticipantForm((prev) => ({ ...prev, preferredSlotIds: [] }));

    if (typeof window !== "undefined" && page === "participant") {
      const url = new URL(window.location.href);
      url.searchParams.set("study", nextStudyId);
      window.history.replaceState({}, "", url.toString());
    }
  }

  function openAdminPage() {
    window.location.href = "/admin";
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
    navigateToLanding();
  }

  function retryFetch() {
    showToast("最新状態は自動同期されています。必要ならページを再読み込みしてください。", "info");
  }

  useEffect(() => {
    if (researcherProfileLoading) return;
    if (page === "admin-login" && authUser) {
      if (isSuperAdmin || isApprovedResearcher) {
        setPage("admin");
      } else if (isPendingResearcher) {
        setPage("researcher-pending");
      } else {
        setPage("researcher-register");
      }
    } else if (page === "researcher-register" && !researcherProfileLoading) {
      if (isSuperAdmin || isApprovedResearcher) setPage("admin");
      else if (isPendingResearcher) setPage("researcher-pending");
    } else if (page === "researcher-pending" && !researcherProfileLoading) {
      if (isSuperAdmin || isApprovedResearcher) setPage("admin");
    }
  }, [page, authUser, isSuperAdmin, isApprovedResearcher, isPendingResearcher, researcherProfileLoading]);

  return (
    <>
      {page === "landing" ? (
        <LabLinkLandingPage
          studies={studies}
          studiesLoading={studiesLoading}
          onOpenStudies={navigateToStudies}
          onOpenAdmin={openAdminPage}
          onOpenHelp={() => setShowHelp(true)}
        />
      ) : page === "studies" ? (
        <StudyBrowsePage
          studies={studies}
          studiesLoading={studiesLoading}
          studiesError={studiesError}
          onOpenReservation={openStudyReservation}
          onOpenAdmin={openAdminPage}
          onOpenHelp={() => setShowHelp(true)}
          onOpenHome={navigateToLanding}
        />
      ) : page === "admin-login" ? (
        <AdminLoginPage
          authUser={authUser}
          authReady={authReady}
          authError={authError}
          firebaseEnabled={firebaseReady}
          onBack={navigateToLanding}
          onGoogleLogin={handleGoogleLogin}
          onOpenResearcherRegister={() => setPage("researcher-register")}
        />
      ) : page === "researcher-register" ? (
        <ResearcherRegisterPage
          authUser={authUser}
          onGoogleLogin={handleGoogleLogin}
          onBack={navigateToLanding}
          registerForm={researcherRegisterForm}
          setRegisterForm={setResearcherRegisterForm}
          onSubmit={handleResearcherRegister}
          loading={researcherRegisterLoading}
          error={researcherRegisterError}
        />
      ) : page === "researcher-pending" ? (
        <ResearcherPendingPage
          authUser={authUser}
          onBack={navigateToLanding}
          onLogout={handleAdminLogout}
        />
      ) : page === "researcher-profile" ? (
        <ResearcherProfilePage
          authUser={authUser}
          profile={researcherProfile}
          onBack={() => setPage("admin")}
          onLogout={handleAdminLogout}
          onSave={handleUpdateResearcherProfile}
          onDelete={handleDeleteResearcherRegistration}
          saving={savingResearcherProfile}
          deleting={deletingResearcherProfile}
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
            requestStatusFilter={requestStatusFilter}
            setRequestStatusFilter={setRequestStatusFilter}
            participantConfirmationFilter={participantConfirmationFilter}
            setParticipantConfirmationFilter={setParticipantConfirmationFilter}
            requestSortMode={requestSortMode}
            setRequestSortMode={setRequestSortMode}
            filteredRequests={filteredRequests}
            confirmedScheduleGroups={confirmedScheduleGroups}
            handleAssignRequest={handleAssignRequest}
            handleDeleteRequest={handleDeleteRequest}
            onToggleRequestCompleted={handleToggleRequestCompleted}
            onBack={navigateToLanding}
            onLogout={handleAdminLogout}
            onOpenProfile={isApprovedResearcher ? () => setPage("researcher-profile") : null}
            adminEmail={authUser?.email || ""}
            isLoading={slotsLoading || requestsLoading || adminStudiesLoading}
            onSeedSampleData={seedSampleData}
            onPrepareAssignRequest={prepareAssignRequest}
            experimentInfo={experimentInfo}
            experimentInfoForm={experimentInfoForm}
            setExperimentInfoForm={setExperimentInfoForm}
            onSaveExperimentInfo={handleSaveExperimentInfo}
            savingExperimentInfo={savingExperimentInfo}
            selectedSlotIds={selectedSlotIds}
            allSlotsSelected={allSlotsSelected}
            onToggleSlotSelection={toggleSlotSelection}
            onToggleSelectAllSlots={toggleSelectAllSlots}
            onClearSlotSelection={clearSlotSelection}
            bulkNote={bulkNote}
            setBulkNote={setBulkNote}
            bulkActionLoading={bulkActionLoading}
            onBulkUpdateNote={handleBulkUpdateNote}
            onImportSlotsCSV={handleImportSlotsCSV}
            onBulkPublish={() => handleBulkPublishState(true)}
            onBulkUnpublish={() => handleBulkPublishState(false)}
            onBulkDelete={handleBulkDelete}
            adminStudies={adminStudies}
            adminStudiesLoading={adminStudiesLoading}
            studyForm={studyForm}
            setStudyForm={setStudyForm}
            editingStudyId={editingStudyId}
            savingStudy={savingStudy}
            deletingStudyId={deletingStudyId}
            onSaveStudy={handleSaveStudy}
            onEditStudy={editStudy}
            onResetStudyForm={resetStudyForm}
            onDeleteStudy={deleteStudy}
            onToggleStudyPublished={toggleStudyPublished}
            onRepairLegacyData={repairLegacyData}
            repairingLegacyData={repairingLegacyData}
            selectedStudyId={selectedStudyId}
            onSelectStudyScope={selectStudyScope}
            onOpenReservationPage={openStudyReservation}
            onOpenLineCodeHelp={() => setShowLineCodeHelp(true)}
            onExportCsv={handleExportCsv}
            studyTemplates={studyTemplates}
            savingTemplate={savingTemplate}
            onSaveAsTemplate={handleSaveAsTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onLoadTemplate={handleLoadTemplate}
            isSuperAdmin={isSuperAdmin}
            researchers={researchers}
            researchersLoading={researchersLoading}
            onApproveResearcher={handleApproveResearcher}
            onRejectResearcher={handleRejectResearcher}
          />
        ) : (
          <AdminLoginPage
            authUser={authUser}
            authReady={authReady}
            authError={authError || "管理者ログインが必要です。"}
            firebaseEnabled={firebaseReady}
            onBack={navigateToLanding}
            onGoogleLogin={handleGoogleLogin}
          />
        )
      ) : page === "participant-response" ? (
        <ParticipantResponsePage
          loading={participantResponseLoading}
          error={participantResponseError}
          requestItem={participantResponseRequest}
          assignedSlot={participantResponseRequest ? {
            date: participantResponseRequest.assignedDate || "",
            periodKey: participantResponseRequest.assignedPeriodKey || "",
            location: participantResponseRequest.assignedLocation || "",
            note: participantResponseRequest.assignedNote || "",
          } : null}
          studyTitle={activeExperimentInfo?.title || ""}
          responseNote={participantResponseNote}
          setResponseNote={setParticipantResponseNote}
          onSubmitChangeRequest={submitParticipantChangeRequest}
          submitting={participantResponseSubmitting}
          submitMessage={participantResponseMessage}
          onBackToTop={navigateToParticipantTop}
        />
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
          participantSubmitLoading={participantSubmitLoading}
          message={message}
          lineLinkInfo={lastLineLinkInfo}
          onOpenLineGuide={() => setLineGuideOpen(true)}
          detailsRef={detailsRef}
          onOpenAdmin={openAdminPage}
          onOpenHelp={() => setShowHelp(true)}
          onOpenHome={navigateToLanding}
          onOpenStudies={navigateToStudies}
          stats={stats}
          isLoading={slotsLoading}
          onRetry={retryFetch}
          setupMode={!firebaseReady}
          calendarView={calendarView}
          setCalendarView={setCalendarView}
          experimentInfo={activeExperimentInfo}
          activeStudy={activeStudy}
        />
      )}

      {showHelp ? <HelpModal onClose={() => setShowHelp(false)} /> : null}
      {showLineCodeHelp ? <LineLinkCodeHelpModal onClose={() => setShowLineCodeHelp(false)} /> : null}
      {participantConfirmOpen ? (
        <ParticipantRequestConfirmModal
          open={participantConfirmOpen}
          participantForm={participantForm}
          sortedSlots={sortedSlots.filter((slot) => slot.isPublished !== false)}
          onConfirm={confirmSubmitRequest}
          onClose={() => setParticipantConfirmOpen(false)}
          loading={participantSubmitLoading}
        />
      ) : null}
      {lineGuideOpen && lastLineLinkInfo?.code ? (
        <LineLinkGuideModal
          lineLinkInfo={lastLineLinkInfo}
          onClose={() => setLineGuideOpen(false)}
          onToast={setToast}
        />
      ) : null}
      {editingSlot ? (
        <EditSlotModal
          form={editSlotForm}
          setForm={setEditSlotForm}
          onSave={saveEditedSlot}
          onClose={() => setEditingSlot(null)}
          saving={savingEdit}
        />
      ) : null}
      {assignmentDialog ? (
        <AssignmentConfirmModal
          dialog={assignmentDialog}
          onConfirm={confirmAssignmentDialog}
          onClose={() => setAssignmentDialog(null)}
          loading={assignmentLoading}
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
