"use client";

import { ReviewCard } from "./ReviewCard";

interface PendingReview {
  evidenceId: string;
  missionTitle: string;
  missionDescription: string;
  evidenceType: string;
  contentUrl: string | null;
  thumbnailUrl: string | null;
  gpsDistanceMeters: number | null;
}

interface ReviewQueueProps {
  reviews: PendingReview[];
  onVote: (evidenceId: string, verdict: "approve" | "reject", confidence: number, reasoning: string) => Promise<void>;
}

export function ReviewQueue({ reviews, onVote }: ReviewQueueProps) {
  if (reviews.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">No pending reviews</p>
        <p className="text-sm mt-1">Check back later for new evidence to review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Pending Reviews</h2>
        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-sm font-medium">
          {reviews.length}
        </span>
      </div>
      {reviews.map((review) => (
        <ReviewCard key={review.evidenceId} {...review} onVote={onVote} />
      ))}
    </div>
  );
}
