"use client";

interface MentorshipItem {
  id: string;
  mentorHumanId: string;
  mentorDisplayName: string;
  menteeHumanId: string;
  menteeDisplayName: string;
  domain: string;
  status: string;
  missionsGuided: number;
  tokensEarnedByMentor: number;
  expiresAt: string;
  createdAt: string;
}

interface MenteeCardProps {
  mentorship: MentorshipItem;
  currentUserId: string;
  onAccept?: (id: string) => void;
  onDecline?: (id: string) => void;
  onEnd?: (id: string) => void;
  onRate?: (id: string) => void;
  isLoading?: boolean;
}

export function MenteeCard({
  mentorship,
  currentUserId,
  onAccept,
  onDecline,
  onEnd,
  onRate,
  isLoading,
}: MenteeCardProps) {
  const isMentor = mentorship.mentorHumanId === currentUserId;
  const partnerName = isMentor ? mentorship.menteeDisplayName : mentorship.mentorDisplayName;
  const role = isMentor ? "Mentor" : "Mentee";
  const domainLabel = mentorship.domain.replace(/_/g, " ");

  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    active: "bg-green-100 text-green-800",
    completed: "bg-blue-100 text-blue-800",
    terminated: "bg-gray-100 text-gray-700",
  };

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(mentorship.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );

  return (
    <div className="rounded-xl bg-white shadow-neu-sm p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-charcoal-light">{role} to</span>
          <h3 className="font-semibold text-charcoal">{partnerName}</h3>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[mentorship.status] ?? "bg-gray-100 text-gray-700"}`}>
          {mentorship.status}
        </span>
      </div>

      <div className="flex items-center gap-3 text-sm text-charcoal-light">
        <span className="capitalize">{domainLabel}</span>
        {mentorship.status === "active" && (
          <span>{daysLeft} days left</span>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span>{mentorship.missionsGuided} missions guided</span>
        {isMentor && (
          <span className="text-terracotta">{mentorship.tokensEarnedByMentor} IT earned</span>
        )}
      </div>

      <div className="flex gap-2 mt-auto pt-2 border-t border-charcoal/10">
        {mentorship.status === "pending" && (
          <>
            {onAccept && (
              <button
                onClick={() => onAccept(mentorship.id)}
                disabled={isLoading}
                className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                Accept
              </button>
            )}
            {onDecline && (
              <button
                onClick={() => onDecline(mentorship.id)}
                disabled={isLoading}
                className="px-3 py-1 bg-gray-200 text-charcoal text-sm rounded-lg hover:bg-gray-300 disabled:opacity-50"
              >
                Decline
              </button>
            )}
          </>
        )}
        {mentorship.status === "active" && onEnd && (
          <button
            onClick={() => onEnd(mentorship.id)}
            disabled={isLoading}
            className="px-3 py-1 bg-amber-100 text-amber-800 text-sm rounded-lg hover:bg-amber-200 disabled:opacity-50"
          >
            End Mentorship
          </button>
        )}
        {(mentorship.status === "completed" || mentorship.status === "terminated") && onRate && (
          <button
            onClick={() => onRate(mentorship.id)}
            disabled={isLoading}
            className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-lg hover:bg-blue-200 disabled:opacity-50"
          >
            Rate Experience
          </button>
        )}
      </div>
    </div>
  );
}
