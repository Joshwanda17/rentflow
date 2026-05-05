import { useCallback, useEffect, useRef } from 'react';

const REGION_ID = 'map-link-live-region';

function ensureLiveRegion(): HTMLElement {
  let el = document.getElementById(REGION_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = REGION_ID;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    el.className = 'sr-only';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Returns an `announce(title)` callback that posts a polite SR message
 * confirming that a Google Maps link is opening in a new tab.
 */
export function useMapLinkAnnouncer() {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return useCallback((title: string) => {
    const region = ensureLiveRegion();
    region.textContent = '';
    // Force re-announcement even if text is identical.
    window.requestAnimationFrame(() => {
      region.textContent = `Opening ${title} in Google Maps in a new tab`;
    });
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      const r = document.getElementById(REGION_ID);
      if (r) r.textContent = '';
    }, 4000);
  }, []);
}