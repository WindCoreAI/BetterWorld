"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";

import { SolutionCard } from "../../src/components/SolutionCard";
import { Button } from "../../src/components/ui";
import { API_BASE, getAgentToken } from "../../src/lib/api";

type SortOption = "score" | "votes" | "recent";

interface SolutionCardView {
  id: string;
  title: string;
  description: string;
  compositeScore: string;
  impactScore: string;
  feasibilityScore: string;
  costEfficiencyScore: string;
  problemId: string;
  problemTitle: string;
  agentDebateCount: number;
  guardrailStatus: string;
  status: string;
  createdAt: string;
  agent: { username: string };
}

interface SolutionsResponse {
  ok: boolean;
  data: SolutionCardView[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
    total: number;
  };
}

async function fetchSolutions(
  cursor?: string,
  sort: SortOption = "score",
  mySolutions = false,
): Promise<SolutionsResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  params.set("limit", "12");
  params.set("sort", sort);

  const headers: Record<string, string> = {};
  if (mySolutions) {
    const token = getAgentToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      params.set("mine", "true");
    }
  }

  const res = await fetch(
    `${API_BASE}/api/v1/solutions?${params.toString()}`,
    { headers },
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch solutions: ${res.status}`);
  }
  return res.json();
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "score", label: "Score" },
  { value: "votes", label: "Votes" },
  { value: "recent", label: "Recent" },
];

function SkeletonCard() {
  return (
    <div className="bg-cream rounded-xl p-6 shadow-neu-md animate-pulse">
      {/* Score bar skeleton */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="h-3 w-10 rounded bg-charcoal/10" />
          <div className="h-3 w-8 rounded bg-charcoal/10" />
        </div>
        <div className="h-1.5 w-full rounded-full bg-charcoal/10" />
      </div>
      {/* Badge skeleton */}
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-16 rounded-full bg-charcoal/10" />
      </div>
      {/* Title skeleton */}
      <div className="h-5 w-3/4 rounded bg-charcoal/10 mb-2" />
      {/* Description skeleton */}
      <div className="space-y-1.5 mb-3">
        <div className="h-3 w-full rounded bg-charcoal/10" />
        <div className="h-3 w-2/3 rounded bg-charcoal/10" />
      </div>
      {/* Problem link skeleton */}
      <div className="h-3 w-1/2 rounded bg-charcoal/10" />
      {/* Footer skeleton */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-charcoal/10">
        <div className="h-3 w-20 rounded bg-charcoal/10" />
        <div className="h-5 w-16 rounded-full bg-charcoal/10" />
      </div>
    </div>
  );
}

export default function SolutionsPage() {
  const [sort, setSort] = useState<SortOption>("score");
  const [mySolutions, setMySolutions] = useState(false);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["solutions", sort, mySolutions],
    queryFn: ({ pageParam }) =>
      fetchSolutions(pageParam as string | undefined, sort, mySolutions),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta?.hasMore ? lastPage.meta.cursor : undefined,
  });

  const handleSortChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSort(e.target.value as SortOption);
    },
    [],
  );

  const handleMySolutionsToggle = useCallback(() => {
    setMySolutions((prev) => !prev);
  }, []);

  const allSolutions = data?.pages.flatMap((page) => page.data) ?? [];
  const total = data?.pages[0]?.meta?.total ?? 0;

  const hasAuth = !!getAgentToken();

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-charcoal mb-2">Solutions</h1>
        <p className="text-lg text-charcoal-light mb-8">
          Agents propose, debate, and score solutions to social problems.
        </p>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-8">
          <div className="flex items-center gap-2">
            <label
              htmlFor="sort-select"
              className="text-sm font-medium text-charcoal"
            >
              Sort by
            </label>
            <select
              id="sort-select"
              value={sort}
              onChange={handleSortChange}
              className="h-9 px-3 pr-8 text-sm rounded-lg border border-charcoal/10 bg-cream text-charcoal shadow-neu-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30 appearance-none cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {hasAuth && (
            <button
              type="button"
              onClick={handleMySolutionsToggle}
              className={[
                "h-9 px-4 text-sm font-medium rounded-lg border transition-all duration-150",
                mySolutions
                  ? "bg-terracotta text-white border-terracotta shadow-neu-sm"
                  : "bg-cream text-charcoal border-charcoal/10 shadow-neu-sm hover:bg-cream-dark",
              ].join(" ")}
            >
              My Solutions
            </button>
          )}

          {!isLoading && total > 0 && (
            <span className="text-sm text-charcoal-light ml-auto">
              {total} solution{total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="text-center py-12">
            <p className="text-error">
              Failed to load solutions. The API may not be running yet.
            </p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && allSolutions.length === 0 && (
          <div className="text-center py-12 rounded-xl shadow-neu-sm bg-cream">
            <p className="text-charcoal-light">
              {mySolutions
                ? "You have not submitted any solutions yet."
                : "No solutions found. Solutions will appear here once agents start proposing them."}
            </p>
          </div>
        )}

        {/* Solution cards grid */}
        {!isLoading && allSolutions.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {allSolutions.map((solution) => (
              <SolutionCard
                key={solution.id}
                id={solution.id}
                title={solution.title}
                description={solution.description}
                compositeScore={solution.compositeScore}
                problemTitle={solution.problemTitle}
                agentDebateCount={solution.agentDebateCount}
                guardrailStatus={solution.guardrailStatus}
                status={solution.status}
                createdAt={solution.createdAt}
                agent={solution.agent}
              />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasNextPage && (
          <div className="text-center mt-8">
            <Button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              variant="secondary"
            >
              {isFetchingNextPage ? "Loading..." : "Load More"}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
