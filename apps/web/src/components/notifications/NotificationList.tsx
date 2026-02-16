"use client";

/**
 * NotificationList Component (Sprint 16: Social Fabric Foundation)
 *
 * Paginated list of notifications with unread filter and mark-all-read.
 */
import { useState } from "react";

import { useNotifications } from "../../hooks/useNotifications";
import { Button } from "../ui";
import { NotificationItem } from "./NotificationItem";

export function NotificationList() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const {
    notifications,
    isLoading,
    unreadCount,
    markRead,
    markAllRead,
  } = useNotifications({ unreadOnly });

  if (isLoading) {
    return (
      <div className="text-center py-8 text-charcoal-light">
        Loading notifications...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            className={`text-sm px-3 py-1 rounded-full ${
              !unreadOnly
                ? "bg-terracotta text-cream"
                : "bg-charcoal/10 text-charcoal-light hover:bg-charcoal/20"
            }`}
            onClick={() => setUnreadOnly(false)}
          >
            All
          </button>
          <button
            className={`text-sm px-3 py-1 rounded-full ${
              unreadOnly
                ? "bg-terracotta text-cream"
                : "bg-charcoal/10 text-charcoal-light hover:bg-charcoal/20"
            }`}
            onClick={() => setUnreadOnly(true)}
          >
            Unread ({unreadCount})
          </button>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => markAllRead()}
          >
            Mark all read
          </Button>
        )}
      </div>

      {!notifications || notifications.length === 0 ? (
        <div className="text-center py-12 text-charcoal-light">
          <p className="text-lg mb-2">No notifications</p>
          <p className="text-sm">
            {unreadOnly
              ? "You're all caught up!"
              : "Notifications will appear here when you get follows, replies, or cheers."}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {notifications.map((notification: { id: string; type: string; message: string; actorDisplayName?: string | null; aggregationCount: number; isRead: boolean; createdAt: string }) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkRead={markRead}
            />
          ))}
        </div>
      )}
    </div>
  );
}
