"use client";

/**
 * NewThreadForm Component (Sprint 16: Social Fabric Foundation)
 *
 * Form to create a new discussion thread with guardrail feedback.
 */
import { useState } from "react";

import { useCreateThread } from "../../hooks/useDiscussions";
import { Button, Input } from "../ui";

interface NewThreadFormProps {
  scopeType: string;
  scopeValue: string;
}

export function NewThreadForm({ scopeType, scopeValue }: NewThreadFormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const createThread = useCreateThread();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.length < 5 || content.length < 10) return;

    createThread.mutate(
      { scopeType, scopeValue, title, content },
      {
        onSuccess: () => {
          setTitle("");
          setContent("");
          setSubmitted(true);
          setTimeout(() => setSubmitted(false), 5000);
        },
      },
    );
  };

  const errorMessage = createThread.error
    ? (createThread.error as Error).message
    : null;

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-neu-sm p-4 space-y-4">
      <h3 className="text-sm font-semibold text-charcoal">Start a new discussion</h3>

      <Input
        label="Title"
        placeholder="What would you like to discuss? (5-200 chars)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
      />

      <div>
        <label className="text-sm font-medium text-charcoal mb-1 block">Content</label>
        <textarea
          className="w-full h-24 px-3 py-2 rounded-lg border border-charcoal/20 bg-cream text-sm text-charcoal resize-none focus:outline-none focus:ring-2 focus:ring-terracotta/30"
          placeholder="Share your thoughts, questions, or insights... (10-2000 chars)"
          maxLength={2000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <p className="text-xs text-charcoal-light mt-1">{content.length}/2000</p>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-lg bg-error/10 text-error text-sm">
          {errorMessage}
        </div>
      )}

      {submitted && (
        <div className="p-3 rounded-lg bg-sage/10 text-sage text-sm">
          Your post has been submitted for review. It will be visible once approved.
        </div>
      )}

      <Button
        type="submit"
        loading={createThread.isPending}
        disabled={title.length < 5 || content.length < 10 || createThread.isPending}
      >
        Post Discussion
      </Button>
    </form>
  );
}
