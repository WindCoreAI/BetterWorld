"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FlaggedContentCard } from "../../../../src/components/admin/FlaggedContentCard";
import { Button } from "../../../../src/components/ui";
import { API_BASE, getAdminToken } from "../../../../src/lib/api";
import type { FlaggedItem } from "../../../../src/types";

type StatusFilter = "all" | "pending_review" | "approved" | "rejected";

interface FlaggedResponse {
  ok: boolean;
  data: FlaggedItem[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
    total: number;
  };
}

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending_review" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

async function fetchFlagged(
  status: StatusFilter,
  cursor?: string,
): Promise<FlaggedResponse> {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  params.set("limit", "10");
  if (cursor) params.set("cursor", cursor);

  const token = getAdminToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}/api/v1/admin/flagged?${params.toString()}`, { headers });
    if (!res.ok) {
      return { ok: false, data: [], meta: { cursor: null, hasMore: false, total: 0 } };
    }
    return res.json() as Promise<FlaggedResponse>;
  } catch {
    return { ok: false, data: [], meta: { cursor: null, hasMore: false, total: 0 } };
  }
}

export default function FlaggedContentListPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending_review");

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["admin-flagged", statusFilter],
    queryFn: ({ pageParam }) => fetchFlagged(statusFilter, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta?.hasMore ? lastPage.meta.cursor : undefined,
  });

  const allItems = data?.pages.flatMap((page) => page.data) ?? [];
  const totalCount = data?.pages[0]?.meta?.total ?? 0;

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-charcoal">Flagged Content Review</h1>
            <p className="text-charcoal-light mt-1">
              Content requiring human review ({totalCount} total)
            </p>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex gap-1 p-1 mb-6 bg-charcoal/5 rounded-lg w-fit">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={[
                "px-4 py-2 text-sm font-medium rounded-md transition-all duration-150",
                statusFilter === tab.value
                  ? "bg-white text-charcoal shadow-sm"
                  : "text-charcoal-light hover:text-charcoal",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <p className="text-charcoal-light">Loading flagged content...</p>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="text-center py-12">
            <p className="text-error">
              Failed to load flagged content. The API may not be running yet.
            </p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && allItems.length === 0 && (
          <div className="p-8 rounded-xl shadow-neu-sm bg-cream text-center">
            <p className="text-charcoal-light">
              No flagged content
              {statusFilter !== "all" ? ` with status "${statusFilter.replaceAll("_", " ")}"` : ""}.
            </p>
          </div>
        )}

        {/* Content List */}
        {allItems.length > 0 && (
          <div className="space-y-4">
            {allItems.map((item) => (
              <FlaggedContentCard
                key={item.id}
                item={item}
                onReview={(id) => router.push(`/admin/flagged/${id}`)}
              />
            ))}
          </div>
        )}

        {/* Load More */}
        {hasNextPage && (
          <div className="text-center mt-8">
            <Button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              variant="secondary"
            >
              {isFetchingNextPage ? "Loading..." : "Load More"}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
