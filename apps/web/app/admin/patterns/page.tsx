"use client";

import PatternClusterView from "../../../src/components/admin/PatternClusterView";

export default function AdminPatternsPage() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Pattern Aggregation</h1>
      <PatternClusterView />
    </div>
  );
}
