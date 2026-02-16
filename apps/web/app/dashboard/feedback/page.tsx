"use client";

/**
 * Feedback Inbox Page (Sprint 17: Community Identity & Visible Growth)
 *
 * Feedback inbox with unread count badge, filtering, and mark-as-read.
 */
import { useState } from "react";

import { FeedbackList } from "../../../src/components/feedback/FeedbackList";
import { useFeedbackList, useFeedbackUnreadCount, useMarkFeedbackRead } from "../../../src/hooks/useFeedback";

export default function FeedbackInboxPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading } = useFeedbackList({ unreadOnly, limit: 20 });
  const { data: unreadData } = useFeedbackUnreadCount();
  const markRead = useMarkFeedbackRead();

  const unreadCount = unreadData?.data?.count ?? 0;
  const items = data?.data?.items ?? [];

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Feedback Inbox</h1>
          {unreadCount > 0 && (
            <span className="bg-blue-500 text-white text-xs rounded-full px-2 py-0.5">
              {unreadCount}
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="rounded border-gray-300"
          />
          Unread only
        </label>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading feedback...</p>
      ) : (
        <FeedbackList
          items={items}
          onMarkRead={(id) => markRead.mutate(id)}
        />
      )}
    </div>
  );
}
