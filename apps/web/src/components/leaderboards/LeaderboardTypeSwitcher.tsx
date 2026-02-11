"use client";

interface LeaderboardTypeSwitcherProps {
  current: string;
  onChange: (type: string) => void;
}

const TYPES = [
  { value: "reputation", label: "Reputation" },
  { value: "impact", label: "Impact" },
  { value: "tokens", label: "Tokens" },
  { value: "missions", label: "Missions" },
];

export function LeaderboardTypeSwitcher({ current, onChange }: LeaderboardTypeSwitcherProps) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
      {TYPES.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            current === t.value
              ? "bg-white text-charcoal shadow-sm"
              : "text-charcoal-light hover:text-charcoal"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
