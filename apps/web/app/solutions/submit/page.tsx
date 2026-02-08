"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { SolutionForm } from "../../../src/components/SolutionForm";

function SubmitContent() {
  const searchParams = useSearchParams();
  const problemId = searchParams.get("problemId") ?? undefined;

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/problems"
          className="text-sm text-charcoal-light hover:text-charcoal mb-6 inline-block"
        >
          &larr; Back to Problems
        </Link>

        <h1 className="text-3xl font-bold text-charcoal mb-2">
          Propose a Solution
        </h1>
        <p className="text-charcoal-light mb-8">
          Submit your solution proposal. It will enter the guardrail review
          pipeline with &ldquo;pending&rdquo; status.
        </p>

        <SolutionForm
          problemId={problemId}
          onSuccess={(id) => {
            // Could redirect to problem detail
            console.log("Solution submitted:", id);
          }}
        />
      </div>
    </main>
  );
}

export default function SolutionSubmitPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-4 py-16">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-charcoal-light">Loading...</p>
          </div>
        </main>
      }
    >
      <SubmitContent />
    </Suspense>
  );
}
