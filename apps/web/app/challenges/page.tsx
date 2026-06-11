"use client";

/**
 * Challenges Page (Sprint 18: Cooperative Depth & Governance — US8)
 *
 * Active cross-group challenges (city-vs-city, domain sprints) with
 * per-capita scoring. Join from the detail page.
 */
import { useChallenges } from "@/hooks/useChallenges";

interface ChallengeSummary {
  id: string;
  challengeType: string;
  title: string;
  description: string | null;
  groups: string[];
  metric: string;
  targetValue: string | null;
  startDate: string;
  endDate: string;
  status: string;
}

const CHALLENGE_TYPE_LABELS: Record<string, string> = {
  city_vs_city: "City vs City",
  domain_sprint: "Domain Sprint",
};

export default function ChallengesPage() {
  const challengesQuery = useChallenges();

  const challenges: ChallengeSummary[] = challengesQuery.data?.ok
    ? challengesQuery.data.data?.items ?? []
    : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Challenges</h1>
      <p className="text-gray-600 mb-6">
        Friendly competitions between cities and domains. Scores are per-capita,
        so small groups compete on equal footing with large ones.
      </p>

      <div className="space-y-4">
        {challengesQuery.isLoading && (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            Loading challenges...
          </div>
        )}

        {!challengesQuery.isLoading && challenges.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No active challenges right now. Check back soon!
          </div>
        )}

        {challenges.map((challenge) => (
          <a
            key={challenge.id}
            href={`/challenges/${challenge.id}`}
            className="block rounded-lg border border-gray-200 p-4 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-sm font-semibold">{challenge.title}</h3>
              <span className="ml-2 shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                {CHALLENGE_TYPE_LABELS[challenge.challengeType] ?? challenge.challengeType.replace(/_/g, " ")}
              </span>
            </div>
            {challenge.description && (
              <p className="text-xs text-gray-600 line-clamp-2 mb-2">{challenge.description}</p>
            )}
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span>
                {new Date(challenge.startDate).toLocaleDateString()} – {new Date(challenge.endDate).toLocaleDateString()}
              </span>
              <span className="capitalize">Metric: {challenge.metric.replace(/_/g, " ")}</span>
              {challenge.groups.length > 0 && <span>{challenge.groups.join(" vs ")}</span>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
