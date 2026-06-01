import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * Legacy compatibility hook.
 *
 * The old implementation used device-specific resume listeners and mobile-only
 * cache rules. That path is intentionally retired: app freshness is now handled
 * universally by `/version.json` checks and asset fingerprinting, not by OS.
 * This hook remains only so older imports keep working and exposes a manual
 * data refresh that never touches service workers, Cache Storage, or URLs.
 */

interface MobileInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  isMobilePWA: boolean;
}

function detectMobileInfo(): MobileInfo {
  return {
    isIOS: false,
    isAndroid: false,
    isStandalone: false,
    isMobilePWA: false,
  };
}

export function useIOSCacheInvalidation() {
  const queryClient = useQueryClient();
  const lastRefreshRef = useRef<number>(Date.now());
  const refreshInProgressRef = useRef<boolean>(false);

  // Invalidate all queries to force fresh data
  const invalidateAllData = useCallback(async (silent: boolean = true) => {
    // Prevent multiple simultaneous refreshes
    if (refreshInProgressRef.current) {
      console.log('[App Refresh] Refresh already in progress, skipping...');
      return;
    }

    refreshInProgressRef.current = true;
    
    console.log('[App Refresh] Invalidating cached query data...');
    
    try {
      // Just invalidate queries - don't clear completely to avoid blank states
      await queryClient.invalidateQueries();
      
      // Force refetch all active queries
      await queryClient.refetchQueries({ type: 'active' });
      
      lastRefreshRef.current = Date.now();
      
      console.log('[App Refresh] Query refresh complete');
      
      // Only show toast for manual refresh, never for automatic
      if (!silent) {
        toast.success('Data refreshed', { 
          duration: 1500,
          position: 'bottom-center',
          style: { fontSize: '12px', padding: '8px 12px' }
        });
      }
    } catch (error) {
      console.error('[App Refresh] Error during data refresh:', error);
    } finally {
      refreshInProgressRef.current = false;
    }
  }, [queryClient]);

  // Quick refresh - just refetch without clearing
  const quickRefresh = useCallback(async () => {
    if (refreshInProgressRef.current) return;
    
    console.log('[App Refresh] Quick refresh triggered');
    try {
      await queryClient.refetchQueries({ type: 'active' });
      lastRefreshRef.current = Date.now();
    } catch (error) {
      console.error('[App Refresh] Quick refresh error:', error);
    }
  }, [queryClient]);

  // Expose manual refresh function
  const forceRefresh = useCallback(async () => {
    await invalidateAllData(false);
  }, [invalidateAllData]);

  return { 
    forceRefresh, 
    quickRefresh,
    isMobilePWA: false,
    isIOSStandalone: false,
    isAndroidPWA: false,
    lastRefreshTime: lastRefreshRef.current
  };
}

/**
 * Creates fetch options with mobile cache-busting headers
 */
export function createIOSFetchOptions(existingOptions?: RequestInit): RequestInit {
  return existingOptions || {};
}

/**
 * Add cache-busting query param for mobile PWAs
 */
export function addIOSCacheBuster(url: string): string {
  return url;
}

// Re-export detectMobileInfo for use in other components
export { detectMobileInfo };
