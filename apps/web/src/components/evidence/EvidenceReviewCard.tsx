"use client";

import { Card, CardBody } from "../ui";

interface EvidenceReviewAssignment {
  id: string;
  evidenceId: string;
  capabilityMatch: string | null;
  status: "pending" | "completed" | "expired";
  expiresAt: string;
  assignedAt: string;
  evidence?: {
    evidenceType: string;
    contentUrl: string | null;
    thumbnailUrl: string | null;
    missionTitle?: string;
  };
}

interface EvidenceReviewCardProps {
  assignment: EvidenceReviewAssignment;
  onReview: (id: string) => void;
}

export default function EvidenceReviewCard({ assignment, onReview }: EvidenceReviewCardProps) {
  const isExpired = new Date(assignment.expiresAt) < new Date();
  const timeLeft = Math.max(0, Math.round((new Date(assignment.expiresAt).getTime() - Date.now()) / 60000));

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm font-medium">
              Evidence Review
              {assignment.capabilityMatch && (
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                  {assignment.capabilityMatch}
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Assigned: {new Date(assignment.assignedAt).toLocaleString()}
            </p>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            assignment.status === "pending" ? "bg-yellow-100 text-yellow-800" :
            assignment.status === "completed" ? "bg-green-100 text-green-800" :
            "bg-gray-100 text-gray-600"
          }`}>
            {assignment.status}
          </span>
        </div>

        {assignment.evidence && (
          <div className="mb-3 text-sm text-gray-600">
            <p>Type: {assignment.evidence.evidenceType}</p>
            {assignment.evidence.missionTitle && (
              <p className="mt-1">Mission: {assignment.evidence.missionTitle}</p>
            )}
          </div>
        )}

        {assignment.status === "pending" && !isExpired && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {timeLeft > 0 ? `${timeLeft} min remaining` : "Expiring soon"}
            </span>
            <button
              onClick={() => onReview(assignment.id)}
              className="bg-emerald-600 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-emerald-700"
            >
              Review
            </button>
          </div>
        )}

        {isExpired && assignment.status === "pending" && (
          <p className="text-xs text-red-500 font-medium">Expired</p>
        )}
      </CardBody>
    </Card>
  );
}
