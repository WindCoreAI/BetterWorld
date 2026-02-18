"use client";

/**
 * Growth Dashboard Page (Sprint 17: Community Identity & Visible Growth)
 *
 * "Your Growth Journey" -- reputation trend, tier progress, skills,
 * domain expertise, personal milestones, and next goals.
 */
import { useEffect, useState } from "react";

import { DomainExpertise } from "../../../src/components/growth/DomainExpertise";
import { NextGoals } from "../../../src/components/growth/NextGoals";
import { ReputationTrend } from "../../../src/components/growth/ReputationTrend";
import { SkillMetrics } from "../../../src/components/growth/SkillMetrics";
import { Card } from "../../../src/components/ui";
import { useGrowthJourney } from "../../../src/hooks/useGrowthJourney";

export default function GrowthDashboardPage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const { data, isLoading, error } = useGrowthJourney();

  if (!isMounted || isLoading) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Your Growth Journey</h1>
        <p className="text-gray-500">Loading your growth data...</p>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Your Growth Journey</h1>
        <Card className="p-6 text-center">
          <p className="text-gray-500">
            Welcome! Start contributing to see your growth journey.
            Complete missions, submit evidence, and review peers to build your reputation.
          </p>
        </Card>
      </div>
    );
  }

  const journey = data.data;

  return (
    <div className="mx-auto max-w-5xl p-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Your Growth Journey</h1>

      {/* Current Tier */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-gray-500">Current Tier</span>
            <h2 className="text-xl font-bold capitalize text-gray-900">{journey.currentTier.tier}</h2>
            <span className="text-sm text-gray-500">{journey.currentTier.score} points</span>
          </div>
          {journey.currentTier.nextTier && (
            <div className="text-right">
              <span className="text-xs text-gray-400">Next: {journey.currentTier.nextTier}</span>
              <div className="w-32 bg-gray-200 rounded-full h-2 mt-1">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{ width: `${journey.currentTier.progressPercent}%` }}
                />
              </div>
              <span className="text-xs text-gray-400">{journey.currentTier.progressPercent}%</span>
            </div>
          )}
        </div>
      </Card>

      <ReputationTrend trend={journey.reputationTrend} />
      <SkillMetrics skills={journey.skills} />

      <div className="grid gap-6 md:grid-cols-2">
        <DomainExpertise domains={journey.domainExpertise} />
        <NextGoals goals={journey.nextGoals} />
      </div>

      {/* Personal Milestones */}
      {journey.personalMilestones && journey.personalMilestones.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-lg mb-3">Personal Milestones</h3>
          <ul className="space-y-2">
            {journey.personalMilestones.map((m: { type: string; value: string; date: string }, i: number) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-gray-700 capitalize">{m.type.replace(/_/g, " ")}: {m.value}</span>
                <span className="text-xs text-gray-400">{new Date(m.date).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
