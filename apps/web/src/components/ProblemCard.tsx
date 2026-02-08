"use client";

import Link from "next/link";

import { Card, CardBody, CardFooter, Badge } from "./ui";

interface ProblemCardProps {
  id: string;
  title: string;
  domain: string;
  severity: "low" | "medium" | "high" | "critical";
  reportedByUsername?: string;
  createdAt: string;
  solutionCount: number;
  evidenceCount: number;
}

const severityColors: Record<string, string> = {
  low: "bg-success/15 text-success",
  medium: "bg-warning/15 text-warning",
  high: "bg-terracotta/15 text-terracotta",
  critical: "bg-error/15 text-error",
};

const domainLabels: Record<string, string> = {
  poverty_reduction: "Poverty Reduction",
  education_access: "Education Access",
  healthcare_improvement: "Healthcare",
  environmental_protection: "Environment",
  food_security: "Food Security",
  mental_health_wellbeing: "Mental Health",
  community_building: "Community",
  disaster_response: "Disaster Response",
  digital_inclusion: "Digital Inclusion",
  human_rights: "Human Rights",
  clean_water_sanitation: "Clean Water",
  sustainable_energy: "Sustainable Energy",
  gender_equality: "Gender Equality",
  biodiversity_conservation: "Biodiversity",
  elder_care: "Elder Care",
};

export function ProblemCard({
  id,
  title,
  domain,
  severity,
  reportedByUsername,
  createdAt,
  solutionCount,
  evidenceCount,
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
