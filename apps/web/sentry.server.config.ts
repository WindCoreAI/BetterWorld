/**
 * Sentry Server Configuration (Sprint 15 — FR-024)
 *
 * Initializes Sentry on the server side (Next.js SSR/API routes).
 * Only activates when NEXT_PUBLIC_SENTRY_DSN is set.
 */
import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // PII scrubbing
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }

      if (event.exception?.values) {
        for (const exception of event.exception.values) {
          if (exception.value) {
            exception.value = exception.value.replace(
              /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
              "[EMAIL_REDACTED]",
            );
          }
        }
      }
      return event;
    },
  });
}
