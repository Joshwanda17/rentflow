import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

declare const __BUILD_TIME__: number;

/**
 * iOS PWA Cache Invalidation Hook - AGGRESSIVE VERSION
 * 
 * iOS Safari in standalone (PWA) mode has extremely aggressive caching.
 * This hook implements multiple strategies to ensure fresh data:
 * 
 * 1. Forces revalidation on ANY app resume (not just long pauses)
 * 2. Uses multiple event listeners for maximum coverage
 * 3. Clears React Query cache on version mismatch
 * 4. Periodic background refresh while app is active
 * 5. Touch-based refresh detection
 */
export function useIOSCacheInvalidation() {
  const queryClient = useQueryClient();
  const lastActiveRef = useRef<number>(Date.now());
  const lastRefreshRef = useRef<number>(Date.now());
  const isIOSStandalone = useRef<boolean>(false);
  const refreshInProgressRef = useRef<boolean>(false);

  // Detect iOS standalone mode
  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = (window.navigator as any).standalone === true || 
                         window.matchMedia('(display-mode: standalone)').matches;
    
    isIOSStandalone.current = isIOS && isStandalone;
    
    if (isIOSStandalone.current) {
      console.log('[iOS Cache] Standalone PWA detected - AGGRESSIVE cache invalidation enabled');
    }
  }, []);

  // Invalidate all queries to force fresh data
  const invalidateAllData = useCallback(async (silent: boolean = false) => {
    // Prevent multiple simultaneous refreshes
    if (refreshInProgressRef.current) {
      console.log('[iOS Cache] Refresh already in progress, skipping...');
      return;
    }

    refreshInProgressRef.current = true;
    const startTime = Date.now();
    
    console.log('[iOS Cache] Invalidating all cached data...');
    
    try {
      // Clear all React Query caches completely
      queryClient.clear();
      
      // Small delay to ensure clear completes
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Force refetch all active queries
      await queryClient.refetchQueries({ type: 'active' });
      
      lastRefreshRef.current = Date.now();
      
      const duration = Date.now() - startTime;
      console.log(`[iOS Cache] Cache invalidation complete in ${duration}ms`);
      
      if (!silent && isIOSStandalone.current) {
        // Very subtle indicator that data was refreshed
        toast.success('Data refreshed', { 
          duration: 1500,
          position: 'bottom-center',
          style: { fontSize: '12px', padding: '8px 12px' }
        });
      }
    } catch (error) {
      console.error('[iOS Cache] Error during cache invalidation:', error);
    } finally {
      refreshInProgressRef.current = false;
    }
  }, [queryClient]);

  // Quick refresh - just refetch without clearing
  const quickRefresh = useCallback(async () => {
    if (refreshInProgressRef.current) return;
    
    console.log('[iOS Cache] Quick refresh triggered');
    try {
      await queryClient.refetchQueries({ type: 'active' });
      lastRefreshRef.current = Date.now();
    } catch (error) {
      console.error('[iOS Cache] Quick refresh error:', error);
    }
  }, [queryClient]);

  // Check for app version changes
  const checkVersionMismatch = useCallback(() => {
    try {
      const storedBuildTime = localStorage.getItem('ios_build_time');
      const currentBuildTime = String(__BUILD_TIME__);
      
      if (storedBuildTime && storedBuildTime !== currentBuildTime) {
        console.log('[iOS Cache] Version mismatch detected - clearing all caches');
        
        // Clear React Query cache
        queryClient.clear();
        
        // Clear iOS-specific caches
        if ('caches' in window) {
          caches.keys().then(keys => {
            keys.forEach(key => {
              if (key.includes('api') || key.includes('supabase')) {
                caches.delete(key);
              }
            });
          });
        }
        
        // Clear any stale sessionStorage data
        const keysToPreserve = ['supabase.auth.token', 'auth_session', 'user_role'];
        const allKeys = Object.keys(sessionStorage);
        allKeys.forEach(key => {
          if (!keysToPreserve.some(preserve => key.includes(preserve))) {
            sessionStorage.removeItem(key);
          }
        });
        
        localStorage.setItem('ios_build_time', currentBuildTime);
        return true;
      }
      
      localStorage.setItem('ios_build_time', currentBuildTime);
      return false;
    } catch (e) {
      console.error('[iOS Cache] Version check error:', e);
      return false;
    }
  }, [queryClient]);

  // Force service worker update check
  const checkServiceWorkerUpdate = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return;
    
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
      
      if (registration.waiting) {
        console.log('[iOS Cache] New service worker waiting - activating');
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch (error) {
      console.warn('[iOS Cache] Service worker update check failed:', error);
    }
  }, []);

  // Handle visibility changes (app resume) - AGGRESSIVE for iOS
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') {
        lastActiveRef.current = Date.now();
        return;
      }

      // For non-iOS platforms, just do a quick check
      if (!isIOSStandalone.current) {
        checkServiceWorkerUpdate();
        return;
      }

      const timeSinceActive = Date.now() - lastActiveRef.current;
      const timeSinceRefresh = Date.now() - lastRefreshRef.current;
      
      // AGGRESSIVE: Only 5 seconds threshold for iOS PWA
      const STALE_THRESHOLD = 5 * 1000; // 5 seconds
      const MIN_REFRESH_INTERVAL = 3 * 1000; // Don't refresh more than every 3 seconds

      console.log(`[iOS Cache] App resumed after ${Math.round(timeSinceActive / 1000)}s (last refresh ${Math.round(timeSinceRefresh / 1000)}s ago)`);

      // Prevent rapid-fire refreshes
      if (timeSinceRefresh < MIN_REFRESH_INTERVAL) {
        console.log('[iOS Cache] Skipping refresh - too soon since last refresh');
        return;
      }

      // Check for version changes first
      const versionChanged = checkVersionMismatch();
      
      // If app was in background for more than threshold, do full refresh
      if (timeSinceActive > STALE_THRESHOLD || versionChanged) {
        console.log('[iOS Cache] Data is stale - full refresh');
        await checkServiceWorkerUpdate();
        await invalidateAllData(true); // Silent to avoid toast spam
      } else {
        // Even for short pauses, do a quick refetch
        await quickRefresh();
      }
    };

    // Handle iOS-specific page show event (most reliable for bfcache)
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && isIOSStandalone.current) {
        console.log('[iOS Cache] Page restored from bfcache - FORCING full invalidation');
        // bfcache restoration is ALWAYS stale - force full refresh
        invalidateAllData(true);
        checkServiceWorkerUpdate();
      }
    };

    // Handle focus (when switching back to app from another app)
    const handleFocus = () => {
      if (!isIOSStandalone.current) return;
      
      const timeSinceActive = Date.now() - lastActiveRef.current;
      const timeSinceRefresh = Date.now() - lastRefreshRef.current;
      
      // Only refresh if it's been a while
      if (timeSinceActive > 10 * 1000 && timeSinceRefresh > 5 * 1000) {
        console.log('[iOS Cache] Focus regained after pause - refreshing');
        quickRefresh();
      }
    };

    // Handle online event (network restored)
    const handleOnline = () => {
      if (isIOSStandalone.current) {
        console.log('[iOS Cache] Network restored - refreshing data');
        invalidateAllData(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    // Initial version check
    checkVersionMismatch();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [queryClient, invalidateAllData, quickRefresh, checkVersionMismatch, checkServiceWorkerUpdate]);

  // Periodic background refresh for iOS PWA (every 60 seconds while active)
  useEffect(() => {
    if (!isIOSStandalone.current) return;

    const intervalId = setInterval(() => {
      // Only refresh if page is visible and it's been a while
      if (document.visibilityState === 'visible') {
        const timeSinceRefresh = Date.now() - lastRefreshRef.current;
        if (timeSinceRefresh > 45 * 1000) { // 45 seconds since last refresh
          console.log('[iOS Cache] Periodic background refresh');
          quickRefresh();
        }
      }
    }, 60 * 1000); // Check every 60 seconds

    return () => clearInterval(intervalId);
  }, [quickRefresh]);

  // Expose manual refresh function
  const forceRefresh = useCallback(async () => {
    console.log('[iOS Cache] Manual refresh triggered');
    await checkServiceWorkerUpdate();
    await invalidateAllData(false); // Show toast for manual refresh
  }, [checkServiceWorkerUpdate, invalidateAllData]);

  return { 
    forceRefresh, 
    isIOSStandalone: isIOSStandalone.current,
    lastRefreshTime: lastRefreshRef.current
  };
}

/**
 * Creates fetch options with iOS cache-busting headers
 */
export function createIOSFetchOptions(existingOptions?: RequestInit): RequestInit {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = (window.navigator as any).standalone === true || 
                       window.matchMedia('(display-mode: standalone)').matches;

  if (!isIOS || !isStandalone) {
    return existingOptions || {};
  }

  return {
    ...existingOptions,
    headers: {
      ...(existingOptions?.headers || {}),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
    cache: 'no-store' as RequestCache,
  };
}

/**
 * Add cache-busting query param for iOS
 */
export function addIOSCacheBuster(url: string): string {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = (window.navigator as any).standalone === true || 
                       window.matchMedia('(display-mode: standalone)').matches;

  if (!isIOS || !isStandalone) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_t=${Date.now()}`;
}
