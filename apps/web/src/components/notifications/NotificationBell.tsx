"use client";

/**
 * NotificationBell Component (Sprint 16: Social Fabric Foundation)
 *
 * Bell icon with unread count badge and dropdown preview.
 */
import Link from "next/link";
import { useRef, useState, useEffect } from "react";

import { NotificationItem } from "./NotificationItem";
import { useNotifications } from "../../hooks/useNotifications";

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markRead } = useNotifications({
    limit: 5,
    enabled: true,
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="relative p-2 text-charcoal-light hover:text-charcoal transition-colors"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        {/* Bell icon */}
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold text-cream bg-terracotta rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-charcoal/10 z-50">
          <div className="p-3 border-b border-charcoal/10">
            <h3 className="text-sm font-medium text-charcoal">
              Notifications
            </h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {!notifications || notifications.length === 0 ? (
              <p className="text-sm text-charcoal-light text-center py-6">
                No notifications yet
              </p>
            ) : (
              notifications.slice(0, 5).map((n: { id: string; type: string; message: string; actorDisplayName?: string | null; aggregationCount: number; isRead: boolean; createdAt: string }) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={markRead}
                />
              ))
            )}
          </div>
          <div className="p-2 border-t border-charcoal/10">
            <Link
              href="/notifications"
              className="block text-center text-sm text-terracotta hover:underline py-1"
              onClick={() => setIsOpen(false)}
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
