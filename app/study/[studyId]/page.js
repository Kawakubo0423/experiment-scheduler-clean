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
import { sortSlots, getSlotLabel, getSlotMetrics, getDaySummary } from "@/app/lib/slot-utils";
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

      <div className="mx-auto max-w-7xl px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7">
        <SelectedStudyContextCard study={study} onOpenHelp={() => setShowHelp(true)} />

        {!firebaseReady ? <div className="mb-6"><SetupNotice /></div> : null}

        <section className="mb-6">
          <ExperimentInfoCard
            info={experimentInfo}
            stats={{ openSeats }}
            openSlotCount={sortedSlots.length}
            setupMode={!firebaseReady}
          />
        </section>

        {slotsLoading ? (
          <LoadingCard title="公開中の日程を読み込んでいます..." />
        ) : (
          <section className="grid gap-6 xl:grid-cols-[1.28fr,0.92fr]">
            <Card>
              <SectionHeader
                eyebrow="CALENDAR"
                title="空いている日をカレンダーで選ぶ"
                description="表示方法を切り替えながら、見やすい形で日程を確認できます。"
                action={
                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
                    <div className="inline-flex w-full rounded-2xl border border-slate-200 bg-white p-1 sm:w-auto">
                      {["calendar", "list"].map((view) => (
                        <button key={view} type="button" onClick={() => setCalendarView(view)}
                          className={classNames("flex-1 rounded-xl px-3 py-2 text-sm font-medium transition sm:flex-none",
                            calendarView === view ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50")}>
                          {view === "calendar" ? "カレンダー表示" : "一覧表示"}
                        </button>
                      ))}
                    </div>
                    <div className="grid w-full grid-cols-[56px_1fr_56px] items-center gap-2 sm:w-auto sm:min-w-[260px]">
                      <IconButton onClick={() => setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() - 1, 1))}><ChevronLeft /></IconButton>
                      <div className="text-center text-sm font-semibold text-slate-700">{formatMonthTitle(displayMonth)}</div>
                      <IconButton onClick={() => setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1))}><ChevronRight /></IconButton>
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
                {[["emerald","空きあり"],["amber","残りわずか"],["rose","満席"],["slate","公開枠なし"]].map(([tone,label]) => (
                  <span key={tone} className={classNames("inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium",
                    tone === "emerald" ? "border-emerald-200 bg-emerald-100 text-emerald-700" :
                    tone === "amber" ? "border-amber-200 bg-amber-100 text-amber-700" :
                    tone === "rose" ? "border-rose-200 bg-rose-100 text-rose-700" :
                    "border-slate-200 bg-slate-100 text-slate-700")}>{label}</span>
                ))}
              </div>

              {calendarView === "calendar" ? (
                <>
                  <div className="mb-3 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-400">
                    {WEEK_LABELS.map((label, i) => (
                      <div key={label} className={classNames("py-2", i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : "text-slate-400")}>{label}</div>
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
                      const isSunday = day.getDay() === 0;
                      const isSaturday = day.getDay() === 6;
                      return (
                        <button key={dateKey} onClick={() => handleSelectDate(dateKey)}
                          className={classNames("min-h-[114px] rounded-3xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                            selected ? "border-slate-900 bg-slate-900 text-white shadow-lg" :
                            !inMonth ? "bg-slate-50 text-slate-400 border-slate-200" :
                            hasSlots ? allFull ? "border-rose-300 bg-rose-50 hover:border-rose-400 hover:shadow-sm" :
                              onlyFewLeft ? "border-amber-300 bg-amber-50 hover:border-amber-400 hover:shadow-sm" :
                              "border-emerald-300 bg-emerald-50 hover:border-emerald-400 hover:shadow-sm" :
                            "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm")}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className={classNames("font-semibold", hasSlots ? "text-lg" : "text-sm",
                                selected ? "text-white" : (holidayName || isSunday) ? "text-rose-600" : isSaturday ? "text-sky-600" : "text-slate-900")}>
                                {day.getDate()}
                              </div>
                              {holidayName && inMonth ? (
                                <span className={classNames("rounded-full px-2 py-0.5 text-[10px] font-medium", selected ? "bg-white/15 text-white" : "bg-rose-100 text-rose-700")}>祝</span>
                              ) : null}
                            </div>
                            {hasSlots ? allFull ? <StatusBadge tone="rose">満枠</StatusBadge> : onlyFewLeft ? <StatusBadge tone="amber">残少</StatusBadge> : <StatusBadge tone="emerald">空き</StatusBadge> : null}
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
                      const isSunday = day.getDay() === 0;
                      const isSaturday = day.getDay() === 6;
                      return (
                        <button key={dateKey} onClick={() => handleSelectDate(dateKey)}
                          className={classNames("aspect-square rounded-2xl border text-center transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                            selected ? "border-slate-900 bg-slate-900 text-white shadow-md" :
                            !inMonth ? "border-slate-200 bg-slate-50 text-slate-300" :
                            hasSlots ? allFull ? "border-rose-200 bg-rose-100 text-rose-700" :
                              few ? "border-amber-200 bg-amber-100 text-amber-700" :
                              "border-emerald-200 bg-emerald-100 text-emerald-700" :
                            "border-slate-200 bg-white text-slate-800 hover:border-slate-300")}>
                          <div className={classNames("flex h-full items-center justify-center text-base font-semibold",
                            selected ? "text-white" : (holidayName || isSunday) ? "text-rose-600" : isSaturday ? "text-sky-600" : inMonth ? "text-slate-800" : "text-slate-300")}>
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
                      return (
                        <button key={dateKey} onClick={() => handleSelectDate(dateKey)}
                          className={classNames("w-full rounded-3xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                            selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:border-slate-300")}>
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
                            <button type="button" onClick={() => togglePreferredSlot(slot.id)} disabled={metrics.full && !selected}
                              className={classNames("rounded-2xl px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                                selected ? "bg-slate-900 text-white" : metrics.full ? "cursor-not-allowed bg-slate-100 text-slate-400" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100")}>
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
                        <input required value={participantForm.name} onChange={(e) => setParticipantForm((p) => ({ ...p, name: e.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200"
                          placeholder="例: 山田 太郎" autoComplete="name" />
                      </label>
                      <label className="text-sm">
                        <div className="mb-1.5 text-slate-600">メールアドレス <span className="text-rose-500">*</span></div>
                        <input required type="email" value={participantForm.email} onChange={(e) => setParticipantForm((p) => ({ ...p, email: e.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200"
                          placeholder="example@xxx.com" autoComplete="email" />
                        <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
                          送信後は、受信箱と迷惑メールの両方を必ず確認してください。
                        </div>
                      </label>
                    </div>
                    <label className="block text-sm">
                      <div className="mb-1.5 text-slate-600">所属・学年 <span className="text-rose-500">*</span></div>
                      <input required value={participantForm.affiliation} onChange={(e) => setParticipantForm((p) => ({ ...p, affiliation: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-sky-200"
                        placeholder="例: 情報理工学部 B4" />
                    </label>
                    <label className="block text-sm">
                      <div className="mb-1.5 text-slate-600">補足</div>
                      <textarea value={participantForm.note} onChange={(e) => setParticipantForm((p) => ({ ...p, note: e.target.value }))}
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

                    <div className="rounded-3xl bg-slate-50 p-4">
                      <div className="text-sm font-medium text-slate-700">選択中の希望枠 <span className="text-rose-500">*</span></div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {participantForm.preferredSlotIds.length === 0 ? (
                          <div className="text-sm text-slate-500">まだ選択されていません。</div>
                        ) : (
                          participantForm.preferredSlotIds.map((slotId) => {
                            const slot = sortedSlots.find((s) => s.id === slotId);
                            if (!slot) return null;
                            return (
                              <button key={slotId} type="button" onClick={() => togglePreferredSlot(slotId)}
                                className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700">
                                {formatJapaneseDate(slot.date)} / {PERIOD_MAP[slot.periodKey].label} ×
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <PrivacyNote />

                    {message ? (
                      <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{message}</div>
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

                    <button disabled={submitLoading}
                      className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-60">
                      {submitLoading ? "送信中..." : "希望日時を送信する"}
                    </button>
                  </form>
                </Card>
              ) : (
                <Card className="border-dashed border-slate-200 bg-white/75">
                  <SectionHeader
                    eyebrow="FORM"
                    title="希望日時を選択すると申込フォームが表示されます"
                    description="まず左側のカレンダーまたは詳細枠から参加できる日程を選択してください。"
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
