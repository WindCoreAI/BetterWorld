"use client";

/**
 * ReplyForm Component (Sprint 16: Social Fabric Foundation)
 *
 * Inline reply form with guardrail feedback.
 */
import { useState } from "react";

import { useCreateReply } from "../../hooks/useDiscussions";
import { Button } from "../ui";

interface ReplyFormProps {
  threadId: string;
}

export function ReplyForm({ threadId }: ReplyFormProps) {
  const [content, setContent] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const createReply = useCreateReply(threadId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (content.length < 2) return;

    createReply.mutate(content, {
      onSuccess: () => {
        setContent("");
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 5000);
      },
    });
  };

  const errorMessage = createReply.error
    ? (createReply.error as Error).message
    : null;

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      <textarea
        className="w-full h-20 px-3 py-2 rounded-lg border border-charcoal/20 bg-cream text-sm text-charcoal resize-none focus:outline-none focus:ring-2 focus:ring-terracotta/30"
        placeholder="Write a reply... (2-1000 chars)"
        maxLength={1000}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      {errorMessage && (
        <div className="p-2 rounded-lg bg-error/10 text-error text-xs">
          {errorMessage}
        </div>
      )}

      {submitted && (
        <div className="p-2 rounded-lg bg-sage/10 text-sage text-xs">
          Your reply has been submitted for review.
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-charcoal-light">{content.length}/1000</span>
        <Button
          type="submit"
          size="sm"
          loading={createReply.isPending}
          disabled={content.length < 2 || createReply.isPending}
        >
          Reply
        </Button>
      </div>
    </form>
  );
}
