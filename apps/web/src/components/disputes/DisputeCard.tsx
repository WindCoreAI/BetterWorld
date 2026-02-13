"use client";

import { Card, CardBody } from "../ui";

interface DisputeCardProps {
  dispute: {
    id: string;
    consensusId: string;
    stakeAmount: number;
    reasoning: string;
    status: "open" | "admin_review" | "upheld" | "overturned" | "dismissed";
    adminNotes?: string | null;
    stakeReturned: boolean;
    bonusPaid: boolean;
    createdAt: string;
    resolvedAt?: string | null;
  };
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: "bg-blue-100", text: "text-blue-800", label: "Open" },
  admin_review: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Under Review" },
  upheld: { bg: "bg-green-100", text: "text-green-800", label: "Upheld" },
  overturned: { bg: "bg-orange-100", text: "text-orange-800", label: "Overturned" },
  dismissed: { bg: "bg-red-100", text: "text-red-800", label: "Dismissed" },
};

export default function DisputeCard({ dispute }: DisputeCardProps) {
  const defaultStyle = { bg: "bg-blue-100", text: "text-blue-800", label: "Open" };
  const style = STATUS_STYLES[dispute.status] ?? defaultStyle;

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm text-gray-500">
              Consensus: {dispute.consensusId.slice(0, 8)}...
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Filed: {new Date(dispute.createdAt).toLocaleDateString()}
            </p>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
            {style.label}
          </span>
        </div>

        <p className="text-sm text-gray-700 mb-3 line-clamp-3">{dispute.reasoning}</p>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">
            Stake: {dispute.stakeAmount} credits
          </span>

          {dispute.status === "upheld" && (
            <span className="text-green-600 font-medium">
              +{dispute.stakeAmount + 5} credits returned
            </span>
          )}
          {dispute.status === "dismissed" && (
            <span className="text-red-600 font-medium">
              -{dispute.stakeAmount} credits forfeited
            </span>
          )}
        </div>

        {dispute.adminNotes && (
          <div className="mt-3 p-2 bg-gray-50 rounded text-sm text-gray-600">
            <p className="font-medium text-xs text-gray-500 mb-1">Admin Notes</p>
            {dispute.adminNotes}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
