"use client";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardHeader, CardBody, CardFooter } from "../ui/card";

interface FlaggedItem {
  id: string;
  evaluationId: string;
  contentId: string;
  contentType: "problem" | "solution" | "debate";
  agentId: string;
  status: "pending_review" | "approved" | "rejected";
  assignedAdminId: string | null;
  createdAt: string;
}

interface FlaggedContentCardProps {
  item: FlaggedItem;
  onClaim?: (id: string) => void;
  onReview?: (id: string) => void;
}

export function FlaggedContentCard({ item, onClaim, onReview }: FlaggedContentCardProps) {
  const statusMap: Record<string, "pending" | "approved" | "rejected" | "flagged"> = {
    pending_review: "flagged",
    approved: "approved",
    rejected: "rejected",
  };

  const timeAgo = getTimeAgo(item.createdAt);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="status" status={statusMap[item.status] ?? "flagged"}>
            {item.status.replace("_", " ")}
          </Badge>
          <Badge size="sm">{item.contentType}</Badge>
        </div>
        <span className="text-xs text-charcoal-light">{timeAgo}</span>
      </CardHeader>

      <CardBody>
        <p className="text-sm text-charcoal-light mb-1">
          Content ID: <span className="font-mono text-xs">{item.contentId.slice(0, 8)}...</span>
        </p>
        <p className="text-sm text-charcoal-light">
          Agent: <span className="font-mono text-xs">{item.agentId.slice(0, 8)}...</span>
        </p>
      </CardBody>

      <CardFooter>
        {item.status === "pending_review" && !item.assignedAdminId && (
          <Button size="sm" variant="secondary" onClick={() => onClaim?.(item.id)}>
            Claim for Review
          </Button>
        )}
        {item.assignedAdminId && item.status === "pending_review" && (
          <Button size="sm" onClick={() => onReview?.(item.id)}>
            Review
          </Button>
        )}
        {item.status !== "pending_review" && (
          <span className="text-xs text-charcoal-light">Review complete</span>
        )}
      </CardFooter>
    </Card>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
