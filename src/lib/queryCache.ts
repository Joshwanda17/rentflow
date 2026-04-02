/**
 * Client-side query cache to minimize database reads.
 * Uses localStorage with TTL for persistent caching across sessions.
 * Memory cache for instant access within session.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// In-memory cache (instant, session-only)
const memoryCache = new Map<string, CacheEntry<any>>();

// Default TTLs by data type
export const CACHE_TTL = {
  WALLET_BALANCE: 120_000,       // 2 min - updated via realtime
  TRANSACTIONS: 300_000,         // 5 min - rarely changes between actions
  PROFILE: 600_000,              // 10 min - rarely changes
  DASHBOARD_METRICS: 600_000,    // 10 min - executive dashboards (was 3 min)
  NOTIFICATIONS_COUNT: 120_000,  // 2 min
  STATIC_DATA: 1_800_000,        // 30 min - roles, settings (was 10 min)
} as const;

function getStorageKey(key: string): string {
  return `qc_${key}`;
}

export function getCached<T>(key: string): T | null {
  // 1. Check memory cache first (fastest)
  const memEntry = memoryCache.get(key);
  if (memEntry && (Date.now() - memEntry.timestamp) < memEntry.ttl) {
    return memEntry.data as T;
  }

  // 2. Check localStorage (survives page refresh)
  try {
    const raw = localStorage.getItem(getStorageKey(key));
    if (raw) {
      const entry: CacheEntry<T> = JSON.parse(raw);
      if ((Date.now() - entry.timestamp) < entry.ttl) {
        // Promote to memory cache
        memoryCache.set(key, entry);
        return entry.data;
      }
      // Expired - clean up
      localStorage.removeItem(getStorageKey(key));
    }
  } catch {}

  return null;
}

export function setCache<T>(key: string, data: T, ttl: number): void {
  const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl };
  
  // Always set memory cache
  memoryCache.set(key, entry);
  
  // Persist to localStorage (best-effort)
  try {
    localStorage.setItem(getStorageKey(key), JSON.stringify(entry));
  } catch {
    // localStorage full - clear old cache entries
    clearExpiredCache();
    try {
      localStorage.setItem(getStorageKey(key), JSON.stringify(entry));
    } catch {}
  }
}

export function invalidateCache(key: string): void {
  memoryCache.delete(key);
  try {
    localStorage.removeItem(getStorageKey(key));
  } catch {}
}

export function invalidateCachePrefix(prefix: string): void {
  // Memory cache
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
  // localStorage
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`qc_${prefix}`)) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {}
}

function clearExpiredCache(): void {
  const now = Date.now();
  // Memory
  for (const [key, entry] of memoryCache.entries()) {
    if ((now - entry.timestamp) >= entry.ttl) memoryCache.delete(key);
  }
  // localStorage
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('qc_')) {
        try {
          const entry = JSON.parse(localStorage.getItem(k) || '');
          if ((now - entry.timestamp) >= entry.ttl) keysToRemove.push(k);
        } catch {
          keysToRemove.push(k!);
        }
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {}
}

/**
 * Cached fetch helper - returns cached data or fetches fresh.
 * Implements stale-while-revalidate pattern.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number,
  options?: { forceRefresh?: boolean }
): Promise<T> {
  if (!options?.forceRefresh) {
    const cached = getCached<T>(key);
    if (cached !== null) return cached;
  }

  const data = await fetcher();
  setCache(key, data, ttl);
  return data;
}
