import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "wr_campaign_ref";
const VISITOR_KEY = "wr_visitor_id";

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

export function storeCampaignRef(ref: CampaignRef) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ref));
  } catch {}
}

export function getStoredCampaignRef(): CampaignRef | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CampaignRef;
    // Expire after 30 days
    if (Date.now() - (parsed.captured_at ?? 0) > 30 * 24 * 60 * 60 * 1000) {
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
  } catch {}
}

/**
 * Called after a user is authenticated. If a campaign context is stored, attach
 * the current user to it via the SECURITY DEFINER RPC. Idempotent server-side.
 */
export async function attachCampaignIfPresent(): Promise<void> {
  const ref = getStoredCampaignRef();
  if (!ref) return;
  try {
    const { data, error } = await supabase.rpc("attach_campaign_registration", {
      p_short_code: ref.short_code,
      p_visitor_id: getVisitorId(),
    });
    if (!error) {
      const status = (data as { status?: string } | null)?.status;
      // Clear on any resolved outcome — retrying won't change anything
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