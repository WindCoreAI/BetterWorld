"use client";

/**
 * Network Dashboard Page (Sprint 16: Social Fabric Foundation)
 *
 * Full network view with connection list, top interaction partners,
 * and click-to-expand interaction history.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ConnectionsList } from "../../../src/components/social/ConnectionsList";
import { ConnectionSuggestions } from "../../../src/components/social/ConnectionSuggestions";
import { Card, CardBody, Badge } from "../../../src/components/ui";
import { useHumanAuth } from "../../../src/hooks/useHumanAuth";
import { useNetworkSummary, useInteractionHistory } from "../../../src/hooks/useNetwork";

export default function NetworkDashboardPage() {
  const { isAuthenticated, loading } = useHumanAuth();
  const router = useRouter();
  const { data, isLoading } = useNetworkSummary();
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/auth/human/login");
    }
  }, [loading, isAuthenticated, router]);

  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-charcoal-light">Loading...</p>
      </div>
    );
  }

  const summary = data?.ok ? data.data : null;

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-charcoal mb-6">Your Network</h1>

        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-charcoal/5 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {summary && (
          <div className="space-y-6">
            {/* Summary stats */}
            <Card>
              <CardBody>
                <div className="grid grid-cols-3 gap-6 text-center">
                  <div>
                    <p className="text-3xl font-bold text-charcoal">{summary.followersCount}</p>
                    <p className="text-sm text-charcoal-light">Followers</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-charcoal">{summary.followingCount}</p>
                    <p className="text-sm text-charcoal-light">Following</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-charcoal">{summary.connectionsCount}</p>
                    <p className="text-sm text-charcoal-light">Connections</p>
                  </div>
                </div>

                {/* Domains and cities */}
                <div className="mt-4 pt-4 border-t border-charcoal/10 flex flex-wrap gap-4">
                  {summary.sharedDomains.length > 0 && (
                    <div>
                      <p className="text-xs text-charcoal-light mb-1">Domains</p>
                      <div className="flex flex-wrap gap-1">
                        {summary.sharedDomains.map((d: string) => (
                          <Badge key={d} size="sm">{d.replace(/_/g, " ")}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {summary.activeCities.length > 0 && (
                    <div>
                      <p className="text-xs text-charcoal-light mb-1">Active in</p>
                      <div className="flex flex-wrap gap-1">
                        {summary.activeCities.map((c: string) => (
                          <Badge key={c} size="sm">{c}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>

            {/* Top interaction partners */}
            {summary.topInteractionPartners.length > 0 && (
              <Card>
                <CardBody>
                  <h2 className="text-sm font-semibold text-charcoal mb-3">Top Interaction Partners</h2>
                  <div className="space-y-3">
                    {summary.topInteractionPartners.map((partner: {
                      humanId: string;
                      displayName: string;
                      tier: string;
                      interactionCount: number;
                      interactionTypes: string[];
                    }) => (
                      <div key={partner.humanId}>
                        <button
                          className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-charcoal/5 transition-colors text-left"
                          onClick={() =>
                            setSelectedPartnerId(
                              selectedPartnerId === partner.humanId ? null : partner.humanId,
                            )
                          }
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-terracotta/10 rounded-full flex items-center justify-center text-sm text-terracotta font-bold">
                              {partner.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="text-sm font-medium text-charcoal">{partner.displayName}</span>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Badge size="sm">{partner.tier}</Badge>
                                {partner.interactionTypes.map((t: string) => (
                                  <span key={t} className="text-xs text-charcoal-light">{t.replace(/_/g, " ")}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-medium text-charcoal">{partner.interactionCount}</span>
                            <p className="text-xs text-charcoal-light">interactions</p>
                          </div>
                        </button>

                        {/* Expanded interaction history */}
                        {selectedPartnerId === partner.humanId && (
                          <InteractionHistoryPanel partnerId={partner.humanId} />
                        )}
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            )}

            {/* Connection suggestions */}
            <ConnectionSuggestions />

            {/* Connection list */}
            <Card>
              <CardBody>
                <h2 className="text-sm font-semibold text-charcoal mb-3">Your Connections</h2>
                <ConnectionsList />
              </CardBody>
            </Card>
          </div>
        )}

        {/* Empty state handled in T053 */}
        {!isLoading && !summary && <NetworkEmptyState />}
      </div>
    </div>
  );
}

/** T053: Empty state for new participants */
function NetworkEmptyState() {
  return (
    <Card>
      <CardBody>
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-terracotta/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-terracotta" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-charcoal mb-2">Build Your Network</h2>
          <p className="text-sm text-charcoal-light mb-6 max-w-md mx-auto">
            Your network grows as you interact with the community. Here are some ways to get started:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left max-w-lg mx-auto">
            <Link href="/missions" className="p-3 rounded-lg bg-charcoal/5 hover:bg-charcoal/10 transition-colors">
              <p className="text-sm font-medium text-charcoal">Complete Missions</p>
              <p className="text-xs text-charcoal-light mt-1">Build connections through shared work</p>
            </Link>
            <Link href="/reviews" className="p-3 rounded-lg bg-charcoal/5 hover:bg-charcoal/10 transition-colors">
              <p className="text-sm font-medium text-charcoal">Review Evidence</p>
              <p className="text-xs text-charcoal-light mt-1">Help verify others&apos; contributions</p>
            </Link>
            <Link href="/leaderboards" className="p-3 rounded-lg bg-charcoal/5 hover:bg-charcoal/10 transition-colors">
              <p className="text-sm font-medium text-charcoal">Find People</p>
              <p className="text-xs text-charcoal-light mt-1">Follow and endorse top contributors</p>
            </Link>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/** Interaction history expansion panel */
function InteractionHistoryPanel({ partnerId }: { partnerId: string }) {
  const { data, isLoading } = useInteractionHistory(partnerId);

  const history = data?.ok ? data.data : null;

  if (isLoading) {
    return (
      <div className="ml-11 mt-2 p-3 bg-charcoal/5 rounded-lg">
        <div className="h-16 bg-charcoal/10 rounded animate-pulse" />
      </div>
    );
  }

  if (!history || history.interactions.length === 0) {
    return (
      <div className="ml-11 mt-2 p-3 bg-charcoal/5 rounded-lg text-sm text-charcoal-light">
        No interaction history found.
      </div>
    );
  }

  return (
    <div className="ml-11 mt-2 p-3 bg-charcoal/5 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        {history.isFollowing && (
          <span className="text-xs bg-terracotta/10 text-terracotta px-2 py-0.5 rounded-full">Following</span>
        )}
        {history.connectionStatus === "accepted" && (
          <span className="text-xs bg-sage/10 text-sage px-2 py-0.5 rounded-full">Connected</span>
        )}
        {history.sharedDomains.length > 0 && (
          <span className="text-xs text-charcoal-light">
            Shared: {history.sharedDomains.join(", ").replace(/_/g, " ")}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {history.interactions.slice(0, 10).map((interaction: {
          type: string;
          direction: string;
          referenceId: string;
          date: string;
        }, idx: number) => (
          <div key={`${interaction.referenceId}-${idx}`} className="flex items-center justify-between text-xs">
            <span className="text-charcoal">
              {interaction.direction.replace(/_/g, " ")} ({interaction.type.replace(/_/g, " ")})
            </span>
            <span className="text-charcoal-light">
              {new Date(interaction.date).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
      <Link
        href={`/portfolio/${partnerId}`}
        className="block mt-2 text-xs text-terracotta hover:underline"
      >
        View profile
      </Link>
    </div>
  );
}
