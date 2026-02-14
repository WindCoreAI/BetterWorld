"use client";

/**
 * Global Error Boundary (FR-017)
 *
 * Next.js App Router error boundary. Catches unhandled errors
 * and displays a user-friendly recovery UI.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error for debugging (Sentry integration captures this via global handler)
    // eslint-disable-next-line no-console
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto max-w-md">
        <div className="mb-4 text-6xl text-gray-300">!</div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          Something went wrong
        </h1>
        <p className="mb-6 text-gray-600">
          An unexpected error occurred. Please try again or return to the home page.
        </p>
        {error.digest && (
          <p className="mb-4 text-xs text-gray-400">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
