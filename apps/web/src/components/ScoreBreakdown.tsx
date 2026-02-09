interface ScoreBreakdownProps {
  impactScore: string | number;
  feasibilityScore: string | number;
  costEfficiencyScore: string | number;
  compositeScore: string | number;
  mode?: "tooltip" | "inline";
}

interface ScoreBarProps {
  label: string;
  value: number;
  weight?: string;
  isComposite?: boolean;
  compact: boolean;
}

function toNumber(v: string | number): number {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function ScoreBar({ label, value, weight, isComposite, compact }: ScoreBarProps) {
  const barHeight = compact ? "h-1.5" : "h-2";
  const labelSize = compact ? "text-xs" : "text-sm";
  const valueSize = compact ? "text-xs" : "text-sm";
  const weightSize = compact ? "text-[10px]" : "text-xs";
  const gap = compact ? "mb-2" : "mb-3";

  return (
    <div className={gap}>
      <div className="flex items-baseline justify-between mb-1">
        <span
          className={[
            labelSize,
            isComposite ? "font-semibold text-charcoal" : "font-medium text-charcoal",
          ].join(" ")}
        >
          {label}
          {weight && (
            <span className={`${weightSize} font-normal text-charcoal-light ml-1`}>
              ({weight})
            </span>
          )}
        </span>
        <span
          className={[
            valueSize,
            "tabular-nums",
            isComposite ? "font-bold text-charcoal" : "font-medium text-charcoal-light",
          ].join(" ")}
        >
          {value.toFixed(1)}
        </span>
      </div>
      <div className={`w-full rounded-full ${barHeight} bg-charcoal/10 overflow-hidden`}>
        <div
          className={[
            "h-full rounded-full transition-all duration-300 ease-out",
            isComposite ? "bg-terracotta-dark" : "bg-terracotta",
          ].join(" ")}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function ScoreBreakdown({
  impactScore,
  feasibilityScore,
  costEfficiencyScore,
  compositeScore,
  mode = "inline",
}: ScoreBreakdownProps) {
  const compact = mode === "tooltip";
  const impact = toNumber(impactScore);
  const feasibility = toNumber(feasibilityScore);
  const costEfficiency = toNumber(costEfficiencyScore);
  const composite = toNumber(compositeScore);

  const containerPadding = compact ? "p-2" : "p-0";

  return (
    <div className={containerPadding}>
      <ScoreBar
        label="Impact"
        value={impact}
        weight={"\u00d70.40"}
        compact={compact}
      />
      <ScoreBar
        label="Feasibility"
        value={feasibility}
        weight={"\u00d70.35"}
        compact={compact}
      />
      <ScoreBar
        label="Cost Efficiency"
        value={costEfficiency}
        weight={"\u00d70.25"}
        compact={compact}
      />
      <div className={compact ? "mt-2 pt-2 border-t border-charcoal/10" : "mt-3 pt-3 border-t border-charcoal/10"}>
        <ScoreBar
          label="Composite"
          value={composite}
          isComposite
          compact={compact}
        />
      </div>
    </div>
  );
}
