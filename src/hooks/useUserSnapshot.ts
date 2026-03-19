import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  cacheProfile,
  cacheWallet,
  cacheNotifications,
  cacheTransactions,
  cacheRentRequests,
  cacheEarnings,
  cacheUserRoles,
} from '@/lib/offlineDataStorage';

const SNAPSHOT_DB = 'welile-snapshot';
const SNAPSHOT_STORE = 'snapshot';
const SNAPSHOT_DB_VERSION = 2; // Bumped for expanded schema
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

export interface UserSnapshot {
  userId: string;
  roles: string[];
  fetchedAt: string;
  version?: number;

  // Universal
  profile: any | null;
  wallet: any | null;
  notifications: any[];
  recentTransactions: any[];

  // Referrals
  referrals: any[];
  referralCount: number;

  // Agent
  subAgents: any[];
  pendingSubAgentInvites: any[];
  userInvites: any[];
  linkSignups: any[];
  earningsSummary: any[];
  agentEarnings: any[];

  // Tenant
  landlords: any[];
  rentRequests: any[];
  repayments: any[];

  // Supporter
  supporterReferrals: any[];
  investmentAccount: any | null;
}

let dbInstance: IDBDatabase | null = null;

function openSnapshotDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbInstance) { resolve(dbInstance); return; }
    const req = indexedDB.open(SNAPSHOT_DB, SNAPSHOT_DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { dbInstance = req.result; resolve(dbInstance); };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'userId' });
      }
    };
  });
}

async function getCachedSnapshot(userId: string): Promise<{ data: UserSnapshot; cachedAt: number } | null> {
  try {
    const db = await openSnapshotDB();
    const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
    const req = tx.objectStore(SNAPSHOT_STORE).get(userId);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

async function setCachedSnapshot(userId: string, data: UserSnapshot): Promise<void> {
  try {
    const db = await openSnapshotDB();
    const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
    tx.objectStore(SNAPSHOT_STORE).put({ userId, data, cachedAt: Date.now() });
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  } catch (e) { console.warn('[Snapshot] cache write failed', e); }
}

/**
 * Fan-out snapshot data into the offline data stores so that
 * individual pages (wallet, profile, notifications, etc.) can
 * read from IndexedDB without a separate network call.
 */
async function hydrateOfflineStores(snapshot: UserSnapshot): Promise<void> {
  try {
    const ops: Promise<void>[] = [];

    if (snapshot.profile) {
      ops.push(cacheProfile(snapshot.profile));
    }
    if (snapshot.wallet) {
      ops.push(cacheWallet(snapshot.wallet));
    }
    if (snapshot.notifications?.length) {
      ops.push(cacheNotifications(snapshot.notifications));
    }
    if (snapshot.recentTransactions?.length) {
      ops.push(cacheTransactions(snapshot.recentTransactions));
    }
    if (snapshot.rentRequests?.length) {
      ops.push(cacheRentRequests(snapshot.rentRequests));
    }
    if (snapshot.agentEarnings?.length) {
      ops.push(cacheEarnings(snapshot.userId, snapshot.agentEarnings));
    }
    if (snapshot.roles?.length) {
      ops.push(cacheUserRoles(snapshot.userId, snapshot.roles));
    }

    await Promise.allSettled(ops);
    console.log('[Snapshot] Hydrated offline stores from snapshot');
  } catch (e) {
    console.warn('[Snapshot] Offline hydration failed (non-critical):', e);
  }
}

const emptySnapshot: UserSnapshot = {
  userId: '',
  roles: [],
  fetchedAt: '',
  profile: null,
  wallet: null,
  notifications: [],
  recentTransactions: [],
  referrals: [],
  referralCount: 0,
  subAgents: [],
  pendingSubAgentInvites: [],
  userInvites: [],
  linkSignups: [],
  earningsSummary: [],
  agentEarnings: [],
  landlords: [],
  rentRequests: [],
  repayments: [],
  supporterReferrals: [],
  investmentAccount: null,
};

export function useUserSnapshot(userId: string | undefined) {
  const [snapshot, setSnapshot] = useState<UserSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<number | null>(null);

  const fetchSnapshot = useCallback(async (force = false) => {
    if (!userId) return;

    // Always try to show cached data immediately (stale-while-revalidate)
    const cached = await getCachedSnapshot(userId);
    if (cached) {
      setSnapshot(cached.data);
      setLastFetched(cached.cachedAt);
      setLoading(false);

      // If cache is fresh and not forced, skip network call
      if (!force && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return;
      }
    }

    // If offline, stop here (we already showed cached data above)
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }

    // Background refresh — don't set loading=true if we have cached data
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const res = await supabase.functions.invoke('user-snapshot', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) {
        console.error('[Snapshot] fetch error:', res.error);
        setLoading(false);
        return;
      }

      const data = res.data as UserSnapshot;
      setSnapshot(data);
      setLastFetched(Date.now());

      // Cache snapshot + fan-out to offline stores in parallel
      await Promise.allSettled([
        setCachedSnapshot(userId, data),
        hydrateOfflineStores(data),
      ]);
    } catch (err) {
      console.error('[Snapshot] unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchSnapshot();
    }
  }, [userId, fetchSnapshot]);

  return { snapshot, loading, refresh: () => fetchSnapshot(true), lastFetched };
}
