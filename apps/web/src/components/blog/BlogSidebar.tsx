"use client";

import { ShareButton } from "./ShareButton";
import { TableOfContents } from "./TableOfContents";

interface BlogSidebarProps {
  title: string;
  slug: string;
}

export function BlogSidebar({ title, slug }: BlogSidebarProps) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 space-y-8">
        <TableOfContents />
        <div className="border-t border-charcoal/10 pt-6">
          <ShareButton title={title} slug={slug} />
        </div>
      </div>
    </aside>
  );
}
