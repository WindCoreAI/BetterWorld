"use client";

import { useCallback, useEffect, useState } from "react";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function TableOfContents() {
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [passedIds, setPassedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const article = document.querySelector("[data-blog-content]");
    if (!article) return;

    const elements = article.querySelectorAll("h2, h3");
    const items: TocItem[] = Array.from(elements).map((el) => ({
      id: el.id,
      text: el.textContent ?? "",
      level: el.tagName === "H2" ? 2 : 3,
    }));
    setHeadings(items);
  }, []);

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            // Mark all headings above the current one as passed
            const idx = headings.findIndex((h) => h.id === entry.target.id);
            if (idx > 0) {
              setPassedIds((prev) => {
                const next = new Set(prev);
                for (let i = 0; i < idx; i++) {
                  next.add(headings[i]!.id);
                }
                return next;
              });
            }
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );

    for (const { id } of headings) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [headings]);

  const scrollToHeading = useCallback((e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Update URL hash without jumping
      window.history.pushState(null, "", `#${id}`);
    }
  }, []);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="Table of contents" className="rounded-xl bg-charcoal/[0.02] border border-charcoal/5 p-4">
      <p className="text-xs font-semibold text-charcoal-light uppercase tracking-wide mb-3">
        On this page
      </p>
      <ul className="space-y-1.5">
        {headings.map((h) => {
          const isPassed = passedIds.has(h.id);
          const isActive = activeId === h.id;
          return (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                onClick={(e) => scrollToHeading(e, h.id)}
                className={`flex items-center gap-1.5 text-sm leading-snug py-0.5 transition-colors ${
                  h.level === 3 ? "pl-3 border-l border-charcoal/10" : ""
                } ${
                  isActive
                    ? "text-terracotta font-medium"
                    : isPassed
                      ? "text-charcoal-light/50"
                      : "text-charcoal-light hover:text-charcoal"
                }`}
              >
                {isPassed && !isActive && (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-emerald-400/60">
                    <path d="M13 4L6 11L3 8" />
                  </svg>
                )}
                <span>{h.text}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
