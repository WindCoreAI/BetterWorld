"use client";

/**
 * Thread Detail Page (Sprint 16: Social Fabric Foundation)
 *
 * Full thread view with replies and reply form (auth guard for replying).
 */
import Link from "next/link";
import { useParams } from "next/navigation";

import { ThreadDetail } from "../../../../src/components/discussions/ThreadDetail";

export default function ThreadDetailPage() {
  const params = useParams<{ threadId: string }>();
  const threadId = params.threadId;

  if (!threadId) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-charcoal-light">Thread not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/discussions"
          className="text-xs text-terracotta hover:underline mb-4 inline-block"
        >
          &larr; Back to discussions
        </Link>
        <ThreadDetail threadId={threadId} />
      </div>
    </div>
  );
}
