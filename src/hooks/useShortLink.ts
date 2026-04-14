import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface UseShortLinkOptions {
  targetPath: string;
  targetParams: Record<string, string>;
  enabled?: boolean;
}

export function useShortLink({ targetPath, targetParams, enabled = true }: UseShortLinkOptions) {
  const { user } = useAuth();

  const { data: shortUrl, isLoading } = useQuery({
    queryKey: ['short-link', user?.id, targetPath, JSON.stringify(targetParams)],
    queryFn: async () => {
      if (!user) return null;

      // Try to find existing
      const { data: existing } = await supabase
        .from('short_links')
        .select('code')
        .eq('user_id', user.id)
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
          user_id: user.id,
          target_path: targetPath,
          target_params: targetParams as any,
        })
        .select('code')
        .single();

      if (error) {
        // Race condition: another tab created it
        const { data: retry } = await supabase
          .from('short_links')
          .select('code')
          .eq('user_id', user.id)
          .eq('target_path', targetPath)
          .eq('target_params', targetParams as any)
          .maybeSingle();
        if (retry) return `${window.location.origin}/r/${retry.code}`;
        throw error;
      }

      return `${window.location.origin}/r/${created.code}`;
    },
    enabled: enabled && !!user,
    staleTime: Infinity,
  });

  return { shortUrl: shortUrl ?? '', isLoading };
}
