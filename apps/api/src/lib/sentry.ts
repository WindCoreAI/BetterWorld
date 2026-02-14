/**
 * Sentry Error Tracking Initialization (Sprint 15 — FR-024)
 *
 * Initializes Sentry for server-side error tracking with PII scrubbing.
 * Only activates when SENTRY_DSN environment variable is set.
 */
import * as Sentry from "@sentry/node";
import pino from "pino";

const logger = pino({ name: "sentry" });

const SENTRY_DSN = process.env.SENTRY_DSN;
const ENVIRONMENT = process.env.NODE_ENV ?? "development";

let initialized = false;

/**
 * Initialize Sentry SDK with PII scrubbing and environment tags.
 */
export function initSentry(): void {
  if (initialized) return;

  if (!SENTRY_DSN) {
    logger.info("Sentry DSN not configured — error tracking disabled");
    initialized = true;
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    tracesSampleRate: ENVIRONMENT === "production" ? 0.1 : 1.0,

    // PII scrubbing: strip emails, tokens, and sensitive data from events
    beforeSend(event) {
      if (event.request?.headers) {
        // Remove authorization headers
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
        delete event.request.headers["x-api-key"];
      }

      // Scrub email-like strings from breadcrumbs
      if (event.breadcrumbs) {
        for (const breadcrumb of event.breadcrumbs) {
          if (breadcrumb.message) {
            breadcrumb.message = breadcrumb.message.replace(
              /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
              "[EMAIL_REDACTED]",
            );
          }
        }
      }

      // Scrub email-like strings from exception values
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

  initialized = true;
  logger.info({ environment: ENVIRONMENT }, "Sentry initialized");
}

/**
 * Capture an exception with optional context.
 */
export function captureException(
  error: Error,
  context?: Record<string, unknown>,
): void {
  if (!SENTRY_DSN) return;

  if (context) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

export { Sentry };
