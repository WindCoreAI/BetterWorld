"use client";

/**
 * Cooperative Achievements Page (Sprint 18: Cooperative Depth & Governance — US10)
 *
 * Gallery of cooperative achievements earned by groups working together,
 * plus the signed-in user's own achievements.
 */
import { useEffect, useState } from "react";

import { useCooperativeAchievements, useMyAchievements } from "@/hooks/useAchievements";
import { getHumanToken } from "@/lib/api";

interface Achievement {
  id: string;
  achievementType: string;
  title: string;
  description: string | null;
  earnedAt: string;
}

const TYPE_STYLES: Record<string, string> = {
  first_responders: "bg-red-50 text-red-600",
  cross_city_bridge: "bg-blue-50 text-blue-600",
  perfect_consensus: "bg-green-50 text-green-600",
  domain_sweep: "bg-purple-50 text-purple-600",
  growth_partners: "bg-yellow-50 text-yellow-700",
};

function AchievementCard({ achievement }: { achievement: Achievement }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-sm font-semibold">{achievement.title}</h3>
        <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs capitalize ${TYPE_STYLES[achievement.achievementType] ?? "bg-gray-50 text-gray-600"}`}>
          {achievement.achievementType.replace(/_/g, " ")}
        </span>
      </div>
      {achievement.description && (
        <p className="text-xs text-gray-600 mb-2">{achievement.description}</p>
      )}
      <span className="text-xs text-gray-400">
        Earned {new Date(achievement.earnedAt).toLocaleDateString()}
      </span>
    </div>
  );
}

export default function AchievementsPage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const communityQuery = useCooperativeAchievements();
  const mineQuery = useMyAchievements();

  const isLoggedIn = isMounted && !!getHumanToken();
  const communityAchievements: Achievement[] = communityQuery.data?.ok
    ? communityQuery.data.data?.items ?? []
    : [];
  const myAchievements: Achievement[] = mineQuery.data?.ok
    ? mineQuery.data.data?.achievements ?? []
    : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Cooperative Achievements</h1>
      <p className="text-gray-600 mb-6">
        Achievements earned by working together — first responders, cross-city bridges,
        perfect consensus, domain sweeps, and growth partners.
      </p>

      {isLoggedIn && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Your Achievements</h2>
          {mineQuery.isLoading ? (
            <p className="text-sm text-gray-500">Loading your achievements...</p>
          ) : myAchievements.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
              No cooperative achievements yet. Team up on missions, reviews, and
              cross-city work to earn them together.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {myAchievements.map((achievement) => (
                <AchievementCard key={achievement.id} achievement={achievement} />
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Recently Earned in the Community</h2>
        {communityQuery.isLoading ? (
          <p className="text-sm text-gray-500">Loading achievements...</p>
        ) : communityAchievements.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            No achievements earned yet. They are detected weekly from cooperative activity.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {communityAchievements.map((achievement) => (
              <AchievementCard key={achievement.id} achievement={achievement} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
