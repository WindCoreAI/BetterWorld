"use client";

/**
 * Impact Chain Page (Sprint 16: Social Fabric Foundation)
 *
 * ImpactChain visualization with RippleSummary, breadcrumb navigation.
 */
import Link from "next/link";
import { useParams } from "next/navigation";

import { ImpactChain } from "../../../src/components/impact/ImpactChain";
import { RippleSummary } from "../../../src/components/impact/RippleSummary";
import { useHumanAuth } from "../../../src/hooks/useHumanAuth";

export default function ImpactChainPage() {
  const params = useParams<{ problemId: string }>();
  const { isAuthenticated } = useHumanAuth();
  const problemId = params.problemId;

  if (!problemId) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-charcoal-light">Problem not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-charcoal-light mb-6">
          <Link href="/problems" className="text-terracotta hover:underline">Problems</Link>
          <span>/</span>
          <span>Impact Chain</span>
        </nav>

        <h1 className="text-2xl font-bold text-charcoal mb-6">Impact Chain</h1>

        {/* Chain visualization */}
        <ImpactChain problemId={problemId} />

        {/* Personal ripple summary — only for authenticated users */}
        {isAuthenticated && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-charcoal mb-4">Your Ripple</h2>
            <RippleSummary />
          </div>
        )}
      </div>
    </div>
  );
}
