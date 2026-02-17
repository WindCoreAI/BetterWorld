"use client";

/**
 * Mentorship Dashboard Page (Sprint 18: Cooperative Depth & Governance — US1)
 *
 * Shows mentor suggestions for newcomers, active mentorships,
 * mentee list for mentors, and past mentorships.
 */
import { useState } from "react";

import { MenteeCard } from "../../src/components/mentorship/MenteeCard";
import { MentorCard } from "../../src/components/mentorship/MentorCard";
import { useHumanAuth } from "../../src/hooks/useHumanAuth";
import {
  useMentorshipSuggestions,
  useMentorships,
  useMentorshipMutations,
} from "../../src/hooks/useMentorships";

// eslint-disable-next-line complexity
export default function MentorshipPage() {
  const { user } = useHumanAuth();
  const [activeTab, setActiveTab] = useState<"active" | "past">("active");

  const suggestionsQuery = useMentorshipSuggestions();
  const activeQuery = useMentorships({ status: "active" });
  const pendingQuery = useMentorships({ status: "pending" });
  const pastQuery = useMentorships({ status: activeTab === "past" ? "completed" : undefined });

  const { create, accept, decline, end, rate } = useMentorshipMutations();

  const suggestions = suggestionsQuery.data?.ok ? suggestionsQuery.data.data?.suggestions ?? [] : [];
  const activeMentorships = activeQuery.data?.ok ? activeQuery.data.data?.mentorships ?? [] : [];
  const pendingMentorships = pendingQuery.data?.ok ? pendingQuery.data.data?.mentorships ?? [] : [];
  const pastMentorships = pastQuery.data?.ok ? pastQuery.data.data?.mentorships ?? [] : [];

  const handleRate = (id: string) => {
    const rating = prompt("Rate your mentorship experience (1-5):");
    if (rating) {
      const num = parseInt(rating, 10);
      if (num >= 1 && num <= 5) {
        rate.mutate({ id, rating: num });
      }
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="mb-2 text-2xl font-bold text-charcoal">Mentorship</h1>
      <p className="mb-6 text-sm text-charcoal-light">
        Connect with experienced community members for guidance, or mentor newcomers to earn teaching rewards.
      </p>

      {/* Pending Mentorships */}
      {pendingMentorships.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-charcoal mb-3">Pending Requests</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pendingMentorships.map((ms: Record<string, unknown>) => (
              <MenteeCard
                key={ms.id as string}
                mentorship={ms as Record<string, unknown> & { id: string; mentorHumanId: string; menteeHumanId: string; mentorDisplayName: string; menteeDisplayName: string; domain: string; status: string; missionsGuided: number; tokensEarnedByMentor: number; expiresAt: string; createdAt: string }}
                currentUserId={user?.id ?? ""}
                onAccept={(id) => accept.mutate(id)}
                onDecline={(id) => decline.mutate(id)}
                isLoading={accept.isPending || decline.isPending}
              />
            ))}
          </div>
        </section>
      )}

      {/* Active Mentorships */}
      {activeMentorships.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-charcoal mb-3">Active Mentorships</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeMentorships.map((ms: Record<string, unknown>) => (
              <MenteeCard
                key={ms.id as string}
                mentorship={ms as Record<string, unknown> & { id: string; mentorHumanId: string; menteeHumanId: string; mentorDisplayName: string; menteeDisplayName: string; domain: string; status: string; missionsGuided: number; tokensEarnedByMentor: number; expiresAt: string; createdAt: string }}
                currentUserId={user?.id ?? ""}
                onEnd={(id) => end.mutate(id)}
                isLoading={end.isPending}
              />
            ))}
          </div>
        </section>
      )}

      {/* Mentor Suggestions (for newcomers without active mentorships) */}
      {activeMentorships.length === 0 && suggestions.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-charcoal mb-3">Suggested Mentors</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((s: Record<string, unknown>) => (
              <MentorCard
                key={s.humanId as string}
                suggestion={s as Record<string, unknown> & { humanId: string; displayName: string; tier: string; primaryDomain: string | null; city: string | null; activeMenteeCount: number; sharedDomain: boolean; sameCity: boolean; score: number }}
                onRequest={(id) => create.mutate(id)}
                isLoading={create.isPending}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {activeMentorships.length === 0 &&
        pendingMentorships.length === 0 &&
        suggestions.length === 0 && (
          <div className="rounded-xl bg-white shadow-neu-sm p-8 text-center">
            <p className="text-charcoal-light">
              {suggestionsQuery.isLoading || activeQuery.isLoading
                ? "Loading mentorships..."
                : "No mentorship activity yet. As you grow in the community, mentorship opportunities will appear."}
            </p>
          </div>
        )}

      {/* Past Mentorships Tab */}
      <section className="mt-8">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => setActiveTab("active")}
            className={`text-sm font-medium ${activeTab === "active" ? "text-terracotta border-b-2 border-terracotta" : "text-charcoal-light"}`}
          >
            Active
          </button>
          <button
            onClick={() => setActiveTab("past")}
            className={`text-sm font-medium ${activeTab === "past" ? "text-terracotta border-b-2 border-terracotta" : "text-charcoal-light"}`}
          >
            Past
          </button>
        </div>

        {activeTab === "past" && pastMentorships.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pastMentorships.map((ms: Record<string, unknown>) => (
              <MenteeCard
                key={ms.id as string}
                mentorship={ms as Record<string, unknown> & { id: string; mentorHumanId: string; menteeHumanId: string; mentorDisplayName: string; menteeDisplayName: string; domain: string; status: string; missionsGuided: number; tokensEarnedByMentor: number; expiresAt: string; createdAt: string }}
                currentUserId={user?.id ?? ""}
                onRate={handleRate}
              />
            ))}
          </div>
        )}

        {activeTab === "past" && pastMentorships.length === 0 && (
          <p className="text-sm text-charcoal-light">No past mentorships.</p>
        )}
      </section>
    </div>
  );
}
