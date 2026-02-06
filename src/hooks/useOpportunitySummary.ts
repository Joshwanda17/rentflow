import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OpportunitySummary {
  id: string;
  total_rent_requested: number;
  total_requests: number;
  total_landlords: number;
  total_agents: number;
  notes: string | null;
  posted_by: string;
  created_at: string;
  updated_at: string;
}

export function useOpportunitySummary() {
  const [summary, setSummary] = useState<OpportunitySummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLatest = async () => {
    try {
      const { data, error } = await supabase
        .from('opportunity_summaries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setSummary(data);
    } catch (e) {
      console.error('Failed to fetch opportunity summary:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatest();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('opportunity_summaries_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'opportunity_summaries',
        },
        () => {
          fetchLatest();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { summary, loading, refetch: fetchLatest };
}
