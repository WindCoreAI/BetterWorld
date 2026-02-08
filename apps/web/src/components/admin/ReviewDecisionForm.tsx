"use client";

import { useState } from "react";

import { Button } from "../ui/button";

interface ReviewDecisionFormProps {
  flaggedId: string;
  onSubmit: (decision: "approve" | "reject", notes: string) => void;
  loading?: boolean;
}

export function ReviewDecisionForm({ flaggedId, onSubmit, loading }: ReviewDecisionFormProps) {
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (decision: "approve" | "reject") => {
    if (notes.length < 10) {
      setError("Notes must be at least 10 characters");
      return;
    }
    setError("");
    onSubmit(decision, notes);
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`notes-${flaggedId}`} className="block text-sm font-medium text-charcoal mb-1">
          Review Notes (required, min 10 characters)
        </label>
        <textarea
          id={`notes-${flaggedId}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full min-h-[100px] p-3 rounded-lg border border-charcoal/10 bg-cream text-charcoal text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30 resize-y"
          placeholder="Explain your decision..."
        />
        {error && <p className="text-xs text-error mt-1">{error}</p>}
        <p className="text-xs text-charcoal-light mt-1">{notes.length} characters</p>
      </div>

      <div className="flex gap-3">
        <Button
          variant="primary"
          size="sm"
          loading={loading}
          onClick={() => handleSubmit("approve")}
        >
          Approve Content
        </Button>
        <Button
          variant="danger"
          size="sm"
          loading={loading}
          onClick={() => handleSubmit("reject")}
        >
          Reject Content
        </Button>
      </div>
    </div>
  );
}
