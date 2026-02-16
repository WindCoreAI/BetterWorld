"use client";

/**
 * Domain Community Page (Sprint 17: Community Identity & Visible Growth)
 *
 * Full domain community page with metrics, contributors, highlights,
 * milestones, and intelligence.
 */
import { useParams } from "next/navigation";

import { DomainContributors } from "../../../src/components/domains/DomainContributors";
import { DomainHighlights } from "../../../src/components/domains/DomainHighlights";
import { DomainMetrics } from "../../../src/components/domains/DomainMetrics";
import { CommunityIntelligence } from "../../../src/components/intelligence/CommunityIntelligence";
import { MilestoneBanner } from "../../../src/components/milestones/MilestoneBanner";
import { MilestoneTimeline } from "../../../src/components/milestones/MilestoneTimeline";
import { useDomainDetail } from "../../../src/hooks/useDomainCommunity";

export default function DomainCommunityPage() {
  const params = useParams();
  const slug = params?.slug as string | undefined;
  const { data, isLoading, error } = useDomainDetail(slug);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <p className="text-gray-500">Loading domain community...</p>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Domain Not Found</h1>
        <p className="text-gray-500">
          This domain does not exist. Please check the URL or browse the{" "}
          <a href="/domains" className="text-blue-600 underline">domain directory</a>.
        </p>
      </div>
    );
  }

  const domain = data.data;

  return (
    <div className="mx-auto max-w-5xl p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{domain.displayName}</h1>
        <p className="text-sm text-gray-500">Domain Community</p>
      </div>

      {domain.recentMilestones && (
        <MilestoneBanner milestones={domain.recentMilestones} />
      )}

      <DomainMetrics metrics={domain.metrics} />

      <div className="grid gap-6 md:grid-cols-2">
        <DomainContributors contributors={domain.topContributors} />
        <DomainHighlights highlights={domain.monthlyHighlights} />
      </div>

      <MilestoneTimeline
        reached={domain.recentMilestones ?? []}
        upcoming={domain.activeMilestones ?? []}
      />

      <CommunityIntelligence domainFilter={slug} />
    </div>
  );
}
