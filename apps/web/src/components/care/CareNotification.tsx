"use client";

/**
 * CareNotification Component (Sprint 16: Social Fabric Foundation)
 *
 * Renders care moment notifications with inline cheer/celebrate buttons.
 * Shows aggregation display ("3 people cheered your streak").
 */
import { CelebrateButton } from "./CelebrateButton";
import { CheerButton } from "./CheerButton";

interface CareNotificationProps {
  notification: {
    id: string;
    type: string;
    message: string;
    actorHumanId: string;
    referenceId?: string;
    referenceType?: string;
    aggregationCount?: number;
    metadata?: Record<string, string>;
  };
}

export function CareNotification({ notification }: CareNotificationProps) {
  const { type, message, actorHumanId: _actorHumanId, referenceId, aggregationCount, id } = notification;

  // Aggregation display
  const displayMessage = aggregationCount && aggregationCount > 1
    ? message.replace(/^.+?(?= is | celebrated | cheered)/, `${aggregationCount} people`)
    : message;

  return (
    <div className="space-y-2">
      <p className="text-sm text-charcoal">{displayMessage}</p>

      {/* Inline action buttons based on notification type */}
      {type === "streak_warning" && referenceId && (
        <CheerButton
          targetHumanId={referenceId}
          notificationId={id}
          compact
        />
      )}

      {type === "milestone" && referenceId && (
        <CelebrateButton
          targetHumanId={referenceId}
          milestoneType={notification.metadata?.milestoneType ?? "mission_count"}
          notificationId={id}
          compact
        />
      )}

      {type === "comeback" && referenceId && (
        <CheerButton
          targetHumanId={referenceId}
          notificationId={id}
          compact
        />
      )}
    </div>
  );
}
