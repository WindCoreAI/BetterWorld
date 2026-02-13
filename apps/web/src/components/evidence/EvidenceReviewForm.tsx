"use client";

import { useState } from "react";

import { Card, CardBody } from "../ui";

interface EvidenceReviewFormProps {
  reviewId: string;
  onSubmit: (data: {
    recommendation: "verified" | "rejected" | "needs_more_info";
    confidence: number;
    reasoning: string;
  }) => Promise<void>;
  onCancel: () => void;
}

export default function EvidenceReviewForm({ reviewId, onSubmit, onCancel }: EvidenceReviewFormProps) {
  const [recommendation, setRecommendation] = useState<"verified" | "rejected" | "needs_more_info" | null>(null);
  const [confidence, setConfidence] = useState(0.8);
  const [reasoning, setReasoning] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = recommendation !== null && reasoning.length >= 10;

  const handleSubmit = async () => {
    if (!recommendation || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ recommendation, confidence, reasoning });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <h3 className="text-lg font-semibold mb-4">Submit Evidence Review</h3>
        <p className="text-xs text-gray-500 mb-4">Review ID: {reviewId.slice(0, 8)}...</p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Recommendation</label>
          <div className="flex gap-2">
            {(["verified", "rejected", "needs_more_info"] as const).map((rec) => (
              <button
                key={rec}
                onClick={() => setRecommendation(rec)}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium border ${
                  recommendation === rec
                    ? rec === "verified" ? "bg-green-600 text-white border-green-600" :
                      rec === "rejected" ? "bg-red-600 text-white border-red-600" :
                      "bg-yellow-500 text-white border-yellow-500"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {rec === "needs_more_info" ? "Needs Info" : rec.charAt(0).toUpperCase() + rec.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Confidence: {confidence.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={confidence}
            onChange={(e) => setConfidence(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-400">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="review-reasoning" className="block text-sm font-medium text-gray-700 mb-1">
            Reasoning (min 10 characters)
          </label>
          <textarea
            id="review-reasoning"
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            className="w-full border border-gray-300 rounded-md p-3 text-sm min-h-[80px] focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="Explain your assessment..."
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="flex-1 bg-emerald-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : "Submit Review (Earn 1.5 Credits)"}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </CardBody>
    </Card>
  );
}
