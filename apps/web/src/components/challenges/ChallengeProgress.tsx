"use client";

interface ChallengeProgressProps {
  challenge: {
    id: string;
    title: string;
    challengeType: string;
    status: string;
    startDate: string;
    endDate: string;
  };
  leaderboard: Array<{ groupValue: string; score: number; participantCount: number }>;
  myProgress?: { score: number; rank: number };
}

export function ChallengeProgress({ challenge, leaderboard, myProgress }: ChallengeProgressProps) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{challenge.title}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs ${
          challenge.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
        }`}>
          {challenge.status}
        </span>
      </div>
      {myProgress && (
        <div className="mb-3 rounded bg-blue-50 p-2 text-sm">
          Your score: <span className="font-medium">{myProgress.score}</span> | Rank: #{myProgress.rank}
        </div>
      )}
      <div className="space-y-1.5">
        {leaderboard.slice(0, 5).map((entry, i) => (
          <div key={entry.groupValue} className="flex items-center justify-between text-sm">
            <span className="text-gray-700">
              #{i + 1} {entry.groupValue}
              <span className="text-xs text-gray-400 ml-1">({entry.participantCount} members)</span>
            </span>
            <span className="font-medium">{entry.score.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
