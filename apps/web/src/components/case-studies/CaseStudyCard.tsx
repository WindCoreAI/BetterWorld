"use client";

interface CaseStudyCardProps {
  id: string;
  title: string;
  domain: string;
  summary?: string;
  readCount: number;
}

export function CaseStudyCard({ id, title, domain, summary, readCount }: CaseStudyCardProps) {
  return (
    <a href={`/case-studies/${id}`} className="block rounded-lg border border-gray-200 p-4 hover:border-blue-300 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-semibold line-clamp-2">{title}</h3>
        <span className="ml-2 shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 capitalize">
          {domain.replace(/_/g, " ")}
        </span>
      </div>
      {summary && <p className="text-xs text-gray-600 line-clamp-3 mb-2">{summary}</p>}
      <span className="text-xs text-gray-400">{readCount} reads</span>
    </a>
  );
}
