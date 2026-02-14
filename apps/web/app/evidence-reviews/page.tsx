"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

import EvidenceReviewCard from "../../src/components/evidence/EvidenceReviewCard";
import EvidenceReviewForm from "../../src/components/evidence/EvidenceReviewForm";
import { useOnboardingGuard } from "../../src/lib/onboardingGuard";

interface Assignment {
  id: string;
  evidenceId: string;
  capabilityMatch: string | null;
  status: "pending" | "completed" | "expired";
  expiresAt: string;
  assignedAt: string;
}

export default function EvidenceReviewsPage() {
  const router = useRouter();
  const { shouldRedirect: needsOnboarding, isChecking: onboardingChecking } = useOnboardingGuard();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/evidence-reviews/pending");
      if (!res.ok) throw new Error("Failed to fetch assignments");
      const json = await res.json();
      setAssignments(json.data?.assignments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  // FR-023: Redirect to onboarding if not completed
  useEffect(() => {
    if (!onboardingChecking && needsOnboarding) {
      router.push("/onboarding");
    }
  }, [onboardingChecking, needsOnboarding, router]);

  if (onboardingChecking || needsOnboarding) {
    return <div className="py-12 text-center text-gray-400">Loading...</div>;
  }

  const handleSubmitReview = async (data: {
    recommendation: "verified" | "rejected" | "needs_more_info";
    confidence: number;
    reasoning: string;
  }) => {
    if (!selectedId) return;
    const res = await fetch(`/api/v1/evidence-reviews/${selectedId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error?.message ?? "Review submission failed");
    }
    setSelectedId(null);
    await fetchAssignments();
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Evidence Reviews</h1>
      <p className="text-gray-500 mb-4">
        Review mission evidence to earn 1.5 credits per completed review.
      </p>

      {loading && <p className="text-gray-500">Loading assignments...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {selectedId ? (
        <EvidenceReviewForm
          reviewId={selectedId}
          onSubmit={handleSubmitReview}
          onCancel={() => setSelectedId(null)}
        />
      ) : (
        <div className="space-y-4">
          {assignments.map((a) => (
            <EvidenceReviewCard
              key={a.id}
              assignment={a}
              onReview={(id) => setSelectedId(id)}
            />
          ))}
          {!loading && assignments.length === 0 && (
            <p className="text-center text-gray-400 py-12">No pending evidence reviews</p>
          )}
        </div>
      )}
    </div>
  );
}
