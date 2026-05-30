// Staged mobile rollout gate.
//
// A Lovable/Vite app ships as a single bundle, so we can't deploy two app
// versions side by side. Instead we ship the new iPhone update-recovery
// behaviour to EVERY device but gate whether it actually runs behind a
// remotely-controlled "canary percentage". Operators start the rollout at a
// small percentage (e.g. 5%), verify the fix on that cohort using the
// update-failure telemetry, then ramp the percentage up to 100% for full
// deployment — or pause it back to 0% instantly if something regresses.
//
// Each device deterministically hashes a stable per-device id into a bucket
// 0-99. A device is "in the cohort" when its bucket is below the current
// rollout percentage, so ramping the percentage up only ADDS devices and never
// reshuffles who already received it.
//
// The config is read with a lightweight fetch beacon (no Supabase client
// dependency) so it works on the earliest startup path — even on a phone that
// is stuck and can't fully boot the React app. The last value is cached in
// localStorage and read synchronously so gating decisions never block startup.

const REST = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/mobile_rollout_config`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const DEVICE_ID_KEY = "welile_device_id";
const CONFIG_CACHE_KEY = "welile_rollout_config";

// Fallback used only when no config has ever been cached on this device. We
// default to 100 so a brand-new device is never LESS protected than the
// already-shipped behaviour; the operator throttles it down from the admin
// panel and the cached value then governs subsequent loads.
const DEFAULT_PERCENT = 100;

export interface RolloutConfig {
  stage: string;
  rollout_percent: number;
  enabled: boolean;
  notes?: string | null;
  /** epoch ms when this device last fetched the value */
  fetchedAt?: number;
}

/** Stable, random per-device id (persisted in localStorage). */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id =
        (crypto as any)?.randomUUID?.() ??
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "no-device";
  }
}

/** Deterministic bucket 0-99 derived from the device id (FNV-1a hash). */
export function getDeviceBucket(): number {
  const id = getDeviceId();
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 100;
}

function readCachedConfig(): RolloutConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RolloutConfig;
  } catch {
    return null;
  }
}

function writeCachedConfig(cfg: RolloutConfig): void {
  try {
    localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

/**
 * Synchronous decision: is THIS device in the active rollout cohort?
 * Uses the last cached config; falls back to DEFAULT_PERCENT when unknown.
 */
export function isRolloutEnabledForDevice(): boolean {
  const cfg = readCachedConfig();
  const enabled = cfg?.enabled ?? true;
  const percent = cfg?.rollout_percent ?? DEFAULT_PERCENT;
  if (!enabled) return false;
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  return getDeviceBucket() < percent;
}

/** The cached config (or null) plus this device's bucket — for diagnostics UI. */
export function getRolloutState(): {
  config: RolloutConfig | null;
  bucket: number;
  inCohort: boolean;
} {
  return {
    config: readCachedConfig(),
    bucket: getDeviceBucket(),
    inCohort: isRolloutEnabledForDevice(),
  };
}

/**
 * Fetch the live rollout config and update the cache. Fire-and-forget safe:
 * never throws, never blocks. Returns the fresh config or null on failure.
 */
export async function refreshRolloutConfig(): Promise<RolloutConfig | null> {
  try {
    if (!REST || !ANON_KEY) return null;
    const res = await fetch(
      `${REST}?id=eq.current&select=stage,rollout_percent,enabled,notes`,
      {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as RolloutConfig[];
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    const cfg: RolloutConfig = {
      stage: row.stage,
      rollout_percent: Number(row.rollout_percent) || 0,
      enabled: !!row.enabled,
      notes: row.notes ?? null,
      fetchedAt: Date.now(),
    };
    writeCachedConfig(cfg);
    return cfg;
  } catch {
    return null;
  }
}
