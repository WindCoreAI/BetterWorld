"use client";

import { useCallback, useEffect, useState } from "react";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function MobileTOC() {
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [showButton, setShowButton] = useState(false);

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
    function handleScroll() {
      setShowButton(window.scrollY > 400);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
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
    setIsOpen(false);
    // Small delay to let drawer close before scrolling
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.pushState(null, "", `#${id}`);
      }
    });
  }, []);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (headings.length === 0) return null;

  // Find active index for progress display
  const activeIdx = headings.findIndex((h) => h.id === activeId);
  const h2Headings = headings.filter((h) => h.level === 2);
  const activeH2Idx = h2Headings.findIndex((h) => h.id === activeId);
  const currentSection = activeH2Idx >= 0
    ? h2Headings[activeH2Idx]!.text
    : activeIdx >= 0
      ? [...headings.slice(0, activeIdx + 1)].reverse().find((h) => h.level === 2)?.text ?? headings[0]!.text
      : "";

  return (
    <>
      {/* Floating TOC button — mobile/tablet only */}
      {showButton && (
        <button
          onClick={() => setIsOpen(true)}
          className="lg:hidden fixed bottom-6 left-6 z-40 flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-charcoal text-cream shadow-lg hover:bg-charcoal/90 transition-all active:scale-95"
          aria-label="Open table of contents"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h18M3 6h18M3 18h12" />
          </svg>
          <span className="text-xs font-medium max-w-[140px] truncate">
            {currentSection || "Contents"}
          </span>
        </button>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
          aria-hidden
        />
      )}

      {/* Slide-up drawer */}
      <div
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="bg-cream rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col">
          {/* Drag handle + header */}
          <div className="flex flex-col items-center pt-3 pb-2 px-5 border-b border-charcoal/10 shrink-0">
            <div className="w-8 h-1 rounded-full bg-charcoal/20 mb-3" />
            <div className="flex items-center justify-between w-full">
              <p className="text-xs font-semibold text-charcoal-light uppercase tracking-wide">
                On this page
              </p>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md text-charcoal-light hover:text-charcoal hover:bg-charcoal/5 transition-colors"
                aria-label="Close table of contents"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Scrollable list */}
          <nav className="overflow-y-auto overscroll-contain px-5 py-3" aria-label="Table of contents">
            <ul className="space-y-1">
              {headings.map((h) => {
                const isActive = activeId === h.id;
                return (
                  <li key={h.id}>
                    <a
                      href={`#${h.id}`}
                      onClick={(e) => scrollToHeading(e, h.id)}
                      className={`flex items-center gap-2 py-2 rounded-lg px-3 transition-colors ${
                        h.level === 3 ? "pl-7" : ""
                      } ${
                        isActive
                          ? "bg-terracotta/10 text-terracotta font-medium"
                          : "text-charcoal-light hover:bg-charcoal/5 hover:text-charcoal"
                      }`}
                    >
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-terracotta shrink-0" />
                      )}
                      <span className={`text-sm leading-snug ${h.level === 3 ? "text-[13px]" : ""}`}>
                        {h.text}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </>
  );
}
