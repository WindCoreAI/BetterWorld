"use client";

interface ChecklistItem {
  label: string;
  passed: boolean;
}

interface EvidenceChecklistProps {
  items: ChecklistItem[];
}

export function EvidenceChecklist({ items }: EvidenceChecklistProps) {
  const allPassed = items.every((item) => item.passed);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700">Pre-submission Checklist</h3>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className={item.passed ? "text-green-600" : "text-red-600"}>
              {item.passed ? "[x]" : "[ ]"}
            </span>
            <span className={item.passed ? "text-gray-700" : "text-gray-500"}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      {!allPassed && (
        <p className="text-xs text-amber-600 mt-2">
          Complete all items before submitting.
        </p>
      )}
    </div>
  );
}
