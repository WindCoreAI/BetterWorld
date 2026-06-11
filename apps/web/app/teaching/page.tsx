"use client";

/**
 * Teaching Page (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * Teaching activity summary (mentorships, help, case studies, welcomes,
 * Teacher badge), the public teaching leaderboard, and welcome
 * ambassador stats for assigned ambassadors.
 */
import { useEffect, useState } from "react";

import { WelcomeCard } from "@/components/ambassadors/WelcomeCard";
import { useHumanAuth } from "@/hooks/useHumanAuth";
import { useTeachingMe, useTeachingLeaderboard, useAmbassadorMe } from "@/hooks/useTeaching";
import { getHumanToken } from "@/lib/api";

interface TeachingPoints {
  total: number;
  mentorshipCompletions: number;
  helpInteractions: number;
  caseStudyContributions: number;
  ambassadorWelcomes: number;
  hasTeacherBadge: boolean;
}

interface LeaderboardEntry {
  humanId: string;
  displayName: string;
  completedMentorships: number;
}

function TeachingSummary({ points }: { points: TeachingPoints }) {
  const cells = [
    { label: "Mentorships Completed", value: points.mentorshipCompletions },
    { label: "Help Interactions", value: points.helpInteractions },
    { label: "Case Study Contributions", value: points.caseStudyContributions },
    { label: "Newcomers Welcomed", value: points.ambassadorWelcomes },
  ];
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-lg font-semibold">Your Teaching Activity</h2>
        {points.hasTeacherBadge && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            🎓 Teacher Badge
          </span>
        )}
      </div>
      <div className="mb-4 rounded-lg border border-gray-200 p-4">
        <p className="text-xs text-gray-500">Total Teaching Points</p>
        <p className="text-2xl font-bold">{points.total}</p>
        {!points.hasTeacherBadge && (
          <p className="mt-1 text-xs text-gray-400">
            Keep mentoring, helping, and welcoming newcomers to earn the Teacher badge.
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500">{cell.label}</p>
            <p className="text-lg font-bold">{cell.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LeaderboardSection({ isLoading, leaderboard }: { isLoading: boolean; leaderboard: LeaderboardEntry[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Teaching Leaderboard</h2>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading leaderboard...</p>
      ) : leaderboard.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          No completed mentorships yet. Become a mentor on the{" "}
          <a href="/mentorship" className="text-blue-600 underline">Mentorship</a> page.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
          {leaderboard.map((entry, i) => (
            <div key={entry.humanId} className="flex items-center justify-between p-3">
              <span className="text-sm">
                <span className="mr-2 font-medium text-gray-400">#{i + 1}</span>
                {entry.displayName}
              </span>
              <span className="text-sm text-gray-600">
                {entry.completedMentorships} mentorship{entry.completedMentorships === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function TeachingPage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const { user } = useHumanAuth();
  const teachingQuery = useTeachingMe();
  const leaderboardQuery = useTeachingLeaderboard();
  const ambassadorQuery = useAmbassadorMe();

  const isLoggedIn = isMounted && !!getHumanToken();
  const points: TeachingPoints | null = teachingQuery.data?.ok
    ? (teachingQuery.data.data as TeachingPoints)
    : null;
  const leaderboard: LeaderboardEntry[] = leaderboardQuery.data?.ok
    ? leaderboardQuery.data.data?.leaderboard ?? []
    : [];
  const ambassador = ambassadorQuery.data?.ok
    ? (ambassadorQuery.data.data as { totalWelcomes: number; monthlyTokensEarned: number; monthlyLimit: number })
    : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Teaching</h1>
      <p className="text-gray-600 mb-6">
        Mentoring, helping on missions, contributing to case studies, and welcoming
        newcomers all earn teaching rewards — and the Teacher badge.
      </p>

      {isMounted && !isLoggedIn && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
          <a href="/auth/human/login" className="font-medium underline">Sign in</a> to see your teaching activity.
        </div>
      )}

      {isLoggedIn && points && <TeachingSummary points={points} />}

      {isLoggedIn && ambassador && ambassador.totalWelcomes > 0 && (
        <section className="mb-8">
          <WelcomeCard
            ambassadorName={user?.displayName ?? "Ambassador"}
            totalWelcomes={ambassador.totalWelcomes}
            monthlyTokensEarned={ambassador.monthlyTokensEarned}
            monthlyLimit={ambassador.monthlyLimit}
          />
        </section>
      )}

      <LeaderboardSection isLoading={leaderboardQuery.isLoading} leaderboard={leaderboard} />
    </div>
  );
}
