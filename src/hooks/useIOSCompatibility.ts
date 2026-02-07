import { useEffect, useState, useCallback } from 'react';

interface MobileInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isIPad: boolean;
  isIPhone: boolean;
  isSafari: boolean;
  isChrome: boolean;
  isStandalone: boolean;
  iosVersion: number | null;
  androidVersion: number | null;
  supportsHaptics: boolean;
  supportsPushNotifications: boolean;
  hasNotch: boolean;
  isMobile: boolean;
}

export function useIOSCompatibility() {
  const [mobileInfo, setMobileInfo] = useState<MobileInfo>({
    isIOS: false,
    isAndroid: false,
    isIPad: false,
    isIPhone: false,
    isSafari: false,
    isChrome: false,
    isStandalone: false,
    iosVersion: null,
    androidVersion: null,
    supportsHaptics: false,
    supportsPushNotifications: false,
    hasNotch: false,
    isMobile: false,
  });

  useEffect(() => {
    const ua = navigator.userAgent;
    
    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isIPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isIPhone = /iPhone/.test(ua);
    
    // Detect Android
    const isAndroid = /Android/.test(ua);
    
    // Detect browsers
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isChrome = /Chrome/.test(ua) && !/Edge/.test(ua);
    
    // Detect standalone mode (PWA)
    const isStandalone = (window.navigator as any).standalone === true || 
                         window.matchMedia('(display-mode: standalone)').matches;
    
    // Extract iOS version
    let iosVersion: number | null = null;
    const iosMatch = ua.match(/OS (\d+)_/);
    if (iosMatch) {
      iosVersion = parseInt(iosMatch[1], 10);
    }
    
    // Extract Android version
    let androidVersion: number | null = null;
    const androidMatch = ua.match(/Android (\d+)/);
    if (androidMatch) {
      androidVersion = parseInt(androidMatch[1], 10);
    }
    
    // Check for haptics support
    const supportsHaptics = 'vibrate' in navigator || 
                           (isIOS && iosVersion !== null && iosVersion >= 10) ||
                           isAndroid;
    
    // Check for push notification support
    const supportsPushNotifications = 'PushManager' in window && 'serviceWorker' in navigator;
    
    // Detect notched devices (iPhone X+ or modern Android)
    const hasNotch = (isIPhone && window.screen.height >= 812) || 
                     (isAndroid && window.screen.height >= 800 && 
                      getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top') !== '');
    
    // General mobile detection
    const isMobile = isIOS || isAndroid || /webOS|BlackBerry|Opera Mini|IEMobile/.test(ua);

    setMobileInfo({
      isIOS,
      isAndroid,
      isIPad,
      isIPhone,
      isSafari,
      isChrome,
      isStandalone,
      iosVersion,
      androidVersion,
      supportsHaptics,
      supportsPushNotifications,
      hasNotch,
      isMobile,
    });

    // Apply platform-specific classes to html element
    if (isIOS) {
      document.documentElement.classList.add('ios');
      if (isStandalone) {
        document.documentElement.classList.add('ios-standalone');
      }
      if (hasNotch) {
        document.documentElement.classList.add('ios-notch');
      }
    }
    
    if (isAndroid) {
      document.documentElement.classList.add('android');
      if (isStandalone) {
        document.documentElement.classList.add('android-standalone');
      }
    }
    
    if (isMobile) {
      document.documentElement.classList.add('mobile');
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

    return () => {
      window.removeEventListener('resize', setViewportHeight);
      window.removeEventListener('orientationchange', setViewportHeight);
    };
  }, []);

  // Mobile haptic feedback - works on iOS and Android
  const mobileHaptic = useCallback((style: 'light' | 'medium' | 'heavy' | 'selection' = 'light') => {
    if (!mobileInfo.supportsHaptics) return;
    
    // Use vibration API (works on both platforms)
    if ('vibrate' in navigator) {
      const patterns = {
        light: 10,
        medium: 20,
        heavy: 30,
        selection: 5,
      };
      navigator.vibrate(patterns[style]);
    }
  }, [mobileInfo.supportsHaptics]);

  // Legacy alias for backwards compatibility
  const iosHaptic = mobileHaptic;

  // No-op: text zoom prevention is now handled by static CSS in index.css
  const preventTextZoom = useCallback(() => {}, []);

  // Handle mobile keyboard avoiding (works on iOS and Android)
  const handleKeyboardAvoid = useCallback((element: HTMLElement | null) => {
    if (!mobileInfo.isMobile || !element) return;

    const handleFocus = () => {
      setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    };

    element.addEventListener('focus', handleFocus);
    return () => element.removeEventListener('focus', handleFocus);
  }, [mobileInfo.isMobile]);

  return {
    ...mobileInfo,
    iosHaptic,
    mobileHaptic,
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
