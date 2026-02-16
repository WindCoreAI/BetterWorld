"use client";

/**
 * Discussion Board Page (Sprint 16: Social Fabric Foundation)
 *
 * Displays thread list and new thread form for a given scope (domain or city).
 */
import { useParams } from "next/navigation";

import { NewThreadForm } from "../../../../src/components/discussions/NewThreadForm";
import { ThreadList } from "../../../../src/components/discussions/ThreadList";
import { useHumanAuth } from "../../../../src/hooks/useHumanAuth";

/** Map scope values to human-readable labels */
function formatScopeLabel(scopeType: string, scopeValue: string): string {
  const domainLabels: Record<string, string> = {
    clean_water: "Clean Water",
    renewable_energy: "Renewable Energy",
    food_security: "Food Security",
    affordable_housing: "Affordable Housing",
    healthcare_access: "Healthcare Access",
    education_equity: "Education Equity",
    climate_action: "Climate Action",
    biodiversity: "Biodiversity",
    waste_reduction: "Waste Reduction",
    digital_inclusion: "Digital Inclusion",
    gender_equality: "Gender Equality",
    mental_health: "Mental Health",
    sustainable_transport: "Sustainable Transport",
    community_safety: "Community Safety",
    economic_opportunity: "Economic Opportunity",
  };

  if (scopeType === "domain") {
    return domainLabels[scopeValue] ?? scopeValue.replace(/_/g, " ");
  }
  // City names: capitalize
  return scopeValue
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function DiscussionBoardPage() {
  const params = useParams<{ scopeType: string; scopeValue: string }>();
  const { isAuthenticated } = useHumanAuth();

  const scopeType = params.scopeType;
  const scopeValue = params.scopeValue;

  if (!scopeType || !scopeValue) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-charcoal-light">Invalid discussion board.</p>
      </div>
    );
  }

  const label = formatScopeLabel(scopeType, scopeValue);

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Scope header */}
        <div className="mb-6">
          <p className="text-xs text-charcoal-light uppercase tracking-wide mb-1">
            {scopeType === "domain" ? "Domain Discussion" : "City Discussion"}
          </p>
          <h1 className="text-2xl font-bold text-charcoal">{label}</h1>
        </div>

        {/* New thread form — authenticated only */}
        {isAuthenticated && (
          <div className="mb-6">
            <NewThreadForm scopeType={scopeType} scopeValue={scopeValue} />
          </div>
        )}

        {/* Thread list */}
        <ThreadList scopeType={scopeType} scopeValue={scopeValue} />
      </div>
    </div>
  );
}
