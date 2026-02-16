"use client";

/**
 * ThreadDetail Component (Sprint 16: Social Fabric Foundation)
 *
 * Full thread content with author info, reply list, and reply form.
 * Shows only approved content per constitution.
 */
import { useState } from "react";

import { useThread, useReplyList } from "../../hooks/useDiscussions";
import { useHumanAuth } from "../../hooks/useHumanAuth";
import { formatRelativeTime } from "../../utils/time";
import { Badge, Button } from "../ui";
import { ReplyForm } from "./ReplyForm";

interface ThreadDetailProps {
  threadId: string;
}

interface ReplyData {
  id: string;
  content: string;
  authorDisplayName: string;
  authorTier: string;
  createdAt: string;
}

function ReplyCard({ reply }: { reply: ReplyData }) {
  return (
    <div className="bg-white rounded-lg shadow-neu-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-charcoal">{reply.authorDisplayName}</span>
        {reply.authorTier && <Badge variant="domain" size="sm">{reply.authorTier}</Badge>}
        <span className="text-xs text-charcoal-light">{formatRelativeTime(reply.createdAt)}</span>
      </div>
      <div className="text-sm text-charcoal leading-relaxed whitespace-pre-wrap">
        {reply.content}
      </div>
    </div>
  );
}

function ReplyListSection({
  isLoading,
  replies,
  replyCount,
  hasMore,
  onLoadMore,
}: {
  isLoading: boolean;
  replies: ReplyData[];
  replyCount: number;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-charcoal">
        Replies ({replyCount})
      </h2>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-charcoal/5 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && replies.length === 0 && (
        <div className="text-center py-8 text-charcoal-light text-sm">
          No replies yet. Be the first to respond.
        </div>
      )}

      {replies.map((reply) => (
        <ReplyCard key={reply.id} reply={reply} />
      ))}

      {hasMore && (
        <div className="text-center mt-2">
          <Button variant="ghost" size="sm" onClick={onLoadMore}>
            Load more replies
          </Button>
        </div>
      )}
    </div>
  );
}

export function ThreadDetail({ threadId }: ThreadDetailProps) {
  const { isAuthenticated } = useHumanAuth();
  const { data: threadData, isLoading: threadLoading } = useThread(threadId);
  const [replyCursor, setReplyCursor] = useState<string | undefined>();
  const { data: replyData, isLoading: repliesLoading } = useReplyList(threadId, { cursor: replyCursor });

  const thread = threadData?.ok ? threadData.data : null;
  const replies: ReplyData[] = replyData?.ok ? replyData.data ?? [] : [];
  const replyMeta = replyData?.ok ? replyData.meta : null;

  if (threadLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-charcoal/5 rounded-lg animate-pulse" />
        <div className="h-20 bg-charcoal/5 rounded-lg animate-pulse" />
        <div className="h-20 bg-charcoal/5 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="text-center py-12 text-charcoal-light">
        <p className="text-lg mb-2">Thread not found</p>
        <p className="text-sm">This discussion may have been removed or is still pending review.</p>
      </div>
    );
  }

  const replyCount = thread.replyCount ?? 0;

  return (
    <div>
      {/* Thread header and content */}
      <div className="bg-white rounded-lg shadow-neu-sm p-6 mb-6">
        <h1 className="text-lg font-bold text-charcoal mb-3">{thread.title}</h1>

        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-charcoal">{thread.authorDisplayName}</span>
          {thread.authorTier && <Badge variant="domain" size="sm">{thread.authorTier}</Badge>}
          <span className="text-xs text-charcoal-light">{formatRelativeTime(thread.createdAt)}</span>
        </div>

        <div className="text-sm text-charcoal leading-relaxed whitespace-pre-wrap">
          {thread.content}
        </div>

        <div className="mt-4 pt-3 border-t border-charcoal/10 flex items-center gap-4 text-xs text-charcoal-light">
          <span>{replyCount} {replyCount === 1 ? "reply" : "replies"}</span>
          <span>Last activity {formatRelativeTime(thread.lastActivityAt)}</span>
        </div>
      </div>

      {/* Reply list */}
      <ReplyListSection
        isLoading={repliesLoading}
        replies={replies}
        replyCount={replyCount}
        hasMore={replyMeta?.hasMore ?? false}
        onLoadMore={() => setReplyCursor(replyMeta?.nextCursor ?? undefined)}
      />

      {/* Reply form — only for authenticated users */}
      {isAuthenticated ? (
        <ReplyForm threadId={threadId} />
      ) : (
        <div className="mt-4 p-4 bg-charcoal/5 rounded-lg text-center text-sm text-charcoal-light">
          <p>Sign in to join this discussion.</p>
        </div>
      )}
    </div>
  );
}
