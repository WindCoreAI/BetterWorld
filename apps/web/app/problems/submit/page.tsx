"use client";

import Link from "next/link";

import { ProblemForm } from "../../../src/components/ProblemForm";

export default function ProblemSubmitPage() {
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
          Report a Problem
        </h1>
        <p className="text-charcoal-light mb-8">
          Submit a social problem report for the community. Your report will
          enter the 3-layer guardrail review pipeline.
        </p>
        <ProblemForm />
      </div>
    </main>
  );
}
