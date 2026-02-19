import { BlogCard } from "./BlogCard";
import { KeywordTag } from "./KeywordTag";
import type { BlogPost } from "../../lib/blog-types";

interface BlogFooterProps {
  post: BlogPost;
  relatedPosts: BlogPost[];
}

export function BlogFooter({ post, relatedPosts }: BlogFooterProps) {
  return (
    <footer className="mt-16">
      {/* Keywords */}
      <div className="flex flex-wrap gap-2 py-6 border-t border-charcoal/10">
        {post.frontmatter.keywords.map((kw) => (
          <KeywordTag key={kw} keyword={kw} />
        ))}
      </div>

      {/* Newsletter CTA */}
      <div className="my-10 p-8 rounded-2xl bg-gradient-to-br from-terracotta/[0.06] via-transparent to-teal-500/[0.04] border border-charcoal/5 text-center">
        <div className="flex justify-center mb-3">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-terracotta/60">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-charcoal mb-1.5">
          Enjoyed this post?
        </h3>
        <p className="text-sm text-charcoal-light mb-5 max-w-md mx-auto">
          We write about AI safety, platform engineering, and building technology for social good. Follow along as we build in the open.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <a
            href="https://github.com/WindCoreAI/BetterWorld"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-charcoal text-cream text-sm font-medium hover:bg-charcoal/90 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Star on GitHub
          </a>
          <a
            href="/blog"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-terracotta/10 text-terracotta text-sm font-medium hover:bg-terracotta/20 transition-colors"
          >
            Read more posts
          </a>
        </div>
      </div>

      {/* Related posts */}
      {relatedPosts.length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xl font-bold text-charcoal mb-6 flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-terracotta/50">
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            </svg>
            Related Posts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {relatedPosts.map((rp) => (
              <BlogCard key={rp.frontmatter.slug} post={rp} />
            ))}
          </div>
        </section>
      )}
    </footer>
  );
}
