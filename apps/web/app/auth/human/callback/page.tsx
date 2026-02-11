"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useHumanAuth } from "../../../../src/hooks/useHumanAuth";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginWithOAuthCode } = useHumanAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("No authorization code received");
      return;
    }

    let cancelled = false;

    async function exchange() {
      const result = await loginWithOAuthCode(code!);
      if (cancelled) return;

      if (result.ok) {
        router.push("/dashboard");
      } else {
        setError(result.error ?? "OAuth login failed");
      }
    }

    exchange();

    return () => {
      cancelled = true;
    };
  }, [searchParams, loginWithOAuthCode, router]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <div className="text-4xl">Something went wrong</div>
          <p className="text-error">{error}</p>
          <Link
            href="/auth/human/register"
            className="inline-block px-6 py-2 bg-terracotta text-cream rounded-lg hover:bg-terracotta-dark transition-colors"
          >
            Try again
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-4 border-terracotta border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-charcoal-light">Completing sign in...</p>
      </div>
    </main>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-terracotta border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
