/**
 * Resilient fetch helper for shaky 3G / Chrome-Android networks.
 *
 * - Hard timeout via AbortController (default 15s)
 * - Exponential-backoff retries on network errors and 5xx (default 2 retries)
 * - Honours caller's signal if provided (linked abort)
 *
 * Usage:
 *   const res = await fetchWithRetry(url, { timeoutMs: 10000, retries: 2 });
 */

export interface FetchWithRetryOptions extends RequestInit {
  /** Per-attempt timeout in ms. Default: 15000 */
  timeoutMs?: number;
  /** Number of retries after the first attempt. Default: 2 */
  retries?: number;
  /** Base backoff in ms (doubled each retry). Default: 600 */
  backoffMs?: number;
  /** Predicate to decide if a response should trigger a retry. Default: status >= 500 */
  shouldRetryResponse?: (res: Response) => boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(
  input: RequestInfo | URL,
  opts: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 15000,
    retries = 2,
    backoffMs = 600,
    shouldRetryResponse = (res) => res.status >= 500,
    signal: callerSignal,
    ...init
  } = opts;

  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Link caller's abort signal to our controller
    const onCallerAbort = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }

    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      if (!shouldRetryResponse(res) || attempt === retries) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
      // If the caller aborted (not our timeout), rethrow immediately
      if (callerSignal?.aborted) throw err;
    } finally {
      clearTimeout(timer);
      if (callerSignal) callerSignal.removeEventListener("abort", onCallerAbort);
    }

    if (attempt < retries) {
      await sleep(backoffMs * Math.pow(2, attempt));
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error("fetchWithRetry: request failed");
}

/** Convenience JSON wrapper. Throws on non-2xx. */
export async function fetchJsonWithRetry<T = unknown>(
  input: RequestInfo | URL,
  opts: FetchWithRetryOptions = {},
): Promise<T> {
  const res = await fetchWithRetry(input, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as T;
}