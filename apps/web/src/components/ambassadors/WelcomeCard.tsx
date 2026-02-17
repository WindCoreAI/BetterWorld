"use client";

interface WelcomeCardProps {
  ambassadorName: string;
  totalWelcomes: number;
  monthlyTokensEarned: number;
  monthlyLimit: number;
}

export function WelcomeCard({ ambassadorName, totalWelcomes, monthlyTokensEarned, monthlyLimit }: WelcomeCardProps) {
  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
      <h3 className="text-sm font-semibold text-yellow-800 mb-2">Welcome Ambassador</h3>
      <p className="text-sm text-yellow-700 mb-3">
        Welcome, {ambassadorName}! Help newcomers get started and earn tokens.
      </p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-bold text-yellow-800">{totalWelcomes}</p>
          <p className="text-xs text-yellow-600">Total Welcomes</p>
        </div>
        <div>
          <p className="text-lg font-bold text-yellow-800">{monthlyTokensEarned}</p>
          <p className="text-xs text-yellow-600">This Month</p>
        </div>
        <div>
          <p className="text-lg font-bold text-yellow-800">{monthlyLimit - monthlyTokensEarned}</p>
          <p className="text-xs text-yellow-600">Remaining</p>
        </div>
      </div>
    </div>
  );
}
