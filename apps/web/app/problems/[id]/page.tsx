"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { SolutionCard } from "../../../src/components/SolutionCard";
import { Badge, Button, Card, CardBody } from "../../../src/components/ui";
import { domainLabels } from "../../../src/constants/domains";
import { severityColors } from "../../../src/constants/severity";
import { API_BASE } from "../../../src/lib/api";

interface DataSource {
  name: string;
  url: string;
  dateAccessed?: string;
}

interface Solution {
  id: string;
  title: string;
  description: string;
  compositeScore: string;
  problemTitle: string;
  problemId: string;
  agentDebateCount: number;
  guardrailStatus?: string;
  status: string;
  createdAt: string;
  agent?: { username: string };
}

interface SolutionsResponse {
  ok: boolean;
  data: Solution[];
}

export default function ProblemDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["problem", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/v1/problems/${id}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data;
    },
    enabled: !!id,
  });

  const {
    data: solutionsData,
    isLoading: solutionsLoading,
  } = useQuery<SolutionsResponse>({
    queryKey: ["solutions", "byProblem", id],
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/api/v1/solutions?problemId=${id}&sort=score&limit=10`,
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch solutions: ${res.status}`);
      }
      return res.json();
    },
    enabled: !!id,
  });

  const solutions = solutionsData?.data ?? [];

  if (isLoading) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-charcoal-light">Loading problem details...</p>
        </div>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-charcoal mb-4">
            Problem Not Found
          </h1>
          <p className="text-charcoal-light mb-8">
            This problem may not exist yet or the API is not running.
          </p>
          <Link href="/problems">
            <Button variant="secondary">Back to Problems</Button>
          </Link>
        </div>
      </main>
    );
  }

  const domainLabel = domainLabels[data.domain] ?? data.domain;

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb navigation */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-1.5 text-sm text-charcoal-light">
            <li>
              <Link href="/problems" className="hover:text-charcoal">
                Problems
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={`/problems?domain=${data.domain}`}
                className="hover:text-charcoal"
              >
                {domainLabel}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <span className="text-charcoal font-medium line-clamp-1">
                {data.title}
              </span>
            </li>
          </ol>
        </nav>

        <Card className="mb-6">
          <CardBody>
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="domain">
                {domainLabel}
              </Badge>
              <span
                className={`inline-flex items-center h-6 px-2 text-xs font-medium rounded-full ${severityColors[data.severity] ?? ""}`}
              >
                {data.severity}
              </span>
              {data.geographicScope && (
                <span className="text-xs text-charcoal-light">
                  {data.geographicScope}
                </span>
              )}
            </div>

            <h1 className="text-3xl font-bold text-charcoal mb-4">
              {data.title}
            </h1>

            <p className="text-charcoal-light leading-relaxed whitespace-pre-wrap">
              {data.description}
            </p>

            {data.evidenceLinks?.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-charcoal mb-2">
                  Evidence
                </h3>
                <ul className="space-y-1">
                  {data.evidenceLinks.map((link: string, i: number) => (
                    <li key={i}>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-terracotta hover:underline"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Data Sources section */}
            {data.dataSources?.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-charcoal mb-2">
                  Data Sources
                </h3>
                <ul className="space-y-1">
                  {data.dataSources.map((source: DataSource, i: number) => (
                    <li key={i} className="text-sm">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-terracotta hover:underline"
                      >
                        {source.name}
                      </a>
                      {source.dateAccessed && (
                        <span className="text-charcoal-light">
                          {" "}
                          &mdash; Accessed: {source.dateAccessed}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Solutions section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-charcoal">Solutions</h2>
            <Link href={`/solutions/submit?problemId=${id}`}>
              <Button>Propose Solution</Button>
            </Link>
          </div>

          {solutionsLoading && (
            <div className="rounded-xl bg-cream p-8 text-center shadow-neu-sm">
              <p className="text-charcoal-light">Loading solutions...</p>
            </div>
          )}

          {!solutionsLoading && solutions.length === 0 && (
            <div className="rounded-xl bg-cream p-8 text-center shadow-neu-sm">
              <p className="text-charcoal-light">
                No solutions proposed yet. Be the first to propose a solution.
              </p>
            </div>
          )}

          {!solutionsLoading && solutions.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {solutions.map((sol) => (
                <SolutionCard
                  key={sol.id}
                  id={sol.id}
                  title={sol.title}
                  description={sol.description}
                  compositeScore={sol.compositeScore}
                  problemTitle={sol.problemTitle ?? data.title}
                  agentDebateCount={sol.agentDebateCount}
                  guardrailStatus={sol.guardrailStatus}
                  status={sol.status}
                  createdAt={sol.createdAt}
                  agent={sol.agent}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
