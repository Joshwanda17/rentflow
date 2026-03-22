/**
 * useLocalFirstQuery — WhatsApp-style local-first data loading
 * 
 * Pattern: Read from localStorage instantly → show stale data → 
 * background-fetch from network → update state + cache silently
 * 
 * This ensures dashboards paint instantly even offline or on 2G networks.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

interface UseLocalFirstQueryOptions<T> {
  /** Unique cache key (e.g., `tenant_dashboard_${userId}`) */
  cacheKey: string;
  /** Async function that fetches fresh data from the network */
  queryFn: () => Promise<T>;
  /** Whether to skip the network fetch (e.g., when userId is undefined) */
  enabled?: boolean;
  /** Max cache age in ms before data is considered stale (default: 5 min) */
  staleTime?: number;
  /** Transform cached data on read (e.g., migration) */
  transform?: (cached: any) => T;
}

interface UseLocalFirstQueryResult<T> {
  data: T | null;
  loading: boolean;
  isOfflineData: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  lastUpdated: number | null;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Module-level in-memory cache for instant re-renders across component instances
const memoryCache = new Map<string, CacheEntry<any>>();

function readCache<T>(key: string): CacheEntry<T> | null {
  // Memory first (fastest)
  const mem = memoryCache.get(key);
  if (mem) return mem;

  // localStorage second (survives page reload)
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheEntry<T>;
      memoryCache.set(key, parsed);
      return parsed;
    }
  } catch {}
  return null;
}

function writeCache<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  memoryCache.set(key, entry);
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Storage full — clear old entries
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('lf_'));
      if (keys.length > 20) {
        keys.slice(0, 10).forEach(k => localStorage.removeItem(k));
      }
      localStorage.setItem(key, JSON.stringify(entry));
    } catch {}
  }
}

export function useLocalFirstQuery<T>({
  cacheKey,
  queryFn,
  enabled = true,
  staleTime = 5 * 60 * 1000,
  transform,
}: UseLocalFirstQueryOptions<T>): UseLocalFirstQueryResult<T> {
  const prefixedKey = `lf_${cacheKey}`;
  
  // Initialize from cache synchronously (no flash)
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    isOfflineData: boolean;
    error: Error | null;
    lastUpdated: number | null;
  }>(() => {
    const cached = readCache<T>(prefixedKey);
    if (cached) {
      const data = transform ? transform(cached.data) : cached.data;
      return { data, loading: false, isOfflineData: true, error: null, lastUpdated: cached.timestamp };
    }
    return { data: null, loading: true, isOfflineData: false, error: null, lastUpdated: null };
  });

  const fetchingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const freshData = await queryFn();
      writeCache(prefixedKey, freshData);
      setState({
        data: freshData,
        loading: false,
        isOfflineData: false,
        error: null,
        lastUpdated: Date.now(),
      });
    } catch (err) {
      // Network failed — keep showing cached data
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err : new Error('Fetch failed'),
        // If we had cached data, keep showing it
        isOfflineData: prev.data !== null,
      }));
    } finally {
      fetchingRef.current = false;
    }
  }, [enabled, queryFn, prefixedKey]);

  // Background fetch on mount: always try network, but never block UI
  useEffect(() => {
    if (!enabled) return;

    const cached = readCache<T>(prefixedKey);
    const isStale = !cached || (Date.now() - cached.timestamp > staleTime);

    if (isStale && navigator.onLine) {
      refresh();
    } else if (!cached) {
      // No cache, no network — stay in loading briefly then give up
      if (!navigator.onLine) {
        setState(prev => ({ ...prev, loading: false }));
      } else {
        refresh();
      }
    }
  }, [enabled, prefixedKey, staleTime, refresh]);

  return {
    data: state.data,
    loading: state.loading,
    isOfflineData: state.isOfflineData,
    error: state.error,
    refresh,
    lastUpdated: state.lastUpdated,
  };
}
