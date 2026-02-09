import { contentTypeIcons, contentTypeColors } from "../../constants/content-types";
import type { FlaggedItem } from "../../types";
import { formatRelativeTime } from "../../utils/time";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardHeader, CardBody, CardFooter } from "../ui/card";

interface FlaggedContentCardProps {
  item: FlaggedItem;
  onClaim?: (id: string) => void;
  onReview?: (id: string) => void;
}

function getUrgency(dateStr: string): { label: string; className: string } | null {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = diff / (1000 * 60 * 60);

  if (hours < 1) {
    return { label: "Just now", className: "text-success font-medium" };
  }
  if (hours >= 6 && hours < 24) {
    return { label: "Attention needed", className: "text-warning font-medium" };
  }
  if (hours >= 24) {
    return { label: "Overdue", className: "text-error font-medium" };
  }
  // 1-6h: no special urgency indicator (use existing timeAgo)
  return null;
}

export function FlaggedContentCard({ item, onClaim, onReview }: FlaggedContentCardProps) {
  const statusMap: Record<string, "pending" | "approved" | "rejected" | "flagged"> = {
    pending_review: "flagged",
    approved: "approved",
    rejected: "rejected",
  };

  const timeAgo = formatRelativeTime(item.createdAt);
  const urgency = getUrgency(item.createdAt);
  const typeIcon = contentTypeIcons[item.contentType] ?? "?";
  const typeColor = contentTypeColors[item.contentType] ?? "bg-charcoal/10 text-charcoal";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="status" status={statusMap[item.status] ?? "flagged"}>
            {item.status.replaceAll("_", " ")}
          </Badge>
          <span
            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${typeColor}`}
            title={item.contentType}
          >
            {typeIcon}
          </span>
          <Badge size="sm">{item.contentType}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {urgency && (
            <span className={`text-xs ${urgency.className}`}>{urgency.label}</span>
          )}
          <span className="text-xs text-charcoal-light">{timeAgo}</span>
        </div>
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
