import { useEffect, forwardRef } from 'react';
import { useIOSCompatibility } from '@/hooks/useIOSCompatibility';

/**
 * Handles iOS-specific link behaviors including:
 * - Deep linking from shared links
 * - Opening links within the PWA
 * - Handling external links properly
 * - Ensuring signup links work reliably
 */
const IOSLinkHandler = forwardRef<HTMLDivElement>(function IOSLinkHandler(_props, _ref) {
  const { isIOS, isStandalone } = useIOSCompatibility();

  // Handle URL parameters preservation across redirects
  useEffect(() => {
    // Preserve critical signup parameters across page navigations
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    const role = urlParams.get('role');
    const become = urlParams.get('become');
    const token = urlParams.get('t');
    
    // Store these in sessionStorage for reliability
    if (ref) sessionStorage.setItem('signup_ref', ref);
    if (role) sessionStorage.setItem('signup_role', role);
    if (become) sessionStorage.setItem('signup_become', become);
    if (token) sessionStorage.setItem('signup_token', token);
  }, []);

  useEffect(() => {
    if (!isIOS) return;

    // Handle shared links - parse URL parameters on mount
    const handleSharedLink = () => {
      const url = new URL(window.location.href);
      const sharedUrl = url.searchParams.get('url');
      const sharedText = url.searchParams.get('text');
      const sharedTitle = url.searchParams.get('title');

      if (sharedUrl || sharedText || sharedTitle) {
        console.log('Received shared content:', { sharedUrl, sharedText, sharedTitle });
        // Handle the shared content - could navigate to a specific page
      }
    };

    handleSharedLink();

    // Intercept link clicks to keep navigation within PWA
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      
      if (!anchor) return;
      
      const href = anchor.getAttribute('href');
      if (!href) return;

      // Check if it's an internal link
      const isInternalLink = href.startsWith('/') || 
                             href.startsWith(window.location.origin) ||
                             !href.startsWith('http');

      // For external links in standalone mode, open in Safari
      if (isStandalone && !isInternalLink && href.startsWith('http')) {
        // Let iOS handle external links naturally
        return;
      }

      // For WhatsApp and other app links, let them open naturally
      if (href.startsWith('whatsapp://') || 
          href.startsWith('tel:') || 
          href.startsWith('mailto:') ||
          href.startsWith('sms:')) {
        return;
      }
    };

    document.addEventListener('click', handleLinkClick);

    // Handle iOS clipboard for sharing
    const handleCopy = async (text: string) => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          return true;
        }
        // Fallback for older iOS versions
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        return success;
      } catch {
        return false;
      }
    };

    // Expose to window for global access
    (window as any).iosCopy = handleCopy;

    return () => {
      document.removeEventListener('click', handleLinkClick);
    };
  }, [isIOS, isStandalone]);

  // Handle iOS share sheet capability detection
  useEffect(() => {
    if (!isIOS) return;

    // Check if Web Share API is available
    const canShare = 'share' in navigator || 'canShare' in navigator;
    
    // Store capability for other components
    (window as any).iosCanShare = canShare;

    // Add iOS-specific share handling
    if (canShare) {
      (window as any).iosShare = async (data: ShareData) => {
        try {
          await navigator.share(data);
          return true;
        } catch (error) {
          if ((error as Error).name !== 'AbortError') {
            console.error('Share failed:', error);
          }
          return false;
        }
      };
    }
  }, [isIOS]);

  return null;
});

export default IOSLinkHandler;

