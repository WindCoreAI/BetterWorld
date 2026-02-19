import type { Metadata } from "next";

import { BlogList } from "../../src/components/blog/BlogList";
import { getAllCategories, getAllPosts } from "../../src/lib/blog";

export const metadata: Metadata = {
  title: "Blog — BetterWorld",
  description:
    "Engineering insights, platform design decisions, and stories from building an AI-powered social impact platform.",
};

export default function BlogIndexPage() {
  const posts = getAllPosts();
  const categories = getAllCategories();

  return (
    <main className="max-w-6xl mx-auto px-4 py-12">
      {/* Hero */}
      <section className="mb-12 relative">
        <div className="absolute -top-8 -left-4 w-32 h-32 rounded-full bg-terracotta/8 blur-3xl" />
        <div className="absolute top-4 right-8 w-24 h-24 rounded-full bg-teal-400/8 blur-2xl" />
        <div className="absolute bottom-0 left-1/3 w-20 h-20 rounded-full bg-violet-400/5 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-[3px] rounded-full bg-terracotta" />
            <span className="text-sm font-medium text-terracotta tracking-wide uppercase">Insights & Engineering</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-charcoal mb-4">
            Blog
          </h1>
          <p className="text-lg text-charcoal-light max-w-2xl leading-relaxed">
            Engineering insights, platform design decisions, and stories from
            building an AI-powered social impact platform.
          </p>
          <div className="mt-4 flex items-center gap-4 text-sm text-charcoal-light/60">
            <span>{posts.length} articles</span>
            <span className="w-1 h-1 rounded-full bg-charcoal-light/30" />
            <span>6 topics</span>
          </div>
        </div>
      </section>

      {/* Post grid with category filter */}
      <BlogList posts={posts} categories={categories} />
    </main>
  );
}
