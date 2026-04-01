import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { OpportunitySummary } from '@/hooks/useOpportunitySummary';

export interface PortfolioRecord {
  id: string;
  investment_amount: number;
  total_roi_earned: number;
  roi_percentage: number;
  status: string;
}

export function useCapitalOpportunities() {
  const { user } = useAuth();
  const [portfolios, setPortfolios] = useState<PortfolioRecord[]>([]);
  const [opportunitySummary, setOpportunitySummary] = useState<OpportunitySummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }

    try {
      const [byInvestor, byAgent, summaryRes] = await Promise.all([
        supabase
          .from('investor_portfolios')
          .select('id, investment_amount, total_roi_earned, roi_percentage, status')
          .eq('investor_id', user.id)
          .in('status', ['active', 'pending', 'pending_approval'])
          .limit(100),
        supabase
          .from('investor_portfolios')
          .select('id, investment_amount, total_roi_earned, roi_percentage, status')
          .eq('agent_id', user.id)
          .is('investor_id', null)
          .in('status', ['active', 'pending', 'pending_approval'])
          .limit(100),
        supabase
          .from('opportunity_summaries')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      // Deduplicate portfolios by id
      const all = [
        ...(!byInvestor.error && byInvestor.data ? byInvestor.data : []),
        ...(!byAgent.error && byAgent.data ? byAgent.data : []),
      ];
      const seen = new Set<string>();
      const deduped = all.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      }) as PortfolioRecord[];

      setPortfolios(deduped);

      if (!summaryRes.error && summaryRes.data) {
        setOpportunitySummary(summaryRes.data as OpportunitySummary);
      }
    } catch (err) {
      console.error('[useCapitalOpportunities] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Event-driven refresh
  useEffect(() => {
    const handler = () => { fetchAll(); };
    window.addEventListener('supporter-contribution-changed', handler);
    return () => window.removeEventListener('supporter-contribution-changed', handler);
  }, [fetchAll]);

  const totalInvested = portfolios.reduce((s, p) => s + Number(p.investment_amount), 0);
  const portfolioCount = portfolios.length;

  return { portfolios, totalInvested, portfolioCount, opportunitySummary, loading, refetch: fetchAll };
}
