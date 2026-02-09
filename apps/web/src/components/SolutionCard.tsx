import Link from "next/link";

import { Card, CardBody, CardFooter, Badge } from "./ui";
import { formatRelativeTime } from "../utils/time";

interface SolutionCardProps {
  id: string;
  title: string;
  description: string;
  compositeScore: string;
  problemTitle: string;
  agentDebateCount: number;
  guardrailStatus?: string;
  status: string;
  createdAt: string;
  agent?: { username: string };
}

function resolveGuardrailBadgeStatus(
  guardrailStatus: string,
): "pending" | "flagged" | undefined {
  if (guardrailStatus === "pending") return "pending";
  if (guardrailStatus === "flagged") return "flagged";
  return undefined;
}

export function SolutionCard({
  id,
  title,
  description,
  compositeScore,
  problemTitle,
  agentDebateCount,
  guardrailStatus,
  status,
  createdAt,
  agent,
}: SolutionCardProps) {
  const score = Math.min(100, Math.max(0, parseFloat(compositeScore) || 0));
  const badgeStatus =
    guardrailStatus && guardrailStatus !== "approved"
      ? resolveGuardrailBadgeStatus(guardrailStatus)
      : undefined;

  return (
    <Link href={`/solutions/${id}`}>
      <Card className="cursor-pointer">
        <CardBody>
          {/* Score bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-charcoal-light">
                Score
              </span>
              <span className="text-xs font-semibold text-terracotta">
                {score.toFixed(1)}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-charcoal/10">
              <div
                className="h-1.5 rounded-full bg-terracotta transition-all duration-300"
                style={{ width: `${score}%` }}
              />
            </div>
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="domain" size="sm">
              {status}
            </Badge>
            {badgeStatus && (
              <Badge variant="status" size="sm" status={badgeStatus}>
                {guardrailStatus === "pending" ? "Pending" : "Flagged"}
              </Badge>
            )}
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold text-charcoal line-clamp-2 mb-2">
            {title}
          </h3>

          {/* Description */}
          <p className="text-sm text-charcoal-light line-clamp-2 mb-3">
            {description}
          </p>

          {/* Linked problem */}
          <p className="text-xs text-charcoal-light">
            Problem:{" "}
            <span className="text-terracotta font-medium">{problemTitle}</span>
          </p>
        </CardBody>

        <CardFooter>
          <div className="flex items-center gap-4 text-sm text-charcoal-light">
            {agent && <span>by {agent.username}</span>}
            <span>{formatRelativeTime(createdAt)}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-charcoal-light">
            <Badge variant="domain" size="sm">
              {agentDebateCount} {agentDebateCount === 1 ? "debate" : "debates"}
            </Badge>
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}
