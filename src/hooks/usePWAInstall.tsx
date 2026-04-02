import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Global storage for the deferred prompt to prevent losing it on re-renders
export let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;

// Capture the prompt as early as possible (before React even loads)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    console.log('[PWA] Early capture: beforeinstallprompt event fired');
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
  });
}

export function usePWAInstall() {
  const [isInstallable, setIsInstallable] = useState(!!globalDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('[PWA] beforeinstallprompt event fired');
      e.preventDefault();
      globalDeferredPrompt = e as BeforeInstallPromptEvent;
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      console.log('[PWA] App installed');
      setIsInstalled(true);
      setIsInstallable(false);
      globalDeferredPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Sync state if prompt was already captured globally
    if (globalDeferredPrompt) {
      setIsInstallable(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    let prompt = globalDeferredPrompt;

    // Retry: if prompt is null, wait 800ms and check again
    if (!prompt) {
      console.log('[PWA] No prompt yet, retrying in 800ms...');
      await new Promise(r => setTimeout(r, 800));
      prompt = globalDeferredPrompt;
    }

    if (!prompt) {
      console.log('[PWA] No deferred prompt available after retry');
      return false;
    }

    try {
      console.log('[PWA] Triggering install prompt...');
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      console.log('[PWA] User choice:', outcome);

      // Clear after userChoice resolves
      globalDeferredPrompt = null;
      setIsInstallable(false);

      if (outcome === 'accepted') {
        setIsInstalled(true);
        localStorage.setItem('welile_pwa_installed', 'true');
        localStorage.setItem('welile_pwa_installed_at', Date.now().toString());
        return true;
      }
      return false;
    } catch (error) {
      console.error('[PWA] Error prompting install:', error);
      return false;
    }
  }, []);

  return {
    isInstallable,
    isInstalled,
    promptInstall,
    hasPrompt: !!globalDeferredPrompt,
  };
}
