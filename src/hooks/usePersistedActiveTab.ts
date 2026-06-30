import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

/**
 * Persists the active sidebar tab per (role, route) so a refresh restores the
 * exact submenu the user was on. Different roles or routes get isolated memory
 * (e.g. CFO on /cfo/dashboard vs admin on /admin/dashboard).
 *
 * The active section is ALSO reflected in the URL as a `?section=<id>` query
 * param, so deep links survive refresh and are shareable — opening a shared
 * link lands the recipient on the same breadcrumb path. The default tab is
 * represented by the absence of the param (clean URLs). Resolution order on
 * load: URL param → localStorage → defaultTab.
 *
 * Falls back to `defaultTab` when storage is unavailable or empty.
 */
export function usePersistedActiveTab(role: string, defaultTab = 'overview') {
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const storageKey = `dashboard:${role}:${pathname}:activeTab`;

  const [activeTab, setActiveTabState] = useState<string>(() => {
    // URL wins so deep links / refresh restore the exact section.
    const fromUrl = searchParams.get('section');
    if (fromUrl) return fromUrl;
    if (typeof window === 'undefined') return defaultTab;
    try {
      return window.localStorage.getItem(storageKey) || defaultTab;
    } catch {
      return defaultTab;
    }
  });

  const setActiveTab = useCallback(
    (tab: string) => {
      setActiveTabState(tab);
      try {
        window.localStorage.setItem(storageKey, tab);
      } catch {
        /* storage unavailable */
      }
      // Reflect into the URL (replace — don't spam history). The default tab is
      // the bare URL with no `section` param.
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tab === defaultTab) next.delete('section');
          else next.set('section', tab);
          return next;
        },
        { replace: true },
      );
    },
    [storageKey, defaultTab, setSearchParams],
  );

  /**
   * On mount, if we restored a non-default section from storage but the URL has
   * no `section` param, write it once so a subsequent refresh / copy-link keeps
   * the deep link intact.
   */
  const didInitUrl = useRef(false);
  useEffect(() => {
    if (didInitUrl.current) return;
    didInitUrl.current = true;
    if (!searchParams.get('section') && activeTab !== defaultTab) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('section', activeTab);
          return next;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * React to external URL changes (browser back/forward, incoming shared link
   * navigations) by mirroring the `section` param into state + storage.
   */
  useEffect(() => {
    const fromUrl = searchParams.get('section') || defaultTab;
    setActiveTabState((prev) => {
      if (prev === fromUrl) return prev;
      try {
        window.localStorage.setItem(storageKey, fromUrl);
      } catch {
        /* storage unavailable */
      }
      return fromUrl;
    });
  }, [searchParams, defaultTab, storageKey]);

  /**
   * Cross-tab sync: when another tab writes to the same storage key (or the
   * Reset button removes it), mirror the change here. The native `storage`
   * event only fires in OTHER tabs, so this never causes a feedback loop.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: StorageEvent) => {
      if (e.storageArea !== window.localStorage) return;
      if (e.key !== storageKey) return;
      setActiveTabState(e.newValue || defaultTab);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [storageKey, defaultTab]);

  return [activeTab, setActiveTab] as const;
}
