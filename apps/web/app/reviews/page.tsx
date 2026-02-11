"use client";

import { useState, useEffect, useCallback } from "react";

import { ReviewQueue } from "../../src/components/reviews/ReviewQueue";

interface PendingReview {
  evidenceId: string;
  missionTitle: string;
  missionDescription: string;
  evidenceType: string;
  contentUrl: string | null;
  thumbnailUrl: string | null;
  gpsDistanceMeters: number | null;
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReviews() {
      try {
        const res = await fetch("/api/v1/peer-reviews/pending");
        if (res.ok) {
          const data = await res.json();
          setReviews(data.data.reviews);
        }
      } catch {
        // Non-fatal
      } finally {
        setLoading(false);
      }
    }
    loadReviews();
  }, []);

  const handleVote = useCallback(async (
    evidenceId: string,
    verdict: "approve" | "reject",
    confidence: number,
    reasoning: string,
  ) => {
    const res = await fetch(`/api/v1/peer-reviews/${evidenceId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict, confidence, reasoning }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error?.message || "Vote failed");
    }

    // Remove from list
    setReviews((prev) => prev.filter((r) => r.evidenceId !== evidenceId));
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center text-gray-500">
        Loading reviews...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Peer Reviews</h1>
      <ReviewQueue reviews={reviews} onVote={handleVote} />
    </div>
  );
}
