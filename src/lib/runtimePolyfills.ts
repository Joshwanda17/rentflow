/**
 * Runtime polyfill GATE — conditional loader.
 *
 * The actual polyfill patches live in `./runtimePolyfillsImpl`, which Vite emits
 * as its own async chunk. This gate runs a tiny, synchronous feature-detection
 * pass on the current device and ONLY dynamically imports (network fetch +
 * apply) the implementation chunk when at least one required method is missing.
 *
 * Result:
 *   - Modern phones: detection passes, nothing is fetched, zero runtime cost.
 *   - Old phones:    the polyfill chunk is fetched once and applied before the
 *                    app loads, preventing blank-screen crashes.
 *
 * Callers MUST await `ensureRuntimePolyfills()` before loading any app code so
 * the patches are in place first.
 */
import { clientLog } from './clientLogger';

/** Individual feature probes — each returns true when the feature is present. */
function detectMissingFeatures(): string[] {
  const probes: Record<string, () => boolean> = {
    'String.prototype.replaceAll': () => typeof (String.prototype as any).replaceAll === 'function',
    'String.prototype.at': () => typeof (String.prototype as any).at === 'function',
    'Array.prototype.at': () => typeof (Array.prototype as any).at === 'function',
    'Array.prototype.flat': () => typeof (Array.prototype as any).flat === 'function',
    'Array.prototype.flatMap': () => typeof (Array.prototype as any).flatMap === 'function',
    'Object.hasOwn': () => typeof (Object as any).hasOwn === 'function',
    'Promise.allSettled': () => typeof (Promise as any).allSettled === 'function',
    'Promise.any': () => typeof (Promise as any).any === 'function',
    globalThis: () => typeof (globalThis as any) !== 'undefined',
  };
  const missing: string[] = [];
  for (const [name, probe] of Object.entries(probes)) {
    let ok = false;
    try { ok = probe() === true; } catch { ok = false; }
    if (!ok) missing.push(name);
  }
  return missing;
}

let applied: Promise<void> | null = null;

/**
 * Ensure runtime polyfills are applied. Resolves immediately (no fetch) on
 * modern devices; fetches + applies the polyfill chunk only when needed.
 * Never throws — a failed polyfill fetch must not block app startup.
 */
export function ensureRuntimePolyfills(): Promise<void> {
  if (applied) return applied;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null;
  let missing: string[];
  try {
    missing = detectMissingFeatures();
  } catch {
    // Detection itself threw on an ancient engine — assume everything is missing.
    missing = ['detection-threw'];
  }

  if (missing.length === 0) {
    applied = Promise.resolve();
    return applied;
  }

  // Missing features detected — record exactly which ones + the device before
  // attempting to fetch the polyfill chunk.
  clientLog.warn('polyfill.gate.missing_features', {
    missing_features: missing,
    missing_count: missing.length,
    user_agent: ua,
  });

  // Persist to the compat telemetry table (fire-and-forget) so the CTO
  // "Browser Compatibility" dashboard can aggregate missing features by device.
  void import('./compatTelemetry')
    .then(({ reportCompatEvent }) =>
      reportCompatEvent({ event_type: 'gate_missing', missing_features: missing }),
    )
    .catch(() => {});

  const startedAt = Date.now();
  applied = import('./runtimePolyfillsImpl')
    .then(() => {
      clientLog.info('polyfill.impl.loaded', {
        missing_features: missing,
        load_ms: Date.now() - startedAt,
      });
      void import('./compatTelemetry')
        .then(({ reportCompatEvent }) =>
          reportCompatEvent({
            event_type: 'impl_loaded',
            missing_features: missing,
            load_ms: Date.now() - startedAt,
          }),
        )
        .catch(() => {});
    })
    .catch((err) => {
      // Polyfill chunk failed to load — the app will likely crash on old
      // engines. Log verbosely (console + Sentry via clientLog) so we can see
      // WHICH features were missing and WHY the fetch failed. The
      // out-of-date-browser banner + startup crash reporter are the safety nets.
      clientLog.error('polyfill.impl.load_failed', {
        missing_features: missing,
        missing_count: missing.length,
        user_agent: ua,
        load_ms: Date.now() - startedAt,
        online: typeof navigator !== 'undefined' ? navigator.onLine : null,
        error_message: err instanceof Error ? err.message : String(err),
        error_stack: err instanceof Error ? err.stack ?? null : null,
        // Raw Error so clientLog forwards it to Sentry.captureException.
        error: err,
      });

      // Persist the gate-path failure for the compatibility dashboard.
      void import('./compatTelemetry')
        .then(({ reportCompatEvent }) =>
          reportCompatEvent({
            event_type: 'impl_load_failed',
            missing_features: missing,
            load_ms: Date.now() - startedAt,
            error_message: err instanceof Error ? err.message : String(err),
          }),
        )
        .catch(() => {});
    });
  return applied;
}