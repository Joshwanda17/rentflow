/**
 * Predictive Prefetch — background-hydrates IndexedDB after login
 * so that navigating to wallet, notifications, earnings, etc.
 * is instant (served from cache, no network wait).
 *
 * This runs ONCE per sign-in, deferred by 3s so it doesn't compete
 * with the critical auth + dashboard render path.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  cacheProfile,
  cacheWallet,
  cacheNotifications,
  cacheTransactions,
  cacheRentRequests,
  cacheEarnings,
  cacheUserRoles,
  cacheDashboardData,
} from '@/lib/offlineDataStorage';

const PREFETCH_FLAG = 'welile_prefetch_done';

/**
 * Call this once after successful sign-in.
 * It defers by 3s, checks a sessionStorage flag to avoid repeats,
 * then fires the user-snapshot edge function and fans data out
 * into every offline store.
 */
export function schedulePredictivePrefetch(userId: string) {
  // Already prefetched this session
  if (sessionStorage.getItem(PREFETCH_FLAG) === userId) return;

  setTimeout(async () => {
    try {
      // Mark immediately to prevent double-fire
      sessionStorage.setItem(PREFETCH_FLAG, userId);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      console.log('[Prefetch] Starting predictive prefetch…');

      const res = await supabase.functions.invoke('user-snapshot', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error || !res.data) {
        console.warn('[Prefetch] Snapshot call failed:', res.error);
        return;
      }

      const snap = res.data as any;

      // Fan-out into offline stores in parallel
      const ops: Promise<void>[] = [];

      if (snap.profile) ops.push(cacheProfile(snap.profile));
      if (snap.wallet) ops.push(cacheWallet(snap.wallet));
      if (snap.notifications?.length) ops.push(cacheNotifications(snap.notifications));
      if (snap.recentTransactions?.length) ops.push(cacheTransactions(snap.recentTransactions));
      if (snap.rentRequests?.length) ops.push(cacheRentRequests(snap.rentRequests));
      if (snap.agentEarnings?.length) ops.push(cacheEarnings(userId, snap.agentEarnings));
      if (snap.roles?.length) ops.push(cacheUserRoles(userId, snap.roles));

      // Cache role-specific dashboard data
      if (snap.roles?.length) {
        for (const role of snap.roles) {
          ops.push(cacheDashboardData(userId, role, snap));
        }
      }

      await Promise.allSettled(ops);
      console.log('[Prefetch] All offline stores hydrated ✓');
    } catch (e) {
      console.warn('[Prefetch] Non-critical prefetch error:', e);
    }
  }, 3000); // 3s delay — don't compete with initial render
}

/**
 * Clear the prefetch flag on sign-out so next login triggers a fresh prefetch.
 */
export function clearPrefetchFlag() {
  sessionStorage.removeItem(PREFETCH_FLAG);
}
