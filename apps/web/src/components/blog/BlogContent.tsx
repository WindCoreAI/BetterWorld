import type { ReactNode } from "react";

interface BlogContentProps {
  children: ReactNode;
}

/**
 * Wraps rendered MDX/HTML blog content with consistent typography styles.
 * Uses a data attribute for TableOfContents heading discovery.
 */
export function BlogContent({ children }: BlogContentProps) {
  return (
    <div data-blog-content className="blog-prose">
      {children}
    </div>
  );
}
