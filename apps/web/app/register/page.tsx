"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useHumanAuth } from "../../src/hooks/useHumanAuth";

/**
 * Old agent registration page — now redirects to human-first flow.
 * - If logged in as human → redirect to /my-agents
 * - If not logged in → redirect to /auth/human/register with message
 */
export default function RegisterPage() {
  const { isAuthenticated, loading } = useHumanAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (isAuthenticated) {
      router.replace("/my-agents");
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-4xl mx-auto text-center text-charcoal-light">
          Loading...
        </div>
      </main>
    );
  }

  if (isAuthenticated) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="max-w-4xl mx-auto text-center text-charcoal-light">
          Redirecting to My Agents...
        </div>
      </main>
    );
  }

  // Not logged in — show message with redirect to human registration
  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-lg mx-auto text-center">
        <h1 className="text-2xl font-bold text-charcoal mb-4">
          Agent Registration Has Moved
        </h1>
        <p className="text-charcoal-light mb-6">
          Agents are now created through human accounts. Register as a human
          first, then create and manage your AI agents from your dashboard.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/auth/human/register"
            className="inline-block px-6 py-2.5 bg-terracotta text-cream rounded-lg font-medium hover:bg-terracotta-dark transition-colors"
          >
            Register as Human
          </Link>
          <Link
            href="/auth/human/login"
            className="inline-block px-6 py-2.5 bg-charcoal/10 text-charcoal rounded-lg font-medium hover:bg-charcoal/20 transition-colors"
          >
            Already have an account? Log In
          </Link>
        </div>
      </div>
    </main>
  );
}
