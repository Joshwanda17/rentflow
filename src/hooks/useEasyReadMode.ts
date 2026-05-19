import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type A11ySize = 0 | 1 | 2; // 0 = M, 1 = L, 2 = XL

const LS_MODE = 'welile_statement_a11y';
const LS_SIZE = 'welile_statement_a11y_size';

const scaleFor = (s: A11ySize) => (s === 2 ? 1.3 : s === 1 ? 1.15 : 1);

/**
 * Shared easy-read accessibility mode for wallet + receipt surfaces.
 * Toggles `.a11y-large` on <body> and sets `--a11y-scale`, so the styles in
 * index.css cascade uniformly to every wallet/receipt/dialog descendant.
 *
 * The boolean ON/OFF is persisted per-user via `profiles.prefers_easy_read`
 * (cross-device). The size step persists locally for snappy mobile fine-tuning.
 */
export function useEasyReadMode() {
  const { user } = useAuth();

  const [enabled, setEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_MODE) === '1'; } catch { return false; }
  });
  const [size, setSize] = useState<A11ySize>(() => {
    try {
      const n = parseInt(localStorage.getItem(LS_SIZE) ?? '0', 10);
      return (n === 1 || n === 2) ? (n as A11ySize) : 0;
    } catch { return 0; }
  });
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from server-side preference.
  useEffect(() => {
    if (!user) { setHydrated(true); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('prefers_easy_read, easy_read_size')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data && typeof (data as any).prefers_easy_read === 'boolean') {
        setEnabled((data as any).prefers_easy_read);
      }
      const srvSize = (data as any)?.easy_read_size;
      if (srvSize === 0 || srvSize === 1 || srvSize === 2) {
        setSize(srvSize as A11ySize);
      }
      setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Apply to <body> and persist.
  useEffect(() => {
    const body = document.body;
    if (enabled) {
      body.classList.add('a11y-large');
      body.style.setProperty('--a11y-scale', String(scaleFor(size)));
    } else {
      body.classList.remove('a11y-large');
      body.style.removeProperty('--a11y-scale');
    }
    try { localStorage.setItem(LS_MODE, enabled ? '1' : '0'); } catch {}
    try { localStorage.setItem(LS_SIZE, String(size)); } catch {}

    if (user && hydrated) {
      supabase
        .from('profiles')
        .update({ prefers_easy_read: enabled, easy_read_size: size })
        .eq('id', user.id)
        .then(({ error }) => {
          if (error) console.error('[useEasyReadMode] save pref', error);
        });
    }
  }, [enabled, size, user, hydrated]);

  const toggle = useCallback(() => setEnabled(v => !v), []);

  return { enabled, setEnabled, toggle, size, setSize, hydrated };
}