"use client";

import { useParams } from "next/navigation";

import { PortfolioHeader } from "../../../src/components/portfolio/PortfolioHeader";
import { PortfolioMissions } from "../../../src/components/portfolio/PortfolioMissions";
import { PortfolioPrivacyToggle } from "../../../src/components/portfolio/PortfolioPrivacyToggle";
import { PortfolioTimeline } from "../../../src/components/portfolio/PortfolioTimeline";
import { useHumanAuth } from "../../../src/hooks/useHumanAuth";
import { usePortfolio } from "../../../src/hooks/usePortfolio";

export default function PortfolioContent() {
  const params = useParams<{ humanId: string }>();
  const humanId = params.humanId;
  const { user } = useHumanAuth();
  const { data, isLoading, error } = usePortfolio(humanId);

  const portfolio = data?.data;
  const isOwner = user?.id === humanId;

  if (isLoading) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-3xl mx-auto space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-charcoal/5 rounded-xl animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  if (error || !portfolio) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl font-bold text-charcoal mb-4">Portfolio</h1>
          <p className="text-charcoal-light">
            {error instanceof Error ? error.message : "Portfolio not found or is private"}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-3xl mx-auto space-y-6">
        <PortfolioHeader
          displayName={portfolio.displayName}
          avatarUrl={portfolio.avatarUrl}
          tier={portfolio.reputation.tier}
          totalScore={portfolio.reputation.totalScore}
          joinedAt={portfolio.joinedAt}
        />

        {isOwner && (
          <div className="flex justify-end">
            <PortfolioPrivacyToggle currentVisibility={portfolio.visibility} />
          </div>
        )}

        <PortfolioTimeline stats={portfolio.stats} />
        <PortfolioMissions missions={portfolio.missions} />
      </div>
    </main>
  );
}
