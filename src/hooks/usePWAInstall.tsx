import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;

export function clearGlobalPrompt() {
  globalDeferredPrompt = null;
  notifyListeners(false);
}
const listeners = new Set<(v: boolean) => void>();

function notifyListeners(hasPrompt: boolean) {
  listeners.forEach(fn => fn(hasPrompt));
}

// Capture prompt as early as possible
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    console.log('[PWA] beforeinstallprompt captured');
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    notifyListeners(true);
  });
}

export function usePWAInstall() {
  const [hasPrompt, setHasPrompt] = useState(!!globalDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check standalone
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    setIsInstalled(standalone);

    // Detect iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    // Subscribe to global prompt changes
    const onPromptChange = (v: boolean) => setHasPrompt(v);
    listeners.add(onPromptChange);

    // Sync if already captured
    if (globalDeferredPrompt) setHasPrompt(true);

    const onInstalled = () => {
      console.log('[PWA] appinstalled fired');
      setIsInstalled(true);
      setHasPrompt(false);
      globalDeferredPrompt = null;
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      listeners.delete(onPromptChange);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    const prompt = globalDeferredPrompt;

    if (!prompt) {
      return false;
    }

    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;

      globalDeferredPrompt = null;
      setHasPrompt(false);
      notifyListeners(false);

      if (outcome === 'accepted') {
        setIsInstalled(true);
        localStorage.setItem('welile_pwa_installed', 'true');
        return true;
      }

      return false;
    } catch {
      globalDeferredPrompt = null;
      setHasPrompt(false);
      notifyListeners(false);
      return false;
    }
  }, []);

  return {
    hasPrompt,
    isInstalled,
    isIOS,
    promptInstall,
    canShow: !isInstalled && (hasPrompt || isIOS),
  };
}
