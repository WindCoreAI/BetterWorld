"use client";

import { useState } from "react";

import { LeaderboardFilters } from "../../src/components/leaderboards/LeaderboardFilters";
import { LeaderboardTable } from "../../src/components/leaderboards/LeaderboardTable";
import { LeaderboardTypeSwitcher } from "../../src/components/leaderboards/LeaderboardTypeSwitcher";
import { useLeaderboard } from "../../src/hooks/useLeaderboard";

export default function LeaderboardsPage() {
  const [type, setType] = useState("reputation");
  const [period, setPeriod] = useState("alltime");
  const [domain, setDomain] = useState<string | undefined>(undefined);

  const { data, isLoading, error } = useLeaderboard(type, { period, domain, limit: 50 });

  const entries = data?.data ?? [];

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-charcoal">Leaderboards</h1>
          <p className="text-charcoal-light mt-1">
            See who&apos;s making the biggest impact
          </p>
        </div>

        <div className="mb-6">
          <LeaderboardTypeSwitcher current={type} onChange={setType} />
        </div>

        <div className="mb-6">
          <LeaderboardFilters
            period={period}
            domain={domain}
            onPeriodChange={setPeriod}
            onDomainChange={(d) => setDomain(d || undefined)}
          />
        </div>

        {error ? (
          <div className="text-center py-12">
            <p className="text-charcoal-light">
              {error instanceof Error ? error.message : "Failed to load leaderboard"}
            </p>
          </div>
        ) : (
          <LeaderboardTable entries={entries} type={type} loading={isLoading} />
        )}
      </div>
    </main>
  );
}
