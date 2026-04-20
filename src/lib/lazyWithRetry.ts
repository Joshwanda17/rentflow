import { lazy, type ComponentType } from "react";

/**
 * Wraps React.lazy with automatic retry on transient chunk-load failures.
 * Common causes: flaky networks, stale service-worker caches, post-deploy
 * asset rotation. Retries with linear backoff before giving up.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2
) {
  return lazy(async () => {
    let lastErr: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        return await factory();
      } catch (e) {
        lastErr = e;
        // Linear backoff: 400ms, 800ms
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    throw lastErr;
  });
}
