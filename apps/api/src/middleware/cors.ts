import { cors } from "hono/cors";

export function corsMiddleware() {
  const origins = process.env.CORS_ORIGINS?.split(",") ?? ["http://localhost:3000"];

  return cors({
    origin: origins,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID", "X-BW-2FA"],
    exposeHeaders: [
      "X-Request-ID",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "Retry-After",
    ],
    maxAge: 86400,
    credentials: true,
  });
}
