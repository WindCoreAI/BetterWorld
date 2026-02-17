"use client";

interface BuddyStatusProps {
  status: "pending" | "accepted" | "declined" | "completed";
  buddyName: string;
}

export function BuddyStatus({ status, buddyName }: BuddyStatusProps) {
  const statusConfig = {
    pending: { label: "Pending", color: "bg-yellow-100 text-yellow-700" },
    accepted: { label: "Active", color: "bg-green-100 text-green-700" },
    declined: { label: "Declined", color: "bg-red-100 text-red-700" },
    completed: { label: "Completed", color: "bg-blue-100 text-blue-700" },
  };

  const config = statusConfig[status] ?? statusConfig.pending;

  return (
    <div className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2">
      <span className="text-sm text-gray-600">Buddy:</span>
      <span className="font-medium text-sm">{buddyName}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    </div>
  );
}
