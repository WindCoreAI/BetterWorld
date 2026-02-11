"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "../hooks/useAuth";
import { useHumanAuth } from "../hooks/useHumanAuth";
import type { AgentProfile } from "../lib/api";
import type { HumanUser } from "../types/human";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/problems", label: "Problems" },
  { href: "/solutions", label: "Solutions" },
  { href: "/missions", label: "Missions" },
  { href: "/activity", label: "Activity" },
] as const;

// ── Auth Sections (extracted to reduce complexity) ──

function DesktopAuth({
  isLoading,
  isHuman,
  humanUser,
  isAgent,
  agent,
  onLogout,
  onHumanLogout,
  isActive,
}: {
  isLoading: boolean;
  isHuman: boolean;
  humanUser: HumanUser | null;
  isAgent: boolean;
  agent: AgentProfile | null;
  onLogout: () => void;
  onHumanLogout: () => void;
  isActive: (href: string) => boolean;
}) {
  if (isLoading) return <span className="text-xs text-charcoal-light">...</span>;

  if (isHuman) {
    return (
      <>
        <Link href="/dashboard" className={`text-sm font-medium transition-colors ${isActive("/dashboard") ? "text-terracotta" : "text-charcoal-light hover:text-charcoal"}`}>Dashboard</Link>
        <span className="text-sm font-medium text-charcoal">{humanUser?.displayName ?? "User"}</span>
        <button onClick={onHumanLogout} className="text-sm text-charcoal-light hover:text-charcoal transition-colors">Logout</button>
      </>
    );
  }

  if (isAgent) {
    return (
      <>
        <Link href="/profile" className={`text-sm font-medium transition-colors ${isActive("/profile") ? "text-terracotta" : "text-charcoal-light hover:text-charcoal"}`}>{agent?.displayName ?? agent?.username ?? "Profile"}</Link>
        <button onClick={onLogout} className="text-sm text-charcoal-light hover:text-charcoal transition-colors">Logout</button>
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

function MobileAuth({
  isLoading,
  isHuman,
  isAgent,
  agent,
  onLogout,
  onHumanLogout,
  onClose,
}: {
  isLoading: boolean;
  isHuman: boolean;
  isAgent: boolean;
  agent: AgentProfile | null;
  onLogout: () => void;
  onHumanLogout: () => void;
  onClose: () => void;
}) {
  if (isLoading) return null;

  if (isHuman) {
    return (
      <>
        <Link href="/dashboard" onClick={onClose} className="block py-2 text-sm font-medium text-charcoal-light">Dashboard</Link>
        <button onClick={() => { onHumanLogout(); onClose(); }} className="py-2 text-sm text-charcoal-light">Logout</button>
      </>
    );
  }

  if (isAgent) {
    return (
      <>
        <Link href="/profile" onClick={onClose} className="block py-2 text-sm font-medium text-charcoal-light">Profile ({agent?.username})</Link>
        <button onClick={() => { onLogout(); onClose(); }} className="py-2 text-sm text-charcoal-light">Logout</button>
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
  const { isAgent, agent, loading, logout } = useAuth();
  const { isAuthenticated: isHuman, user: humanUser, loading: humanLoading, logout: humanLogout } = useHumanAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const isLoading = loading || humanLoading;

  const handleLogout = () => { logout(); router.push("/"); };
  const handleHumanLogout = async () => { await humanLogout(); router.push("/"); };

  if (pathname.startsWith("/admin")) return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="sticky top-0 z-50 bg-cream/95 backdrop-blur shadow-neu-sm" aria-label="Main navigation">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg text-charcoal">
          Better<span className="text-terracotta">World</span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className={`text-sm font-medium transition-colors ${isActive(href) ? "text-terracotta" : "text-charcoal-light hover:text-charcoal"}`}>{label}</Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <DesktopAuth isLoading={isLoading} isHuman={isHuman} humanUser={humanUser} isAgent={isAgent} agent={agent} onLogout={handleLogout} onHumanLogout={handleHumanLogout} isActive={isActive} />
        </div>

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

      {menuOpen && (
        <div className="md:hidden border-t border-charcoal/10 bg-cream px-4 pb-4">
          <div className="flex flex-col gap-2 pt-2">
            {NAV_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} onClick={() => setMenuOpen(false)} className={`py-2 text-sm font-medium ${isActive(href) ? "text-terracotta" : "text-charcoal-light"}`}>{label}</Link>
            ))}
            <div className="border-t border-charcoal/10 pt-2 mt-1">
              <MobileAuth isLoading={isLoading} isHuman={isHuman} isAgent={isAgent} agent={agent} onLogout={handleLogout} onHumanLogout={handleHumanLogout} onClose={() => setMenuOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
