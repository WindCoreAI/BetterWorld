import Link from "next/link";

import { CategoryBadge } from "./CategoryBadge";
import { ReadingTime } from "./ReadingTime";
import type { BlogPost } from "../../lib/blog-types";
import { CATEGORY_META } from "../../lib/blog-types";

interface BlogHeaderProps {
  post: BlogPost;
}

export function BlogHeader({ post }: BlogHeaderProps) {
  const { frontmatter, readingTime } = post;
  const meta = CATEGORY_META[frontmatter.category];
  const dateStr = new Date(frontmatter.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="mb-10">
      {/* Back link */}
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-charcoal-light hover:text-terracotta transition-colors mb-6 group"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="group-hover:-translate-x-0.5 transition-transform"
        >
          <path d="M10 12L6 8l4-4" />
        </svg>
        Back to Blog
      </Link>

      {/* Category gradient banner */}
      <div className={`relative rounded-2xl overflow-hidden mb-8 bg-gradient-to-br ${meta.gradient}`}>
        <div className="absolute inset-0 opacity-[0.06]">
          <svg className="w-full h-full" viewBox="0 0 400 120" fill="none" preserveAspectRatio="xMidYMid slice">
            <circle cx="350" cy="20" r="80" stroke={meta.color} strokeWidth="0.5" opacity="0.5" />
            <circle cx="50" cy="100" r="60" stroke={meta.color} strokeWidth="0.5" opacity="0.3" />
            <circle cx="200" cy="60" r="100" stroke={meta.color} strokeWidth="0.3" opacity="0.2" />
          </svg>
        </div>
        <div className="relative px-8 py-10 md:py-14 flex items-center gap-6">
          <svg
            className="w-12 h-12 md:w-16 md:h-16 opacity-15 shrink-0 hidden sm:block"
            viewBox="0 0 24 24"
            fill="none"
            stroke={meta.color}
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={meta.icon} />
          </svg>
          <div>
            {/* Meta */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <CategoryBadge category={frontmatter.category} />
              <span className="text-charcoal-light/40">·</span>
              <ReadingTime minutes={readingTime} />
              <span className="text-charcoal-light/40">·</span>
              <time className="text-sm text-charcoal-light" dateTime={frontmatter.date}>
                {dateStr}
              </time>
            </div>

            {/* Title */}
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-charcoal leading-tight">
              {frontmatter.title}
            </h1>
          </div>
        </div>
      </div>

      {/* Author */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-terracotta to-terracotta/70 flex items-center justify-center text-cream font-bold text-sm shadow-sm">
          BW
        </div>
        <div>
          <p className="font-medium text-charcoal text-sm">{frontmatter.author}</p>
          <p className="text-xs text-charcoal-light">
            Building AI-powered social impact infrastructure
          </p>
        </div>
      </div>

      {/* Cover image */}
      {frontmatter.coverImage && (
        <div className="mt-8 rounded-xl overflow-hidden shadow-neu-md">
          <img
            src={frontmatter.coverImage}
            alt=""
            className="w-full h-auto"
          />
        </div>
      )}
    </header>
  );
}
