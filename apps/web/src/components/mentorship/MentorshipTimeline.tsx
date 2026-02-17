"use client";

interface TimelineEvent {
  date: string;
  label: string;
  icon: "start" | "accept" | "mission" | "complete" | "rate";
}

interface MentorshipTimelineProps {
  createdAt: string;
  status: string;
  missionsGuided: number;
  completedAt?: string | null;
  mentorRating?: number | null;
  menteeRating?: number | null;
}

export function MentorshipTimeline({
  createdAt,
  status,
  missionsGuided,
  completedAt,
  mentorRating,
  menteeRating,
}: MentorshipTimelineProps) {
  const events: TimelineEvent[] = [
    { date: createdAt, label: "Mentorship requested", icon: "start" },
  ];

  if (status !== "pending") {
    events.push({
      date: createdAt,
      label: "Both accepted",
      icon: "accept",
    });
  }

  if (missionsGuided > 0) {
    events.push({
      date: createdAt,
      label: `${missionsGuided} mission${missionsGuided !== 1 ? "s" : ""} guided`,
      icon: "mission",
    });
  }

  if (completedAt) {
    events.push({
      date: completedAt,
      label: status === "completed" ? "Completed (30 days)" : "Ended early",
      icon: "complete",
    });
  }

  if (mentorRating !== null && mentorRating !== undefined) {
    events.push({
      date: completedAt ?? createdAt,
      label: `Mentor rated: ${"*".repeat(mentorRating)}`,
      icon: "rate",
    });
  }

  if (menteeRating !== null && menteeRating !== undefined) {
    events.push({
      date: completedAt ?? createdAt,
      label: `Mentee rated: ${"*".repeat(menteeRating)}`,
      icon: "rate",
    });
  }

  const iconColors: Record<string, string> = {
    start: "bg-blue-500",
    accept: "bg-green-500",
    mission: "bg-terracotta",
    complete: "bg-purple-500",
    rate: "bg-amber-500",
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-charcoal">Timeline</h3>
      <div className="relative pl-6">
        <div className="absolute left-2.5 top-0 bottom-0 w-0.5 bg-charcoal/10" />
        {events.map((event, idx) => (
          <div key={idx} className="relative mb-4 last:mb-0">
            <div className={`absolute -left-3.5 w-3 h-3 rounded-full ${iconColors[event.icon] ?? "bg-gray-400"}`} />
            <div className="ml-2">
              <p className="text-sm text-charcoal">{event.label}</p>
              <p className="text-xs text-charcoal-light">
                {new Date(event.date).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
