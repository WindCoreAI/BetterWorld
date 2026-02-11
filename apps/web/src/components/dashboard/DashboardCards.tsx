/** Dashboard card components (Sprint 6) */

import Link from "next/link";

import type { DashboardData } from "../../types/human";
import { formatRelativeTime } from "../../utils/time";
import { Card, CardBody } from "../ui";

// ── Token Balance Card ──

export function TokenBalanceCard({ tokens }: { tokens: DashboardData["tokens"] }) {
  return (
    <Card>
      <CardBody>
        <h3 className="text-sm font-medium text-charcoal-light mb-3">
          ImpactTokens
        </h3>
        <p className="text-4xl font-bold text-terracotta mb-4">
          {tokens.balance} <span className="text-lg font-normal">IT</span>
        </p>
        <div className="flex justify-between text-sm text-charcoal-light">
          <span>
            Earned:{" "}
            <span className="font-medium text-charcoal">
              {tokens.totalEarned}
            </span>
          </span>
          <span>
            Spent:{" "}
            <span className="font-medium text-charcoal">
              {tokens.totalSpent}
            </span>
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

// ── Profile Completeness Card ──

export function ProfileCompletenessCard({
  profile,
}: {
  profile: DashboardData["profile"];
}) {
  const percentage = Math.round(profile.completenessScore);

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-charcoal-light">
            Profile Completeness
          </h3>
          <span className="text-lg font-bold text-charcoal">{percentage}%</span>
        </div>

        {/* Progress bar */}
        <div className="h-2.5 bg-charcoal/10 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-terracotta rounded-full transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {profile.suggestions.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-charcoal-light mb-1">Improve your profile:</p>
            {profile.suggestions.slice(0, 3).map((suggestion) => (
              <p key={suggestion} className="text-xs text-charcoal-light flex items-center gap-1">
                <span className="text-terracotta">&#8226;</span> {suggestion}
              </p>
            ))}
          </div>
        )}

        {percentage < 100 && (
          <Link
            href="/auth/human/profile"
            className="block mt-3 text-xs text-terracotta hover:underline"
          >
            Edit profile
          </Link>
        )}
      </CardBody>
    </Card>
  );
}

// ── Missions Card ──

export function MissionsCard({
  missions,
  orientationCompleted,
}: {
  missions: DashboardData["missions"];
  orientationCompleted: boolean;
}) {
  return (
    <Card>
      <CardBody>
        <h3 className="text-sm font-medium text-charcoal-light mb-3">
          Missions
        </h3>

        {!orientationCompleted ? (
          <div className="text-center py-4">
            <p className="text-charcoal-light text-sm mb-3">
              Complete orientation to unlock missions
            </p>
            <Link
              href="/onboarding"
              className="inline-block px-4 py-2 bg-terracotta text-cream rounded-lg text-sm font-medium hover:bg-terracotta-dark transition-colors"
            >
              Start Orientation
            </Link>
          </div>
        ) : missions.active === 0 && missions.completed === 0 ? (
          <div className="text-center py-4">
            <p className="text-charcoal-light text-sm">
              Missions coming soon! Complete your profile to be ready for
              matching.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-charcoal">
                {missions.active}
              </p>
              <p className="text-xs text-charcoal-light">Active</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-charcoal">
                {missions.completed}
              </p>
              <p className="text-xs text-charcoal-light">Completed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-charcoal">
                {missions.streakDays}
              </p>
              <p className="text-xs text-charcoal-light">Day Streak</p>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── Recent Activity ──

export function RecentActivityCard({
  activities,
}: {
  activities: DashboardData["recentActivity"];
}) {
  return (
    <Card>
      <CardBody>
        <h3 className="text-sm font-medium text-charcoal-light mb-3">
          Recent Activity
        </h3>

        {activities.length === 0 ? (
          <p className="text-sm text-charcoal-light text-center py-4">
            No activity yet. Complete orientation to get started!
          </p>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span
                    className={`flex-shrink-0 w-2 h-2 mt-1.5 rounded-full ${
                      activity.type === "token_earned"
                        ? "bg-green-500"
                        : activity.type === "token_spent"
                          ? "bg-terracotta"
                          : "bg-charcoal/30"
                    }`}
                  />
                  <span className="text-charcoal truncate">
                    {activity.description}
                  </span>
                </div>
                <div className="flex-shrink-0 text-right">
                  {activity.amount !== null && (
                    <span
                      className={`font-medium ${
                        activity.amount > 0
                          ? "text-green-600"
                          : "text-terracotta"
                      }`}
                    >
                      {activity.amount > 0 ? "+" : ""}
                      {activity.amount} IT
                    </span>
                  )}
                  <p className="text-xs text-charcoal-light">
                    {formatRelativeTime(activity.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// -- Evidence Status Card (Sprint 8) --

interface EvidenceStatusData {
  pending: number;
  verified: number;
  rejected: number;
}

export function EvidenceStatusCard({ evidenceStatus }: { evidenceStatus: EvidenceStatusData }) {
  const total = evidenceStatus.pending + evidenceStatus.verified + evidenceStatus.rejected;

  return (
    <Card>
      <CardBody>
        <h3 className="text-sm font-medium text-charcoal-light mb-3">
          Evidence Submissions
        </h3>

        {total === 0 ? (
          <p className="text-sm text-charcoal-light text-center py-4">
            No evidence submitted yet. Claim a mission to get started!
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-yellow-600">
                {evidenceStatus.pending}
              </p>
              <p className="text-xs text-charcoal-light">Pending</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">
                {evidenceStatus.verified}
              </p>
              <p className="text-xs text-charcoal-light">Verified</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">
                {evidenceStatus.rejected}
              </p>
              <p className="text-xs text-charcoal-light">Rejected</p>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// -- Peer Reviews Card (Sprint 8) --

interface PeerReviewsData {
  completed: number;
  pendingCount: number;
}

export function PeerReviewsCard({ peerReviews }: { peerReviews: PeerReviewsData }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-charcoal-light">
            Peer Reviews
          </h3>
          {peerReviews.pendingCount > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-terracotta text-cream">
              {peerReviews.pendingCount} pending
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-charcoal">
              {peerReviews.completed}
            </p>
            <p className="text-xs text-charcoal-light">Reviews Done</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-charcoal">
              {peerReviews.completed * 2}
            </p>
            <p className="text-xs text-charcoal-light">IT Earned</p>
          </div>
        </div>

        {peerReviews.pendingCount > 0 && (
          <Link
            href="/reviews"
            className="block mt-3 text-center text-xs text-terracotta hover:underline"
          >
            Review pending evidence
          </Link>
        )}
      </CardBody>
    </Card>
  );
}

