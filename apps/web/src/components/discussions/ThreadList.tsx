"use client";

/**
 * ThreadList Component (Sprint 16: Social Fabric Foundation)
 *
 * List of discussion threads with sort toggle and cursor pagination.
 */
import Link from "next/link";
import { useState } from "react";

import { useThreadList } from "../../hooks/useDiscussions";
import { formatRelativeTime } from "../../utils/time";
import { Badge, Button } from "../ui";

interface ThreadListProps {
  scopeType: string;
  scopeValue: string;
}

export function ThreadList({ scopeType, scopeValue }: ThreadListProps) {
  const [sort, setSort] = useState<"activity" | "recent">("activity");
  const [cursor, setCursor] = useState<string | undefined>();

  const { data, isLoading } = useThreadList(scopeType, scopeValue, { sort, cursor });

  const threads = data?.ok ? data.data ?? [] : [];
  const meta = data?.ok ? data.meta : null;

  return (
    <div>
      {/* Sort toggle */}
      <div className="flex items-center gap-3 mb-4">
        <button
          className={`text-sm px-3 py-1 rounded-full ${
            sort === "activity"
              ? "bg-terracotta text-cream"
              : "bg-charcoal/10 text-charcoal-light hover:bg-charcoal/20"
          }`}
          onClick={() => { setSort("activity"); setCursor(undefined); }}
        >
          Most Active
        </button>
        <button
          className={`text-sm px-3 py-1 rounded-full ${
            sort === "recent"
              ? "bg-terracotta text-cream"
              : "bg-charcoal/10 text-charcoal-light hover:bg-charcoal/20"
          }`}
          onClick={() => { setSort("recent"); setCursor(undefined); }}
        >
          Recent
        </button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-charcoal/5 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && threads.length === 0 && (
        <div className="text-center py-12 text-charcoal-light">
          <p className="text-lg mb-2">No discussions yet</p>
          <p className="text-sm">Be the first to start a discussion in this space.</p>
        </div>
      )}

      {threads.length > 0 && (
        <div className="space-y-2">
          {threads.map((thread: {
            id: string;
            title: string;
            authorDisplayName: string;
            authorTier: string;
            replyCount: number;
            lastActivityAt: string;
            createdAt: string;
          }) => (
            <Link
              key={thread.id}
              href={`/discussions/thread/${thread.id}`}
              className="block p-4 bg-white rounded-lg shadow-neu-sm hover:shadow-md transition-shadow"
            >
              <h3 className="text-sm font-semibold text-charcoal line-clamp-2 mb-2">
                {thread.title}
              </h3>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-charcoal-light">{thread.authorDisplayName}</span>
                  <Badge variant="secondary">{thread.authorTier}</Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-charcoal-light">
                  <span>{thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}</span>
                  <span>{formatRelativeTime(thread.lastActivityAt)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {meta?.hasMore && (
        <div className="text-center mt-4">
          <Button variant="ghost" size="sm" onClick={() => setCursor(meta.nextCursor ?? undefined)}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
