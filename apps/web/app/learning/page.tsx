"use client";

/**
 * Learning Pathways Page (Sprint 18: Cooperative Depth & Governance — US6)
 *
 * Lists all 15 domain pathways with enrollment state and level progress
 * for the signed-in human. Enrollment posts to the API and the card
 * switches to a progress view linking to the per-domain detail page.
 */
import { useEffect, useState } from "react";

import { PathwayCard } from "@/components/pathways/PathwayCard";
import { useMyPathways, usePathwayMutations } from "@/hooks/useLearningPathways";
import { getHumanToken } from "@/lib/api";

const DOMAINS = [
  "poverty_reduction", "education_access", "healthcare_improvement",
  "environmental_protection", "food_security", "mental_health_wellbeing",
  "community_building", "disaster_response", "digital_inclusion",
  "human_rights", "clean_water_sanitation", "sustainable_energy",
  "gender_equality", "biodiversity_conservation", "elder_care",
] as const;

const LEVEL_NUMBERS: Record<string, number> = {
  observer: 1,
  participant: 2,
  specialist: 3,
  expert: 4,
};

interface PathwaySummary {
  domain: string;
  currentLevel: string;
}

export default function LearningPathwaysPage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const myPathwaysQuery = useMyPathways();
  const { enroll } = usePathwayMutations();

  const isLoggedIn = isMounted && !!getHumanToken();
  const pathways: PathwaySummary[] = myPathwaysQuery.data?.ok
    ? myPathwaysQuery.data.data?.pathways ?? []
    : [];
  const pathwayByDomain = new Map(pathways.map((p) => [p.domain, p]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Learning Pathways</h1>
      <p className="text-gray-600 mb-6">
        Enroll in domain pathways to build expertise. Progress through 4 levels by completing missions, reviewing peers, and reading case studies.
      </p>

      {isMounted && !isLoggedIn && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
          <a href="/auth/human/login" className="font-medium underline">Sign in</a> to enroll in pathways and track your progress.
        </div>
      )}

      {enroll.isError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Enrollment failed. Please try again.
        </div>
      )}

      {isLoggedIn && myPathwaysQuery.isLoading ? (
        <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
          Loading your pathways...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DOMAINS.map((domain) => {
            const enrolled = pathwayByDomain.get(domain);
            return (
              <PathwayCard
                key={domain}
                domain={domain}
                enrolled={!!enrolled}
                currentLevel={enrolled ? LEVEL_NUMBERS[enrolled.currentLevel] ?? 1 : 0}
                onEnroll={() => {
                  if (!isLoggedIn) {
                    window.location.href = "/auth/human/login";
                    return;
                  }
                  enroll.mutate(domain);
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
