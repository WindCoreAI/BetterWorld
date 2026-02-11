"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  EvidenceStatusCard,
  MissionsCard,
  PeerReviewsCard,
  ProfileCompletenessCard,
  RecentActivityCard,
  TokenBalanceCard,
} from "../../src/components/dashboard/DashboardCards";
import { useHumanAuth } from "../../src/hooks/useHumanAuth";
import { dashboardApi } from "../../src/lib/humanApi";

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user, loading: authLoading } = useHumanAuth();

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/auth/human/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const {
    data: dashboard,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await dashboardApi.get();
      if (!res.ok) throw new Error(res.error?.message ?? "Failed to load dashboard");
      return res.data!;
    },
    enabled: isAuthenticated,
    refetchInterval: 30_000, // Poll every 30s
  });

  if (authLoading || (!isAuthenticated && !authLoading)) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-terracotta border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-charcoal mb-8">Dashboard</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-40 bg-charcoal/5 rounded-xl animate-pulse"
              />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (error || !dashboard) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl font-bold text-charcoal mb-4">Dashboard</h1>
          <p className="text-charcoal-light mb-4">
            {error instanceof Error ? error.message : "Failed to load dashboard data"}
          </p>
          <button
            onClick={() => refetch()}
            className="px-6 py-2 bg-terracotta text-cream rounded-lg hover:bg-terracotta-dark transition-colors"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-charcoal">
            Welcome back, {user?.displayName ?? "Human"}
          </h1>
          <p className="text-charcoal-light mt-1">
            Your impact dashboard
          </p>
        </div>

        {/* Orientation banner */}
        {!dashboard.profile.orientationCompleted && (
          <div className="mb-6 p-4 bg-terracotta/10 rounded-xl flex items-center justify-between">
            <div>
              <p className="font-medium text-charcoal">
                Complete your orientation
              </p>
              <p className="text-sm text-charcoal-light">
                Earn 10 ImpactTokens and unlock missions
              </p>
            </div>
            <Link
              href="/onboarding"
              className="px-4 py-2 bg-terracotta text-cream rounded-lg text-sm font-medium hover:bg-terracotta-dark transition-colors"
            >
              Start
            </Link>
          </div>
        )}

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TokenBalanceCard tokens={dashboard.tokens} />
          <ProfileCompletenessCard profile={dashboard.profile} />
          <MissionsCard
            missions={dashboard.missions}
            orientationCompleted={dashboard.profile.orientationCompleted}
          />
          <RecentActivityCard activities={dashboard.recentActivity} />
          {dashboard.evidenceStatus && (
            <EvidenceStatusCard evidenceStatus={dashboard.evidenceStatus} />
          )}
          {dashboard.peerReviews && (
            <PeerReviewsCard peerReviews={dashboard.peerReviews} />
          )}
        </div>
      </div>
    </main>
  );
}
