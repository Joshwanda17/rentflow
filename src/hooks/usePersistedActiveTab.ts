import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Persists the active sidebar tab per (role, route) so a refresh restores the
 * exact submenu the user was on. Different roles or routes get isolated memory
 * (e.g. CFO on /cfo/dashboard vs admin on /admin/dashboard).
 *
 * Falls back to `defaultTab` when storage is unavailable or empty.
 */
export function usePersistedActiveTab(role: string, defaultTab = 'overview') {
  const { pathname } = useLocation();
  const storageKey = `dashboard:${role}:${pathname}:activeTab`;

  const [activeTab, setActiveTabState] = useState<string>(() => {
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
    },
    [storageKey],
  );

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
