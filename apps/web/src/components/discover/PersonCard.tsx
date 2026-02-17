"use client";

interface PersonCardProps {
  person: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    city: string | null;
    primaryDomain: string | null;
    tier: string | null;
    totalMissionsCompleted: number | null;
    reasons?: string[];
  };
  onFollow?: () => void;
  onConnect?: () => void;
}

export function PersonCard({ person, onFollow, onConnect }: PersonCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 hover:border-blue-300 transition-colors">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
          {person.displayName?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate">{person.displayName ?? "Anonymous"}</h3>
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
            {person.city && <span>{person.city}</span>}
            {person.primaryDomain && (
              <span className="capitalize">{person.primaryDomain.replace(/_/g, " ")}</span>
            )}
          </div>
          {person.tier && (
            <span className="inline-block mt-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-600 capitalize">
              {person.tier}
            </span>
          )}
          {person.reasons && person.reasons.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {person.reasons.map((r) => (
                <span key={r} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">{r}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {onFollow && (
          <button
            onClick={onFollow}
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            Follow
          </button>
        )}
        {onConnect && (
          <button
            onClick={onConnect}
            className="flex-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
}
