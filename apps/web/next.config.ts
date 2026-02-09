import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Next.js requires 'unsafe-inline' for script-src to support inline hydration scripts.
// In dev mode, Turbopack/Webpack also need 'unsafe-eval' for HMR compilation.
// TODO: Implement nonce-based CSP via middleware for stricter script-src policy.
const scriptSrc = isDev
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'";
const connectSrc = isDev
  ? "'self' wss: ws: http://localhost:* https://*.fly.dev"
  : "'self' wss: https://*.fly.dev";

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
            value: `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src ${connectSrc}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
