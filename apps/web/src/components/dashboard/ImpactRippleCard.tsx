"use client";

/**
 * ImpactRippleCard Component (Sprint 16: Social Fabric Foundation)
 *
 * Compact ripple summary for dashboard with link to full impact page.
 */
import Link from "next/link";

import { useMyRipple } from "../../hooks/useImpact";
import { Card, CardBody, Badge } from "../ui";

export function ImpactRippleCard() {
  const { data, isLoading } = useMyRipple();

  const ripple = data?.ok ? data.data : null;

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-charcoal-light">
            Impact Ripple
          </h3>
          {ripple && ripple.contributionsCount > 0 && (
            <Link
              href="/dashboard/network"
              className="text-xs text-terracotta hover:underline"
            >
              View details
            </Link>
          )}
        </div>

        {isLoading && (
          <div className="h-20 bg-charcoal/5 rounded-lg animate-pulse" />
        )}

        {!isLoading && (!ripple || ripple.contributionsCount === 0) && (
          <div className="text-center py-4">
            <p className="text-sm text-charcoal-light">
              Make your first contribution to see your impact ripple across the community.
            </p>
          </div>
        )}

        {ripple && ripple.contributionsCount > 0 && (
          <div>
            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              <div>
                <p className="text-xl font-bold text-terracotta">{ripple.contributionsCount}</p>
                <p className="text-xs text-charcoal-light">Contributions</p>
              </div>
              <div>
                <p className="text-xl font-bold text-charcoal">{ripple.downstreamMissions}</p>
                <p className="text-xs text-charcoal-light">Downstream</p>
              </div>
              <div>
                <p className="text-xl font-bold text-charcoal">{ripple.citiesReached}</p>
                <p className="text-xs text-charcoal-light">Cities</p>
              </div>
            </div>

            {ripple.domainsImpacted.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ripple.domainsImpacted.slice(0, 3).map((domain: string) => (
                  <Badge key={domain} size="sm">{domain.replace(/_/g, " ")}</Badge>
                ))}
                {ripple.domainsImpacted.length > 3 && (
                  <span className="text-xs text-charcoal-light">
                    +{ripple.domainsImpacted.length - 3}
                  </span>
                )}
              </div>
            )}

            {ripple.topChain && (
              <Link
                href={`/impact/${ripple.topChain.problemId}`}
                className="block mt-3 text-xs text-terracotta hover:underline"
              >
                Top chain: {ripple.topChain.problemTitle}
              </Link>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
