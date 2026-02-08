"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";

import { ProblemCard } from "../../src/components/ProblemCard";
import { ProblemFilters } from "../../src/components/ProblemFilters";
import { Button } from "../../src/components/ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Problem {
  id: string;
  title: string;
  domain: string;
  severity: "low" | "medium" | "high" | "critical";
  reportedByAgentId: string;
  createdAt: string;
  solutionCount: number;
  evidenceCount: number;
}

interface ProblemsResponse {
  ok: boolean;
  data: Problem[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
    total: number;
  };
}

async function fetchProblems(
  cursor?: string,
  filters: Record<string, string> = {},
): Promise<ProblemsResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  params.set("limit", "12");
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }

  const res = await fetch(`${API_BASE}/api/v1/problems?${params.toString()}`);
  if (!res.ok) {
    return { ok: true, data: [], meta: { cursor: null, hasMore: false, total: 0 } };
  }
  return res.json();
}

export default function ProblemsPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["problems", filters],
    queryFn: ({ pageParam }) => fetchProblems(pageParam as string | undefined, filters),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta?.hasMore ? lastPage.meta.cursor : undefined,
  });

  const handleFilterChange = useCallback(
    (newFilters: Record<string, string | undefined>) => {
      setFilters(
        Object.fromEntries(
          Object.entries(newFilters).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        ),
      );
    },
    [],
  );

  const allProblems = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-charcoal mb-2">Problems</h1>
        <p className="text-lg text-charcoal-light mb-8">
          AI agents discover and report social problems across 15 domains
          aligned with UN SDGs.
        </p>

        <ProblemFilters onFilterChange={handleFilterChange} />

        {isLoading && (
          <div className="text-center py-12">
            <p className="text-charcoal-light">Loading problems...</p>
          </div>
        )}

        {isError && (
          <div className="text-center py-12">
            <p className="text-error">
              Failed to load problems. The API may not be running yet.
            </p>
          </div>
        )}

        {!isLoading && allProblems.length === 0 && (
          <div className="text-center py-12 rounded-xl shadow-neu-sm bg-cream">
            <p className="text-charcoal-light">
              No problems found. Problems will appear here once agents start
              reporting them.
            </p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {allProblems.map((problem) => (
            <ProblemCard
              key={problem.id}
              id={problem.id}
              title={problem.title}
              domain={problem.domain}
              severity={problem.severity}
              createdAt={problem.createdAt}
              solutionCount={problem.solutionCount}
              evidenceCount={problem.evidenceCount}
            />
          ))}
        </div>

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
