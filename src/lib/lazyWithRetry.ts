import { lazy, type ComponentType } from "react";

/**
 * Concurrency-limited dynamic import queue.
 *
 * On slow networks (2G/3G in the field), Vite/React can fan out dozens of
 * lazy chunk requests in parallel when a route mounts (providers + page +
 * deferred extras + preloads). The browser's 6-connection-per-host limit
 * then makes every request slower, increases the chance any one of them
 * times out, and trips the "Connection Error" fallback.
 *
 * We funnel all dynamic imports through a tiny FIFO queue so the network
 * stays healthy. The limit is tuned to the user's effective connection.
 */

function getImportConcurrency(): number {
  if (typeof navigator === "undefined") return 4;
  const conn = (navigator as any).connection;
  if (!conn) return 4;
  if (conn.saveData) return 1;
  switch (conn.effectiveType) {
    case "slow-2g":
    case "2g":
      return 1;
    case "3g":
      return 2;
    case "4g":
    default:
      return 4;
  }
}

let active = 0;
const queue: Array<() => void> = [];

function next() {
  if (active >= getImportConcurrency()) return;
  const job = queue.shift();
  if (!job) return;
  active++;
  job();
}

/**
 * Wrap any dynamic import so it waits its turn in the global import queue.
 * Resolves/rejects with the same value as the underlying factory.
 */
export function queuedImport<T>(factory: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      factory()
        .then(resolve, reject)
        .finally(() => {
          active = Math.max(0, active - 1);
          // Drain on next tick to avoid deep sync chains
          setTimeout(next, 0);
        });
    };
    queue.push(run);
    next();
  });
}

/**
 * Wraps React.lazy with:
 *  1. A concurrency-limited import queue (prevents slow-network overload).
 *  2. Automatic retry on transient chunk-load failures (flaky networks,
 *     stale service-worker caches, post-deploy asset rotation).
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2
) {
  return lazy(async () => {
    let lastErr: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        return await queuedImport(factory);
      } catch (e) {
        lastErr = e;
        // Linear backoff: 400ms, 800ms
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    throw lastErr;
  });
}
