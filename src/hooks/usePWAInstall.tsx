import { useState, useEffect, useCallback, useRef } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Global storage for the deferred prompt to prevent losing it on re-renders
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
let promptCaptured = false;

// Capture the prompt as early as possible (before React even loads)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    console.log('[PWA] Early capture: beforeinstallprompt event fired');
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    promptCaptured = true;
  }, { once: false });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(globalDeferredPrompt);
  const [isInstallable, setIsInstallable] = useState(!!globalDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const promptTriggered = useRef(false);

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    // Enhanced iOS detection (includes iPad on iOS 13+)
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    setIsIOS(iOS || isIPadOS);

    // Listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('[PWA] beforeinstallprompt event fired');
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      globalDeferredPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed
    const handleAppInstalled = () => {
      console.log('[PWA] App installed event fired');
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      globalDeferredPrompt = null;
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // Check if prompt was already captured globally
    if (globalDeferredPrompt) {
      setDeferredPrompt(globalDeferredPrompt);
      setIsInstallable(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const promptToUse = deferredPrompt || globalDeferredPrompt;
    
    if (!promptToUse) {
      console.log('[PWA] No deferred prompt available');
      return false;
    }

    // Prevent multiple triggers
    if (promptTriggered.current) {
      console.log('[PWA] Prompt already triggered');
      return false;
    }

    try {
      promptTriggered.current = true;
      console.log('[PWA] Triggering install prompt...');
      
      await promptToUse.prompt();
      const { outcome } = await promptToUse.userChoice;
      
      console.log('[PWA] User choice:', outcome);
      
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
        // Store that installation was completed for redirect logic
        localStorage.setItem('welile_pwa_installed', 'true');
        localStorage.setItem('welile_pwa_installed_at', Date.now().toString());
      }
      
      setDeferredPrompt(null);
      globalDeferredPrompt = null;
      promptTriggered.current = false;
      
      return outcome === 'accepted';
    } catch (error) {
      console.error('[PWA] Error prompting install:', error);
      promptTriggered.current = false;
      return false;
    }
  }, [deferredPrompt]);

  return {
    isInstallable,
    isInstalled,
    isIOS,
    promptInstall,
    // Expose whether we have a prompt ready
    hasPrompt: !!(deferredPrompt || globalDeferredPrompt),
  };
}
