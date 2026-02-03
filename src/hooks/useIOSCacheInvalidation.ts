import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

declare const __BUILD_TIME__: number;

/**
 * iOS PWA Cache Invalidation Hook
 * 
 * iOS Safari in standalone (PWA) mode has aggressive caching that can cause
 * stale data. This hook implements multiple strategies to ensure fresh data:
 * 
 * 1. Forces revalidation on app resume (visibility change)
 * 2. Clears React Query cache on version mismatch
 * 3. Adds cache-busting headers for fetch requests
 * 4. Forces service worker update checks on iOS
 */
export function useIOSCacheInvalidation() {
  const queryClient = useQueryClient();
  const lastActiveRef = useRef<number>(Date.now());
  const isIOSStandalone = useRef<boolean>(false);

  // Detect iOS standalone mode
  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = (window.navigator as any).standalone === true || 
                         window.matchMedia('(display-mode: standalone)').matches;
    
    isIOSStandalone.current = isIOS && isStandalone;
    
    if (isIOSStandalone.current) {
      console.log('[iOS Cache] Standalone PWA detected - enabling aggressive cache invalidation');
    }
  }, []);

  // Invalidate all queries to force fresh data
  const invalidateAllData = useCallback(async () => {
    console.log('[iOS Cache] Invalidating all cached data...');
    
    // Invalidate all React Query caches
    await queryClient.invalidateQueries();
    
    // Clear any stale entries
    queryClient.clear();
    
    // Force refetch all active queries
    await queryClient.refetchQueries({ type: 'active' });
    
    console.log('[iOS Cache] Cache invalidation complete');
  }, [queryClient]);

  // Check for app version changes
  const checkVersionMismatch = useCallback(() => {
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
      const keysToPreserve = ['supabase.auth.token', 'auth_session'];
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

  // Handle visibility changes (app resume)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') {
        lastActiveRef.current = Date.now();
        return;
      }

      // Only apply aggressive invalidation on iOS standalone mode
      if (!isIOSStandalone.current) {
        // For other platforms, just check for SW updates
        checkServiceWorkerUpdate();
        return;
      }

      const timeSinceActive = Date.now() - lastActiveRef.current;
      const STALE_THRESHOLD = 30 * 1000; // 30 seconds

      console.log(`[iOS Cache] App resumed after ${Math.round(timeSinceActive / 1000)}s`);

      // Check for version changes first
      const versionChanged = checkVersionMismatch();
      
      // If app was in background for more than threshold, refresh data
      if (timeSinceActive > STALE_THRESHOLD || versionChanged) {
        console.log('[iOS Cache] Data may be stale - refreshing...');
        
        // Force service worker update check
        await checkServiceWorkerUpdate();
        
        // Invalidate all cached queries
        await invalidateAllData();
      } else {
        // Just refetch active queries without clearing cache
        queryClient.refetchQueries({ type: 'active' });
      }
    };

    // Handle iOS-specific page show event (more reliable than visibility change)
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && isIOSStandalone.current) {
        console.log('[iOS Cache] Page restored from bfcache - invalidating data');
        invalidateAllData();
        checkServiceWorkerUpdate();
      }
    };

    // Handle focus (when switching back to app)
    const handleFocus = () => {
      if (isIOSStandalone.current) {
        const timeSinceActive = Date.now() - lastActiveRef.current;
        if (timeSinceActive > 60 * 1000) { // 1 minute
          console.log('[iOS Cache] Focus regained after long pause - refreshing');
          queryClient.refetchQueries({ type: 'active' });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);

    // Initial version check
    checkVersionMismatch();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
    };
  }, [queryClient, invalidateAllData, checkVersionMismatch, checkServiceWorkerUpdate]);

  // Expose manual refresh function
  const forceRefresh = useCallback(async () => {
    console.log('[iOS Cache] Manual refresh triggered');
    await checkServiceWorkerUpdate();
    await invalidateAllData();
  }, [checkServiceWorkerUpdate, invalidateAllData]);

  return { forceRefresh, isIOSStandalone: isIOSStandalone.current };
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
