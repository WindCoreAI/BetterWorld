"use client";

interface PathwayLevel {
  level: number;
  name: string;
  completed: boolean;
  current: boolean;
  requirements: Array<{ label: string; current: number; target: number }>;
}

interface PathwayProgressProps {
  domain: string;
  levels: PathwayLevel[];
}

export function PathwayProgress({ domain, levels }: PathwayProgressProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold capitalize">{domain.replace(/_/g, " ")} Pathway</h3>
      <div className="space-y-3">
        {levels.map((level) => (
          <div
            key={level.level}
            className={`rounded-lg border p-4 ${
              level.current ? "border-blue-300 bg-blue-50" :
              level.completed ? "border-green-300 bg-green-50" :
              "border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">
                Level {level.level}: {level.name}
              </h4>
              {level.completed && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Complete</span>
              )}
              {level.current && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">In Progress</span>
              )}
            </div>
            {(level.current || level.completed) && (
              <div className="space-y-1.5">
                {level.requirements.map((req) => {
                  const progress = Math.min(100, (req.current / req.target) * 100);
                  return (
                    <div key={req.label}>
                      <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                        <span>{req.label}</span>
                        <span>{req.current}/{req.target}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-gray-200">
                        <div
                          className="h-1.5 rounded-full bg-blue-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
