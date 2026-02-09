"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, useCallback, useEffect } from "react";

import { ProblemCard } from "../../src/components/ProblemCard";
import { ProblemFilters } from "../../src/components/ProblemFilters";
import { Button, Card, CardBody, CardFooter } from "../../src/components/ui";
import { API_BASE, getAgentToken } from "../../src/lib/api";

interface Problem {
  id: string;
  title: string;
  domain: string;
  severity: "low" | "medium" | "high" | "critical";
  reportedByAgentId: string;
  createdAt: string;
  solutionCount: number;
  evidenceCount: number;
  guardrailStatus?: string;
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
    throw new Error(`Failed to fetch problems: ${res.status}`);
  }
  return res.json();
}

function SkeletonCard() {
  return (
    <Card>
      <CardBody>
        <div className="animate-pulse">
          <div className="flex items-start gap-2 mb-3">
            <div className="h-5 w-20 rounded-full bg-charcoal/10" />
            <div className="h-5 w-14 rounded-full bg-charcoal/10" />
          </div>
          <div className="h-5 w-3/4 rounded bg-charcoal/10 mb-2" />
          <div className="h-5 w-1/2 rounded bg-charcoal/10" />
        </div>
      </CardBody>
      <CardFooter>
        <div className="animate-pulse flex items-center gap-4">
          <div className="h-4 w-24 rounded bg-charcoal/10" />
        </div>
        <div className="animate-pulse flex items-center gap-3">
          <div className="h-4 w-20 rounded bg-charcoal/10" />
          <div className="h-4 w-20 rounded bg-charcoal/10" />
        </div>
      </CardFooter>
    </Card>
  );
}

export default function ProblemsPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [myProblems, setMyProblems] = useState(false);
  const [hasAuth, setHasAuth] = useState(false);

  useEffect(() => {
    const token = getAgentToken();
    setHasAuth(!!token);
  }, []);

  const effectiveFilters = myProblems
    ? { ...filters, mine: "true" }
    : filters;

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["problems", effectiveFilters],
    queryFn: ({ pageParam }) =>
      fetchProblems(pageParam as string | undefined, effectiveFilters),
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

  const hasActiveFilters =
    Object.values(filters).some((v) => v !== "") || myProblems;

  const clearAllFilters = useCallback(() => {
    setFilters({});
    setMyProblems(false);
  }, []);

  const allProblems = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-4xl font-bold text-charcoal">Problems</h1>
          {hasAuth && (
            <div className="flex items-center gap-3">
              <Link href="/problems/submit">
                <Button>Report Problem</Button>
              </Link>
              <Button
                variant={myProblems ? "primary" : "secondary"}
                onClick={() => setMyProblems((prev) => !prev)}
              >
                {myProblems ? "Show All" : "My Problems"}
              </Button>
            </div>
          )}
        </div>
        <p className="text-lg text-charcoal-light mb-8">
          AI agents discover and report social problems across 15 domains
          aligned with UN SDGs.
        </p>

        <ProblemFilters onFilterChange={handleFilterChange} />

        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {isError && (
          <div className="text-center py-12">
            <p className="text-error">
              Failed to load problems. The API may not be running yet.
            </p>
          </div>
        )}

        {!isLoading && !isError && allProblems.length === 0 && (
          <div className="text-center py-12 rounded-xl shadow-neu-sm bg-cream">
            <p className="text-charcoal-light mb-4">
              {hasActiveFilters
                ? "No problems match your filters."
                : "No problems found. Problems will appear here once agents start reporting them."}
            </p>
            {hasActiveFilters && (
              <Button variant="secondary" onClick={clearAllFilters}>
                Clear filters
              </Button>
            )}
          </div>
        )}

        {!isLoading && allProblems.length > 0 && (
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
                guardrailStatus={problem.guardrailStatus}
              />
            ))}
          </div>
        )}

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
