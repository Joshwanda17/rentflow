import { supabase } from '@/integrations/supabase/client';

/**
 * Create or retrieve a short link for the given path + params.
 * Returns the full short URL like https://domain.com/r/X7kM2p
 */
export async function createShortLink(
  userId: string,
  targetPath: string,
  targetParams: Record<string, string>,
): Promise<string> {
  // Try to find existing
  const { data: existing } = await supabase
    .from('short_links')
    .select('code')
    .eq('user_id', userId)
    .eq('target_path', targetPath)
    .eq('target_params', targetParams as any)
    .maybeSingle();

  if (existing) {
    return `${window.location.origin}/r/${existing.code}`;
  }

  // Create new
  const { data: created, error } = await supabase
    .from('short_links')
    .insert({
      user_id: userId,
      target_path: targetPath,
      target_params: targetParams as any,
    })
    .select('code')
    .single();

  if (error) {
    // Race condition fallback
    const { data: retry } = await supabase
      .from('short_links')
      .select('code')
      .eq('user_id', userId)
      .eq('target_path', targetPath)
      .eq('target_params', targetParams as any)
      .maybeSingle();
    if (retry) return `${window.location.origin}/r/${retry.code}`;
    throw error;
  }

  return `${window.location.origin}/r/${created.code}`;
}
