"use client";

/**
 * ConnectionSuggestions Component (Sprint 16: Social Fabric Foundation)
 *
 * "People you may know" card with up to 5 suggestions, reason text, and connect button.
 */
import Link from "next/link";

import { useConnectionSuggestions } from "../../hooks/useConnections";
import { Badge, Card, CardBody } from "../ui";
import { ConnectButton } from "./ConnectButton";

export function ConnectionSuggestions() {
  const { data, isLoading } = useConnectionSuggestions();

  const suggestions = data?.ok ? data.data ?? [] : [];

  if (isLoading) {
    return (
      <Card>
        <CardBody>
          <h3 className="text-lg font-semibold text-charcoal mb-4">People you may know</h3>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-charcoal/5 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardBody>
      </Card>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <Card>
      <CardBody>
        <h3 className="text-lg font-semibold text-charcoal mb-4">People you may know</h3>
        <div className="space-y-3">
          {suggestions.map((suggestion: {
            humanId: string;
            displayName: string;
            avatarUrl: string | null;
            tier: string;
            city: string | null;
            sharedDomains: string[];
            reason: string;
          }) => (
            <div
              key={suggestion.humanId}
              className="flex items-center justify-between p-3 rounded-lg bg-charcoal/5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                  {suggestion.avatarUrl ? (
                    <img src={suggestion.avatarUrl} alt={suggestion.displayName} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <span className="text-sm font-medium text-charcoal-light">
                      {suggestion.displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <Link
                    href={`/portfolio/${suggestion.humanId}`}
                    className="text-sm font-medium text-charcoal hover:text-terracotta truncate block"
                  >
                    {suggestion.displayName}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary">{suggestion.tier}</Badge>
                    {suggestion.city && (
                      <span className="text-xs text-charcoal-light">{suggestion.city}</span>
                    )}
                  </div>
                  <p className="text-xs text-charcoal-light mt-1">{suggestion.reason}</p>
                </div>
              </div>
              <div className="flex-shrink-0 ml-2">
                <ConnectButton targetHumanId={suggestion.humanId} compact />
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
