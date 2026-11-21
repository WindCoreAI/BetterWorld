"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { getAdminToken, getHumanRefreshToken, validateAdminToken } from "../../../src/lib/api";
import { humanAuthApi } from "../../../src/lib/humanApi";
import { rememberReturnTo } from "../../../src/lib/returnTo";

/** Access tokens live 15 minutes; keep the session alive while the panel is open. */
const SESSION_REFRESH_MS = 10 * 60 * 1000;

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // An operator's normal sign-in is their admin session. Renew it first so a
      // token that expired while the tab was idle does not read as "access denied".
      if (getHumanRefreshToken()) {
        await humanAuthApi.refresh();
      }
      const adminToken = getAdminToken();
      const ok = adminToken ? await validateAdminToken(adminToken) : false;
      if (!cancelled) setIsAdmin(ok);
    }

    void check();
    const timer = setInterval(() => {
      if (getHumanRefreshToken()) void humanAuthApi.refresh();
    }, SESSION_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-charcoal-light">Checking authorization...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold text-charcoal mb-4">Access Denied</h1>
        <p className="text-charcoal-light mb-2 max-w-md">
          This area is for operators. Sign in with an operator account to review flagged content and evidence.
        </p>
        <p className="text-charcoal-light text-sm mb-6 max-w-md">
          Running your own instance? Add your email to <code>ADMIN_EMAILS</code> in the API settings, then sign in with that account.
        </p>
        <div className="flex gap-4">
          <Link
            href="/auth/human/login"
            onClick={() => rememberReturnTo(pathname ?? "/admin")}
            className="text-terracotta hover:underline"
          >
            Sign in
          </Link>
          <Link href="/" className="text-terracotta hover:underline">Return to Home</Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-cream/50">
      <nav className="bg-charcoal text-cream px-6 py-3 flex flex-wrap items-center justify-between gap-y-2" aria-label="Admin navigation">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/admin" className="font-bold text-lg">Admin</Link>
          <Link href="/admin/flagged" className="text-sm text-cream/80 hover:text-cream">Flagged Content</Link>
          <Link href="/admin/evidence" className="text-sm text-cream/80 hover:text-cream">Evidence Review</Link>
          <Link href="/admin/fraud" className="text-sm text-cream/80 hover:text-cream">Fraud Review</Link>
          <Link href="/admin/shadow" className="text-sm text-cream/80 hover:text-cream">Shadow Mode</Link>
          <Link href="/admin/production" className="text-sm text-cream/80 hover:text-cream">Production Shift</Link>
          <Link href="/city" className="text-sm text-cream/80 hover:text-cream">City Dashboards</Link>
        </div>
        <Link href="/" className="text-sm text-cream/60 hover:text-cream">Back to Site</Link>
      </nav>
      {children}
    </div>
  );
}
