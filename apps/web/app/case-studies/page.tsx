"use client";

/**
 * Case Study Library Page (Sprint 18: Cooperative Depth & Governance — US7)
 *
 * Public library of published case studies curated from high-quality
 * completed missions, filterable by domain.
 */
import { useState } from "react";

import { CaseStudyCard } from "@/components/case-studies/CaseStudyCard";
import { domainLabels } from "@/constants/domains";
import { useCaseStudies } from "@/hooks/useCaseStudies";

interface CaseStudySummary {
  id: string;
  title: string;
  summary: string;
  domain: string;
  readCount: number;
}

export default function CaseStudiesPage() {
  const [domain, setDomain] = useState("");
  const caseStudiesQuery = useCaseStudies(domain || undefined);

  const items: CaseStudySummary[] = caseStudiesQuery.data?.ok
    ? caseStudiesQuery.data.data?.items ?? []
    : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Case Study Library</h1>
      <p className="text-gray-600 mb-6">
        Learn from successful missions. Case studies are auto-curated from high-quality
        completed missions and reviewed by administrators.
      </p>

      <div className="mb-6">
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Domains</option>
          {Object.entries(domainLabels).map(([slug, label]) => (
            <option key={slug} value={slug}>{label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {caseStudiesQuery.isLoading && (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 col-span-full">
            Loading case studies...
          </div>
        )}

        {!caseStudiesQuery.isLoading && items.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 col-span-full">
            Case studies will appear here as missions are completed and curated.
          </div>
        )}

        {items.map((study) => (
          <CaseStudyCard
            key={study.id}
            id={study.id}
            title={study.title}
            domain={study.domain}
            summary={study.summary}
            readCount={study.readCount}
          />
        ))}
      </div>
    </div>
  );
}
