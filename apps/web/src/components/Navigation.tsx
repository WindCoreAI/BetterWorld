"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useHumanAuth } from "../hooks/useHumanAuth";
import type { HumanUser } from "../types/human";
import { NotificationBell } from "./notifications/NotificationBell";

// ── Grouped Navigation Structure ──

interface NavChild {
  href: string;
  label: string;
  description: string;
}

interface NavGroup {
  label: string;
  children: NavChild[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Explore",
    children: [
      { href: "/problems", label: "Problems", description: "Discover social issues" },
      { href: "/solutions", label: "Solutions", description: "Browse proposed solutions" },
      { href: "/missions", label: "Missions", description: "Find work to do" },
      { href: "/case-studies", label: "Case Studies", description: "Learn from successful missions" },
      { href: "/blog", label: "Blog", description: "Engineering & design insights" },
    ],
  },
  {
    label: "Community",
    children: [
      { href: "/domains", label: "Domains", description: "15 impact domains" },
      { href: "/circles", label: "Circles", description: "Small groups, shared causes" },
      { href: "/challenges", label: "Challenges", description: "City & domain competitions" },
      { href: "/achievements", label: "Achievements", description: "Earned by working together" },
      { href: "/leaderboards", label: "Leaderboards", description: "Top contributors" },
      { href: "/activity", label: "Activity", description: "Recent platform activity" },
      { href: "/discover", label: "Discover", description: "Find people & circles" },
      { href: "/governance", label: "Governance", description: "Power & network transparency" },
    ],
  },
  {
    label: "My Journey",
    children: [
      { href: "/feed", label: "My Feed", description: "Activity from people you follow" },
      { href: "/impact", label: "Impact", description: "Your impact dashboard" },
      { href: "/learning", label: "Learning", description: "Grow your skills" },
      { href: "/teaching", label: "Teaching", description: "Mentor rewards & leaderboard" },
      { href: "/my-agents", label: "My Agents", description: "Create & manage AI agents" },
    ],
  },
];

// ── Chevron Icon ──

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 1l4 4 4-4" />
    </svg>
  );
}

// ── Desktop Dropdown ──

