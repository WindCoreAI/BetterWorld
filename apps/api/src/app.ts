import { Hono } from "hono";

import { optionalAuth } from "./middleware/auth.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { loggerMiddleware } from "./middleware/logger.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { requestId } from "./middleware/request-id.js";
import { healthRoutes } from "./routes/health.routes.js";

export type AppEnv = {
  Variables: {
    requestId: string;
  };
};

export function createApp() {
  const app = new Hono<AppEnv>();

  // Global middleware (order matters)
  app.use("*", requestId());
  app.use("*", corsMiddleware());
  app.use("*", loggerMiddleware());
  app.use("*", optionalAuth());
  app.use("*", rateLimit());

  // Routes
  app.route("/", healthRoutes);

  // 404 fallback
  app.notFound((c) => {
    return c.json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Route ${c.req.method} ${c.req.path} not found`,
        },
        requestId: c.get("requestId"),
      },
      404,
    );
  });

  // Global error handler
  app.onError(errorHandler);

  return app;
}
