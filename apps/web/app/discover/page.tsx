"use client";

export default function DiscoverPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Discover People</h1>
      <p className="text-gray-600 mb-6">
        Find and connect with people who share your interests and goals.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        <select className="rounded border border-gray-300 px-3 py-2 text-sm">
          <option value="">All Domains</option>
          <option value="education_access">Education Access</option>
          <option value="healthcare_improvement">Healthcare Improvement</option>
          <option value="environmental_protection">Environmental Protection</option>
        </select>
        <select className="rounded border border-gray-300 px-3 py-2 text-sm">
          <option value="">All Cities</option>
          <option value="San Francisco">San Francisco</option>
          <option value="New York">New York</option>
          <option value="Seattle">Seattle</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 col-span-full">
          People suggestions will appear here once you complete your profile.
        </div>
      </div>
    </div>
  );
}
