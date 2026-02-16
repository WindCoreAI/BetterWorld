"use client";

/**
 * RippleSummary Component (Sprint 16: Social Fabric Foundation)
 *
 * Aggregate stats display: contributions by type, downstream missions,
 * people involved, cities reached, domains impacted, top chain highlight.
 */
import Link from "next/link";

import { useMyRipple } from "../../hooks/useImpact";
import { Badge, Card, CardBody } from "../ui";

export function RippleSummary() {
  const { data, isLoading } = useMyRipple();

  const ripple = data?.ok ? data.data : null;

  if (isLoading) {
    return <div className="h-48 bg-charcoal/5 rounded-lg animate-pulse" />;
  }

  if (!ripple || ripple.contributionsCount === 0) {
    return (
      <Card>
        <CardBody>
          <div className="text-center py-8">
            <h3 className="text-sm font-semibold text-charcoal mb-2">Your Impact Ripple</h3>
            <p className="text-sm text-charcoal-light">
              Start contributing to see your ripple effect across the community.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Aggregate stats */}
      <Card>
        <CardBody>
          <h3 className="text-sm font-semibold text-charcoal mb-4">Your Impact Ripple</h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center mb-4">
            <div>
              <p className="text-2xl font-bold text-terracotta">{ripple.contributionsCount}</p>
              <p className="text-xs text-charcoal-light">Contributions</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-charcoal">{ripple.downstreamMissions}</p>
              <p className="text-xs text-charcoal-light">Downstream Missions</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-charcoal">{ripple.citiesReached}</p>
              <p className="text-xs text-charcoal-light">Cities Reached</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-charcoal">{ripple.domainsImpacted.length}</p>
              <p className="text-xs text-charcoal-light">Domains</p>
            </div>
          </div>

          {/* Contribution breakdown */}
          <div className="flex items-center justify-center gap-6 text-xs text-charcoal-light">
            <span>{ripple.contributionTypes.observationsSubmitted} observations</span>
            <span>{ripple.contributionTypes.missionsCompleted} missions</span>
            <span>{ripple.contributionTypes.evidenceVerified} reviews</span>
          </div>

          {/* Domains */}
          {ripple.domainsImpacted.length > 0 && (
            <div className="mt-4 pt-3 border-t border-charcoal/10">
              <p className="text-xs text-charcoal-light mb-2">Domains impacted</p>
              <div className="flex flex-wrap gap-1">
                {ripple.domainsImpacted.map((domain: string) => (
                  <Badge key={domain} size="sm">{domain.replace(/_/g, " ")}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Top chain highlight */}
      {ripple.topChain && (
        <Card>
          <CardBody>
            <p className="text-xs text-charcoal-light uppercase tracking-wide mb-2">Top Impact Chain</p>
            <Link
              href={`/impact/${ripple.topChain.problemId}`}
              className="block hover:bg-charcoal/5 rounded-lg p-2 -mx-2 transition-colors"
            >
              <h4 className="text-sm font-semibold text-charcoal">{ripple.topChain.problemTitle}</h4>
              <div className="flex items-center gap-4 mt-1 text-xs text-charcoal-light">
                <span>{ripple.topChain.totalMissionsCompleted} missions completed</span>
                <span>{ripple.topChain.totalParticipants} participants</span>
              </div>
            </Link>
          </CardBody>
        </Card>
      )}

      {/* Recent chains */}
      {ripple.recentChains.length > 0 && (
        <Card>
          <CardBody>
            <p className="text-xs text-charcoal-light uppercase tracking-wide mb-3">Recent Impact Chains</p>
            <div className="space-y-2">
              {ripple.recentChains.map((chain: {
                problemId: string;
                problemTitle: string;
                myRole: string;
                downstreamCount: number;
                date: string;
              }) => (
                <Link
                  key={chain.problemId}
                  href={`/impact/${chain.problemId}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-charcoal/5 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-charcoal truncate">{chain.problemTitle}</p>
                    <p className="text-xs text-charcoal-light">
                      {chain.myRole.replace(/_/g, " ")} &middot; {chain.downstreamCount} downstream
                    </p>
                  </div>
                  <span className="text-xs text-charcoal-light flex-shrink-0 ml-2">
                    {new Date(chain.date).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
