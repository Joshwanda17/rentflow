import { useEffect } from 'react';
import { useIOSCompatibility } from '@/hooks/useIOSCompatibility';

/**
 * Component that handles iOS-specific setup and optimizations
 * Should be mounted once at the app root level
 */
export default function IOSOptimizations() {
  const { isIOS, isStandalone, isSafari, preventTextZoom } = useIOSCompatibility();

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

  useEffect(() => {
    if (!isIOS) return;

    // Prevent text zoom on input focus
    preventTextZoom();

    // Handle iOS keyboard events
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

    // Prevent double-tap zoom on interactive elements
    const preventDoubleTapZoom = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.closest('button') ||
        target.closest('a') ||
        target.closest('[role="button"]')
      ) {
        e.preventDefault();
      }
    };

    // Handle iOS-specific touch behaviors
    document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });

    // Fix iOS scroll restoration
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    // Handle iOS status bar tap to scroll to top
    if (isStandalone) {
      const handleStatusBarTap = (e: TouchEvent) => {
        const touch = e.touches[0];
        // Status bar area (top ~44px)
        if (touch && touch.clientY < 44) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      };
      document.addEventListener('touchstart', handleStatusBarTap);
      
      return () => {
        document.removeEventListener('touchstart', handleStatusBarTap);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', handleVisualViewportResize);
        }
        document.removeEventListener('touchend', preventDoubleTapZoom);
      };
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportResize);
      }
      document.removeEventListener('touchend', preventDoubleTapZoom);
    };
  }, [isIOS, isStandalone, preventTextZoom]);

  // Handle iOS Safari address bar hiding/showing
  useEffect(() => {
    if (!isIOS || !isSafari || isStandalone) return;

    let lastScrollY = window.scrollY;
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          const isScrollingDown = currentScrollY > lastScrollY;
          
          // Update CSS custom property for components that need to adapt
          document.documentElement.style.setProperty(
            '--ios-chrome-hidden',
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
  }, [isIOS, isSafari, isStandalone]);

  // No visual output - purely functional component
  return null;
}
