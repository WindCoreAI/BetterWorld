import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** Origin of a configured URL, or null if it is missing or malformed. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// The API (and its WebSocket endpoint) this build talks to. They must be in the
// CSP: the policy used to allow only 'self' and https://*.fly.dev, so pointing
// NEXT_PUBLIC_API_URL at any other host (a custom domain, a self-hosted server)
// produced a site whose every request was blocked by its own policy.
const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL);
const wsOrigin = originOf(process.env.NEXT_PUBLIC_WS_URL);
const configuredOrigins = [apiOrigin, wsOrigin].filter((o): o is string => !!o);

// Next.js requires 'unsafe-inline' for script-src to support inline hydration scripts.
// In dev mode, Turbopack/Webpack also need 'unsafe-eval' for HMR compilation.
// TODO: Implement nonce-based CSP via middleware for stricter script-src policy.
const scriptSrc = isDev
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'";

const connectSrc = [
  "'self'",
  "wss:",
  ...(isDev ? ["ws:", "http://localhost:*"] : []),
  "https://*.fly.dev",
  ...configuredOrigins,
].join(" ");

// blob: — the local preview of a photo chosen for upload (URL.createObjectURL)
// https: — map tiles and signed evidence links
// plus the API origin itself, which serves evidence files when no object storage is configured
const imgSrc = [
  "'self'",
  "data:",
  "blob:",
  "https:",
  ...(isDev ? ["http://localhost:*"] : []),
  ...(apiOrigin ? [apiOrigin] : []),
].join(" ");

const nextConfig: NextConfig = {
  transpilePackages: ["@betterworld/shared"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "0" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src ${imgSrc}; font-src 'self'; connect-src ${connectSrc}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
