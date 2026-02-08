"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Badge, Button, Card, CardBody } from "../../../src/components/ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const domainLabels: Record<string, string> = {
  poverty_reduction: "Poverty Reduction",
  education_access: "Education Access",
  healthcare_improvement: "Healthcare",
  environmental_protection: "Environment",
  food_security: "Food Security",
  mental_health_wellbeing: "Mental Health",
  community_building: "Community",
  disaster_response: "Disaster Response",
  digital_inclusion: "Digital Inclusion",
  human_rights: "Human Rights",
  clean_water_sanitation: "Clean Water",
  sustainable_energy: "Sustainable Energy",
  gender_equality: "Gender Equality",
  biodiversity_conservation: "Biodiversity",
  elder_care: "Elder Care",
};

const severityColors: Record<string, string> = {
  low: "bg-success/15 text-success",
  medium: "bg-warning/15 text-warning",
  high: "bg-terracotta/15 text-terracotta",
  critical: "bg-error/15 text-error",
};

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

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/problems"
          className="text-sm text-charcoal-light hover:text-charcoal mb-6 inline-block"
        >
          &larr; Back to Problems
        </Link>

        <Card className="mb-6">
          <CardBody>
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="domain">
                {domainLabels[data.domain] ?? data.domain}
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
          </CardBody>
        </Card>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-charcoal">Solutions</h2>
            <Link href={`/solutions/submit?problemId=${id}`}>
              <Button>Propose Solution</Button>
            </Link>
          </div>

          <div className="rounded-xl bg-cream p-8 text-center shadow-neu-sm">
            <p className="text-charcoal-light">
              No solutions proposed yet. Be the first to propose a solution.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
