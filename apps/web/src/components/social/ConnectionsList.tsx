"use client";

/**
 * ConnectionsList Component (Sprint 16: Social Fabric Foundation)
 *
 * Paginated list of accepted connections with shared domains and interaction count.
 * Pending requests tab with accept/decline actions.
 */
import Link from "next/link";
import { useState } from "react";

import { useConnectionList, usePendingConnections } from "../../hooks/useConnections";
import { Badge, Button } from "../ui";
import { ConnectButton } from "./ConnectButton";

type Tab = "accepted" | "pending";

interface AcceptedConnection {
  connectionId: string;
  humanId: string;
  displayName: string;
  avatarUrl: string | null;
  tier: string;
  city: string | null;
  sharedDomains: string[];
  interactionCount: number;
}

interface PendingRequest {
  connectionId: string;
  requesterHumanId: string;
  requesterDisplayName: string;
  requesterAvatarUrl: string | null;
  requesterTier: string;
  sharedDomains: string[];
}

function UserAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <div className="w-10 h-10 rounded-full bg-charcoal/10 flex items-center justify-center flex-shrink-0">
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="w-10 h-10 rounded-full object-cover" />
      ) : (
        <span className="text-sm font-medium text-charcoal-light">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

function SharedDomainsLabel({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="text-xs text-terracotta">
      {count} shared domain{count > 1 ? "s" : ""}
    </span>
  );
}

function AcceptedConnectionCard({ conn }: { conn: AcceptedConnection }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-white shadow-neu-sm">
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar name={conn.displayName} avatarUrl={conn.avatarUrl} />
        <div className="min-w-0">
          <Link
            href={`/portfolio/${conn.humanId}`}
            className="text-sm font-medium text-charcoal hover:text-terracotta truncate block"
          >
            {conn.displayName}
          </Link>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge variant="secondary">{conn.tier}</Badge>
            {conn.city && <span className="text-xs text-charcoal-light">{conn.city}</span>}
            <SharedDomainsLabel count={conn.sharedDomains.length} />
            {conn.interactionCount > 0 && (
              <span className="text-xs text-charcoal-light">
                {conn.interactionCount} interactions
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingRequestCard({ req }: { req: PendingRequest }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-white shadow-neu-sm">
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar name={req.requesterDisplayName} avatarUrl={req.requesterAvatarUrl} />
        <div className="min-w-0">
          <Link
            href={`/portfolio/${req.requesterHumanId}`}
            className="text-sm font-medium text-charcoal hover:text-terracotta truncate block"
          >
            {req.requesterDisplayName}
          </Link>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="secondary">{req.requesterTier}</Badge>
            <SharedDomainsLabel count={req.sharedDomains.length} />
          </div>
        </div>
      </div>
      <ConnectButton targetHumanId={req.requesterHumanId} compact />
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-center py-12 text-charcoal-light">
      <p className="text-lg mb-2">{title}</p>
      <p className="text-sm">{subtitle}</p>
    </div>
  );
}

function LoadMoreButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="text-center mt-4">
      <Button variant="ghost" size="sm" onClick={onClick}>
        Load more
      </Button>
    </div>
  );
}

function AcceptedTab({
  isLoading,
  items,
  meta,
  onLoadMore,
}: {
  isLoading: boolean;
  items: AcceptedConnection[];
  meta: { hasMore: boolean; nextCursor: string | null; count?: number } | null | undefined;
  onLoadMore: (cursor: string) => void;
}) {
  if (isLoading) {
    return <div className="text-center py-8 text-charcoal-light">Loading...</div>;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="No connections yet"
        subtitle="Connect with other participants who share your interests and mission areas."
      />
    );
  }
  return (
    <>
      <div className="space-y-2">
        {items.map((conn) => (
          <AcceptedConnectionCard key={conn.connectionId} conn={conn} />
        ))}
      </div>
      {meta?.hasMore && (
        <LoadMoreButton onClick={() => onLoadMore(meta.nextCursor ?? "")} />
      )}
    </>
  );
}

function PendingTab({
  isLoading,
  items,
  meta,
  onLoadMore,
}: {
  isLoading: boolean;
  items: PendingRequest[];
  meta: { hasMore: boolean; nextCursor: string | null; count?: number } | null | undefined;
  onLoadMore: (cursor: string) => void;
}) {
  if (isLoading) {
    return <div className="text-center py-8 text-charcoal-light">Loading...</div>;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="No pending requests"
        subtitle="Connection requests from others will appear here."
      />
    );
  }
  return (
    <>
      <div className="space-y-2">
        {items.map((req) => (
          <PendingRequestCard key={req.connectionId} req={req} />
        ))}
      </div>
      {meta?.hasMore && (
        <LoadMoreButton onClick={() => onLoadMore(meta.nextCursor ?? "")} />
      )}
    </>
  );
}

export function ConnectionsList() {
  const [activeTab, setActiveTab] = useState<Tab>("accepted");
  const [acceptedCursor, setAcceptedCursor] = useState<string | undefined>();
  const [pendingCursor, setPendingCursor] = useState<string | undefined>();

  const acceptedQuery = useConnectionList({ cursor: acceptedCursor });
  const pendingQuery = usePendingConnections({ cursor: pendingCursor });

  const acceptedItems: AcceptedConnection[] = acceptedQuery.data?.ok ? acceptedQuery.data.data ?? [] : [];
  const pendingItems: PendingRequest[] = pendingQuery.data?.ok ? pendingQuery.data.data ?? [] : [];
  const acceptedMeta = acceptedQuery.data?.ok ? acceptedQuery.data.meta : null;
  const pendingMeta = pendingQuery.data?.ok ? pendingQuery.data.meta : null;
  const pendingCount = pendingItems.length;

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex items-center gap-3 mb-4">
        <button
          className={`text-sm px-3 py-1 rounded-full ${
            activeTab === "accepted"
              ? "bg-terracotta text-cream"
              : "bg-charcoal/10 text-charcoal-light hover:bg-charcoal/20"
          }`}
          onClick={() => setActiveTab("accepted")}
        >
          Connections
        </button>
        <button
          className={`text-sm px-3 py-1 rounded-full ${
            activeTab === "pending"
              ? "bg-terracotta text-cream"
              : "bg-charcoal/10 text-charcoal-light hover:bg-charcoal/20"
          }`}
          onClick={() => setActiveTab("pending")}
        >
          Pending {pendingCount > 0 && `(${pendingCount})`}
        </button>
      </div>

      {activeTab === "accepted" && (
        <AcceptedTab
          isLoading={acceptedQuery.isLoading}
          items={acceptedItems}
          meta={acceptedMeta}
          onLoadMore={(c) => setAcceptedCursor(c || undefined)}
        />
      )}

      {activeTab === "pending" && (
        <PendingTab
          isLoading={pendingQuery.isLoading}
          items={pendingItems}
          meta={pendingMeta}
          onLoadMore={(c) => setPendingCursor(c || undefined)}
        />
      )}
    </div>
  );
}
