"use client";

/**
 * NotificationItem Component (Sprint 16: Social Fabric Foundation)
 *
 * Renders a single notification with type-based styling, actor name,
 * aggregation count, and read/unread status.
 */
import { formatRelativeTime } from "../../utils/time";

interface NotificationItemProps {
  notification: {
    id: string;
    type: string;
    message: string;
    actorDisplayName?: string | null;
    aggregationCount: number;
    isRead: boolean;
    createdAt: string;
    referenceId?: string | null;
    referenceType?: string | null;
  };
  onMarkRead?: (id: string) => void;
}

function getTypeIcon(type: string): string {
  switch (type) {
    case "cheer":
    case "celebration":
      return "🎉";
    case "streak_warning":
      return "🔥";
    case "milestone":
      return "⭐";
    case "comeback":
      return "👋";
    case "reply":
      return "💬";
    case "connection_request":
    case "connection_accepted":
      return "🤝";
    case "follow":
      return "👤";
    default:
      return "🔔";
  }
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const handleClick = () => {
    if (!notification.isRead && onMarkRead) {
      onMarkRead(notification.id);
    }
  };

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
        notification.isRead
          ? "bg-transparent hover:bg-charcoal/5"
          : "bg-terracotta/5 hover:bg-terracotta/10"
      }`}
      onClick={handleClick}
    >
      <span className="text-lg flex-shrink-0 mt-0.5">
        {getTypeIcon(notification.type)}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm ${
            notification.isRead ? "text-charcoal-light" : "text-charcoal font-medium"
          }`}
        >
          {notification.message}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-charcoal-light">
            {formatRelativeTime(notification.createdAt)}
          </span>
          {notification.aggregationCount > 1 && (
            <span className="text-xs text-terracotta font-medium">
              +{notification.aggregationCount - 1} more
            </span>
          )}
        </div>
      </div>
      {!notification.isRead && (
        <span className="w-2 h-2 bg-terracotta rounded-full flex-shrink-0 mt-2" />
      )}
    </div>
  );
}
