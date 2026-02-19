import Link from "next/link";

import { CategoryBadge } from "./CategoryBadge";
import { KeywordTag } from "./KeywordTag";
import { ReadingTime } from "./ReadingTime";
import type { BlogPost } from "../../lib/blog-types";
import { CATEGORY_META } from "../../lib/blog-types";

interface BlogCardProps {
  post: BlogPost;
  variant?: "default" | "hero";
}

export function BlogCard({ post, variant = "default" }: BlogCardProps) {
  const { frontmatter, readingTime } = post;
  const meta = CATEGORY_META[frontmatter.category];
  const dateStr = new Date(frontmatter.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });

  if (variant === "hero") {
    return (
      <Link href={`/blog/${frontmatter.slug}`} className="block group">
        <article className="bg-cream rounded-2xl shadow-neu-md transition-[box-shadow,transform] duration-150 ease-out hover:shadow-neu-lg hover:-translate-y-0.5 overflow-hidden flex flex-col md:flex-row">
          {/* Cover area */}
          {frontmatter.coverImage ? (
            <div className="md:w-1/2 aspect-video md:aspect-auto bg-charcoal/5 overflow-hidden">
              <img
                src={frontmatter.coverImage}
                alt=""
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
          ) : (
            <div className={`md:w-1/2 aspect-video md:aspect-auto min-h-[260px] bg-gradient-to-br ${meta.gradient} flex items-center justify-center relative overflow-hidden`}>
              <div className="absolute inset-0 opacity-[0.07]">
                <svg className="w-full h-full" viewBox="0 0 200 200" fill="none">
                  <circle cx="160" cy="40" r="60" stroke={meta.color} strokeWidth="0.5" opacity="0.5" />
                  <circle cx="40" cy="160" r="80" stroke={meta.color} strokeWidth="0.5" opacity="0.3" />
                  <circle cx="100" cy="100" r="40" stroke={meta.color} strokeWidth="0.5" opacity="0.4" />
                </svg>
              </div>
              <svg
                className="w-16 h-16 opacity-20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={meta.color}
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={meta.icon} />
              </svg>
            </div>
          )}

          <div className="md:w-1/2 p-6 md:p-8 flex flex-col justify-center">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <CategoryBadge category={frontmatter.category} />
              <span className="text-charcoal-light/40">·</span>
              <ReadingTime minutes={readingTime} />
              <span className="text-charcoal-light/40">·</span>
              <span className="text-sm text-charcoal-light">{dateStr}</span>
            </div>

            <h2 className="text-2xl md:text-3xl font-bold text-charcoal leading-snug mb-3 group-hover:text-terracotta transition-colors">
              {frontmatter.title}
            </h2>

            <p className="text-base text-charcoal-light leading-relaxed mb-5 line-clamp-3">
              {frontmatter.excerpt}
            </p>

            <div className="flex flex-wrap gap-1.5">
              {frontmatter.keywords.slice(0, 4).map((kw) => (
                <KeywordTag key={kw} keyword={kw} />
              ))}
            </div>
          </div>
        </article>
      </Link>
    );
  }

  return (
    <Link href={`/blog/${frontmatter.slug}`} className="block group">
      <article className="bg-cream rounded-xl shadow-neu-md transition-[box-shadow,transform] duration-150 ease-out hover:shadow-neu-lg hover:-translate-y-0.5 overflow-hidden h-full flex flex-col">
        {/* Cover image area */}
        {frontmatter.coverImage ? (
          <div className="aspect-video bg-charcoal/5 overflow-hidden">
            <img
              src={frontmatter.coverImage}
              alt=""
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
        ) : (
          <div className={`aspect-video bg-gradient-to-br ${meta.gradient} flex items-center justify-center relative overflow-hidden`}>
            <div className="absolute inset-0 opacity-[0.07]">
              <svg className="w-full h-full" viewBox="0 0 200 200" fill="none">
                <circle cx="150" cy="50" r="50" stroke={meta.color} strokeWidth="0.5" opacity="0.5" />
                <circle cx="50" cy="150" r="70" stroke={meta.color} strokeWidth="0.5" opacity="0.3" />
              </svg>
            </div>
            <svg
              className="w-12 h-12 opacity-20 group-hover:opacity-30 transition-opacity duration-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke={meta.color}
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={meta.icon} />
            </svg>
          </div>
        )}

        <div className="p-5 flex flex-col flex-1">
          {/* Meta line */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <CategoryBadge category={frontmatter.category} size="sm" />
            <span className="text-charcoal-light/40">·</span>
            <ReadingTime minutes={readingTime} />
            <span className="text-charcoal-light/40">·</span>
            <span className="text-sm text-charcoal-light">{dateStr}</span>
          </div>

          {/* Title */}
          <h3 className="text-lg font-bold text-charcoal leading-snug mb-2 group-hover:text-terracotta transition-colors line-clamp-2">
            {frontmatter.title}
          </h3>

          {/* Excerpt */}
          <p className="text-sm text-charcoal-light leading-relaxed mb-4 flex-1 line-clamp-3">
            {frontmatter.excerpt}
          </p>

          {/* Keywords — single scrollable row with fade hint */}
          <div className="relative">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {frontmatter.keywords.slice(0, 3).map((kw) => (
                <KeywordTag key={kw} keyword={kw} />
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-cream to-transparent" />
          </div>
        </div>
      </article>
    </Link>
  );
}
