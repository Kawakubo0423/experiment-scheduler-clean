"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { firestore, firebaseReady } from "@/app/lib/firebase";
import { normalizeStudyInfo } from "@/app/lib/study-utils";
import { SAMPLE_STUDIES } from "@/app/lib/constants";
import {
  PublicSiteHeader,
  StudyPreviewCard,
  StudyListEmptyState,
  StudyListSkeleton,
  ActionToast,
} from "@/app/components/shared";

const FILTERS = [
  { key: "all", label: "すべて" },
  { key: "rewarded", label: "謝礼あり" },
];

const SORT_OPTIONS = [
  { key: "newest", label: "新着順" },
  { key: "duration_asc", label: "所要時間: 短い順" },
  { key: "reward_desc", label: "謝礼: 高い順" },
];

function parseDurationMinutes(str) {
  if (!str || str === "未設定") return Infinity;
  const m = str.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity;
}

function parseRewardAmount(str) {
  if (!str || str === "未設定" || str.trim() === "") return 0;
  const m = str.replace(/,/g, "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

function applyFilter(studies, filterKey) {
  if (filterKey === "rewarded") {
    return studies.filter((s) => s.reward && s.reward !== "未設定" && s.reward.trim() !== "");
  }
  return studies;
}

function applySort(studies, sortKey) {
  const arr = [...studies];
  if (sortKey === "duration_asc") {
    return arr.sort((a, b) => parseDurationMinutes(a.duration) - parseDurationMinutes(b.duration));
  }
  if (sortKey === "reward_desc") {
    return arr.sort((a, b) => parseRewardAmount(b.reward) - parseRewardAmount(a.reward));
  }
  return arr;
}

export default function StudiesPage() {
  const router = useRouter();
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(firebaseReady);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [sortKey, setSortKey] = useState("newest");

  useEffect(() => {
    document.title = "募集中の実験 | LabLink";
  }, []);

  useEffect(() => {
    if (!firebaseReady) {
      setStudies(SAMPLE_STUDIES);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(firestore, "studies"), where("isPublished", "==", true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs
          .map((d) => normalizeStudyInfo(d.data(), d.id))
          .sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            if (aTime !== bTime) return bTime - aTime;
            return (a.title || "").localeCompare(b.title || "", "ja");
          });
        setStudies(next);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error(err);
        setStudies([]);
        setLoading(false);
        setError("実験一覧の取得に失敗しました。");
      }
    );
    return () => unsub();
  }, []);

  function handleOpenReservation(study) {
    router.push(`/study/${encodeURIComponent(study.id)}`);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ccfbf1_0%,_#eff6ff_30%,_#f8fafc_60%,_#eef2ff_100%)] text-slate-900">
      <PublicSiteHeader
        onOpenHelp={() => {}}
        onOpenAdmin={() => router.push("/")}
        onOpenHome={() => router.push("/")}
        onOpenReservation={() => {}}
        activePage="studies"
      />

      <ActionToast toast={toast} onClose={() => setToast(null)} />

      <main className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <section className="mb-8 rounded-[34px] border border-white/80 bg-white/85 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-teal-700">
                STUDIES
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">募集中の実験</h1>
              <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
                現在公開されている実験募集です。参加したい実験を選ぶと、その実験専用の予約ページに進みます。
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              トップへ戻る
            </button>
          </div>
        </section>

        {!loading && studies.length > 0 ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setActiveFilter(f.key)}
                  className={
                    activeFilter === f.key
                      ? "rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm"
                      : "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  }
                >
                  {f.label}
                  {f.key !== "all" ? (
                    <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${activeFilter === f.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                      {applyFilter(studies, f.key).length}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">並べ替え</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {loading ? (
          <StudyListSkeleton />
        ) : applySort(applyFilter(studies, activeFilter), sortKey).length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {applySort(applyFilter(studies, activeFilter), sortKey).map((study, i) => (
              <StudyPreviewCard
                key={study.id}
                study={study}
                colorIndex={i}
                onOpenReservation={handleOpenReservation}
              />
            ))}
          </div>
        ) : studies.length > 0 ? (
          <div className="rounded-[32px] border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center">
            <p className="text-sm text-slate-500">このフィルターに該当する実験はありません。</p>
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              すべて表示
            </button>
          </div>
        ) : (
          <StudyListEmptyState studiesError={error} />
        )}
      </main>
    </div>
  );
}
