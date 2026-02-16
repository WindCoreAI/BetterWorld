"use client";

/**
 * MilestoneTimeline Component (Sprint 17: Community Identity & Visible Growth)
 *
 * Vertical timeline of reached and upcoming milestones with progress bars.
 */
import { Card } from "../ui";

interface Milestone {
  id: string;
  milestoneType: string;
  targetValue: number;
  currentValue: number;
  reachedAt: string | null;
}

interface MilestoneTimelineProps {
  reached: Milestone[];
  upcoming: Milestone[];
}

export function MilestoneTimeline({ reached, upcoming }: MilestoneTimelineProps) {
  if (reached.length === 0 && upcoming.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold text-lg mb-2">Milestones</h3>
        <p className="text-gray-500 text-sm">No milestones configured yet.</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-lg mb-4">Milestones</h3>
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

        {reached.map((m) => (
          <div key={m.id} className="relative flex items-start gap-4 mb-4 pl-10">
            <div className="absolute left-2.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
            <div>
              <span className="font-medium text-green-700 text-sm">
                {m.targetValue} {m.milestoneType.replace(/_/g, " ")}
              </span>
              {m.reachedAt && (
                <span className="text-xs text-gray-400 block">
                  Reached {new Date(m.reachedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        ))}

        {upcoming.map((m) => {
          const progress = Math.min(100, Math.round((m.currentValue / m.targetValue) * 100));
          return (
            <div key={m.id} className="relative flex items-start gap-4 mb-4 pl-10">
              <div className="absolute left-2.5 w-3 h-3 bg-gray-300 rounded-full border-2 border-white" />
              <div className="flex-1">
                <span className="font-medium text-gray-600 text-sm">
                  {m.targetValue} {m.milestoneType.replace(/_/g, " ")}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">{m.currentValue}/{m.targetValue}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
