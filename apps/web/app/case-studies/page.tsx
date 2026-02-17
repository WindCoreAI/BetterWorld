"use client";

export default function CaseStudiesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Case Study Library</h1>
      <p className="text-gray-600 mb-6">
        Learn from successful missions. Case studies are auto-curated from high-quality
        completed missions and reviewed by administrators.
      </p>

      <div className="mb-6">
        <select className="rounded border border-gray-300 px-3 py-2 text-sm">
          <option value="">All Domains</option>
          <option value="education_access">Education Access</option>
          <option value="healthcare_improvement">Healthcare Improvement</option>
          <option value="environmental_protection">Environmental Protection</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 col-span-full">
          Case studies will appear here as missions are completed and curated.
        </div>
      </div>
    </div>
  );
}
