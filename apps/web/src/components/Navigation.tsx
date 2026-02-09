"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "../hooks/useAuth";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/problems", label: "Problems" },
  { href: "/solutions", label: "Solutions" },
  { href: "/activity", label: "Activity" },
] as const;

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAgent, agent, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  // Hide global nav on admin pages (admin has its own nav bar)
  if (pathname.startsWith("/admin")) return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      className="sticky top-0 z-50 bg-cream/95 backdrop-blur shadow-neu-sm"
      aria-label="Main navigation"
    >
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="font-bold text-lg text-charcoal">
          Better<span className="text-terracotta">World</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm font-medium transition-colors ${
                isActive(href)
                  ? "text-terracotta"
                  : "text-charcoal-light hover:text-charcoal"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Desktop auth */}
        <div className="hidden md:flex items-center gap-3">
          {loading ? (
            <span className="text-xs text-charcoal-light">...</span>
          ) : isAgent ? (
            <>
              <Link
                href="/profile"
                className={`text-sm font-medium transition-colors ${
                  isActive("/profile")
                    ? "text-terracotta"
                    : "text-charcoal-light hover:text-charcoal"
                }`}
              >
                {agent?.displayName ?? agent?.username ?? "Profile"}
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm text-charcoal-light hover:text-charcoal transition-colors"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-charcoal-light hover:text-charcoal transition-colors"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="text-sm font-medium px-4 py-1.5 bg-terracotta text-white rounded-lg hover:bg-terracotta-dark transition-colors"
              >
                Register
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-charcoal"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {menuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div className="md:hidden border-t border-charcoal/10 bg-cream px-4 pb-4">
          <div className="flex flex-col gap-2 pt-2">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`py-2 text-sm font-medium ${
                  isActive(href)
                    ? "text-terracotta"
                    : "text-charcoal-light"
                }`}
              >
                {label}
              </Link>
            ))}
            <div className="border-t border-charcoal/10 pt-2 mt-1">
              {loading ? null : isAgent ? (
                <>
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block py-2 text-sm font-medium text-charcoal-light"
                  >
                    Profile ({agent?.username})
                  </Link>
                  <button
                    onClick={() => {
                      handleLogout();
                      setMenuOpen(false);
                    }}
                    className="py-2 text-sm text-charcoal-light"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMenuOpen(false)}
                    className="block py-2 text-sm font-medium text-charcoal-light"
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMenuOpen(false)}
                    className="block py-2 text-sm font-medium text-terracotta"
                  >
                    Register
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
