"use client";

/**
 * Challenge Detail Page (Sprint 18: Cooperative Depth & Governance — US8)
 *
 * Live per-capita leaderboard, personal progress for participants,
 * and a join action that assigns the user to their city group.
 */
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ChallengeProgress } from "@/components/challenges/ChallengeProgress";
import { useChallenge, useChallengeProgress, useChallengeMutations } from "@/hooks/useChallenges";
import { getHumanToken } from "@/lib/api";

interface LeaderboardEntry {
  groupValue: string;
  groupType: string;
  totalScore: number;
  participantCount: number;
  perCapitaScore: number;
}

interface ChallengeDetail {
  id: string;
  title: string;
  description: string | null;
  challengeType: string;
  status: string;
  metric: string;
  startDate: string;
  endDate: string;
}

function JoinSection({
  challenge,
  isLoggedIn,
  hasJoined,
  myGroupValue,
}: {
  challenge: ChallengeDetail;
  isLoggedIn: boolean;
  hasJoined: boolean;
  myGroupValue: string | undefined;
}) {
  const { join } = useChallengeMutations();
  const canJoin = isLoggedIn && !hasJoined && (challenge.status === "active" || challenge.status === "upcoming");

  return (
    <div className="mt-4 mb-4">
      {challenge.description && <p className="mb-4 text-sm text-gray-700">{challenge.description}</p>}

      {canJoin && (
        <button
          onClick={() => join.mutate(challenge.id)}
          disabled={join.isPending}
          className="mb-4 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {join.isPending ? "Joining..." : "Join Challenge"}
        </button>
      )}

      {join.isError && (
        <p className="mb-4 text-xs text-red-600">Could not join the challenge. Please try again.</p>
      )}

      {!isLoggedIn && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
          <a href="/auth/human/login" className="font-medium underline">Sign in</a> to join this challenge.
        </div>
      )}

      {hasJoined && myGroupValue && (
        <p className="mb-4 text-sm text-green-700">
          You are competing for <span className="font-medium">{myGroupValue}</span>.
        </p>
      )}
    </div>
  );
}

function buildMyProgress(
  myGroup: { score: string; groupValue: string } | undefined,
  rankedLeaderboard: LeaderboardEntry[],
): { score: number; rank: number } | undefined {
  if (!myGroup) return undefined;
  const rank = rankedLeaderboard.findIndex((e) => e.groupValue === myGroup.groupValue) + 1;
  return {
    score: parseFloat(myGroup.score) || 0,
    rank: rank > 0 ? rank : rankedLeaderboard.length + 1,
  };
}

export default function ChallengeDetailPage() {
  const params = useParams<{ id: string }>();
  const challengeId = params?.id;

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const challengeQuery = useChallenge(challengeId);
  const progressQuery = useChallengeProgress(challengeId);

  const isLoggedIn = isMounted && !!getHumanToken();

  if (challengeQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
          Loading challenge...
        </div>
      </div>
    );
  }

  if (!challengeQuery.data?.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <a href="/challenges" className="text-sm text-blue-600 hover:text-blue-800">← All Challenges</a>
        <div className="mt-4 rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
          Challenge not found.
        </div>
      </div>
    );
  }

  const { challenge, leaderboard } = challengeQuery.data.data as {
    challenge: ChallengeDetail;
    leaderboard: LeaderboardEntry[];
  };

  // Rank groups by per-capita score (the official challenge metric)
  const rankedLeaderboard = [...leaderboard].sort((a, b) => b.perCapitaScore - a.perCapitaScore);
  const displayLeaderboard = rankedLeaderboard.map((entry) => ({
    groupValue: entry.groupValue,
    score: entry.perCapitaScore,
    participantCount: entry.participantCount,
  }));

  const hasJoined = progressQuery.data?.ok === true;
  const myGroup = hasJoined
    ? (progressQuery.data?.data as { score: string; groupValue: string } | undefined)
    : undefined;
  const myProgress = buildMyProgress(myGroup, rankedLeaderboard);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <a href="/challenges" className="text-sm text-blue-600 hover:text-blue-800">← All Challenges</a>

      {isMounted && (
        <JoinSection
          challenge={challenge}
          isLoggedIn={isLoggedIn}
          hasJoined={hasJoined}
          myGroupValue={myGroup?.groupValue}
        />
      )}

      <ChallengeProgress
        challenge={challenge}
        leaderboard={displayLeaderboard}
        myProgress={myProgress}
      />
    </div>
  );
}
