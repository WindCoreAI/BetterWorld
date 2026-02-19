"use client";

import { useState } from "react";

import { BlogCard } from "./BlogCard";
import { CategoryFilter } from "./CategoryFilter";
import type { BlogCategory, BlogPost } from "../../lib/blog-types";

interface BlogListProps {
  posts: BlogPost[];
  categories: BlogCategory[];
}

export function BlogList({ posts, categories }: BlogListProps) {
  const [selected, setSelected] = useState<BlogCategory | null>(null);

  const filtered = selected
    ? posts.filter((p) => p.frontmatter.category === selected)
    : posts;

  const [heroPost, ...restPosts] = filtered;

  return (
    <>
      <style>{`
        @keyframes blog-card-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .blog-card-animate {
          animation: blog-card-in 0.3s ease-out both;
        }
      `}</style>

      <div className="mb-8">
        <CategoryFilter
          categories={categories}
          selected={selected}
          onSelect={setSelected}
          posts={posts}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-charcoal-light text-center py-12">
          No posts in this category yet. Check back soon!
        </p>
      ) : (
        <div key={selected ?? "all"} className="space-y-8">
          {/* Featured hero post */}
          {heroPost && (
            <div className="blog-card-animate">
              <BlogCard post={heroPost} variant="hero" />
            </div>
          )}

          {/* Remaining posts in grid — flex-wrap centers incomplete last row */}
          {restPosts.length > 0 && (
            <div className="flex flex-wrap justify-center gap-6">
              {restPosts.map((post, i) => (
                <div
                  key={post.frontmatter.slug}
                  className="w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] blog-card-animate"
                  style={{ animationDelay: `${(i + 1) * 60}ms` }}
                >
                  <BlogCard post={post} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
