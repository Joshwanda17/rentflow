import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

declare const __BUILD_TIME__: number;

interface IOSInfo {
  isIOS: boolean;
  isIPad: boolean;
  isIPhone: boolean;
  isSafari: boolean;
  isStandalone: boolean;
  iosVersion: number | null;
  supportsHaptics: boolean;
  supportsPushNotifications: boolean;
  hasNotch: boolean;
}

export function useIOSCompatibility() {
  const queryClient = useQueryClient();
  const lastActiveRef = useRef<number>(Date.now());
  
  const [iosInfo, setIosInfo] = useState<IOSInfo>({
    isIOS: false,
    isIPad: false,
    isIPhone: false,
    isSafari: false,
    isStandalone: false,
    iosVersion: null,
    supportsHaptics: false,
    supportsPushNotifications: false,
    hasNotch: false,
  });

  useEffect(() => {
    const ua = navigator.userAgent;
    
    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isIPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isIPhone = /iPhone/.test(ua);
    
    // Detect Safari
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    
    // Detect standalone mode (PWA)
    const isStandalone = (window.navigator as any).standalone === true || 
                         window.matchMedia('(display-mode: standalone)').matches;
    
    // Extract iOS version
    let iosVersion: number | null = null;
    const match = ua.match(/OS (\d+)_/);
    if (match) {
      iosVersion = parseInt(match[1], 10);
    }
    
    // Check for haptics support (Taptic Engine)
    const supportsHaptics = 'vibrate' in navigator || (isIOS && iosVersion !== null && iosVersion >= 10);
    
    // Check for push notification support
    const supportsPushNotifications = 'PushManager' in window && 'serviceWorker' in navigator;
    
    // Detect notched devices (iPhone X+)
    const hasNotch = isIPhone && (
      window.screen.height >= 812 || 
      getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top') !== ''
    );

    setIosInfo({
      isIOS,
      isIPad,
      isIPhone,
      isSafari,
      isStandalone,
      iosVersion,
      supportsHaptics,
      supportsPushNotifications,
      hasNotch,
    });

    // Apply iOS-specific classes to html element
    if (isIOS) {
      document.documentElement.classList.add('ios');
      if (isStandalone) {
        document.documentElement.classList.add('ios-standalone');
      }
      if (hasNotch) {
        document.documentElement.classList.add('ios-notch');
      }
    }

    // Fix iOS viewport height issue (100vh problem)
    const setViewportHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    setViewportHeight();
    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', setViewportHeight);

    // Prevent iOS overscroll/bounce in standalone mode
    if (isStandalone && isIOS) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
    }

    // iOS PWA Cache Invalidation - handle visibility changes for data freshness
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') {
        lastActiveRef.current = Date.now();
        return;
      }

      if (!isStandalone || !isIOS) return;

      const timeSinceActive = Date.now() - lastActiveRef.current;
      const STALE_THRESHOLD = 30 * 1000; // 30 seconds

      console.log(`[iOS] App resumed after ${Math.round(timeSinceActive / 1000)}s`);

      // Check for version changes
      const storedBuildTime = localStorage.getItem('ios_pwa_build_time');
      const currentBuildTime = String(__BUILD_TIME__);
      const versionChanged = storedBuildTime && storedBuildTime !== currentBuildTime;
      
      if (versionChanged) {
        console.log('[iOS] Version mismatch - clearing caches');
        localStorage.setItem('ios_pwa_build_time', currentBuildTime);
      } else {
        localStorage.setItem('ios_pwa_build_time', currentBuildTime);
      }

      // If app was backgrounded for more than threshold, force refresh data
      if (timeSinceActive > STALE_THRESHOLD || versionChanged) {
        console.log('[iOS] Data may be stale - refreshing queries...');
        
        // Force service worker update check
        if ('serviceWorker' in navigator) {
          try {
            const registration = await navigator.serviceWorker.ready;
            await registration.update();
            if (registration.waiting) {
              registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          } catch (e) {
            console.warn('[iOS] SW update check failed:', e);
          }
        }

        // Invalidate all React Query caches to force fresh data
        queryClient.invalidateQueries();
        queryClient.refetchQueries({ type: 'active' });
      }
    };

    // Handle iOS page restoration from bfcache
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && isStandalone && isIOS) {
        console.log('[iOS] Page restored from bfcache - invalidating data');
        queryClient.invalidateQueries();
        queryClient.refetchQueries({ type: 'active' });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('resize', setViewportHeight);
      window.removeEventListener('orientationchange', setViewportHeight);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [queryClient]);

  // iOS-specific haptic feedback
  const iosHaptic = useCallback((style: 'light' | 'medium' | 'heavy' | 'selection' = 'light') => {
    if (!iosInfo.supportsHaptics) return;
    
    // Use vibration API as fallback
    if ('vibrate' in navigator) {
      const patterns = {
        light: 10,
        medium: 20,
        heavy: 30,
        selection: 5,
      };
      navigator.vibrate(patterns[style]);
    }
  }, [iosInfo.supportsHaptics]);

  // Prevent iOS text zoom
  const preventTextZoom = useCallback(() => {
    const style = document.createElement('style');
    style.textContent = `
      input, textarea, select {
        font-size: 16px !important;
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Handle iOS keyboard avoiding
  const handleKeyboardAvoid = useCallback((element: HTMLElement | null) => {
    if (!iosInfo.isIOS || !element) return;

    const handleFocus = () => {
      setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    };

    element.addEventListener('focus', handleFocus);
    return () => element.removeEventListener('focus', handleFocus);
  }, [iosInfo.isIOS]);

  return {
    ...iosInfo,
    iosHaptic,
    preventTextZoom,
    handleKeyboardAvoid,
  };
}

// iOS-specific utility functions
export function getIOSSafeAreaInsets() {
  const computedStyle = getComputedStyle(document.documentElement);
  return {
    top: parseInt(computedStyle.getPropertyValue('--safe-area-inset-top') || '0', 10) || 
         parseInt(computedStyle.getPropertyValue('env(safe-area-inset-top)') || '0', 10),
    bottom: parseInt(computedStyle.getPropertyValue('--safe-area-inset-bottom') || '0', 10) ||
            parseInt(computedStyle.getPropertyValue('env(safe-area-inset-bottom)') || '0', 10),
    left: parseInt(computedStyle.getPropertyValue('--safe-area-inset-left') || '0', 10) ||
          parseInt(computedStyle.getPropertyValue('env(safe-area-inset-left)') || '0', 10),
    right: parseInt(computedStyle.getPropertyValue('--safe-area-inset-right') || '0', 10) ||
           parseInt(computedStyle.getPropertyValue('env(safe-area-inset-right)') || '0', 10),
  };
}

// Check if current browser is Chrome on iOS (uses Safari engine)
export function isChromeIOS() {
  return /CriOS/.test(navigator.userAgent);
}

// Check if current browser is Firefox on iOS (uses Safari engine)
export function isFirefoxIOS() {
  return /FxiOS/.test(navigator.userAgent);
}

// Get the best browser for PWA installation on iOS
export function getIOSInstallInstructions() {
  if (isChromeIOS() || isFirefoxIOS()) {
    return {
      needsSafari: true,
      message: 'For the best experience, open this page in Safari to install the app.',
    };
  }
  return {
    needsSafari: false,
    message: 'Tap the Share button, then "Add to Home Screen".',
  };
}
