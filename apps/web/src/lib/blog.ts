import fs from "fs";
import path from "path";

import matter from "gray-matter";
import readingTime from "reading-time";

import type { BlogCategory, BlogPost } from "./blog-types";

// Re-export types for convenience in server-only code
export type { BlogCategory, BlogFrontmatter, BlogPost } from "./blog-types";
export { CATEGORY_META } from "./blog-types";

// ── File Helpers ──

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

function getMdxFiles(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));
}

function parsePost(filename: string): BlogPost {
  const filePath = path.join(CONTENT_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  const stats = readingTime(content);

  return {
    frontmatter: {
      title: data.title ?? "",
      slug: data.slug ?? filename.replace(/\.mdx?$/, ""),
      date: data.date ?? "",
      author: data.author ?? "BetterWorld Team",
      category: data.category ?? "engineering",
      keywords: data.keywords ?? [],
      excerpt: data.excerpt ?? "",
      coverImage: data.coverImage,
    },
    content,
    readingTime: Math.ceil(stats.minutes),
  };
}

// ── Public API (server-only) ──

export function getAllPosts(): BlogPost[] {
  return getMdxFiles()
    .map(parsePost)
    .sort(
      (a, b) =>
        new Date(b.frontmatter.date).getTime() -
        new Date(a.frontmatter.date).getTime(),
    );
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  const all = getAllPosts();
  return all.find((p) => p.frontmatter.slug === slug);
}

export function getPostsByCategory(category: BlogCategory): BlogPost[] {
  return getAllPosts().filter((p) => p.frontmatter.category === category);
}

export function getRelatedPosts(post: BlogPost, limit = 3): BlogPost[] {
  const sameCategory = getAllPosts().filter(
    (p) =>
      p.frontmatter.slug !== post.frontmatter.slug &&
      p.frontmatter.category === post.frontmatter.category,
  );

  // If not enough in same category, fill with other recent posts
  if (sameCategory.length >= limit) {
    return sameCategory.slice(0, limit);
  }

  const others = getAllPosts().filter(
    (p) =>
      p.frontmatter.slug !== post.frontmatter.slug &&
      p.frontmatter.category !== post.frontmatter.category,
  );

  return [...sameCategory, ...others].slice(0, limit);
}

export function getAllCategories(): BlogCategory[] {
  const cats = new Set(getAllPosts().map((p) => p.frontmatter.category));
  return Array.from(cats);
}

export function getAllSlugs(): string[] {
  return getAllPosts().map((p) => p.frontmatter.slug);
}

export function getAdjacentPosts(
  post: BlogPost,
): { prev: BlogPost | null; next: BlogPost | null } {
  const all = getAllPosts(); // sorted newest-first
  const idx = all.findIndex((p) => p.frontmatter.slug === post.frontmatter.slug);
  return {
    prev: idx < all.length - 1 ? all[idx + 1]! : null, // older post
    next: idx > 0 ? all[idx - 1]! : null, // newer post
  };
}
