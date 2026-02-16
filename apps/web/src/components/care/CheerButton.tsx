"use client";

/**
 * CheerButton Component (Sprint 16: Social Fabric Foundation)
 *
 * "Cheer" action with optional gift toggle, loading state,
 * insufficient balance fallback. Appears in streak_warning notifications.
 */
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { careApi } from "../../lib/humanApi";
import { Button } from "../ui";

interface CheerButtonProps {
  targetHumanId: string;
  notificationId?: string;
  compact?: boolean;
}

export function CheerButton({ targetHumanId, notificationId, compact }: CheerButtonProps) {
  const [includeGift, setIncludeGift] = useState(false);
  const [sent, setSent] = useState(false);
  const [balanceError, setBalanceError] = useState(false);

  const cheerMutation = useMutation({
    mutationFn: () =>
      careApi.sendCheer({ targetHumanId, notificationId, includeGift }),
    onSuccess: (result) => {
      if (result.ok) {
        setSent(true);
      } else if (result.error?.code === "INSUFFICIENT_BALANCE") {
        setBalanceError(true);
        setIncludeGift(false);
      }
    },
    onError: () => {
      // Silently handle
    },
  });

  if (sent) {
    return (
      <span className="text-xs text-sage font-medium">
        Cheer sent{includeGift ? " with gift" : ""}!
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "mt-2"}`}>
      <Button
        size="sm"
        variant="ghost"
        loading={cheerMutation.isPending}
        disabled={cheerMutation.isPending}
        onClick={() => cheerMutation.mutate()}
      >
        Cheer
      </Button>

      {!balanceError && (
        <label className="flex items-center gap-1 text-xs text-charcoal-light cursor-pointer">
          <input
            type="checkbox"
            checked={includeGift}
            onChange={(e) => setIncludeGift(e.target.checked)}
            className="rounded border-charcoal/30 text-terracotta focus:ring-terracotta/30"
          />
          Include 1 IT gift
        </label>
      )}

      {balanceError && (
        <span className="text-xs text-charcoal-light">
          (insufficient balance for gift)
        </span>
      )}
    </div>
  );
}
