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
  return `Support this tenant's house for ${formatDynamic(rent)} on the platform to earn ${formatDynamic(
    monthly,
  )} per month. Support today.`;
}

/**
 * Create (or reuse) a trackable short link for a fundable rent plan.
 *
 * Returns both shapes for the same code:
 * - `shortUrl`  https://welileapp.com/s/<code> — in-app, click-counted route.
 * - `shareUrl`  the `og-plan` function URL, which serves Open Graph tags with
 *   the plan's house photo so WhatsApp/Facebook/X render a real preview image
 *   (a static SPA route cannot do that), records the same click, then forwards
 *   the visitor to the funder page.
 */
export async function createPlanShareLink(
  userId: string,
  planId: string,
): Promise<{ code: string; shortUrl: string; shareUrl: string }> {
  const targetPath = '/funder-onboarding';
  const targetParams = { plan: planId, ref: userId } as Record<string, string>;
  const origin = getPublicOrigin();
  const build = (code: string) => ({
    code,
    shortUrl: `${origin}/s/${code}`,
    shareUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/og-plan/${code}`,
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
