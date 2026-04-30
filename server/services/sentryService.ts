/**
 * Sentry Error Monitoring Service
 * Initializes and exports Sentry for error tracking
 */

import * as Sentry from "@sentry/node";

let sentryEnabled = false;

export function initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.log("ℹ️  SENTRY_DSN not configured — error monitoring disabled");
    sentryEnabled = false;
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({
        request: true,
        serverName: true,
        transaction: true,
      }),
    ],
  });

  sentryEnabled = true;
  console.log("✅ Sentry error monitoring enabled");
}

export function isSentryEnabled() {
  return sentryEnabled;
}

export function captureError(error: Error, context?: Record<string, any>) {
  if (sentryEnabled) {
    Sentry.captureException(error, {
      contexts: context ? { custom: context } : undefined,
    });
  } else {
    // Fallback to console logging if Sentry not configured
    console.error("Error captured:", error.message, context);
  }
}

export function captureMessage(message: string, level: "error" | "warning" | "info" = "info") {
  if (sentryEnabled) {
    Sentry.captureMessage(message, level);
  } else {
    console.log(`[${level.toUpperCase()}] ${message}`);
  }
}

export { Sentry };
