interface MissionStatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const statusConfig: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-green-100 text-green-800" },
  claimed: { label: "Claimed", className: "bg-blue-100 text-blue-800" },
  in_progress: { label: "In Progress", className: "bg-indigo-100 text-indigo-800" },
  submitted: { label: "Submitted", className: "bg-yellow-100 text-yellow-800" },
  verified: { label: "Verified", className: "bg-emerald-100 text-emerald-800" },
  expired: { label: "Expired", className: "bg-gray-100 text-gray-600" },
  archived: { label: "Archived", className: "bg-gray-100 text-gray-500" },
  active: { label: "Active", className: "bg-blue-100 text-blue-800" },
  abandoned: { label: "Abandoned", className: "bg-red-100 text-red-800" },
  released: { label: "Released", className: "bg-orange-100 text-orange-800" },
};

export default function MissionStatusBadge({ status, size = "sm" }: MissionStatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  const sizeClass = size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${config.className} ${sizeClass}`}>
      {config.label}
    </span>
  );
}
