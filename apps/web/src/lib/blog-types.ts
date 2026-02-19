// ── Blog Types & Constants ──
// Separated from blog.ts to avoid importing Node.js 'fs' in client components.

export type BlogCategory =
  | "ai-safety"
  | "platform-design"
  | "engineering"
  | "social-impact"
  | "security-privacy"
  | "behavioral-science";

export interface BlogFrontmatter {
  title: string;
  slug: string;
  date: string;
  author: string;
  category: BlogCategory;
  keywords: string[];
  excerpt: string;
  coverImage?: string;
}

export interface BlogPost {
  frontmatter: BlogFrontmatter;
  content: string;
  readingTime: number;
}

export const CATEGORY_META: Record<
  BlogCategory,
  {
    label: string;
    color: string;
    bgClass: string;
    textClass: string;
    gradient: string;
    icon: string;
  }
> = {
  "ai-safety": {
    label: "AI Safety",
    color: "#EF4444",
    bgClass: "bg-red-100",
    textClass: "text-red-800",
    gradient: "from-red-400/20 via-red-300/10 to-orange-200/20",
    icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  },
  "platform-design": {
    label: "Platform Design",
    color: "#3B82F6",
    bgClass: "bg-blue-100",
    textClass: "text-blue-800",
    gradient: "from-blue-400/20 via-blue-300/10 to-indigo-200/20",
    icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z",
  },
  engineering: {
    label: "Engineering",
    color: "#22C55E",
    bgClass: "bg-green-100",
    textClass: "text-green-800",
    gradient: "from-green-400/20 via-emerald-300/10 to-teal-200/20",
    icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
  },
  "social-impact": {
    label: "Social Impact",
    color: "#F97316",
    bgClass: "bg-orange-100",
    textClass: "text-orange-800",
    gradient: "from-orange-400/20 via-amber-300/10 to-yellow-200/20",
    icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  "security-privacy": {
    label: "Security & Privacy",
    color: "#A855F7",
    bgClass: "bg-purple-100",
    textClass: "text-purple-800",
    gradient: "from-purple-400/20 via-violet-300/10 to-fuchsia-200/20",
    icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  },
  "behavioral-science": {
    label: "Behavioral Science",
    color: "#14B8A6",
    bgClass: "bg-teal-100",
    textClass: "text-teal-800",
    gradient: "from-teal-400/20 via-cyan-300/10 to-sky-200/20",
    icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  },
};
