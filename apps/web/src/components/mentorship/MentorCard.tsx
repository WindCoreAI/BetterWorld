"use client";

import { MentorBadge } from "../badges/MentorBadge";
import { TierBadge } from "../reputation/TierBadge";

interface MentorSuggestion {
  humanId: string;
  displayName: string;
  tier: string;
  primaryDomain: string | null;
  city: string | null;
  activeMenteeCount: number;
  sharedDomain: boolean;
  sameCity: boolean;
  score: number;
}

interface MentorCardProps {
  suggestion: MentorSuggestion;
  onRequest: (humanId: string) => void;
  isLoading?: boolean;
}

export function MentorCard({ suggestion, onRequest, isLoading }: MentorCardProps) {
  const domainLabel = suggestion.primaryDomain?.replace(/_/g, " ") ?? "General";

  return (
    <div className="rounded-xl bg-white shadow-neu-sm p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-charcoal">{suggestion.displayName}</span>
          <TierBadge tier={suggestion.tier} size="sm" />
        </div>
        <MentorBadge activeMenteeCount={suggestion.activeMenteeCount} size="sm" />
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-charcoal-light">
        <span className="capitalize">{domainLabel}</span>
        {suggestion.city && <span>{suggestion.city}</span>}
      </div>

      <div className="flex gap-2 text-xs">
        {suggestion.sharedDomain && (
          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">Same Domain</span>
        )}
        {suggestion.sameCity && (
          <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full">Same City</span>
        )}
      </div>

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-charcoal/10">
        <span className="text-xs text-charcoal-light">
          Match Score: {suggestion.score}
        </span>
        <button
          onClick={() => onRequest(suggestion.humanId)}
          disabled={isLoading}
          className="px-3 py-1.5 bg-terracotta text-white text-sm rounded-lg hover:bg-terracotta-dark transition-colors disabled:opacity-50"
        >
          {isLoading ? "Requesting..." : "Request Mentor"}
        </button>
      </div>
    </div>
  );
}
