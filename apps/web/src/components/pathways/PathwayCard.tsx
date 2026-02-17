"use client";

interface PathwayCardProps {
  domain: string;
  enrolled: boolean;
  currentLevel: number;
  onEnroll: () => void;
}

export function PathwayCard({ domain, enrolled, currentLevel, onEnroll }: PathwayCardProps) {
  const displayName = domain.replace(/_/g, " ");

  return (
    <div className="rounded-lg border border-gray-200 p-4 hover:border-blue-300 transition-colors">
      <h3 className="text-sm font-semibold capitalize mb-1">{displayName}</h3>
      {enrolled ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500">Level {currentLevel}/4</span>
            <div className="flex-1 h-1.5 rounded-full bg-gray-200">
              <div
                className="h-1.5 rounded-full bg-blue-500"
                style={{ width: `${(currentLevel / 4) * 100}%` }}
              />
            </div>
          </div>
          <a
            href={`/learning/${domain}`}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            View Progress
          </a>
        </div>
      ) : (
        <button
          onClick={onEnroll}
          className="mt-2 rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700"
        >
          Enroll
        </button>
      )}
    </div>
  );
}
