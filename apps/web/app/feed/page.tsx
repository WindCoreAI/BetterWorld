"use client";

/**
 * Personalized Feed Page (Sprint 18: Cooperative Depth & Governance — US11)
 *
 * Cursor-paginated activity feed; events from people you follow are
 * boosted to the top. Last 30 days of community activity.
 */
import { useEffect, useState } from "react";

import { FeedItem } from "@/components/feed/FeedItem";
import { useFeed } from "@/hooks/useFeed";
import { getHumanToken } from "@/lib/api";

export default function FeedPage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const feedQuery = useFeed();

  const isLoggedIn = isMounted && !!getHumanToken();
  const items = feedQuery.data?.pages.flatMap((page) => (page.ok ? page.data?.items ?? [] : [])) ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">My Feed</h1>
      <p className="text-gray-600 mb-6">
        Recent activity across the community — people you follow appear first.
      </p>

      {isMounted && !isLoggedIn && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
          <a href="/auth/human/login" className="font-medium underline">Sign in</a> to see your personalized feed.
        </div>
      )}

      {isLoggedIn && feedQuery.isLoading && (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Loading your feed...
        </div>
      )}

      {isLoggedIn && !feedQuery.isLoading && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Nothing here yet. Follow people on the{" "}
          <a href="/discover" className="text-blue-600 underline">Discover</a> page
          to personalize your feed.
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <FeedItem key={item.id} item={item} />
        ))}
      </div>

      {feedQuery.hasNextPage && (
        <div className="mt-6 text-center">
          <button
            onClick={() => feedQuery.fetchNextPage()}
            disabled={feedQuery.isFetchingNextPage}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {feedQuery.isFetchingNextPage ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}
