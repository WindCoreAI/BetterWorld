"use client";

/**
 * Notifications Page (Sprint 16: Social Fabric Foundation)
 *
 * Full notification center with list, type filter, and auth guard.
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { NotificationList } from "../../src/components/notifications/NotificationList";
import { useHumanAuth } from "../../src/hooks/useHumanAuth";

export default function NotificationsPage() {
  const { isAuthenticated, loading } = useHumanAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/auth/human/login");
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-charcoal-light">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-charcoal mb-6">
          Notifications
        </h1>
        <NotificationList />
      </div>
    </div>
  );
}
