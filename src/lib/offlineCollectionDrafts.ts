// Agent-local offline collection drafts (system of record until proof + sync).
// Per CFO mandate: drafts are NEVER sent to the server until the agent
// attaches proof and explicitly submits. Financial Ops cannot see these.

const DB_NAME = 'welile-offline-collections';
const DB_VERSION = 1;
const STORE = 'drafts';
const COUNTER_STORE = 'counters';

export type DraftStatus =
  | 'awaiting_proof'   // captured offline, no proof yet
  | 'ready_to_submit'  // proof attached, waiting for connectivity / agent tap
  | 'syncing'          // currently submitting
  | 'rejected'         // server rejected (validation, no float, etc.)
  | 'needs_attention'; // stale / repeated failures

export type ProofType = 'photo' | 'signature' | 'sms_code';

export interface ProofBundle {
  type: ProofType;
  /** base64 data URL — kept on-device only until submit */
  photo_data_url?: string;
  /** base64 PNG of the on-screen signature */
  signature_data_url?: string;
  /** SMS confirmation code entered by agent */
  sms_code?: string;
  captured_at: string;
}

export interface OfflineCollectionDraft {
  draft_id: string;            // client UUID — idempotency key
  agent_id: string;
  tenant_id: string;
  tenant_name: string;
  rent_request_id: string;
  amount: number;
  notes: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy: number | null;
  provisional_receipt_no: string;
  captured_at: string;
  status: DraftStatus;
  proof_bundle: ProofBundle | null;
  attempts: number;
  last_error: string | null;
  last_attempted_at: string | null;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'draft_id' });
        store.createIndex('agent_id', 'agent_id', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('captured_at', 'captured_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(COUNTER_STORE)) {
        db.createObjectStore(COUNTER_STORE, { keyPath: 'agent_id' });
      }
    };
  });
  return dbPromise;
}

function tryGeolocation(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    const timeout = setTimeout(() => resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timeout); resolve(pos); },
      () => { clearTimeout(timeout); resolve(null); },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 60_000 },
    );
  });
}

async function nextProvisionalReceipt(agentId: string): Promise<string> {
  const db = await openDB();
  const tx = db.transaction(COUNTER_STORE, 'readwrite');
  const store = tx.objectStore(COUNTER_STORE);
  const current = await new Promise<{ agent_id: string; counter: number } | undefined>(
    (resolve, reject) => {
      const r = store.get(agentId);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    },
  );
  const next = (current?.counter ?? 0) + 1;
  store.put({ agent_id: agentId, counter: next });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const short = agentId.replace(/-/g, '').slice(0, 3).toUpperCase();
  return `OFFL-${short}-${String(next).padStart(5, '0')}`;
}

export interface CaptureDraftInput {
  agent_id: string;
  tenant_id: string;
  tenant_name: string;
  rent_request_id: string;
  amount: number;
  notes?: string | null;
}

export async function captureOfflineDraft(input: CaptureDraftInput): Promise<OfflineCollectionDraft> {
  const gps = await tryGeolocation();
  const provisional_receipt_no = await nextProvisionalReceipt(input.agent_id);
  const draft: OfflineCollectionDraft = {
    draft_id: crypto.randomUUID(),
    agent_id: input.agent_id,
    tenant_id: input.tenant_id,
    tenant_name: input.tenant_name,
    rent_request_id: input.rent_request_id,
    amount: input.amount,
    notes: input.notes?.trim() || null,
    gps_lat: gps?.coords.latitude ?? null,
    gps_lng: gps?.coords.longitude ?? null,
    gps_accuracy: gps?.coords.accuracy ?? null,
    provisional_receipt_no,
    captured_at: new Date().toISOString(),
    status: 'awaiting_proof',
    proof_bundle: null,
    attempts: 0,
    last_error: null,
    last_attempted_at: null,
  };

  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(draft);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return draft;
}

export async function listDrafts(agentId: string): Promise<OfflineCollectionDraft[]> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readonly');
  const idx = tx.objectStore(STORE).index('agent_id');
  return new Promise((resolve, reject) => {
    const req = idx.getAll(agentId);
    req.onsuccess = () => {
      const items = (req.result || []) as OfflineCollectionDraft[];
      items.sort((a, b) => a.captured_at.localeCompare(b.captured_at));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getDraft(draftId: string): Promise<OfflineCollectionDraft | null> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE).get(draftId);
    req.onsuccess = () => resolve((req.result as OfflineCollectionDraft) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function updateDraft(
  draftId: string,
  updates: Partial<OfflineCollectionDraft>,
): Promise<OfflineCollectionDraft | null> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  return new Promise((resolve, reject) => {
    const r = store.get(draftId);
    r.onsuccess = () => {
      if (!r.result) { resolve(null); return; }
      const merged = { ...r.result, ...updates };
      store.put(merged);
      tx.oncomplete = () => resolve(merged);
    };
    r.onerror = () => reject(r.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function attachProof(
  draftId: string,
  proof: ProofBundle,
): Promise<OfflineCollectionDraft | null> {
  return updateDraft(draftId, {
    proof_bundle: proof,
    status: 'ready_to_submit',
    last_error: null,
  });
}

export async function deleteDraft(draftId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(draftId);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function countByStatus(agentId: string): Promise<Record<DraftStatus, number>> {
  const drafts = await listDrafts(agentId);
  const out: Record<DraftStatus, number> = {
    awaiting_proof: 0,
    ready_to_submit: 0,
    syncing: 0,
    rejected: 0,
    needs_attention: 0,
  };
  for (const d of drafts) out[d.status] = (out[d.status] ?? 0) + 1;
  return out;
}