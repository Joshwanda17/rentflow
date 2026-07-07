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

/** True when every runtime method the app/deps rely on already exists. */
function hasAllModernFeatures(): boolean {
  try {
    return (
      typeof (String.prototype as any).replaceAll === 'function' &&
      typeof (String.prototype as any).at === 'function' &&
      typeof (Array.prototype as any).at === 'function' &&
      typeof (Array.prototype as any).flat === 'function' &&
      typeof (Array.prototype as any).flatMap === 'function' &&
      typeof (Object as any).hasOwn === 'function' &&
      typeof (Promise as any).allSettled === 'function' &&
      typeof (Promise as any).any === 'function' &&
      typeof (globalThis as any) !== 'undefined'
    );
  } catch {
    // If detection itself throws on an ancient engine, assume we need the patch.
    return false;
  }
}

let applied: Promise<void> | null = null;

/**
 * Ensure runtime polyfills are applied. Resolves immediately (no fetch) on
 * modern devices; fetches + applies the polyfill chunk only when needed.
 * Never throws — a failed polyfill fetch must not block app startup.
 */
export function ensureRuntimePolyfills(): Promise<void> {
  if (applied) return applied;
  if (hasAllModernFeatures()) {
    applied = Promise.resolve();
    return applied;
  }
  applied = import('./runtimePolyfillsImpl')
    .then(() => undefined)
    .catch((err) => {
      // Best-effort: log and continue. The out-of-date-browser banner and
      // startup crash reporter are the safety nets if the app still can't run.
      try { console.error('[runtimePolyfills] failed to load polyfill chunk', err); } catch {}
    });
  return applied;
}