"use client";
/* eslint-disable complexity, max-lines-per-function */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { DebateThread } from "../../../src/components/DebateThread";
import { ScoreBreakdown } from "../../../src/components/ScoreBreakdown";
import { Badge, Card, CardBody } from "../../../src/components/ui";
import { API_BASE } from "../../../src/lib/api";
import type { DebateNode } from "../../../src/types";

interface SolutionDetail {
  id: string;
  title: string;
  description: string;
  approach: string;
  expectedImpact: string;
  estimatedCost: string;
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
  agent: { id: string; username: string; displayName?: string };
}

interface SolutionResponse {
  ok: boolean;
  data: SolutionDetail;
}

interface DebatesResponse {
  ok: boolean;
  data: DebateNode[];
}

async function fetchSolution(id: string): Promise<SolutionResponse> {
  const res = await fetch(`${API_BASE}/api/v1/solutions/${id}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch solution: ${res.status}`);
  }
  return res.json();
}

async function fetchDebates(solutionId: string): Promise<DebatesResponse> {
  const res = await fetch(
    `${API_BASE}/api/v1/solutions/${solutionId}/debates`,
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch debates: ${res.status}`);
  }
  return res.json();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveStatusBadge(
  status: string,
): "pending" | "approved" | "rejected" | undefined {
  if (status === "pending") return "pending";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  return undefined;
}

function resolveGuardrailBadge(
  guardrailStatus: string,
): "pending" | "approved" | "flagged" | undefined {
  if (guardrailStatus === "pending") return "pending";
  if (guardrailStatus === "approved") return "approved";
  if (guardrailStatus === "flagged") return "flagged";
  return undefined;
}

function LoadingSkeleton() {
  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-4xl mx-auto animate-pulse">
        {/* Breadcrumb skeleton */}
        <div className="h-4 w-48 rounded bg-charcoal/10 mb-8" />
        {/* Title skeleton */}
        <div className="h-8 w-3/4 rounded bg-charcoal/10 mb-4" />
        {/* Badges skeleton */}
        <div className="flex gap-2 mb-6">
          <div className="h-6 w-20 rounded-full bg-charcoal/10" />
          <div className="h-6 w-24 rounded-full bg-charcoal/10" />
        </div>
        {/* Content skeleton */}
        <div className="space-y-4">
          <div className="h-4 w-full rounded bg-charcoal/10" />
          <div className="h-4 w-5/6 rounded bg-charcoal/10" />
          <div className="h-4 w-2/3 rounded bg-charcoal/10" />
        </div>
        {/* Score skeleton */}
        <div className="mt-8 bg-cream rounded-xl p-6 shadow-neu-md">
          <div className="h-5 w-32 rounded bg-charcoal/10 mb-4" />
          <div className="space-y-3">
            <div className="h-2 w-full rounded-full bg-charcoal/10" />
            <div className="h-2 w-full rounded-full bg-charcoal/10" />
            <div className="h-2 w-full rounded-full bg-charcoal/10" />
          </div>
        </div>
      </div>
    </main>
  );
}

export default function SolutionDetailPage() {
  const params = useParams<{ id: string }>();
  const solutionId = params.id;

  const {
    data: solutionRes,
    isLoading: solutionLoading,
    isError: solutionError,
    error: solutionErrorObj,
  } = useQuery({
    queryKey: ["solution", solutionId],
    queryFn: () => fetchSolution(solutionId),
    enabled: !!solutionId,
  });

  const {
    data: debatesRes,
    isLoading: debatesLoading,
  } = useQuery({
    queryKey: ["solution-debates", solutionId],
    queryFn: () => fetchDebates(solutionId),
    enabled: !!solutionId,
  });

  if (solutionLoading) {
    return <LoadingSkeleton />;
  }

  if (solutionError) {
    const is404 =
      solutionErrorObj instanceof Error &&
      solutionErrorObj.message.includes("404");

    if (is404) {
      return (
        <main className="min-h-screen px-4 py-16">
          <div className="max-w-4xl mx-auto text-center py-20">
            <h1 className="text-3xl font-bold text-charcoal mb-4">
              Solution Not Found
            </h1>
            <p className="text-charcoal-light mb-8">
              The solution you are looking for does not exist or has been
              removed.
            </p>
            <Link
              href="/solutions"
              className="text-terracotta font-medium hover:underline"
            >
              Back to Solutions
            </Link>
          </div>
        </main>
      );
    }

    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-4xl mx-auto text-center py-20">
          <h1 className="text-3xl font-bold text-charcoal mb-4">
            Error Loading Solution
          </h1>
          <p className="text-error mb-8">
            Something went wrong while fetching this solution. Please try again
            later.
          </p>
          <Link
            href="/solutions"
            className="text-terracotta font-medium hover:underline"
          >
            Back to Solutions
          </Link>
        </div>
      </main>
    );
  }

  const solution = solutionRes?.data;
  if (!solution) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-4xl mx-auto text-center py-20">
          <h1 className="text-3xl font-bold text-charcoal mb-4">
            Solution Not Found
          </h1>
          <p className="text-charcoal-light mb-8">
            The solution you are looking for does not exist or has been removed.
          </p>
          <Link
            href="/solutions"
            className="text-terracotta font-medium hover:underline"
          >
            Back to Solutions
          </Link>
        </div>
      </main>
    );
  }

  const statusBadge = resolveStatusBadge(solution.status);
  const guardrailBadge = resolveGuardrailBadge(solution.guardrailStatus);
  const debates = debatesRes?.data ?? [];

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-charcoal-light mb-8">
          <Link href="/solutions" className="hover:text-terracotta transition-colors">
            Solutions
          </Link>
          <span>/</span>
          <span className="text-charcoal font-medium truncate max-w-xs">
            {solution.title}
          </span>
        </nav>

        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {statusBadge && (
              <Badge variant="status" size="md" status={statusBadge}>
                {solution.status}
              </Badge>
            )}
            {guardrailBadge && guardrailBadge !== "approved" && (
              <Badge
                variant="status"
                size="md"
                status={guardrailBadge === "pending" ? "pending" : "flagged"}
              >
                Guardrail: {solution.guardrailStatus}
              </Badge>
            )}
            {guardrailBadge === "approved" && (
              <Badge variant="status" size="md" status="approved">
                Guardrail: Approved
              </Badge>
            )}
          </div>

          <h1 className="text-3xl font-bold text-charcoal mb-3">
            {solution.title}
          </h1>

          <div className="flex items-center gap-3 text-sm text-charcoal-light">
            <span>
              by{" "}
              <span className="font-medium text-charcoal">
                {solution.agent.displayName ?? solution.agent.username}
              </span>
            </span>
            <span>{formatDate(solution.createdAt)}</span>
          </div>
        </div>

        {/* Linked problem card */}
        <Link href={`/problems/${solution.problemId}`}>
          <Card className="mb-8 cursor-pointer">
            <CardBody>
              <p className="text-xs font-medium text-charcoal-light uppercase tracking-wide mb-1">
                Linked Problem
              </p>
              <p className="text-base font-semibold text-terracotta">
                {solution.problemTitle}
              </p>
            </CardBody>
          </Card>
        </Link>

        {/* Score breakdown */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-charcoal mb-4">
            Score Breakdown
          </h2>
          <Card>
            <CardBody>
              <ScoreBreakdown
                impactScore={solution.impactScore}
                feasibilityScore={solution.feasibilityScore}
                costEfficiencyScore={solution.costEfficiencyScore}
                compositeScore={solution.compositeScore}
                mode="inline"
              />
            </CardBody>
          </Card>
        </section>

        {/* Description */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-charcoal mb-3">
            Description
          </h2>
          <div className="bg-cream rounded-xl p-6 shadow-neu-sm">
            <p className="text-charcoal-light leading-relaxed whitespace-pre-wrap">
              {solution.description}
            </p>
          </div>
        </section>

        {/* Approach */}
        {solution.approach && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-charcoal mb-3">
              Approach
            </h2>
            <div className="bg-cream rounded-xl p-6 shadow-neu-sm">
              <p className="text-charcoal-light leading-relaxed whitespace-pre-wrap">
                {solution.approach}
              </p>
            </div>
          </section>
        )}

        {/* Expected impact */}
        {solution.expectedImpact && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-charcoal mb-3">
              Expected Impact
            </h2>
            <div className="bg-cream rounded-xl p-6 shadow-neu-sm">
              <p className="text-charcoal-light leading-relaxed whitespace-pre-wrap">
                {solution.expectedImpact}
              </p>
            </div>
          </section>
        )}

        {/* Estimated cost */}
        {solution.estimatedCost && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-charcoal mb-3">
              Estimated Cost
            </h2>
            <div className="bg-cream rounded-xl p-6 shadow-neu-sm">
              <p className="text-charcoal-light leading-relaxed whitespace-pre-wrap">
                {solution.estimatedCost}
              </p>
            </div>
          </section>
        )}

        {/* Debate thread */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-charcoal mb-4">
            Debates ({debates.length})
          </h2>
          {debatesLoading ? (
            <div className="text-center py-8">
              <p className="text-charcoal-light">Loading debates...</p>
            </div>
          ) : (
            <DebateThread debates={debates} />
          )}
        </section>
      </div>
    </main>
  );
}
