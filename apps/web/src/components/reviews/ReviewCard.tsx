"use client";

import { useState } from "react";

interface ReviewCardProps {
  evidenceId: string;
  missionTitle: string;
  missionDescription: string;
  evidenceType: string;
  contentUrl: string | null;
  thumbnailUrl: string | null;
  gpsDistanceMeters: number | null;
  onVote: (evidenceId: string, verdict: "approve" | "reject", confidence: number, reasoning: string) => Promise<void>;
}

export function ReviewCard({
  evidenceId,
  missionTitle,
  missionDescription,
  evidenceType: _evidenceType,
  contentUrl: _contentUrl,
  thumbnailUrl,
  gpsDistanceMeters,
  onVote,
}: ReviewCardProps) {
  const [verdict, setVerdict] = useState<"approve" | "reject" | null>(null);
  const [confidence, setConfidence] = useState(0.5);
  const [reasoning, setReasoning] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!verdict || reasoning.length < 20) {
      setError("Please select a verdict and provide reasoning (min 20 chars)");
      return;
    }
    setSubmitting(true);
    try {
      await onVote(evidenceId, verdict, confidence, reasoning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div>
        <h3 className="font-medium text-gray-900">{missionTitle}</h3>
        <p className="text-sm text-gray-600 mt-1">{missionDescription}</p>
      </div>

      {thumbnailUrl && (
        <div className="relative aspect-video bg-gray-100 rounded overflow-hidden">
          <img src={thumbnailUrl} alt="Evidence" className="object-contain w-full h-full" />
        </div>
      )}

      {gpsDistanceMeters !== null && (
        <div className="text-sm text-gray-600">
          GPS distance: {gpsDistanceMeters}m from mission location
        </div>
      )}

      <div className="space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => setVerdict("approve")}
            className={`flex-1 py-2 rounded text-sm font-medium ${verdict === "approve" ? "bg-green-600 text-white" : "bg-green-50 text-green-700 border border-green-200"}`}
          >
            Approve
          </button>
          <button
            onClick={() => setVerdict("reject")}
            className={`flex-1 py-2 rounded text-sm font-medium ${verdict === "reject" ? "bg-red-600 text-white" : "bg-red-50 text-red-700 border border-red-200"}`}
          >
            Reject
          </button>
        </div>

        <div>
          <label className="text-sm text-gray-600">
            Confidence: {Math.round(confidence * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={confidence * 100}
            onChange={(e) => setConfidence(parseInt(e.target.value) / 100)}
            className="w-full"
          />
        </div>

        <textarea
          value={reasoning}
          onChange={(e) => setReasoning(e.target.value)}
          placeholder="Explain your decision (min 20 chars)..."
          rows={3}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !verdict || reasoning.length < 20}
          className="w-full py-2 rounded bg-blue-600 text-white font-medium text-sm disabled:bg-gray-400"
        >
          {submitting ? "Submitting..." : "Submit Vote"}
        </button>
      </div>
    </div>
  );
}
