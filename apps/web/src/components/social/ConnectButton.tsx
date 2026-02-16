"use client";

/**
 * ConnectButton Component (Sprint 16: Social Fabric Foundation)
 *
 * Multi-state connection button: none -> "Connect", pending-sent -> "Request Sent",
 * pending-received -> "Accept/Decline", accepted -> "Connected" with remove option.
 */
import { useState } from "react";

import { useConnections } from "../../hooks/useConnections";
import { Button } from "../ui";

interface ConnectButtonProps {
  targetHumanId: string;
  compact?: boolean;
}

export function ConnectButton({ targetHumanId, compact = false }: ConnectButtonProps) {
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const {
    connectionStatus,
    connectionId,
    direction,
    statusLoading,
    request,
    accept,
    decline,
    remove,
    isRequestPending,
    isAcceptPending,
    isDeclinePending,
    isRemovePending,
    requestError,
  } = useConnections(targetHumanId);

  const size = compact ? "sm" : "md";

  if (statusLoading) {
    return <Button variant="secondary" size={size} disabled loading>...</Button>;
  }

  // No connection
  if (connectionStatus === "none") {
    const errorMsg = requestError ? (requestError as Error).message : null;
    const isCooldown = errorMsg?.includes("COOLDOWN_ACTIVE");

    return (
      <div>
        <Button
          variant="primary"
          size={size}
          onClick={() => request(targetHumanId)}
          loading={isRequestPending}
          disabled={isRequestPending || isCooldown}
        >
          Connect
        </Button>
        {isCooldown && (
          <p className="text-xs text-charcoal-light mt-1">Cooldown active</p>
        )}
      </div>
    );
  }

  // Pending - sent by me
  if (connectionStatus === "pending" && direction === "sent") {
    return (
      <Button variant="secondary" size={size} disabled>
        Request Sent
      </Button>
    );
  }

  // Pending - received from target
  if (connectionStatus === "pending" && direction === "received" && connectionId) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size={size}
          onClick={() => accept(connectionId)}
          loading={isAcceptPending}
        >
          Accept
        </Button>
        <Button
          variant="ghost"
          size={size}
          onClick={() => decline(connectionId)}
          loading={isDeclinePending}
        >
          Decline
        </Button>
      </div>
    );
  }

  // Accepted
  if (connectionStatus === "accepted" && connectionId) {
    if (showRemoveConfirm) {
      return (
        <div className="flex items-center gap-2">
          <Button
            variant="danger"
            size={size}
            onClick={() => {
              remove(connectionId);
              setShowRemoveConfirm(false);
            }}
            loading={isRemovePending}
          >
            Remove
          </Button>
          <Button
            variant="ghost"
            size={size}
            onClick={() => setShowRemoveConfirm(false)}
          >
            Cancel
          </Button>
        </div>
      );
    }

    return (
      <Button
        variant="secondary"
        size={size}
        onClick={() => setShowRemoveConfirm(true)}
      >
        Connected
      </Button>
    );
  }

  return null;
}
