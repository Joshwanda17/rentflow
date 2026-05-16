/**
 * Tiny structured client-side logger.
 *
 * - Emits a single console line per event using `console.error` /
 *   `console.warn` / `console.info` with a stable `[evt]` prefix so log
 *   pipelines (Sentry breadcrumbs, browser DevTools, Lovable session replay)
 *   can grep for it.
 * - Always JSON-serialises the payload so structured fields (partner_id,
 *   error_code, request_id, ...) survive copy-paste from a bug report.
 * - Keeps an in-memory ring buffer (last 100 events) on
 *   `window.__welile_logs` for ad-hoc debugging from the console.
 */
type Level = 'info' | 'warn' | 'error';

export interface LogEvent {
  ts: string;          // ISO timestamp
  level: Level;
  event: string;       // dot.separated event name
  [key: string]: unknown;
}

const RING_LIMIT = 100;

function pushRing(entry: LogEvent) {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __welile_logs?: LogEvent[] };
  if (!Array.isArray(w.__welile_logs)) w.__welile_logs = [];
  w.__welile_logs.push(entry);
  if (w.__welile_logs.length > RING_LIMIT) {
    w.__welile_logs.splice(0, w.__welile_logs.length - RING_LIMIT);
  }
}

function emit(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const entry: LogEvent = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  pushRing(entry);
  const sink =
    level === 'error' ? console.error
    : level === 'warn' ? console.warn
    : console.info;
  // Keep the message short + structured JSON for grep-ability.
  sink(`[evt] ${event}`, entry);
}

export const clientLog = {
  info:  (event: string, fields?: Record<string, unknown>) => emit('info',  event, fields),
  warn:  (event: string, fields?: Record<string, unknown>) => emit('warn',  event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit('error', event, fields),
};
