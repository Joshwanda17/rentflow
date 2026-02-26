/**
 * Network-aware hook for adapting app behavior on slow connections.
 * Agents in low-network areas get reduced data fetching, smaller payloads,
 * and graceful degradation.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';

type NetworkTier = 'fast' | 'medium' | 'slow' | 'offline';

interface NetworkAwareConfig {
  /** Current network tier */
  tier: NetworkTier;
  /** Whether to skip non-essential requests (images, analytics, etc.) */
  saveData: boolean;
  /** Whether animations should be reduced */
  reduceMotion: boolean;
  /** Recommended fetch timeout in ms */
  fetchTimeout: number;
  /** Whether to prefer cached data over network */
  preferCache: boolean;
  /** Recommended staleTime for React Query */
  staleTime: number;
  /** Whether images should be lazy-loaded aggressively */
  lazyImages: boolean;
}

export function useNetworkAware(): NetworkAwareConfig {
  const [tier, setTier] = useState<NetworkTier>(() => {
    if (typeof navigator === 'undefined') return 'fast';
    if (!navigator.onLine) return 'offline';
    const conn = (navigator as any).connection;
    if (conn) {
      if (conn.saveData) return 'slow';
      if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') return 'slow';
      if (conn.effectiveType === '3g') return 'medium';
    }
    return 'fast';
  });

  const updateTier = useCallback(() => {
    if (!navigator.onLine) {
      setTier('offline');
      return;
    }
    const conn = (navigator as any).connection;
    if (conn) {
      if (conn.saveData) { setTier('slow'); return; }
      if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') { setTier('slow'); return; }
      if (conn.effectiveType === '3g') { setTier('medium'); return; }
    }
    setTier('fast');
  }, []);

  useEffect(() => {
    window.addEventListener('online', updateTier);
    window.addEventListener('offline', updateTier);
    const conn = (navigator as any).connection;
    if (conn) conn.addEventListener('change', updateTier);
    return () => {
      window.removeEventListener('online', updateTier);
      window.removeEventListener('offline', updateTier);
      if (conn) conn.removeEventListener('change', updateTier);
    };
  }, [updateTier]);

  return useMemo(() => {
    switch (tier) {
      case 'offline':
        return { tier, saveData: true, reduceMotion: true, fetchTimeout: 5000, preferCache: true, staleTime: 60 * 60 * 1000, lazyImages: true };
      case 'slow':
        return { tier, saveData: true, reduceMotion: true, fetchTimeout: 15000, preferCache: true, staleTime: 30 * 60 * 1000, lazyImages: true };
      case 'medium':
        return { tier, saveData: false, reduceMotion: false, fetchTimeout: 20000, preferCache: false, staleTime: 15 * 60 * 1000, lazyImages: true };
      case 'fast':
      default:
        return { tier, saveData: false, reduceMotion: false, fetchTimeout: 30000, preferCache: false, staleTime: 10 * 60 * 1000, lazyImages: false };
    }
  }, [tier]);
}

/**
 * Fetch wrapper with timeout — prevents hanging on slow networks.
 * Use this instead of raw fetch() for API calls.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeout?: number }
): Promise<Response> {
  const timeout = init?.timeout ?? 15000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}
