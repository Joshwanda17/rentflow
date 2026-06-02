import { useEffect, useState } from 'react';

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
const TRACKING_ID = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

// Module-level singletons so the script loads only once across the whole app.
let scriptPromise: Promise<void> | null = null;

declare global {
  interface Window {
    __welileInitGoogleMaps?: () => void;
    google?: typeof google;
  }
}

function loadGoogleMaps(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.maps) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  if (!BROWSER_KEY) return Promise.reject(new Error('Google Maps key missing'));

  scriptPromise = new Promise<void>((resolve, reject) => {
    window.__welileInitGoogleMaps = () => resolve();
    const script = document.createElement('script');
    const params = new URLSearchParams({
      key: BROWSER_KEY,
      loading: 'async',
      callback: '__welileInitGoogleMaps',
      libraries: 'marker',
    });
    if (TRACKING_ID) params.set('channel', TRACKING_ID);
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Loads the Google Maps JavaScript API once (async, with callback) and reports
 * readiness. The browser key is referrer-restricted and safe to embed.
 */
export function useGoogleMapsLoader(enabled = true) {
  const [state, setState] = useState<LoadState>(() =>
    typeof window !== 'undefined' && window.google?.maps ? 'ready' : 'idle'
  );

  useEffect(() => {
    if (!enabled || state === 'ready' || state === 'error') return;
    if (!BROWSER_KEY) { setState('error'); return; }
    let cancelled = false;
    setState('loading');
    loadGoogleMaps()
      .then(() => { if (!cancelled) setState('ready'); })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [enabled, state]);

  return { isReady: state === 'ready', isLoading: state === 'loading', isError: state === 'error', hasKey: !!BROWSER_KEY };
}