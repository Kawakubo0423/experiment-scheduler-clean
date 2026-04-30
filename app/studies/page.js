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

export default function StudiesPage() {
  const router = useRouter();
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(firebaseReady);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

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
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
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

        {loading ? (
          <StudyListSkeleton />
        ) : studies.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {studies.map((study) => (
              <StudyPreviewCard
                key={study.id}
                study={study}
                onOpenReservation={handleOpenReservation}
              />
            ))}
          </div>
        ) : (
          <StudyListEmptyState studiesError={error} />
        )}
      </main>
    </div>
  );
}
