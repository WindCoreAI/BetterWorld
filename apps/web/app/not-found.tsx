/**
 * Custom 404 Page (FR-018)
 *
 * Styled page with navigation links back to dashboard/home.
 */

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto max-w-md">
        <div className="mb-4 text-7xl font-bold text-gray-200">404</div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          Page not found
        </h1>
        <p className="mb-6 text-gray-600">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
