// ============================================================================
// Update-flow debug log.
//
// A tiny, self-contained ring buffer that records every meaningful step of the
// forced-update / recovery flow (forced flag + versions, purge attempts, reload
// count, errors). It is persisted to sessionStorage so the trail SURVIVES the
// cache-busted reload — critical for troubleshooting iPhones that cycle through
// the update flow, where we otherwise lose the history on every reload.
//
// This is intentionally dependency-free and never throws so it can run from the
// earliest startup path and from inside the blocking overlay.
// ============================================================================

const LOG_KEY = "welile_update_debug_log";
const MAX_ENTRIES = 60;

export interface UpdateDebugEntry {
  /** epoch ms */
  t: number;
  msg: string;
  data?: Record<string, unknown>;
}

function read(): UpdateDebugEntry[] {
  try {
    const raw = sessionStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UpdateDebugEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: UpdateDebugEntry[]): void {
  try {
    sessionStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* ignore */
  }
}

/** Append a timestamped debug entry. Never throws. */
export function pushUpdateDebug(msg: string, data?: Record<string, unknown>): void {
  try {
    const entries = read();
    entries.push({ t: Date.now(), msg, ...(data ? { data } : {}) });
    write(entries);
    // Mirror to the console for live (cable-attached) iPhone inspection.
    // eslint-disable-next-line no-console
    console.info(`[update-flow] ${msg}`, data ?? "");
  } catch {
    /* debug log must never break the app */
  }
}

/** The full debug trail (oldest → newest). */
export function getUpdateDebugLog(): UpdateDebugEntry[] {
  return read();
}

/** Wipe the trail. Call once the app has confirmably recovered. */
export function clearUpdateDebugLog(): void {
  try {
    sessionStorage.removeItem(LOG_KEY);
  } catch {
    /* ignore */
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Render a single entry as `HH:MM:SS  message  {json}`. */
export function formatUpdateDebugEntry(e: UpdateDebugEntry): string {
  const d = new Date(e.t);
  const ts = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  let suffix = "";
  if (e.data && Object.keys(e.data).length) {
    try {
      suffix = ` ${JSON.stringify(e.data)}`;
    } catch {
      suffix = "";
    }
  }
  return `${ts}  ${e.msg}${suffix}`;
}

/** Render the whole trail as a single plain-text block (for copy/paste). */
export function formatUpdateDebugLog(): string {
  const entries = read();
  if (!entries.length) return "No update-flow events recorded yet.";
  return entries.map(formatUpdateDebugEntry).join("\n");
}