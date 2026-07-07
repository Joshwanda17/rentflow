/**
 * Browser-compatibility telemetry.
 *
 * Persists a small, anonymous record whenever the runtime-polyfill gate detects
 * missing features, when the polyfill implementation chunk loads, and when it
 * fails to load. This is the DATA SOURCE behind the CTO "Browser Compatibility"
 * dashboard — the console/Sentry logs in `clientLogger` are ephemeral and can't
 * be aggregated, so we mirror the important events into `browser_compat_events`
 * (anon-insertable, manager-readable).
 *
 * Like the startup-crash reporter, this module is dependency-free at import time
 * and only dynamically imports the Supabase client when it actually has
 * something to write, so it never weighs down the critical startup path. It
 * never throws — telemetry must never break the app.
 */

export type CompatEventType =
  | 'gate_missing'
  | 'impl_loaded'
  | 'impl_load_failed';

interface CompatEventInput {
  event_type: CompatEventType;
  missing_features?: string[];
  error_message?: string | null;
  load_ms?: number | null;
}

/** Best-effort device summary — no library, safe on ancient engines. */
function summarizeDevice(): Record<string, unknown> {
  try {
    const ua = navigator.userAgent || '';
    const nav = navigator as any;
    const chromeMatch = ua.match(/Chrome\/(\d+)/);
    return {
      os: /Android/i.test(ua)
        ? 'Android'
        : /iPhone|iPad|iPod/i.test(ua)
          ? 'iOS'
          : /Windows/i.test(ua)
            ? 'Windows'
            : /Mac OS X/i.test(ua)
              ? 'macOS'
              : /Linux/i.test(ua)
                ? 'Linux'
                : 'unknown',
      chromium_version: chromeMatch ? parseInt(chromeMatch[1], 10) : null,
      is_webview: /; wv\)/.test(ua) || /\bFB_IAB\b|FBAN|FBAV|Instagram/.test(ua),
      language: navigator.language ?? null,
      online: typeof navigator.onLine === 'boolean' ? navigator.onLine : null,
      device_memory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
      hardware_concurrency:
        typeof navigator.hardwareConcurrency === 'number'
          ? navigator.hardwareConcurrency
          : null,
      effective_type: nav.connection?.effectiveType ?? null,
      save_data: nav.connection?.saveData ?? null,
    };
  } catch {
    return {};
  }
}

/**
 * Record a compatibility event. Always resolves — never throws.
 * Fire-and-forget: callers don't await it so it never blocks startup.
 */
export async function reportCompatEvent(input: CompatEventInput): Promise<void> {
  try {
    const payload = {
      event_type: input.event_type,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      missing_features: input.missing_features ?? [],
      device: summarizeDevice(),
      error_message: input.error_message ?? null,
      load_ms:
        typeof input.load_ms === 'number' ? Math.round(input.load_ms) : null,
    };
    const { supabase } = await import('@/integrations/supabase/client');
    await supabase.from('browser_compat_events').insert(payload as any);
  } catch {
    // Telemetry must never throw — swallow everything.
  }
}
