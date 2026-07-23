import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "wr_campaign_ref";
const TOKEN_KEY = "welile_campaign_attribution_token";
const COOKIE_NAME = "welile_campaign_attribution";
const VISITOR_KEY = "wr_visitor_id";
const ATTR_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type CampaignRef = {
  short_code: string;
  campaign_id: string;
  campaign_name?: string;
  agent_id: string;
  location_slug: string;
  location_display?: string;
  district?: string;
  selected_source?: string;
  captured_at: number;
  attribution_token?: string;
  locked?: boolean;
};

export function getVisitorId(): string {
  try {
    let v = localStorage.getItem(VISITOR_KEY);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, v);
    }
    return v;
  } catch {
    return crypto.randomUUID();
  }
}

function setCookie(name: string, value: string, maxAgeSec: number) {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(
      value,
    )}; Max-Age=${maxAgeSec}; Path=/; SameSite=Lax${secure}`;
  } catch {}
}

function readCookie(name: string): string | null {
  try {
    const match = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(name + "="));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
  } catch {
    return null;
  }
}

function clearCookie(name: string) {
  try {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {}
}

export function getStoredAttributionToken(): string | null {
  try {
    return readCookie(COOKIE_NAME) || localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function persistToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    setCookie(COOKIE_NAME, token, 30 * 24 * 60 * 60);
  } catch {}
}

export function storeCampaignRef(ref: CampaignRef) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ref));
    if (ref.attribution_token) persistToken(ref.attribution_token);
  } catch {}
}

export function getStoredCampaignRef(): CampaignRef | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CampaignRef;
    // Expire after 30 days
    if (Date.now() - (parsed.captured_at ?? 0) > ATTR_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearCampaignRef() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    clearCookie(COOKIE_NAME);
  } catch {}
}

/**
 * Create or refresh a server-side attribution when a campaign link is opened.
 * The RPC applies latest-valid-link-before-lock semantics and returns the
 * attribution token which we persist in a first-party cookie + localStorage
 * as recovery layers. The server row remains the source of truth.
 */
export async function createOrRefreshCampaignAttribution(shortCode: string) {
  const priorToken = getStoredAttributionToken();
  const visitorId = getVisitorId();
  const { data, error } = await supabase.rpc(
    "create_or_refresh_campaign_attribution" as any,
    {
      p_short_code: shortCode,
      p_visitor_id: visitorId,
      p_prior_token: priorToken,
      p_click_id: null,
    } as any,
  );
  if (error) return null;
  const meta = data as {
    status?: string;
    attribution_token?: string;
    locked?: boolean;
    campaign_link_id?: string;
    campaign_id?: string;
    referring_agent_id?: string;
    campaign_location_id?: string;
    selected_source?: string;
    canonical_slug?: string;
    short_code?: string;
  } | null;
  if (!meta || meta.status !== "ok" || !meta.attribution_token) return meta;
  persistToken(meta.attribution_token);
  return meta;
}

/**
 * If we have a stored attribution token but no ref (or on app load), verify
 * the token server-side. If invalid/expired, clear local recovery data.
 */
export async function restoreAttributionFromToken() {
  const token = getStoredAttributionToken();
  if (!token) return null;
  const { data, error } = await supabase.rpc(
    "restore_campaign_attribution" as any,
    { p_token: token } as any,
  );
  if (error) return null;
  const meta = data as { status?: string; attribution_token?: string } | null;
  if (!meta) return null;
  if (meta.status !== "ok") {
    if (["invalid", "expired", "invalidated", "link_inactive", "campaign_inactive", "completed"].includes(meta.status || "")) {
      // Only clear local token; keep completed attribution history server-side.
      try {
        localStorage.removeItem(TOKEN_KEY);
        clearCookie(COOKIE_NAME);
      } catch {}
    }
    return meta;
  }
  if (meta.attribution_token) persistToken(meta.attribution_token);
  return meta;
}

/**
 * Lock attribution after OTP / identity confirmation so subsequent campaign
 * clicks cannot switch the referring agent. Idempotent server-side.
 */
export async function lockAttribution() {
  const token = getStoredAttributionToken();
  if (!token) return;
  try {
    await supabase.rpc("lock_campaign_attribution" as any, { p_token: token } as any);
  } catch {}
}

/**
 * Save non-sensitive registration progress. Never pass passwords or OTP codes.
 */
export async function saveRegistrationDraft(params: {
  current_step: string;
  form_data?: Record<string, unknown>;
  phone_number?: string;
  status?: "started" | "awaiting_otp" | "verified" | "completed" | "abandoned";
  verification_status?: string;
}) {
  const token = getStoredAttributionToken();
  if (!token) return null;
  try {
    const { data } = await supabase.rpc(
      "upsert_sub_agent_registration_draft" as any,
      {
        p_token: token,
        p_current_step: params.current_step,
        p_form_data: (params.form_data ?? {}) as any,
        p_phone_number: params.phone_number ?? null,
        p_status: params.status ?? "started",
        p_verification_status: params.verification_status ?? null,
      } as any,
    );
    return data;
  } catch {
    return null;
  }
}

/**
 * Called after a user is authenticated. If a campaign context is stored, attach
 * the current user to it via the SECURITY DEFINER RPC. Idempotent server-side.
 */
export async function attachCampaignIfPresent(): Promise<void> {
  const token = getStoredAttributionToken();
  // Prefer token-based completion (Phase Two path).
  if (token) {
    try {
      const { data, error } = await supabase.rpc(
        "complete_campaign_attribution" as any,
        { p_token: token } as any,
      );
      if (!error) {
        const status = (data as { status?: string } | null)?.status;
        if (
          status === "ok" ||
          status === "already_completed" ||
          status === "already_completed_other_user" ||
          status === "already_attributed" ||
          status === "self_referral_blocked" ||
          status === "link_inactive" ||
          status === "campaign_inactive" ||
          status === "expired"
        ) {
          clearCampaignRef();
          return;
        }
      }
    } catch {
      // fall through to legacy path
    }
  }
  // Legacy path: short_code stored without attribution_token.
  const ref = getStoredCampaignRef();
  if (!ref) return;
  try {
    const { data, error } = await supabase.rpc("attach_campaign_registration", {
      p_short_code: ref.short_code,
      p_visitor_id: getVisitorId(),
    });
    if (!error) {
      const status = (data as { status?: string } | null)?.status;
      if (
        status === "ok" ||
        status === "already_attributed" ||
        status === "self_referral_blocked" ||
        status === "link_inactive" ||
        status === "campaign_inactive"
      ) {
        clearCampaignRef();
      }
    }
  } catch {
    // Silent — retry on next auth event
  }
}