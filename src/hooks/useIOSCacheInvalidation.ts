import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

declare const __BUILD_TIME__: number;

/**
 * Mobile PWA Cache Invalidation Hook - Works on iOS AND Android
 * 
 * Both iOS and Android in standalone (PWA) mode can have caching issues.
 * iOS is more aggressive, but Android also benefits from these strategies:
 * 
 * 1. Forces revalidation on app resume
 * 2. Uses multiple event listeners for maximum coverage
 * 3. Clears React Query cache on version mismatch
 * 4. Periodic background refresh while app is active
 * 5. Network restore detection
 */

interface MobileInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  isMobilePWA: boolean;
}

function detectMobileInfo(): MobileInfo {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isAndroid = /Android/.test(ua);
  const isStandalone = (window.navigator as any).standalone === true || 
                       window.matchMedia('(display-mode: standalone)').matches;
  
  return {
    isIOS,
    isAndroid,
    isStandalone,
    isMobilePWA: (isIOS || isAndroid) && isStandalone
  };
}

export function useIOSCacheInvalidation() {
  const queryClient = useQueryClient();
  const lastActiveRef = useRef<number>(Date.now());
  const lastRefreshRef = useRef<number>(Date.now());
  const mobileInfoRef = useRef<MobileInfo>({ isIOS: false, isAndroid: false, isStandalone: false, isMobilePWA: false });
  const refreshInProgressRef = useRef<boolean>(false);

  // Detect mobile platform
  useEffect(() => {
    const info = detectMobileInfo();
    mobileInfoRef.current = info;
    
    if (info.isMobilePWA) {
      console.log(`[Mobile Cache] ${info.isIOS ? 'iOS' : 'Android'} PWA detected - cache invalidation enabled`);
    }
  }, []);

  // Invalidate all queries to force fresh data
  const invalidateAllData = useCallback(async (silent: boolean = true) => {
    // Prevent multiple simultaneous refreshes
    if (refreshInProgressRef.current) {
      console.log('[iOS Cache] Refresh already in progress, skipping...');
      return;
    }

    refreshInProgressRef.current = true;
    
    console.log('[iOS Cache] Invalidating all cached data...');
    
    try {
      // Just invalidate queries - don't clear completely to avoid blank states
      await queryClient.invalidateQueries();
      
      // Force refetch all active queries
      await queryClient.refetchQueries({ type: 'active' });
      
      lastRefreshRef.current = Date.now();
      
      console.log('[iOS Cache] Cache invalidation complete');
      
      // Only show toast for manual refresh, never for automatic
      if (!silent) {
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

  // Handle visibility changes (app resume) - works for iOS and Android
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') {
        lastActiveRef.current = Date.now();
        return;
      }

      const { isMobilePWA, isIOS } = mobileInfoRef.current;

      // For non-PWA platforms, just do a quick check
      if (!isMobilePWA) {
        checkServiceWorkerUpdate();
        return;
      }

      const timeSinceActive = Date.now() - lastActiveRef.current;
      const timeSinceRefresh = Date.now() - lastRefreshRef.current;
      
      // iOS needs more aggressive threshold (5s), Android can be slightly more relaxed (10s)
      const STALE_THRESHOLD = isIOS ? 5 * 1000 : 10 * 1000;
      const MIN_REFRESH_INTERVAL = 3 * 1000; // Don't refresh more than every 3 seconds

      console.log(`[Mobile Cache] App resumed after ${Math.round(timeSinceActive / 1000)}s`);

      // Prevent rapid-fire refreshes
      if (timeSinceRefresh < MIN_REFRESH_INTERVAL) {
        console.log('[Mobile Cache] Skipping refresh - too soon since last refresh');
        return;
      }

      // Check for version changes first
      const versionChanged = checkVersionMismatch();
      
      // If app was in background for more than threshold, do full refresh
      if (timeSinceActive > STALE_THRESHOLD || versionChanged) {
        console.log('[Mobile Cache] Data is stale - refreshing');
        await checkServiceWorkerUpdate();
        await invalidateAllData(true);
      } else {
        // Even for short pauses, do a quick refetch
        await quickRefresh();
      }
    };

    // Handle page show event (reliable for both iOS bfcache and Android)
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && mobileInfoRef.current.isMobilePWA) {
        console.log('[Mobile Cache] Page restored from cache - forcing refresh');
        invalidateAllData(true);
        checkServiceWorkerUpdate();
      }
    };

    // Handle focus (when switching back to app from another app)
    const handleFocus = () => {
      if (!mobileInfoRef.current.isMobilePWA) return;
      
      const timeSinceActive = Date.now() - lastActiveRef.current;
      const timeSinceRefresh = Date.now() - lastRefreshRef.current;
      
      // Only refresh if it's been a while
      if (timeSinceActive > 10 * 1000 && timeSinceRefresh > 5 * 1000) {
        console.log('[Mobile Cache] Focus regained - refreshing');
        quickRefresh();
      }
    };

    // Handle online event (network restored) - important for both platforms
    const handleOnline = () => {
      if (mobileInfoRef.current.isMobilePWA) {
        console.log('[Mobile Cache] Network restored - refreshing data');
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

  // Periodic background refresh for mobile PWAs (every 24 hours — cost optimized)
  useEffect(() => {
    if (!mobileInfoRef.current.isMobilePWA) return;

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        const timeSinceRefresh = Date.now() - lastRefreshRef.current;
        if (timeSinceRefresh > 23 * 60 * 60 * 1000) {
          quickRefresh();
        }
      }
    }, 24 * 60 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [quickRefresh]);

  // Expose manual refresh function
  const forceRefresh = useCallback(async () => {
    await checkServiceWorkerUpdate();
    await invalidateAllData(false);
  }, [checkServiceWorkerUpdate, invalidateAllData]);

  return { 
    forceRefresh, 
    isMobilePWA: mobileInfoRef.current.isMobilePWA,
    isIOSStandalone: mobileInfoRef.current.isIOS && mobileInfoRef.current.isStandalone,
    isAndroidPWA: mobileInfoRef.current.isAndroid && mobileInfoRef.current.isStandalone,
    lastRefreshTime: lastRefreshRef.current
  };
}

/**
 * Creates fetch options with mobile cache-busting headers
 */
export function createIOSFetchOptions(existingOptions?: RequestInit): RequestInit {
  const { isMobilePWA } = detectMobileInfo();

  if (!isMobilePWA) {
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
 * Add cache-busting query param for mobile PWAs
 */
export function addIOSCacheBuster(url: string): string {
  const { isMobilePWA } = detectMobileInfo();

  if (!isMobilePWA) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_t=${Date.now()}`;
}

// Re-export detectMobileInfo for use in other components
export { detectMobileInfo };
