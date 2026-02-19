"use client";

import type { BlogCategory, BlogPost } from "../../lib/blog-types";
import { CATEGORY_META } from "../../lib/blog-types";

interface CategoryFilterProps {
  categories: BlogCategory[];
  selected: BlogCategory | null;
  onSelect: (category: BlogCategory | null) => void;
  posts?: BlogPost[];
}

export function CategoryFilter({ categories, selected, onSelect, posts }: CategoryFilterProps) {
  const getCategoryCount = (cat: BlogCategory) => {
    if (!posts) return null;
    return posts.filter((p) => p.frontmatter.category === cat).length;
  };

  return (
    <div className="relative">
      {/* Horizontal scroll on mobile, wrap on desktop */}
      <div className="flex md:flex-wrap gap-2 overflow-x-auto md:overflow-x-visible scrollbar-hide pb-1 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0">
        <button
          onClick={() => onSelect(null)}
          className={`px-4 py-2 text-sm font-medium rounded-full transition-all whitespace-nowrap shrink-0 ${
            selected === null
              ? "bg-terracotta text-white shadow-sm"
              : "bg-charcoal/5 text-charcoal-light hover:bg-charcoal/10 hover:text-charcoal"
          }`}
        >
          All{posts ? ` (${posts.length})` : ""}
        </button>
        {categories.map((cat) => {
          const meta = CATEGORY_META[cat];
          const isActive = selected === cat;
          const count = getCategoryCount(cat);
          return (
            <button
              key={cat}
              onClick={() => onSelect(isActive ? null : cat)}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-all whitespace-nowrap shrink-0 ${
                isActive
                  ? `${meta.bgClass} ${meta.textClass} shadow-sm`
                  : "bg-charcoal/5 text-charcoal-light hover:bg-charcoal/10 hover:text-charcoal"
              }`}
            >
              {meta.label}{count !== null ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>
      {/* Fade edge hint on mobile */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--background,#FAF5F0)] to-transparent md:hidden" />
    </div>
  );
}
