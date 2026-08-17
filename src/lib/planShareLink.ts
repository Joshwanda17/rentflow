import { supabase } from '@/integrations/supabase/client';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { formatDynamic } from '@/lib/currencyFormat';

export const SHARE_ROI_RATE = 15;

export interface SharePlanInput {
  rent_request_id: string;
  funding_amount: number;
  house_category?: string | null;
  request_city?: string | null;
  tenant_location?: string | null;
}

const pretty = (raw?: string | null) =>
  (raw ?? '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/** "Single Room" — the house title used in the share metadata. */
export function planHouseTitle(plan: SharePlanInput): string {
  return pretty(plan.house_category) || 'Rental Home';
}

/** Full readable location, falling back to the district then Uganda. */
export function planLocation(plan: SharePlanInput): string {
  const parts = (plan.tenant_location || plan.request_city || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? `${parts.join(', ')}, Uganda` : 'Uganda';
}

export function planShareTitle(plan: SharePlanInput): string {
  return `Support a tenant in a ${planHouseTitle(plan)} in ${planLocation(plan)}`;
}

export function planShareDescription(plan: SharePlanInput): string {
  const rent = Number(plan.funding_amount || 0);
  const monthly = Math.round((rent * SHARE_ROI_RATE) / 100);
  return `Support this tenant for ${formatDynamic(rent)} by paying their landlord on the platform and earn ${formatDynamic(
    monthly,
  )} per month for the next 12 months Start here today welileapp.com.`;
}

/**
 * Share host for plan links. Set to "https://s.welileapp.com" once the
 * Cloudflare Worker in infra/share-proxy/ is deployed and the CNAME is live.
 * While empty, links fall back to the SPA route (works, but WhatsApp/Facebook
 * crawlers only see the generic Welile OG image because the SPA cannot emit
 * dynamic server-side HTML).
 */
export const SHARE_LINK_HOST = '';

/**
 * Create (or reuse) a trackable short link for a fundable rent plan.
 *
 * Returns the branded, click-counted link for the code:
 * - `shortUrl`  https://s.welileapp.com/s/<code> when SHARE_LINK_HOST is set,
 *   proxied to the `og-plan` edge function so crawlers receive the house photo.
 * - `shareUrl`  alias of `shortUrl`, kept so callers stay unchanged. The raw
 *   `og-plan` function URL is never shared (it exposes the backend host).
 */
export async function createPlanShareLink(
  userId: string,
  planId: string,
): Promise<{ code: string; shortUrl: string; shareUrl: string }> {
  const targetPath = '/funder-onboarding';
  const targetParams = { plan: planId, ref: userId } as Record<string, string>;
  const shareOrigin = SHARE_LINK_HOST || getPublicOrigin();
  const build = (code: string) => ({
    code,
    shortUrl: `${shareOrigin}/s/${code}`,
    shareUrl: `${shareOrigin}/s/${code}`,
  });

  const findExisting = async () => {
    const { data } = await supabase
      .from('short_links')
      .select('code, target_params')
      .eq('user_id', userId)
      .eq('target_path', targetPath)
      .contains('target_params', targetParams as any);
    const exact = (data ?? []).find((row: any) => {
      const stored = (row.target_params ?? {}) as Record<string, string>;
      const keys = new Set([...Object.keys(stored), ...Object.keys(targetParams)]);
      for (const k of keys) {
        if (String(stored[k] ?? '') !== String(targetParams[k] ?? '')) return false;
      }
      return true;
    });
    return exact?.code ?? null;
  };

  const existing = await findExisting();
  if (existing) return build(existing);

  const { data: created, error } = await supabase
    .from('short_links')
    .insert({ user_id: userId, target_path: targetPath, target_params: targetParams as any })
    .select('code')
    .single();

  if (!error && created) return build(created.code);

  const retry = await findExisting();
  if (retry) return build(retry);
  throw error ?? new Error('Failed to create share link');
}
