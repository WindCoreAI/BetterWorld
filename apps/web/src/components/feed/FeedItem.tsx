"use client";

interface FeedItemProps {
  item: {
    id: string;
    eventType: string;
    actorName: string | null;
    targetType: string;
    domain: string | null;
    city: string | null;
    createdAt: string;
  };
}

const EVENT_LABELS: Record<string, string> = {
  problem_created: "reported a problem",
  solution_proposed: "proposed a solution",
  mission_claimed: "claimed a mission",
  evidence_submitted: "submitted evidence",
  thread_created: "started a discussion",
  reply_created: "replied to a discussion",
  achievement_earned: "earned an achievement",
  milestone_reached: "reached a milestone",
  help_offered: "offered to help",
};

export function FeedItem({ item }: FeedItemProps) {
  const label = EVENT_LABELS[item.eventType] ?? item.eventType.replace(/_/g, " ");
  const timeAgo = getTimeAgo(new Date(item.createdAt));

  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50 transition-colors">
      <div className="h-8 w-8 shrink-0 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-600">
        {item.actorName?.[0]?.toUpperCase() ?? "?"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-medium">{item.actorName ?? "Someone"}</span>{" "}
          <span className="text-gray-600">{label}</span>
        </p>
        <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
          <span>{timeAgo}</span>
          {item.domain && (
            <span className="capitalize">{item.domain.replace(/_/g, " ")}</span>
          )}
          {item.city && <span>{item.city}</span>}
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
