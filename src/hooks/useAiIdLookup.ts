import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { AiIdSummary } from '@/lib/welileAiId';
import { generateWelileAiId } from '@/lib/welileAiId';

const CACHE_KEY = 'welile_my_ai_summary';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

interface CachedSummary {
  data: AiIdSummary;
  cachedAt: number;
}

/** Get own AI ID summary — cached with 10-min TTL */
export function useMyAiSummary() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<AiIdSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Try cache first
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached: CachedSummary = JSON.parse(raw);
        if (Date.now() - cached.cachedAt < CACHE_TTL) {
          setSummary(cached.data);
          return;
        }
      }
    } catch {}

    // Fetch from DB (single aggregated read)
    setLoading(true);
    supabase.rpc('get_my_ai_id_summary').then(({ data, error }) => {
      if (!error && data) {
        const summary = data as unknown as AiIdSummary;
        setSummary(summary);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data: summary, cachedAt: Date.now() }));
        } catch {}
      } else {
        // Fallback: generate AI ID client-side
        setSummary({
          ai_id: generateWelileAiId(user.id),
          total_rent_facilitated: 0,
          total_rent_requests: 0,
          funded_requests: 0,
          risk_level: 'new',
          risk_score: 50,
          on_time_payment_rate: 0,
          estimated_borrowing_limit: 0,
          wallet_balance: 0,
          referral_count: 0,
          member_since: new Date().toISOString(),
          last_refreshed_at: new Date().toISOString(),
          can_lend: false,
        });
      }
      setLoading(false);
    });
  }, [user]);

  return { summary, loading };
}

/** Look up another user's AI ID — single read, no polling */
export function useAiIdLookup() {
  const [result, setResult] = useState<AiIdSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (aiId: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    const { data, error: rpcError } = await supabase.rpc('lookup_ai_id', { p_ai_id: aiId.trim().toUpperCase() });
    
    if (rpcError) {
      setError('Failed to look up AI ID');
      setLoading(false);
      return;
    }

    const parsed = data as unknown as AiIdSummary & { error?: string };
    if (parsed?.error) {
      setError(parsed.error === 'AI ID not found' ? 'No user found with this Welile AI ID' : parsed.error);
    } else {
      setResult(parsed);
    }
    setLoading(false);
  }, []);

  return { result, loading, error, lookup };
}
