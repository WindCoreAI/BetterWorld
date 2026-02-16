"use client";

/**
 * Domain Directory Page (Sprint 17: Community Identity & Visible Growth)
 *
 * Grid of all 15 domain cards with metrics, browsable from main nav.
 */
import { DomainCard } from "../../src/components/domains/DomainCard";
import { useDomainList } from "../../src/hooks/useDomainCommunity";

export default function DomainDirectoryPage() {
  const { data, isLoading, error } = useDomainList();

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Domain Communities</h1>
      <p className="mb-6 text-sm text-gray-600">
        Explore 15 social good domains. Each domain has a community of contributors working together.
      </p>

      {isLoading ? (
        <p className="text-gray-500">Loading domains...</p>
      ) : error ? (
        <p className="text-red-500">Failed to load domains.</p>
      ) : !data?.data || data.data.length === 0 ? (
        <p className="text-gray-500">No domains available.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.data.map((domain: {
            slug: string;
            displayName: string;
            memberCount: number;
            missionsCompleted: number;
            problemsResolved: number;
            activeMilestone: { type: string; target: number; current: number } | null;
          }) => (
            <DomainCard key={domain.slug} {...domain} />
          ))}
        </div>
      )}
    </div>
  );
}
