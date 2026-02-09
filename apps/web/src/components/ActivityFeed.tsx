import { Card, CardBody, Badge } from "./ui";
import { formatRelativeTime } from "../utils/time";

export interface ActivityEvent {
  type: string;
  timestamp: string;
  actor: { id: string; username: string };
  target: { id: string; type: string; title?: string };
  metadata?: Record<string, unknown>;
}

interface ActivityFeedProps {
  events: ActivityEvent[];
}

interface EventTypeConfig {
  label: string;
  icon: string;
}

const EVENT_TYPE_MAP: Record<string, EventTypeConfig> = {
  "problem.created": { label: "New Problem", icon: "\uD83D\uDD0D" },
  "solution.created": { label: "New Solution", icon: "\uD83D\uDCA1" },
  "debate.created": { label: "New Debate", icon: "\uD83D\uDCAC" },
  "content.approved": { label: "Content Approved", icon: "\u2705" },
  "content.rejected": { label: "Content Rejected", icon: "\u274C" },
};

const DEFAULT_EVENT_CONFIG: EventTypeConfig = {
  label: "Activity",
  icon: "\u2022",
};

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "\u2026";
}

function getTargetDisplay(target: ActivityEvent["target"]): string {
  if (target.title) {
    return truncate(target.title, 60);
  }
  const idSnippet = target.id.slice(0, 8);
  return `${target.type} #${idSnippet}`;
}

function getContentType(eventType: string): string {
  if (eventType.startsWith("problem.")) return "problem";
  if (eventType.startsWith("solution.")) return "solution";
  if (eventType.startsWith("debate.")) return "debate";
  if (eventType === "content.approved" || eventType === "content.rejected") return "content";
  return "event";
}

function EventCard({ event }: { event: ActivityEvent }) {
  const config = EVENT_TYPE_MAP[event.type] ?? DEFAULT_EVENT_CONFIG;
  const contentType = getContentType(event.type);

  return (
    <Card className="hover:shadow-neu-md hover:translate-y-0">
      <CardBody className="flex items-start gap-4">
        <span
          className="flex-shrink-0 text-2xl leading-none mt-0.5"
          role="img"
          aria-label={config.label}
        >
          {config.icon}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-charcoal">
              {config.label}
            </span>
            <Badge variant="domain" size="sm">
              {contentType}
            </Badge>
          </div>

          <p className="text-sm text-charcoal/70 mt-1">
            <span className="font-medium text-charcoal/90">
              {event.actor.username}
            </span>
            {" \u2014 "}
            <span>{getTargetDisplay(event.target)}</span>
          </p>

          <time
            className="text-xs text-charcoal/50 mt-1 block"
            dateTime={event.timestamp}
            title={new Date(event.timestamp).toLocaleString()}
          >
            {formatRelativeTime(event.timestamp)}
          </time>
        </div>
      </CardBody>
    </Card>
  );
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  const sorted = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-charcoal/40">
        <span className="text-4xl mb-3">{"\uD83D\uDCED"}</span>
        <p className="text-sm font-medium">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((event) => (
        <EventCard key={`${event.type}-${event.target.id}-${event.timestamp}`} event={event} />
      ))}
    </div>
  );
}

export type { ActivityFeedProps };
