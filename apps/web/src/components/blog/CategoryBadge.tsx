import type { BlogCategory } from "../../lib/blog-types";
import { CATEGORY_META } from "../../lib/blog-types";

interface CategoryBadgeProps {
  category: BlogCategory;
  size?: "sm" | "md";
}

export function CategoryBadge({ category, size = "md" }: CategoryBadgeProps) {
  const meta = CATEGORY_META[category];
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${meta.bgClass} ${meta.textClass} ${sizeClass}`}
    >
      {meta.label}
    </span>
  );
}
