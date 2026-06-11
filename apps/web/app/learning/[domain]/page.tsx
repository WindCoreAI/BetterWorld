"use client";

/**
 * Pathway Progress Page (Sprint 18: Cooperative Depth & Governance — US6)
 *
 * Per-domain pathway detail: 4-level ladder with requirement progress
 * toward the next level. Offers enrollment if not yet enrolled.
 */
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PathwayProgress } from "@/components/pathways/PathwayProgress";
import { usePathwayProgress, usePathwayMutations } from "@/hooks/useLearningPathways";
import { getHumanToken } from "@/lib/api";

const LEVEL_ORDER = ["observer", "participant", "specialist", "expert"] as const;

const LEVEL_NAMES: Record<string, string> = {
  observer: "Observer",
  participant: "Participant",
  specialist: "Specialist",
  expert: "Expert",
};

const REQUIREMENT_LABELS: Record<string, string> = {
  missions: "Missions completed",
  missionTypes: "Mission types",
  reviews: "Peer reviews",
  accuracy: "Review accuracy (%)",
  debates: "Debates participated",
  crossCity: "Cross-city missions",
  caseStudies: "Case studies read",
};

interface ProgressData {
  currentLevel: string;
  nextLevel: string | null;
  progressPercent: number;
  requirements: Record<string, { current: number; required: number; met: boolean }>;
}

function buildLevels(progress: ProgressData) {
  const currentIdx = LEVEL_ORDER.indexOf(progress.currentLevel as (typeof LEVEL_ORDER)[number]);

  const nextLevelRequirements = Object.entries(progress.requirements)
    .filter(([, req]) => req.required > 0)
    .map(([key, req]) => ({
      label: REQUIREMENT_LABELS[key] ?? key,
      current: Math.round(req.current),
      target: req.required,
    }));

  return LEVEL_ORDER.map((level, idx) => ({
    level: idx + 1,
    name: LEVEL_NAMES[level] ?? level,
    completed: idx <= currentIdx,
    current: progress.nextLevel !== null && idx === currentIdx + 1,
    requirements: progress.nextLevel !== null && idx === currentIdx + 1 ? nextLevelRequirements : [],
  }));
}

export default function PathwayDetailPage() {
  const params = useParams<{ domain: string }>();
  const domain = params?.domain;

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const progressQuery = usePathwayProgress(domain);
  const { enroll } = usePathwayMutations();

  const isLoggedIn = isMounted && !!getHumanToken();
  const displayName = (domain ?? "").replace(/_/g, " ");

  if (!isMounted || progressQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-2 capitalize">{displayName} Pathway</h1>
        <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
          Loading pathway progress...
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-2 capitalize">{displayName} Pathway</h1>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
          <a href="/auth/human/login" className="font-medium underline">Sign in</a> to view your pathway progress.
        </div>
      </div>
    );
  }

  const response = progressQuery.data;

  if (!response?.ok) {
    const notEnrolled = (response as { error?: string } | undefined)?.error === "NOT_ENROLLED";
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-2 capitalize">{displayName} Pathway</h1>
        {notEnrolled ? (
          <div className="rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-600 mb-4">
              You are not enrolled in this pathway yet.
            </p>
            <button
              onClick={() => domain && enroll.mutate(domain)}
              disabled={enroll.isPending}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {enroll.isPending ? "Enrolling..." : "Enroll Now"}
            </button>
            {enroll.isError && (
              <p className="mt-3 text-xs text-red-600">Enrollment failed. Please try again.</p>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Failed to load pathway progress. Please try again later.
          </div>
        )}
      </div>
    );
  }

  const progress = response.data as ProgressData;
  const levels = buildLevels(progress);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <a href="/learning" className="text-sm text-blue-600 hover:text-blue-800">
          ← All Pathways
        </a>
        {progress.nextLevel && (
          <span className="text-sm text-gray-500">
            {progress.progressPercent}% toward {LEVEL_NAMES[progress.nextLevel] ?? progress.nextLevel}
          </span>
        )}
      </div>
      <PathwayProgress domain={domain ?? ""} levels={levels} />
      {!progress.nextLevel && (
        <p className="mt-4 text-sm text-green-700">
          You have reached the highest level in this pathway. Congratulations!
        </p>
      )}
    </div>
  );
}
