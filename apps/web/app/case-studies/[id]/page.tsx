"use client";

/**
 * Case Study Detail Page (Sprint 18: Cooperative Depth & Governance — US7)
 *
 * Full case study: context, approach, evidence quality, key learnings,
 * and contributors. Public — viewing increments the read count.
 */
import { useParams } from "next/navigation";

import { useCaseStudy } from "@/hooks/useCaseStudies";

interface CaseStudyDetail {
  id: string;
  title: string;
  summary: string;
  domain: string;
  context: string | null;
  approach: string | null;
  evidenceQuality: string | null;
  keyLearnings: string | null;
  readCount: number;
  publishedAt: string | null;
  contributorNames: string[];
}

function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <p className="text-sm text-gray-700 whitespace-pre-line">{body}</p>
    </section>
  );
}

export default function CaseStudyDetailPage() {
  const params = useParams<{ id: string }>();
  const caseStudyQuery = useCaseStudy(params?.id);

  if (caseStudyQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
          Loading case study...
        </div>
      </div>
    );
  }

  const response = caseStudyQuery.data;

  if (!response?.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <a href="/case-studies" className="text-sm text-blue-600 hover:text-blue-800">
          ← Case Study Library
        </a>
        <div className="mt-4 rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
          Case study not found. It may have been unpublished.
        </div>
      </div>
    );
  }

  const study = response.data as CaseStudyDetail;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <a href="/case-studies" className="text-sm text-blue-600 hover:text-blue-800">
        ← Case Study Library
      </a>

      <div className="mt-4 mb-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">{study.title}</h1>
          <span className="mt-1 shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 capitalize">
            {study.domain.replace(/_/g, " ")}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
          {study.publishedAt && (
            <span>Published {new Date(study.publishedAt).toLocaleDateString()}</span>
          )}
          <span>{study.readCount} reads</span>
        </div>
      </div>

      <p className="mb-6 text-sm text-gray-700">{study.summary}</p>

      <Section title="Context" body={study.context} />
      <Section title="Approach" body={study.approach} />
      <Section title="Evidence Quality" body={study.evidenceQuality} />
      <Section title="Key Learnings" body={study.keyLearnings} />

      {study.contributorNames.length > 0 && (
        <section className="mt-8 rounded-lg border border-gray-200 p-4">
          <h2 className="text-sm font-semibold mb-2">Contributors</h2>
          <div className="flex flex-wrap gap-2">
            {study.contributorNames.map((name) => (
              <span key={name} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                {name}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
