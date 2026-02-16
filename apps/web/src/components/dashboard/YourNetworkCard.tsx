"use client";

/**
 * YourNetworkCard Component (Sprint 16: Social Fabric Foundation)
 *
 * Compact dashboard card showing network summary:
 * connection count, shared domains, active cities, recent connections.
 */
import Link from "next/link";

import { useNetworkSummary } from "../../hooks/useNetwork";
import { Card, CardBody, Badge } from "../ui";

export function YourNetworkCard() {
  const { data, isLoading } = useNetworkSummary();

  const summary = data?.ok ? data.data : null;

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-charcoal-light">
            Your Network
          </h3>
          <Link
            href="/dashboard/network"
            className="text-xs text-terracotta hover:underline"
          >
            View all
          </Link>
        </div>

        {isLoading && (
          <div className="h-24 bg-charcoal/5 rounded-lg animate-pulse" />
        )}

        {!isLoading && !summary && (
          <div className="text-center py-4">
            <p className="text-sm text-charcoal-light">
              Start building your network by following others and sending connection requests.
            </p>
          </div>
        )}

        {summary && (
          <div>
            {/* Counts */}
            <div className="grid grid-cols-3 gap-3 text-center mb-4">
              <div>
                <p className="text-xl font-bold text-charcoal">{summary.followersCount}</p>
                <p className="text-xs text-charcoal-light">Followers</p>
              </div>
              <div>
                <p className="text-xl font-bold text-charcoal">{summary.followingCount}</p>
                <p className="text-xs text-charcoal-light">Following</p>
              </div>
              <div>
                <p className="text-xl font-bold text-charcoal">{summary.connectionsCount}</p>
                <p className="text-xs text-charcoal-light">Connections</p>
              </div>
            </div>

            {/* Shared domains */}
            {summary.sharedDomains.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-charcoal-light mb-1">Your domains</p>
                <div className="flex flex-wrap gap-1">
                  {summary.sharedDomains.slice(0, 4).map((domain: string) => (
                    <Badge key={domain} size="sm">
                      {domain.replace(/_/g, " ")}
                    </Badge>
                  ))}
                  {summary.sharedDomains.length > 4 && (
                    <span className="text-xs text-charcoal-light">
                      +{summary.sharedDomains.length - 4} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Recent connections */}
            {summary.recentConnections.length > 0 && (
              <div>
                <p className="text-xs text-charcoal-light mb-2">Recent connections</p>
                <div className="space-y-2">
                  {summary.recentConnections.slice(0, 3).map((conn: {
                    humanId: string;
                    displayName: string;
                    tier: string;
                    city: string | null;
                  }) => (
                    <Link
                      key={conn.humanId}
                      href={`/portfolio/${conn.humanId}`}
                      className="flex items-center gap-2 text-sm hover:bg-charcoal/5 rounded p-1 -mx-1"
                    >
                      <div className="w-6 h-6 bg-terracotta/10 rounded-full flex items-center justify-center text-xs text-terracotta font-bold">
                        {conn.displayName.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-charcoal truncate">{conn.displayName}</span>
                      {conn.city && (
                        <span className="text-xs text-charcoal-light ml-auto">{conn.city}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