function NavDropdown({
  group,
  isActive,
}: {
  group: NavGroup;
  isActive: (href: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const groupIsActive = group.children.some((c) => isActive(c.href));

  const handleEnter = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  }, []);

  const handleLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        className={`flex items-center gap-1 text-sm font-medium transition-colors ${
          groupIsActive
            ? "text-terracotta"
            : "text-charcoal-light hover:text-charcoal"
        }`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {group.label}
        <ChevronDown
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 z-50">
          <div className="bg-white rounded-xl shadow-lg border border-charcoal/5 py-2 min-w-[200px]">
            {group.children.map(({ href, label, description }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2.5 transition-colors ${
                  isActive(href)
                    ? "bg-terracotta/5 text-terracotta"
                    : "hover:bg-cream text-charcoal"
                }`}
              >
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-charcoal-light mt-0.5">{description}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Auth Sections ──

function DesktopAuth({
  isLoading,
  isHuman,
  humanUser,
  onHumanLogout,
  isActive,
}: {
  isLoading: boolean;
  isHuman: boolean;
  humanUser: HumanUser | null;
  onHumanLogout: () => void;
  isActive: (href: string) => boolean;
}) {
  if (isLoading) return <span className="text-xs text-charcoal-light">...</span>;

  if (isHuman) {
    return (
      <>
        <Link href="/dashboard" className={`text-sm font-medium transition-colors ${isActive("/dashboard") ? "text-terracotta" : "text-charcoal-light hover:text-charcoal"}`}>Dashboard</Link>
        <NotificationBell />
        <span className="text-sm font-medium text-charcoal">{humanUser?.displayName ?? "User"}</span>
        <button onClick={onHumanLogout} className="text-sm text-charcoal-light hover:text-charcoal transition-colors">Logout</button>
      </>
    );
  }

  return (
    <>
      <Link href="/auth/human/login" className="text-sm font-medium text-charcoal-light hover:text-charcoal transition-colors">Login</Link>
      <Link href="/auth/human/register" className="text-sm font-medium px-4 py-1.5 bg-terracotta text-white rounded-lg hover:bg-terracotta-dark transition-colors">Join</Link>
    </>
  );
}

// ── Mobile Accordion Group ──

function MobileNavGroup({
  group,
  isActive,
  onClose,
}: {
  group: NavGroup;
  isActive: (href: string) => boolean;
  onClose: () => void;
}) {
  const groupIsActive = group.children.some((c) => isActive(c.href));
  const [expanded, setExpanded] = useState(groupIsActive);

  return (
    <div>
      <button
        className={`flex items-center justify-between w-full py-2 text-sm font-medium ${
          groupIsActive ? "text-terracotta" : "text-charcoal"
        }`}
        onClick={() => setExpanded((o) => !o)}
        aria-expanded={expanded}
      >
        {group.label}
        <ChevronDown
          className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="pl-4 pb-1">
          {group.children.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`block py-1.5 text-sm ${
                isActive(href)
                  ? "text-terracotta font-medium"
                  : "text-charcoal-light"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileAuth({
  isLoading,
  isHuman,
  onHumanLogout,
  onClose,
}: {
  isLoading: boolean;
  isHuman: boolean;
  onHumanLogout: () => void;
  onClose: () => void;
}) {
  if (isLoading) return null;

  if (isHuman) {
    return (
      <>
        <Link href="/dashboard" onClick={onClose} className="block py-2 text-sm font-medium text-charcoal-light">Dashboard</Link>
        <Link href="/notifications" onClick={onClose} className="block py-2 text-sm font-medium text-charcoal-light">Notifications</Link>
        <button onClick={() => { onHumanLogout(); onClose(); }} className="py-2 text-sm text-charcoal-light">Logout</button>
      </>
    );
  }

  return (
    <>
      <Link href="/auth/human/login" onClick={onClose} className="block py-2 text-sm font-medium text-charcoal-light">Login</Link>
      <Link href="/auth/human/register" onClick={onClose} className="block py-2 text-sm font-medium text-terracotta">Join</Link>
    </>
  );
}

// ── Main Navigation ──

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated: isHuman, user: humanUser, loading: humanLoading, logout: humanLogout } = useHumanAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const isLoading = humanLoading;

  const handleHumanLogout = async () => { await humanLogout(); router.push("/"); };

  if (pathname.startsWith("/admin")) return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="sticky top-0 z-50 bg-cream/95 backdrop-blur shadow-neu-sm" aria-label="Main navigation">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="font-bold text-lg text-charcoal">
          Better<span className="text-terracotta">World</span>
        </Link>

        {/* Desktop: Grouped dropdowns */}
        <div className="hidden md:flex items-center gap-6">
          {NAV_GROUPS.map((group) => (
            <NavDropdown key={group.label} group={group} isActive={isActive} />
          ))}
        </div>

        {/* Desktop: Auth */}
        <div className="hidden md:flex items-center gap-3">
          <DesktopAuth isLoading={isLoading} isHuman={isHuman} humanUser={humanUser} onHumanLogout={handleHumanLogout} isActive={isActive} />
        </div>

        {/* Mobile: Hamburger */}
        <button className="md:hidden p-2 text-charcoal" onClick={() => setMenuOpen((o) => !o)} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile: Accordion menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-charcoal/10 bg-cream px-4 pb-4">
          <div className="flex flex-col gap-1 pt-2">
            {NAV_GROUPS.map((group) => (
              <MobileNavGroup
                key={group.label}
                group={group}
                isActive={isActive}
                onClose={() => setMenuOpen(false)}
              />
            ))}
            <div className="border-t border-charcoal/10 pt-2 mt-1">
              <MobileAuth isLoading={isLoading} isHuman={isHuman} onHumanLogout={handleHumanLogout} onClose={() => setMenuOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
