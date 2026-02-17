"use client";

interface RewardSplitProps {
  totalReward: number;
  hasBuddy: boolean;
  hasHelper: boolean;
}

export function RewardSplit({ totalReward, hasBuddy, hasHelper }: RewardSplitProps) {
  let splits: Array<{ label: string; percentage: number; amount: number }>;

  if (hasBuddy && hasHelper) {
    splits = [
      { label: "You", percentage: 45, amount: Math.ceil(totalReward * 0.45) },
      { label: "Buddy", percentage: 30, amount: Math.floor(totalReward * 0.3) },
      { label: "Helper", percentage: 25, amount: totalReward - Math.ceil(totalReward * 0.45) - Math.floor(totalReward * 0.3) },
    ];
  } else if (hasBuddy) {
    splits = [
      { label: "You", percentage: 60, amount: Math.ceil(totalReward * 0.6) },
      { label: "Buddy", percentage: 40, amount: totalReward - Math.ceil(totalReward * 0.6) },
    ];
  } else if (hasHelper) {
    splits = [
      { label: "You", percentage: 75, amount: Math.ceil(totalReward * 0.75) },
      { label: "Helper", percentage: 25, amount: totalReward - Math.ceil(totalReward * 0.75) },
    ];
  } else {
    splits = [{ label: "You", percentage: 100, amount: totalReward }];
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <h4 className="text-xs font-medium text-gray-500 mb-2">Reward Split Preview</h4>
      <div className="space-y-1">
        {splits.map((split) => (
          <div key={split.label} className="flex items-center justify-between text-sm">
            <span className="text-gray-700">{split.label} ({split.percentage}%)</span>
            <span className="font-medium">{split.amount} tokens</span>
          </div>
        ))}
      </div>
    </div>
  );
}
