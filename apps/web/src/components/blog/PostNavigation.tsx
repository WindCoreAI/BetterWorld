import Link from "next/link";

import { CategoryBadge } from "./CategoryBadge";
import type { BlogPost } from "../../lib/blog-types";

interface PostNavigationProps {
  prev: BlogPost | null;
  next: BlogPost | null;
}

export function PostNavigation({ prev, next }: PostNavigationProps) {
  if (!prev && !next) return null;

  return (
    <nav
      aria-label="Post navigation"
      className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-12 pt-8 border-t border-charcoal/10"
    >
      {/* Previous (older) */}
      {prev ? (
        <Link
          href={`/blog/${prev.frontmatter.slug}`}
          className="group flex flex-col gap-1.5 p-4 rounded-xl bg-charcoal/[0.02] border border-charcoal/5 hover:border-terracotta/20 hover:bg-terracotta/[0.03] transition-all"
        >
          <span className="text-xs text-charcoal-light/60 uppercase tracking-wide flex items-center gap-1">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 transition-transform">
              <path d="M10 12L6 8l4-4" />
            </svg>
            Previous
          </span>
          <span className="font-medium text-charcoal group-hover:text-terracotta transition-colors line-clamp-2 text-sm leading-snug">
            {prev.frontmatter.title}
          </span>
          <span className="flex items-center gap-2 mt-1">
            <CategoryBadge category={prev.frontmatter.category} size="sm" />
            <span className="text-xs text-charcoal-light/50">{prev.readingTime} min read</span>
          </span>
        </Link>
      ) : (
        <div />
      )}

      {/* Next (newer) */}
      {next ? (
        <Link
          href={`/blog/${next.frontmatter.slug}`}
          className="group flex flex-col gap-1.5 p-4 rounded-xl bg-charcoal/[0.02] border border-charcoal/5 hover:border-terracotta/20 hover:bg-terracotta/[0.03] transition-all text-right sm:items-end"
        >
          <span className="text-xs text-charcoal-light/60 uppercase tracking-wide flex items-center gap-1">
            Next
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform">
              <path d="M6 12l4-4-4-4" />
            </svg>
          </span>
          <span className="font-medium text-charcoal group-hover:text-terracotta transition-colors line-clamp-2 text-sm leading-snug">
            {next.frontmatter.title}
          </span>
          <span className="flex items-center gap-2 mt-1">
            <CategoryBadge category={next.frontmatter.category} size="sm" />
            <span className="text-xs text-charcoal-light/50">{next.readingTime} min read</span>
          </span>
        </Link>
      ) : (
        <div />
      )}
    </nav>
  );
}
