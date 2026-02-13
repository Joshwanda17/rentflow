import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SNAPSHOT_DB = 'welile-snapshot';
const SNAPSHOT_STORE = 'snapshot';
const SNAPSHOT_DB_VERSION = 1;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface UserSnapshot {
  userId: string;
  roles: string[];
  fetchedAt: string;
  referrals: any[];
  referralCount: number;
  subAgents: any[];
  pendingSubAgentInvites: any[];
  userInvites: any[];
  linkSignups: any[];
  earningsSummary: any[];
  landlords: any[];
  rentRequests: any[];
  supporterReferrals: any[];
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

const emptySnapshot: UserSnapshot = {
  userId: '',
  roles: [],
  fetchedAt: '',
  referrals: [],
  referralCount: 0,
  subAgents: [],
  pendingSubAgentInvites: [],
  userInvites: [],
  linkSignups: [],
  earningsSummary: [],
  landlords: [],
  rentRequests: [],
  supporterReferrals: [],
};

export function useUserSnapshot(userId: string | undefined) {
  const [snapshot, setSnapshot] = useState<UserSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<number | null>(null);

  const fetchSnapshot = useCallback(async (force = false) => {
    if (!userId) return;

    // Check cache first
    if (!force) {
      const cached = await getCachedSnapshot(userId);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        setSnapshot(cached.data);
        setLastFetched(cached.cachedAt);
        setLoading(false);
        return;
      }
    }

    // If offline, use stale cache
    if (!navigator.onLine) {
      const cached = await getCachedSnapshot(userId);
      if (cached) {
        setSnapshot(cached.data);
        setLastFetched(cached.cachedAt);
      }
      setLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const res = await supabase.functions.invoke('user-snapshot', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) {
        console.error('[Snapshot] fetch error:', res.error);
        // Fall back to stale cache
        const cached = await getCachedSnapshot(userId);
        if (cached) { setSnapshot(cached.data); setLastFetched(cached.cachedAt); }
        setLoading(false);
        return;
      }

      const data = res.data as UserSnapshot;
      setSnapshot(data);
      setLastFetched(Date.now());
      await setCachedSnapshot(userId, data);
    } catch (err) {
      console.error('[Snapshot] unexpected error:', err);
      const cached = await getCachedSnapshot(userId);
      if (cached) { setSnapshot(cached.data); setLastFetched(cached.cachedAt); }
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
