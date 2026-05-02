"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { firestore, firebaseReady } from "@/app/lib/firebase";
import {
  PERIODS,
  PERIOD_MAP,
  WEEK_LABELS,
  MAX_PREFERRED_SLOTS,
  DEFAULT_STUDY_ID,
  DEFAULT_EXPERIMENT_INFO,
  SAMPLE_SLOTS,
} from "@/app/lib/constants";
import {
  formatDateKey,
  formatJapaneseDate,
  formatMonthTitle,
  getJapaneseHolidayName,
  getMonthGrid,
} from "@/app/lib/date-utils";
import { normalizeStudyInfo, normalizeExperimentInfo, studyToExperimentInfo } from "@/app/lib/study-utils";
import { sortSlots, getSlotLabel, getSlotMetrics, getDaySummary, hasSlotEnded } from "@/app/lib/slot-utils";
import { generateLineLinkCode } from "@/app/lib/request-utils";
import {
  LINE_QR_IMAGE_URL,
  LINE_ADD_FRIEND_URL,
  LINE_OFFICIAL_ACCOUNT_ID,
  PublicSiteHeader,
  HelpModal,
  ExperimentInfoCard,
  SetupNotice,
  PrivacyNote,
  Card,
  StatusBadge,
  SectionHeader,
  IconButton,
  ModalShell,
  LoadingCard,
  ActionToast,
  classNames,
  ChevronLeft,
  ChevronRight,
  LabLinkMark,
  TinyFeature,
} from "@/app/components/shared";
import { getStudyStatusLabel, getStudyStatusTone } from "@/app/lib/study-utils";

// ── Participant-specific components ────────────────────────────────────────────

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
            <button type="button" onClick={onOpenHelp}
              className="rounded-2xl border border-teal-200 bg-white px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50">
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

