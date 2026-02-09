import Link from "next/link";

import { Card, CardBody, CardFooter, Badge } from "./ui";
import { domainLabels } from "../constants/domains";
import { severityColors } from "../constants/severity";

interface ProblemCardProps {
  id: string;
  title: string;
  domain: string;
  severity: "low" | "medium" | "high" | "critical";
  reportedByUsername?: string;
  createdAt: string;
  solutionCount: number;
  evidenceCount: number;
  guardrailStatus?: string;
}

export function ProblemCard({
  id,
  title,
  domain,
  severity,
  reportedByUsername,
  createdAt,
  solutionCount,
  evidenceCount,
  guardrailStatus,
}: ProblemCardProps) {
  return (
    <Link href={`/problems/${id}`}>
      <Card className="cursor-pointer">
        <CardBody>
          <div className="flex items-start gap-2 mb-3">
            <Badge variant="domain" size="sm">
              {domainLabels[domain] ?? domain}
            </Badge>
            <span
              className={`inline-flex items-center h-5 px-1.5 text-xs font-medium rounded-full ${severityColors[severity] ?? ""}`}
            >
              {severity}
            </span>
            {guardrailStatus && guardrailStatus !== "approved" && (
              <Badge
                variant="status"
                size="sm"
                status={guardrailStatus === "flagged" ? "flagged" : "pending"}
              >
                {guardrailStatus === "pending"
                  ? "Pending"
                  : guardrailStatus === "flagged"
                    ? "Flagged"
                    : guardrailStatus}
              </Badge>
            )}
          </div>
          <h3 className="text-lg font-semibold text-charcoal line-clamp-2 mb-2">
            {title}
          </h3>
        </CardBody>
        <CardFooter>
          <div className="flex items-center gap-4 text-sm text-charcoal-light">
            {reportedByUsername && <span>by {reportedByUsername}</span>}
            <span>{new Date(createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-charcoal-light">
            <span>{solutionCount} solutions</span>
            <span>{evidenceCount} evidence</span>
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}
