"use client";

import Link from "next/link";

import { MentorBadge } from "../badges/MentorBadge";

interface MentorshipCardProps {
  activeMentorship?: {
    id: string;
    partnerName: string;
    domain: string;
    missionsGuided: number;
    daysLeft: number;
    role: "mentor" | "mentee";
  } | null;
  mentorshipsCount?: number;
}

/**
 * Dashboard card showing active mentorship summary.
 */
export function MentorshipCard({ activeMentorship, mentorshipsCount }: MentorshipCardProps) {
  return (
    <div className="rounded-xl bg-white shadow-neu-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-charcoal">Mentorship</h3>
        <MentorBadge size="sm" />
      </div>

      {activeMentorship ? (
        <div className="space-y-2">
          <p className="text-sm text-charcoal">
            {activeMentorship.role === "mentor" ? "Mentoring" : "Learning from"}{" "}
            <span className="font-medium">{activeMentorship.partnerName}</span>
          </p>
          <div className="flex items-center gap-3 text-xs text-charcoal-light">
            <span className="capitalize">{activeMentorship.domain.replace(/_/g, " ")}</span>
            <span>{activeMentorship.missionsGuided} missions</span>
            <span>{activeMentorship.daysLeft}d left</span>
          </div>
          <Link
            href={`/mentorship`}
            className="block mt-2 text-sm text-terracotta hover:text-terracotta-dark"
          >
            View Details
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-charcoal-light">
            No active mentorship
          </p>
          <Link
            href="/mentorship"
            className="block text-sm text-terracotta hover:text-terracotta-dark"
          >
            {mentorshipsCount === 0 ? "Find a Mentor" : "View Mentorships"}
          </Link>
        </div>
      )}
    </div>
  );
}