function ConfirmModal({ open, participantForm, sortedSlots, onConfirm, onClose, loading }) {
  if (!open) return null;
  const selectedSlots = participantForm.preferredSlotIds
    .map((id) => sortedSlots.find((s) => s.id === id))
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
          <button type="button" onClick={onConfirm} disabled={loading}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60">
            {loading ? "送信中..." : "この内容で送信する"}
          </button>
          <button type="button" onClick={onClose} disabled={loading}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
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
    } catch (e) { console.error(e); }
    try {
      const ta = document.createElement("textarea");
      ta.value = lineLinkInfo.code;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showCopiedFeedback();
    } catch (e) {
      console.error(e);
      onToast?.({ tone: "error", message: "コピーに失敗しました。連携コードを手動で選択してコピーしてください。" });
    }
  };

  return (
    <ModalShell title="LINEでも通知を受け取る（オススメ）" onClose={onClose}>
      <div className="space-y-5 text-sm leading-7 text-slate-700">
        <div className="rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
          <div className="text-xl font-bold text-slate-900">申込が完了しました</div>
          <p className="mt-2 text-sm leading-7 text-slate-700">
            日程の確定・変更・確認の案内をLINEでも受け取りたい方は、以下の手順で公式LINEと申込情報を連携してください。
          </p>
          <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-6 text-emerald-800">
            LINE連携は任意です。連携しない場合でも、これまで通りメールで日程のご連絡をお送りします。
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-base font-bold text-white shadow-sm">1</div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-slate-900">公式LINEを追加</div>
                <p className="mt-2 text-sm leading-7 text-slate-600">QRコードを読み取るか、友だち追加ボタンから公式LINEを追加してください。</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)] lg:items-center">
              {LINE_QR_IMAGE_URL ? (
                <div className="rounded-3xl border border-emerald-200 bg-white p-4 text-center shadow-sm">
                  <img src={LINE_QR_IMAGE_URL} alt="公式LINE友だち追加用QRコード" className="mx-auto h-36 w-36 rounded-2xl object-contain sm:h-52 sm:w-52" />
                  <div className="mt-3 text-sm font-medium text-emerald-800">QRコードで友だち追加</div>
                </div>
              ) : null}
              <div className={classNames("space-y-3", !LINE_QR_IMAGE_URL && "lg:col-span-2")}>
                {LINE_ADD_FRIEND_URL ? (
                  <a href={LINE_ADD_FRIEND_URL} target="_blank" rel="noreferrer"
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-emerald-200 bg-white px-4 py-4 shadow-sm transition hover:bg-emerald-50"
                    aria-label="公式LINEを友だち追加する">
                    <img src="https://scdn.line-apps.com/n/line_add_friends/btn/ja.png" alt="友だち追加" className="h-11 w-auto sm:h-12" />
                  </a>
                ) : null}
                {LINE_OFFICIAL_ACCOUNT_ID ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-6 text-emerald-900">
                    LINEアプリでID検索する場合：<span className="ml-1 font-semibold">{LINE_OFFICIAL_ACCOUNT_ID}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-base font-bold text-white shadow-sm">2</div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-slate-900">連携コードを送信</div>
                <p className="mt-2 text-sm leading-7 text-slate-600">公式LINEを追加したあと、以下の8桁の連携コードをそのまま送信してください。</p>
              </div>
            </div>
            <div className="mt-5 rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_132px] md:items-stretch">
                  <div className="min-w-0 overflow-hidden rounded-2xl bg-white/60 px-3 py-4 text-center text-[2rem] font-bold tracking-[0.14em] text-emerald-800 md:flex md:items-center md:justify-center">
                    <span className="block max-w-full whitespace-nowrap leading-none">{lineLinkInfo.code}</span>
                  </div>
                  <button type="button" onClick={handleCopyCode} title="連携コードをコピー"
                    className={classNames("inline-flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white shadow-sm transition md:h-full md:min-h-16 md:w-[132px]",
                      copied ? "bg-emerald-700" : "bg-emerald-600 hover:bg-emerald-500")}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                      <path d="M8 7.5A2.5 2.5 0 0 1 10.5 5H17a2.5 2.5 0 0 1 2.5 2.5V14a2.5 2.5 0 0 1-2.5 2.5h-1.5v-2H17a.5.5 0 0 0 .5-.5V7.5A.5.5 0 0 0 17 7h-6.5a.5.5 0 0 0-.5.5V9H8V7.5Z" fill="currentColor" />
                      <path d="M4.5 10A2.5 2.5 0 0 1 7 7.5h6.5A2.5 2.5 0 0 1 16 10v6.5A2.5 2.5 0 0 1 13.5 19H7a2.5 2.5 0 0 1-2.5-2.5V10Zm2.5-.5a.5.5 0 0 0-.5.5v6.5a.5.5 0 0 0 .5.5h6.5a.5.5 0 0 0 .5-.5V10a.5.5 0 0 0-.5-.5H7Z" fill="currentColor" />
                    </svg>
                    <span>{copied ? "コピー済み" : "コピー"}</span>
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs leading-6 text-slate-500">連携コードをコピーし、公式LINEのトーク画面に貼り付けて送信してください。</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-base font-bold text-white shadow-sm">3</div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-slate-900">連携完了</div>
                <p className="mt-2 text-sm leading-7 text-slate-600">LINEに連携完了メッセージが届けば設定は完了です。</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center pt-1 sm:justify-start">
          <button type="button" onClick={onClose}
            className="inline-flex min-w-[180px] items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800">
            閉じる
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function StudyPage() {
  const params = useParams();
  const router = useRouter();
  const studyId = params?.studyId || DEFAULT_STUDY_ID;

  const [study, setStudy] = useState(null);
  const [studyLoading, setStudyLoading] = useState(true);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(firebaseReady);
  const [displayMonth, setDisplayMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState("");
  const [calendarView, setCalendarView] = useState("calendar");
  const [participantForm, setParticipantForm] = useState({ name: "", email: "", affiliation: "", note: "", preferredSlotIds: [], customFieldValues: {} });
  const [message, setMessage] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [lineGuideOpen, setLineGuideOpen] = useState(false);
  const [lineLinkInfo, setLineLinkInfo] = useState(null);
  const [toast, setToast] = useState(null);
  const [step, setStep] = useState(1); // 1 = pick slots, 2 = fill form
  const detailsRef = useRef(null);

  function showToast(msg, tone = "info") {
    setToast({ message: msg, tone });
    window.setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    document.title = "実験日程の予約 | LabLink";
  }, []);

  useEffect(() => {
    if (!firebaseReady) {
      const sample = normalizeStudyInfo({}, studyId);
      setStudy(sample);
      setStudyLoading(false);
      const sampleSlots = sortSlots(SAMPLE_SLOTS.filter((s) => s.studyId === studyId || studyId === DEFAULT_STUDY_ID));
      setSlots(sampleSlots);
      setSlotsLoading(false);
      return;
    }

    setStudyLoading(true);
    getDoc(doc(firestore, "studies", studyId))
      .then((snap) => {
        if (snap.exists()) {
          setStudy(normalizeStudyInfo(snap.data(), snap.id));
        } else {
          setStudy(normalizeStudyInfo({ title: "研究実験", status: "recruiting" }, studyId));
        }
      })
      .catch((err) => {
        console.error(err);
        setStudy(normalizeStudyInfo({}, studyId));
      })
      .finally(() => setStudyLoading(false));
  }, [studyId]);

  useEffect(() => {
    if (!firebaseReady) return;

    setSlotsLoading(true);
    const q = query(
      collection(firestore, "slots"),
      where("studyId", "==", studyId),
      where("isPublished", "==", true)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSlots(sortSlots(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
        setSlotsLoading(false);
      },
      (err) => {
        console.error(err);
        setSlotsLoading(false);
      }
    );
    return () => unsub();
  }, [studyId]);

  const sortedSlots = useMemo(() => sortSlots(slots), [slots]);
  const days = useMemo(() => getMonthGrid(displayMonth), [displayMonth]);
  const selectedDaySlots = useMemo(
    () => sortedSlots.filter((s) => s.date === selectedDate),
    [sortedSlots, selectedDate]
  );
  const monthSummary = useMemo(() => {
    const map = {};
    days.forEach((day) => { map[formatDateKey(day)] = getDaySummary(formatDateKey(day), sortedSlots); });
    return map;
  }, [days, sortedSlots]);
  const openSeats = useMemo(() => sortedSlots.reduce((sum, s) => sum + getSlotMetrics(s).remaining, 0), [sortedSlots]);

  const experimentInfo = useMemo(() => {
    if (!study) return normalizeExperimentInfo(DEFAULT_EXPERIMENT_INFO);
    return studyToExperimentInfo(study, DEFAULT_EXPERIMENT_INFO);
  }, [study]);

  function handleSelectDate(dateKey) {
    setSelectedDate(dateKey);
    window.setTimeout(() => {
      if (detailsRef.current) {
        detailsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        detailsRef.current.focus({ preventScroll: true });
      }
    }, 60);
  }

  function togglePreferredSlot(slotId) {
    setParticipantForm((prev) => {
      const ids = prev.preferredSlotIds;
      if (ids.includes(slotId)) return { ...prev, preferredSlotIds: ids.filter((id) => id !== slotId) };
      if (ids.length >= MAX_PREFERRED_SLOTS) {
        showToast(`希望枠は最大${MAX_PREFERRED_SLOTS}つまでです。`, "error");
        return prev;
      }
      return { ...prev, preferredSlotIds: [...ids, slotId] };
    });
  }

  function validateForm() {
    if (!participantForm.name.trim() || !participantForm.email.trim() || !participantForm.affiliation.trim() || participantForm.preferredSlotIds.length === 0) {
      setMessage("氏名、メールアドレス、所属・学年、希望枠は必須です。");
      showToast("必須項目を入力してください。", "error");
      return false;
    }
    if (!participantForm.email.includes("@") || !participantForm.email.includes(".")) {
      setMessage("メールアドレスの形式が正しくありません。");
      showToast("メールアドレスを確認してください。", "error");
      return false;
    }
    for (const field of (study?.customFields || [])) {
      if (!field.required) continue;
      const val = (participantForm.customFieldValues || {})[field.id];
      if (!val || (Array.isArray(val) ? val.length === 0 : !String(val).trim())) {
        setMessage(`「${field.label}」は必須項目です。`);
        showToast(`「${field.label}」を入力してください。`, "error");
        return false;
      }
    }
    return true;
  }

  function handleSubmitRequest(event) {
    event.preventDefault();
    if (!validateForm()) return;
    setConfirmOpen(true);
  }

  async function confirmSubmitRequest() {
    if (!validateForm()) return;
    try {
      setSubmitLoading(true);
      const lineLinkCode = generateLineLinkCode();
      if (firebaseReady) {
        const responseToken = crypto.randomUUID();
        await addDoc(collection(firestore, "requests"), {
          studyId,
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
      }
      setConfirmOpen(false);
      setParticipantForm({ name: "", email: "", affiliation: "", note: "", preferredSlotIds: [], customFieldValues: {} });
      setLineLinkInfo({ code: lineLinkCode });
      setLineGuideOpen(true);
      showToast("希望日時を送信しました。", "success");
    } catch (err) {
      console.error(err);
      setMessage("送信に失敗しました。時間をおいて再度お試しください。");
      showToast("送信に失敗しました。", "error");
    } finally {
      setSubmitLoading(false);
    }
  }

  function isDatePast(dateKey) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(`${dateKey}T00:00:00`) < today;
  }

  const mobileDateItems = days
    .filter((day) => day.getMonth() === displayMonth.getMonth())
    .map((day) => { const dateKey = formatDateKey(day); return { day, dateKey, summary: monthSummary[dateKey] }; })
    .filter(({ summary }) => (summary?.slotCount || 0) > 0);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0%,_#eff6ff_30%,_#f8fafc_60%,_#eef2ff_100%)] text-slate-900">
      <PublicSiteHeader
        onOpenHelp={() => setShowHelp(true)}
        onOpenAdmin={() => router.push("/")}
        onOpenHome={() => router.push("/")}
        onOpenReservation={() => router.push("/studies")}
        activePage="studies"
      />
      <ActionToast toast={toast} onClose={() => setToast(null)} />
      {showHelp ? <HelpModal onClose={() => setShowHelp(false)} /> : null}
      <ConfirmModal
        open={confirmOpen}
        participantForm={participantForm}
        sortedSlots={sortedSlots}
        onConfirm={confirmSubmitRequest}
        onClose={() => setConfirmOpen(false)}
        loading={submitLoading}
      />
      {lineGuideOpen && lineLinkInfo ? (
        <LineLinkGuideModal
          lineLinkInfo={lineLinkInfo}
          onClose={() => setLineGuideOpen(false)}
          onToast={(t) => setToast(t)}
        />
      ) : null}

      <div className="mx-auto max-w-5xl px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7">

        {/* ── Page header ──────────────────────────────────────────── */}
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-[0.16em] text-teal-600">RESERVATION</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {study?.title || "実験日程の予約"}
          </h1>
        </div>

        {!firebaseReady ? <div className="mb-5"><SetupNotice /></div> : null}

        {/* ── Step indicator ─────────────────────────────────────── */}
        <div className="mb-6 flex items-center">
          {[
            { n: 1, label: "実験を確認" },
            { n: 2, label: "日程を選ぶ" },
            { n: 3, label: "情報を入力" },
          ].map(({ n, label }, i) => (
            <React.Fragment key={n}>
              <div className="flex items-center gap-2">
                <div className={classNames(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  step > n ? "bg-teal-600 text-white" :
                  step === n ? "bg-slate-900 text-white" :
                  "border-2 border-slate-200 bg-white text-slate-400"
                )}>
                  {step > n ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                  ) : n}
                </div>
                <span className={classNames("hidden text-xs font-semibold sm:block", step >= n ? "text-slate-900" : "text-slate-400")}>
                  {label}
                </span>
              </div>
              {i < 2 && (
                <div className={classNames("mx-2 h-px flex-1 transition-colors", step > n ? "bg-teal-400" : "bg-slate-200")} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="space-y-5">

        {/* ════════════════════════════════════════════════════════
             STEP 1 — 実験を確認する
             ════════════════════════════════════════════════════════ */}
        {step === 1 ? (
          <div className="space-y-5">
            <button
              type="button"
              onClick={() => router.push("/studies")}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <ChevronLeft />
              募集中の実験に戻る
            </button>
            <ExperimentInfoCard
              info={experimentInfo}
              stats={{ openSeats }}
              openSlotCount={sortedSlots.length}
              setupMode={!firebaseReady}
            />
            <button
              type="button"
              onClick={() => { setStep(2); window.scrollTo(0, 0); }}
              className="w-full rounded-2xl bg-slate-900 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              日程を選ぶ →
            </button>
          </div>
        ) : slotsLoading ? (
          <LoadingCard title="公開中の日程を読み込んでいます..." />
        ) : step === 2 ? (
          /* ════════════════════════════════════════════════════════
             STEP 2 — 日程を選ぶ
             ════════════════════════════════════════════════════════ */
          <div className="space-y-5">
            <button
              type="button"
              onClick={() => { setStep(1); window.scrollTo(0, 0); }}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <ChevronLeft />
              実験情報に戻る
            </button>
            <Card>
              <SectionHeader
                eyebrow="STEP 2"
                title="希望日を選んでください"
                description="空きのある日付をタップすると、その日の時間帯が下に表示されます。最大5枠まで選べます。"
                action={
                  <div className="flex flex-col gap-3">
                    <div className="inline-flex w-full rounded-2xl border border-slate-200 bg-white p-1 sm:w-auto">
                      {["calendar", "list"].map((view) => (
                        <button key={view} type="button" onClick={() => setCalendarView(view)}
                          className={classNames(
                            "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition sm:flex-none",
                            calendarView === view ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                          )}>
                          {view === "calendar" ? "カレンダー" : "一覧"}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-[40px_1fr_40px] items-center gap-2">
                      <IconButton onClick={() => setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() - 1, 1))}><ChevronLeft /></IconButton>
                      <div className="text-center text-sm font-semibold text-slate-700">{formatMonthTitle(displayMonth)}</div>
                      <IconButton onClick={() => setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1))}><ChevronRight /></IconButton>
                    </div>
                  </div>
                }
              />

              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                {[["emerald","空きあり"],["amber","残りわずか"],["rose","満席"],["slate","公開枠なし / 終了"]].map(([tone,label]) => (
                  <StatusBadge key={tone} tone={tone}>{label}</StatusBadge>
                ))}
              </div>

              {calendarView === "calendar" ? (
                <>
                  <div className="mb-3 grid grid-cols-7 gap-1.5 text-center text-xs font-semibold">
                    {WEEK_LABELS.map((label, i) => (
                      <div key={label} className={classNames("py-1.5", i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : "text-slate-400")}>{label}</div>
                    ))}
                  </div>
                  {/* Desktop calendar */}
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
                      const isSunday = day.getDay() === 0;
                      const isSaturday = day.getDay() === 6;
                      const isPast = inMonth && isDatePast(dateKey);
                      return (
                        <button key={dateKey} onClick={() => !isPast && handleSelectDate(dateKey)}
                          disabled={isPast}
                          className={classNames(
                            "min-h-[100px] rounded-3xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                            isPast ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50" :
                            selected ? "border-slate-900 bg-slate-900 text-white shadow-lg" :
                            !inMonth ? "bg-slate-50 text-slate-400 border-slate-200" :
                            hasSlots ? allFull ? "border-rose-300 bg-rose-50 hover:border-rose-400 hover:shadow-sm" :
                              onlyFewLeft ? "border-amber-300 bg-amber-50 hover:border-amber-400 hover:shadow-sm" :
                              "border-emerald-300 bg-emerald-50 hover:border-emerald-400 hover:shadow-sm" :
                            "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                          )}>
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex items-center gap-1.5">
                              <div className={classNames("font-semibold", hasSlots ? "text-lg" : "text-sm",
                                isPast ? "text-slate-400" :
                                selected ? "text-white" : (holidayName || isSunday) ? "text-rose-600" : isSaturday ? "text-sky-600" : "text-slate-900")}>
                                {day.getDate()}
                              </div>
                              {holidayName && inMonth ? (
                                <span className={classNames("rounded-full px-1.5 py-0.5 text-[10px] font-medium", selected ? "bg-white/15 text-white" : "bg-rose-100 text-rose-700")}>祝</span>
                              ) : null}
                            </div>
                            {isPast && hasSlots ? <StatusBadge tone="slate">終了</StatusBadge> :
                             hasSlots ? allFull ? <StatusBadge tone="rose">満</StatusBadge> : onlyFewLeft ? <StatusBadge tone="amber">残</StatusBadge> : <StatusBadge tone="emerald">空</StatusBadge> : null}
                          </div>
                          <div className={classNames("mt-3 space-y-0.5 text-xs leading-5", selected ? "text-slate-200" : "text-slate-500")}>
                            <div>{summary?.slotCount || 0}枠</div>
                            <div>{hasSlots ? (isPast ? "受付終了" : `残${summary.totalRemaining}席`) : "なし"}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {/* Mobile calendar */}
                  <div className="grid grid-cols-7 gap-1.5 md:hidden">
                    {days.map((day) => {
                      const dateKey = formatDateKey(day);
                      const summary = monthSummary[dateKey];
                      const inMonth = day.getMonth() === displayMonth.getMonth();
                      const selected = dateKey === selectedDate;
                      const hasSlots = summary?.slotCount > 0;
                      const allFull = hasSlots && summary.fullCount === summary.slotCount;
                      const few = hasSlots && !allFull && summary.totalRemaining <= 1;
                      const holidayName = getJapaneseHolidayName(day);
                      const isSunday = day.getDay() === 0;
                      const isSaturday = day.getDay() === 6;
                      const isPast = inMonth && isDatePast(dateKey);
                      return (
                        <button key={dateKey} onClick={() => !isPast && handleSelectDate(dateKey)}
                          disabled={isPast}
                          className={classNames(
                            "aspect-square rounded-xl border text-center transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                            isPast ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-40" :
                            selected ? "border-slate-900 bg-slate-900 text-white shadow-md" :
                            !inMonth ? "border-slate-200 bg-slate-50 text-slate-300" :
                            hasSlots ? allFull ? "border-rose-200 bg-rose-100 text-rose-700" :
                              few ? "border-amber-200 bg-amber-100 text-amber-700" :
                              "border-emerald-200 bg-emerald-100 text-emerald-700" :
                            "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                          )}>
                          <div className={classNames(
                            "flex h-full items-center justify-center text-sm font-semibold",
                            isPast ? "text-slate-300" :
                            selected ? "text-white" : (holidayName || isSunday) ? "text-rose-600" : isSaturday ? "text-sky-600" : inMonth ? "text-slate-800" : "text-slate-300"
                          )}>
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
                    <div className="rounded-3xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">今月の公開中の枠はまだありません。</div>
                  ) : (
                    mobileDateItems.map(({ day, dateKey, summary }) => {
                      const selected = dateKey === selectedDate;
                      const allFull = summary.fullCount === summary.slotCount;
                      const few = !allFull && summary.totalRemaining <= 1;
                      const isPast = isDatePast(dateKey);
                      return (
                        <button key={dateKey} onClick={() => !isPast && handleSelectDate(dateKey)}
                          disabled={isPast}
                          className={classNames(
                            "w-full rounded-3xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                            isPast ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50" :
                            selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:border-slate-300"
                          )}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className={classNames("text-lg font-semibold", isPast ? "text-slate-400" : selected ? "text-white" : "text-slate-900")}>
                                {day.getDate()}日（{WEEK_LABELS[day.getDay()]}）
                              </div>
                              <div className={classNames("mt-1 text-sm", isPast ? "text-slate-400" : selected ? "text-slate-200" : "text-slate-500")}>
                                {isPast ? "受付終了" : `${summary.slotCount}枠 / 残り${summary.totalRemaining}席`}
                              </div>
                            </div>
                            <StatusBadge tone={isPast ? "slate" : allFull ? "rose" : few ? "amber" : "emerald"}>
                              {isPast ? "終了" : allFull ? "満枠" : few ? "残少" : "空き"}
                            </StatusBadge>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </Card>

            {/* Slot detail panel — appears when a date is selected */}
            {selectedDate && (
              <Card ref={detailsRef} tabIndex={-1} className="scroll-mt-6 focus:outline-none">
                <SectionHeader
                  eyebrow="時間帯"
                  title={`${formatJapaneseDate(selectedDate)} の空き枠`}
                  description="参加できる時間帯を選んでください。複数選択できます。"
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
                      const ended = hasSlotEnded(slot);
                      return (
                        <div key={slot.id}
                          className={classNames(
                            "rounded-3xl border p-4 transition",
                            ended ? "border-slate-100 bg-slate-50 opacity-60" :
                            selected ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-slate-50/80"
                          )}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className={classNames("text-base font-semibold", ended ? "text-slate-400" : "text-slate-900")}>{getSlotLabel(slot)}</div>
                                {ended ? (
                                  <StatusBadge tone="slate">受付終了</StatusBadge>
                                ) : (
                                  <StatusBadge tone={metrics.full ? "rose" : metrics.remaining <= 1 ? "amber" : "emerald"}>
                                    {metrics.full ? "満枠" : `残り${metrics.remaining}席`}
                                  </StatusBadge>
                                )}
                              </div>
                              <div className="mt-1 text-sm text-slate-500">{slot.location || "場所未設定"}</div>
                              {slot.note ? <div className="mt-0.5 text-sm text-slate-500">{slot.note}</div> : null}
                            </div>
                            <button type="button" onClick={() => !ended && togglePreferredSlot(slot.id)}
                              disabled={ended || (metrics.full && !selected)}
                              className={classNames(
                                "shrink-0 rounded-2xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                                ended
                                  ? "cursor-not-allowed bg-slate-100 text-slate-400"
                                  : selected
                                  ? "bg-sky-600 text-white hover:bg-sky-500"
                                  : metrics.full
                                  ? "cursor-not-allowed bg-slate-100 text-slate-400"
                                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                              )}>
                              {ended ? "終了" : selected ? "選択中 ✓" : "選択する"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            )}

            {/* Selected slots summary + Next button */}
            {participantForm.preferredSlotIds.length > 0 && (
              <div className="rounded-3xl border border-sky-200 bg-sky-50 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-sky-900">選択中の希望枠</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {participantForm.preferredSlotIds.map((slotId) => {
                        const slot = sortedSlots.find((s) => s.id === slotId);
                        if (!slot) return null;
                        return (
                          <button key={slotId} type="button" onClick={() => togglePreferredSlot(slotId)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-100">
                            {formatJapaneseDate(slot.date)} / {PERIOD_MAP[slot.periodKey]?.label || slot.periodKey}
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setStep(3); window.scrollTo(0, 0); }}
                  className="mt-4 w-full rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  この日程で申込情報を入力する →
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ════════════════════════════════════════════════════════
             STEP 3 — 情報を入力する
             ════════════════════════════════════════════════════════ */
          <div className="space-y-5">
            <button
              type="button"
              onClick={() => { setStep(2); window.scrollTo(0, 0); }}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <ChevronLeft />
              日程選択に戻る
            </button>

            {/* Selected slots review */}
            <div className="rounded-3xl border border-sky-200 bg-sky-50 p-5">
              <div className="text-xs font-semibold tracking-[0.16em] text-sky-600">選択した希望枠</div>
              <div className="mt-3 space-y-2">
                {participantForm.preferredSlotIds.map((slotId) => {
                  const slot = sortedSlots.find((s) => s.id === slotId);
                  if (!slot) return null;
                  return (
                    <div key={slotId} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                      <div className="text-sm font-medium text-slate-800">
                        {formatJapaneseDate(slot.date)} / {PERIOD_MAP[slot.periodKey]?.label || slot.periodKey}
                        {slot.location ? ` / ${slot.location}` : ""}
                      </div>
                      <button type="button" onClick={() => togglePreferredSlot(slotId)}
                        className="shrink-0 text-xs text-slate-400 transition hover:text-rose-500">
                        削除
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Form */}
            <Card>
              <SectionHeader
                eyebrow="STEP 2"
                title="申込情報を入力してください"
                description="確定連絡はメールでお送りします。受信箱と迷惑メールの両方をご確認ください。"
              />
              <form onSubmit={handleSubmitRequest} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    <div className="mb-1.5 text-slate-600">氏名 <span className="text-rose-500">*</span></div>
                    <input required value={participantForm.name}
                      onChange={(e) => setParticipantForm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200"
                      placeholder="例: 山田 太郎" autoComplete="name" />
                  </label>
                  <label className="text-sm">
                    <div className="mb-1.5 text-slate-600">メールアドレス <span className="text-rose-500">*</span></div>
                    <input required type="email" value={participantForm.email}
                      onChange={(e) => setParticipantForm((p) => ({ ...p, email: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200"
                      placeholder="example@xxx.com" autoComplete="email" />
                    <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
                      送信後は受信箱と迷惑メールの両方を確認してください。
                    </div>
                  </label>
                </div>
                <label className="block text-sm">
                  <div className="mb-1.5 text-slate-600">所属・学年 <span className="text-rose-500">*</span></div>
                  <input required value={participantForm.affiliation}
                    onChange={(e) => setParticipantForm((p) => ({ ...p, affiliation: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200"
                    placeholder="例: 情報理工学部 B4" />
                </label>
                <label className="block text-sm">
                  <div className="mb-1.5 text-slate-600">補足</div>
                  <textarea value={participantForm.note}
                    onChange={(e) => setParticipantForm((p) => ({ ...p, note: e.target.value }))}
                    className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200"
                    placeholder="例: 放課後希望 / VR酔いしやすい など" />
                </label>

                {(study?.customFields || []).map((field) => {
                  const val = (participantForm.customFieldValues || {})[field.id] ?? (field.type === "checkbox" ? [] : "");
                  const setVal = (v) => setParticipantForm((p) => ({ ...p, customFieldValues: { ...(p.customFieldValues || {}), [field.id]: v } }));
                  return (
                    <div key={field.id} className="block text-sm">
                      <div className="mb-1.5 text-slate-600">{field.label}{field.required ? <span className="ml-1 text-rose-500">*</span> : null}</div>
                      {field.type === "text" && <input required={field.required} value={val} onChange={(e) => setVal(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200" />}
                      {field.type === "textarea" && <textarea required={field.required} value={val} onChange={(e) => setVal(e.target.value)} className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200" />}
                      {field.type === "select" && <select required={field.required} value={val} onChange={(e) => setVal(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200"><option value="">選択してください</option>{(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select>}
                      {field.type === "radio" && <div className="flex flex-wrap gap-3">{(field.options || []).map((opt) => <label key={opt} className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name={`custom_${field.id}`} value={opt} checked={val === opt} onChange={() => setVal(opt)} className="h-4 w-4" />{opt}</label>)}</div>}
                      {field.type === "checkbox" && <div className="flex flex-wrap gap-3">{(field.options || []).map((opt) => <label key={opt} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" value={opt} checked={Array.isArray(val) && val.includes(opt)} onChange={(e) => { const next = Array.isArray(val) ? [...val] : []; setVal(e.target.checked ? [...next, opt] : next.filter((v) => v !== opt)); }} className="h-4 w-4 rounded" />{opt}</label>)}</div>}
                    </div>
                  );
                })}

                <PrivacyNote />

                {message ? (
                  <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>
                ) : null}

                {lineLinkInfo?.code ? (
                  <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-900">
                    <div className="font-semibold text-emerald-950">LINE連携コードを発行しました</div>
                    <button type="button" onClick={() => setLineGuideOpen(true)}
                      className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500">
                      公式LINEの案内をもう一度見る
                    </button>
                  </div>
                ) : null}

                <button
                  disabled={submitLoading}
                  className="w-full rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-60">
                  {submitLoading ? "送信中..." : "内容を確認して送信する →"}
                </button>
              </form>
            </Card>
          </div>
        )}
        </div>{/* end space-y-5 */}
      </div>
    </div>
  );
}
