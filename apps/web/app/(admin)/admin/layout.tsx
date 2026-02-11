"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { getAdminToken, validateAdminToken } from "../../../src/lib/api";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const adminToken = getAdminToken();
    if (!adminToken) {
      setIsAdmin(false);
      return;
    }
    validateAdminToken(adminToken).then(setIsAdmin);
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
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <h1 className="text-2xl font-bold text-charcoal mb-4">Access Denied</h1>
        <p className="text-charcoal-light mb-6">You need admin access to view this page.</p>
        <Link href="/" className="text-terracotta hover:underline">Return to Home</Link>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-cream/50">
      <nav className="bg-charcoal text-cream px-6 py-3 flex items-center justify-between" aria-label="Admin navigation">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="font-bold text-lg">Admin</Link>
          <Link href="/admin/flagged" className="text-sm text-cream/80 hover:text-cream">Flagged Content</Link>
          <Link href="/admin/fraud" className="text-sm text-cream/80 hover:text-cream">Fraud Review</Link>
        </div>
        <Link href="/" className="text-sm text-cream/60 hover:text-cream">Back to Site</Link>
      </nav>
      {children}
    </div>
  );
}
