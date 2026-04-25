/**
 * safeStorage — drop-in localStorage replacement with graceful fallback.
 *
 * Why this exists:
 *   `window.localStorage` throws (or is undefined) in several real-world
 *   scenarios our agents hit on cheap field devices:
 *     - Safari/iOS Private Browsing (older versions throw on writes)
 *     - Storage permission denied / 3rd-party storage blocked in webviews
 *     - Quota exceeded (rare but possible after long offline sessions)
 *     - SSR / non-browser environments
 *
 *   Wrapping every call site in try/catch is repetitive and easy to
 *   forget on the next persisted preference. This module centralizes
 *   that logic AND adds a session-scoped in-memory fallback so a
 *   preference still "remembers" within the current tab even when the
 *   underlying storage is blocked.
 *
 * Behavior:
 *   - Reads/writes go through `window.localStorage` when available.
 *   - On any thrown error (or when `window` is undefined), operations
 *     transparently swap to an in-memory `Map` for the rest of the
 *     session. The Map is process-lifetime only — perfect for "the
 *     filter still works during this visit even if it can't persist
 *     across reloads".
 *   - Writes never throw. Callers don't need to wrap calls.
 *   - `isPersistent()` lets callers tell the user (or telemetry) when
 *     persistence has degraded to memory-only, but it's optional.
 */

const memory = new Map<string, string>();
let persistentChecked = false;
let persistent = false;

/** True when localStorage is usable; false when we've fallen back to memory. */
function probe(): boolean {
  if (persistentChecked) return persistent;
  persistentChecked = true;
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      persistent = false;
      return false;
    }
    // Round-trip a tiny key to confirm both reads and writes work.
    const probeKey = '__welile_safeStorage_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    persistent = true;
  } catch {
    persistent = false;
  }
  return persistent;
}

export const safeStorage = {
  /**
   * Returns the stored string, or null if the key isn't set OR storage
   * is unreadable. Mirrors the native localStorage API.
   */
  getItem(key: string): string | null {
    if (probe()) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        // Storage was usable at probe time but failed now (rare — e.g.
        // mid-session permission revocation). Fall through to memory.
      }
    }
    return memory.has(key) ? memory.get(key)! : null;
  },

  /**
   * Writes the value. Never throws. If localStorage is blocked the
   * value is held in the in-memory map so reads in the same session
   * still return it.
   */
  setItem(key: string, value: string): void {
    if (probe()) {
      try {
        window.localStorage.setItem(key, value);
        // Mirror to memory too so a later read after mid-session
        // failure still returns the most recent value.
        memory.set(key, value);
        return;
      } catch {
        /* fall through to memory-only write */
      }
    }
    memory.set(key, value);
  },

  /**
   * Removes the key from both backing stores. Never throws.
   */
  removeItem(key: string): void {
    if (probe()) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* swallow */
      }
    }
    memory.delete(key);
  },

  /**
   * True when the underlying localStorage is functional. Lets UI code
   * surface a one-time "preferences won't persist on this device"
   * notice if it cares — most callers can ignore this.
   */
  isPersistent(): boolean {
    return probe();
  },
};

export default safeStorage;