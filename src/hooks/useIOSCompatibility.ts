import { useEffect, useState, useCallback } from 'react';

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

    return () => {
      window.removeEventListener('resize', setViewportHeight);
      window.removeEventListener('orientationchange', setViewportHeight);
    };
  }, []);

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
