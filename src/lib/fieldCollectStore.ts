/**
 * Offline-first store for Field Collections.
 * Uses IndexedDB to:
 *   1) Cache the agent's tenant list (loaded when online).
 *   2) Queue field collection entries captured offline.
 *
 * Per-agent scoped (keyed by agentId) so multiple accounts on one device stay isolated.
 */

const DB_NAME = 'welile-field-collect';
const DB_VERSION = 1;
const STORE_TENANTS = 'tenants';
const STORE_ENTRIES = 'entries';

export interface CachedTenant {
  agentId: string;
  tenantId: string;
  fullName: string;
  phone: string | null;
  monthlyRent?: number | null;
  cachedAt: number;
}

export interface FieldEntry {
  id: string;            // client_uuid (also used in DB unique constraint)
  agentId: string;
  tenantId: string | null;
  tenantName: string;
  tenantPhone: string | null;
  amount: number;
  notes?: string | null;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  capturedAt: number;    // ms epoch
  /**
   * 'queued'    = needs sync
   * 'synced'    = pushed to server pending review
   * 'error'    = failed last sync (will retry)
   * 'duplicate' = server rejected as duplicate of an already-uploaded receipt
   *              (idempotency key collision — needs human reconciliation)
   */
  syncState: 'queued' | 'synced' | 'error' | 'duplicate';
  syncError?: string | null;
  serverId?: string | null;
  /** When syncState='duplicate', the server-side field_collections.id this entry collided with */
  duplicateOfServerId?: string | null;
  /** Snapshot of the server record at the moment the duplicate was detected (for side-by-side review) */
  duplicateServerSnapshot?: {
    amount: number;
    capturedAt: string;
    tenantName: string | null;
    status: string;
    createdAt: string;
  } | null;
  /** Last sync attempt timestamp (ms epoch) — used for backoff / display */
  lastSyncAt?: number | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TENANTS)) {
        const s = db.createObjectStore(STORE_TENANTS, { keyPath: ['agentId', 'tenantId'] });
        s.createIndex('by_agent', 'agentId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const s = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
        s.createIndex('by_agent', 'agentId', { unique: false });
        s.createIndex('by_agent_state', ['agentId', 'syncState'], { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result: any;
    const r = fn(s);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result as T);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

/* ----------------- Tenant cache ----------------- */

export async function cacheTenants(agentId: string, tenants: Array<Omit<CachedTenant, 'agentId' | 'cachedAt'>>): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_TENANTS, 'readwrite');
    const s = t.objectStore(STORE_TENANTS);
    // Replace existing cache for this agent
    const idx = s.index('by_agent');
    const cursorReq = idx.openCursor(IDBKeyRange.only(agentId));
    cursorReq.onsuccess = () => {
      const cur = cursorReq.result;
      if (cur) {
        cur.delete();
        cur.continue();
      } else {
        const now = Date.now();
        for (const tn of tenants) {
          s.put({ ...tn, agentId, cachedAt: now });
        }
      }
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getCachedTenants(agentId: string): Promise<CachedTenant[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_TENANTS, 'readonly');
    const s = t.objectStore(STORE_TENANTS).index('by_agent');
    const req = s.getAll(IDBKeyRange.only(agentId));
    req.onsuccess = () => resolve((req.result || []) as CachedTenant[]);
    req.onerror = () => reject(req.error);
  });
}

/* ----------------- Entries queue ----------------- */

export async function addEntry(entry: FieldEntry): Promise<void> {
  await tx(STORE_ENTRIES, 'readwrite', (s) => s.put(entry));
}

export async function updateEntry(id: string, patch: Partial<FieldEntry>): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_ENTRIES, 'readwrite');
    const s = t.objectStore(STORE_ENTRIES);
    const getReq = s.get(id);
    getReq.onsuccess = () => {
      const cur = getReq.result as FieldEntry | undefined;
      if (!cur) { resolve(); return; }
      s.put({ ...cur, ...patch });
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function deleteEntry(id: string): Promise<void> {
  await tx(STORE_ENTRIES, 'readwrite', (s) => s.delete(id));
}

export async function getEntries(agentId: string): Promise<FieldEntry[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_ENTRIES, 'readonly');
    const s = t.objectStore(STORE_ENTRIES).index('by_agent');
    const req = s.getAll(IDBKeyRange.only(agentId));
    req.onsuccess = () => {
      const all = (req.result || []) as FieldEntry[];
      all.sort((a, b) => b.capturedAt - a.capturedAt);
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getQueuedEntries(agentId: string): Promise<FieldEntry[]> {
  const all = await getEntries(agentId);
  return all.filter(e => e.syncState === 'queued' || e.syncState === 'error');
}

export async function getDuplicateEntries(agentId: string): Promise<FieldEntry[]> {
  const all = await getEntries(agentId);
  return all.filter(e => e.syncState === 'duplicate');
}

/** UUID v4 — works without crypto.randomUUID on older mobile WebViews */
export function newClientUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try { return (crypto as any).randomUUID(); } catch { /* fall through */ }
  }
  // Fallback
  const bytes = new Uint8Array(16);
  (crypto as any).getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}