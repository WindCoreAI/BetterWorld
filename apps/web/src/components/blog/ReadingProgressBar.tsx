"use client";

import { useEffect, useState } from "react";

interface ReadingProgressBarProps {
  readingTime?: number;
}

export function ReadingProgressBar({ readingTime }: ReadingProgressBarProps) {
  const [progress, setProgress] = useState(0);
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    function handleScroll() {
      const article = document.querySelector("[data-blog-content]");
      if (!article) return;

      const rect = article.getBoundingClientRect();
      const articleTop = rect.top + window.scrollY;
      const articleHeight = rect.height;
      const scrolled = window.scrollY - articleTop + window.innerHeight * 0.3;
      const pct = Math.min(100, Math.max(0, (scrolled / articleHeight) * 100));
      setProgress(pct);
      setShowIndicator(window.scrollY > 300 && pct < 95);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const minutesLeft = readingTime
    ? Math.max(1, Math.ceil(readingTime * (1 - progress / 100)))
    : 0;

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 h-[3px] bg-charcoal/5">
        <div
          className="h-full bg-gradient-to-r from-terracotta to-terracotta/70 transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      {/* Reading time remaining — visible on scroll, fades at end */}
      {readingTime && showIndicator ? (
        <div className="fixed top-[3px] right-4 z-50 py-1 px-2.5 text-[11px] font-medium text-charcoal-light/70 bg-cream/90 backdrop-blur-sm rounded-b-lg shadow-sm transition-opacity duration-300">
          {minutesLeft} min left
        </div>
      ) : null}
    </>
  );
}
