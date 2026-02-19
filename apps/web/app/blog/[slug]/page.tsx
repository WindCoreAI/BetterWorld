import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackToTop } from "../../../src/components/blog/BackToTop";
import { BlogFooter } from "../../../src/components/blog/BlogFooter";
import { BlogHeader } from "../../../src/components/blog/BlogHeader";
import { BlogSidebar } from "../../../src/components/blog/BlogSidebar";
import { MarkdownRenderer } from "../../../src/components/blog/MarkdownRenderer";
import { MobileTOC } from "../../../src/components/blog/MobileTOC";
import { PostNavigation } from "../../../src/components/blog/PostNavigation";
import { ReadingProgressBar } from "../../../src/components/blog/ReadingProgressBar";
import { getAdjacentPosts, getAllSlugs, getPostBySlug, getRelatedPosts } from "../../../src/lib/blog";
import { parseMarkdown } from "../../../src/lib/markdown";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Post Not Found — BetterWorld" };

  return {
    title: `${post.frontmatter.title} — BetterWorld Blog`,
    description: post.frontmatter.excerpt,
    openGraph: {
      title: post.frontmatter.title,
      description: post.frontmatter.excerpt,
      type: "article",
      publishedTime: post.frontmatter.date,
      authors: [post.frontmatter.author],
      ...(post.frontmatter.coverImage && {
        images: [post.frontmatter.coverImage],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title: post.frontmatter.title,
      description: post.frontmatter.excerpt,
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const relatedPosts = getRelatedPosts(post, 3);
  const { prev, next } = getAdjacentPosts(post);
  const blocks = parseMarkdown(post.content);

  return (
    <>
      <ReadingProgressBar readingTime={post.readingTime} />
      <main className="max-w-6xl mx-auto px-4 py-12">
        <BlogHeader post={post} />

        <div className="lg:grid lg:grid-cols-[1fr_240px] lg:gap-12">
          {/* Article body */}
          <article>
            <MarkdownRenderer blocks={blocks} />
          </article>

          {/* Sidebar — desktop only */}
          <BlogSidebar title={post.frontmatter.title} slug={slug} />
        </div>

        <PostNavigation prev={prev} next={next} />
        <BlogFooter post={post} relatedPosts={relatedPosts} />
      </main>
      <MobileTOC />
      <BackToTop />
    </>
  );
}
