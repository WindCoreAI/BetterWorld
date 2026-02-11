"use client";

interface PortfolioStats {
  missionsCompleted: number;
  totalTokensEarned: number;
  domainsContributed: number;
  currentStreak: number;
  longestStreak: number;
  endorsementsReceived: number;
}

interface PortfolioTimelineProps {
  stats: PortfolioStats;
}

export function PortfolioTimeline({ stats }: PortfolioTimelineProps) {
  const items = [
    { label: "Missions Completed", value: stats.missionsCompleted },
    { label: "Domains Contributed", value: stats.domainsContributed },
    { label: "Current Streak", value: `${stats.currentStreak}d` },
    { label: "Longest Streak", value: `${stats.longestStreak}d` },
    { label: "Endorsements", value: stats.endorsementsReceived },
  ];

  return (
    <div className="bg-white rounded-xl shadow-neu-sm p-6">
      <h3 className="font-semibold text-charcoal mb-4">Impact Summary</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <p className="text-2xl font-bold text-terracotta">{item.value}</p>
            <p className="text-xs text-charcoal-light mt-1">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
