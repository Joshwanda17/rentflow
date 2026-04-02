/**
 * Event Storm Guard — prevents runaway event loops and request deduplication.
 * Tracks event frequency and pauses if the same event fires >3 times in 60s.
 */

interface EventRecord {
  timestamps: number[];
  paused: boolean;
  pausedAt?: number;
}

const events = new Map<string, EventRecord>();
const WINDOW_MS = 60_000;       // 1-minute window
const MAX_FIRES = 3;            // max fires per window
const PAUSE_DURATION = 300_000; // 5-min pause on storm detection

/**
 * Check if an event should be allowed to fire.
 * Returns false if the event is storm-paused.
 */
export function guardEvent(eventKey: string): boolean {
  const now = Date.now();
  let record = events.get(eventKey);

  if (!record) {
    record = { timestamps: [now], paused: false };
    events.set(eventKey, record);
    return true;
  }

  // If paused, check if pause has expired
  if (record.paused) {
    if (record.pausedAt && now - record.pausedAt > PAUSE_DURATION) {
      record.paused = false;
      record.timestamps = [now];
      return true;
    }
    console.warn(`[EventStorm] Blocked: "${eventKey}" is paused due to storm detection`);
    return false;
  }

  // Prune old timestamps
  record.timestamps = record.timestamps.filter(t => now - t < WINDOW_MS);
  record.timestamps.push(now);

  if (record.timestamps.length > MAX_FIRES) {
    record.paused = true;
    record.pausedAt = now;
    console.error(`[EventStorm] 🚨 Storm detected: "${eventKey}" fired ${record.timestamps.length} times in 1 min — PAUSED for 5 min`);
    return false;
  }

  return true;
}

/**
 * Request deduplication — prevents the same API call from firing multiple times.
 * Returns a dedup key; call `releaseDedup` when the request completes.
 */
const inflightRequests = new Map<string, number>();
const DEDUP_TTL = 5_000; // 5s dedup window

export function isDuplicate(requestKey: string): boolean {
  const existing = inflightRequests.get(requestKey);
  if (existing && Date.now() - existing < DEDUP_TTL) {
    return true;
  }
  inflightRequests.set(requestKey, Date.now());
  return false;
}

export function releaseDedup(requestKey: string): void {
  inflightRequests.delete(requestKey);
}

/**
 * Get storm guard stats for monitoring
 */
export function getStormStats(): { total: number; paused: string[] } {
  const paused: string[] = [];
  for (const [key, record] of events) {
    if (record.paused) paused.push(key);
  }
  return { total: events.size, paused };
}
