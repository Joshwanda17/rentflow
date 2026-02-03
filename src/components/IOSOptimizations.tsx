import { useEffect } from 'react';
import { useIOSCompatibility } from '@/hooks/useIOSCompatibility';

/**
 * Component that handles mobile-specific setup and optimizations
 * Works on both iOS and Android PWAs
 * Should be mounted once at the app root level
 */
export default function IOSOptimizations() {
  const { isIOS, isAndroid, isStandalone, isSafari, isMobile, preventTextZoom } = useIOSCompatibility();

  // Apply global mobile optimizations immediately on mount
  useEffect(() => {
    // Prevent text zoom on ALL mobile devices (not just iOS)
    const style = document.createElement('style');
    style.id = 'mobile-input-fix';
    style.textContent = `
      input, textarea, select, button {
        font-size: 16px !important;
        -webkit-text-size-adjust: 100%;
        touch-action: manipulation;
      }
      input:focus, textarea:focus, select:focus {
        font-size: 16px !important;
      }
    `;
    if (!document.getElementById('mobile-input-fix')) {
      document.head.appendChild(style);
    }
    
    return () => {
      const existingStyle = document.getElementById('mobile-input-fix');
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  // Mobile-specific optimizations
  useEffect(() => {
    if (!isMobile) return;

    // Prevent text zoom on input focus
    preventTextZoom();

    // Handle keyboard events (works for both iOS and Android)
    const handleVisualViewportResize = () => {
      if (window.visualViewport) {
        document.documentElement.style.setProperty(
          '--keyboard-inset-height',
          `${window.innerHeight - window.visualViewport.height}px`
        );
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportResize);
    }

    // Fix scroll restoration
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    // Handle status bar tap to scroll to top (iOS specific, but harmless on Android)
    if (isStandalone) {
      const handleStatusBarTap = (e: TouchEvent) => {
        const touch = e.touches[0];
        // Status bar area (top ~44px for iOS, ~24px for Android)
        const statusBarHeight = isIOS ? 44 : 24;
        if (touch && touch.clientY < statusBarHeight) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      };
      document.addEventListener('touchstart', handleStatusBarTap);
      
      return () => {
        document.removeEventListener('touchstart', handleStatusBarTap);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', handleVisualViewportResize);
        }
      };
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportResize);
      }
    };
  }, [isIOS, isAndroid, isStandalone, isMobile, preventTextZoom]);

  // Handle Safari/Chrome address bar hiding/showing
  useEffect(() => {
    if (!isMobile || isStandalone) return;

    let lastScrollY = window.scrollY;
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          const isScrollingDown = currentScrollY > lastScrollY;
          
          // Update CSS custom property for components that need to adapt
          document.documentElement.style.setProperty(
            '--mobile-chrome-hidden',
            isScrollingDown ? '1' : '0'
          );
          
          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile, isSafari, isStandalone]);

  // No visual output - purely functional component
  return null;
}
