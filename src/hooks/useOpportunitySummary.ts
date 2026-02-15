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

  const fetchSummary = async () => {
    try {
      const { data, error } = await supabase
        .from('opportunity_summaries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setSummary(data as OpportunitySummary | null);
    } catch (err) {
      console.error('Failed to fetch opportunity summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();

    // Listen for realtime updates
    const channel = supabase
      .channel('opportunity_summaries_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'opportunity_summaries',
      }, () => {
        fetchSummary();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { summary, loading, refetch: fetchSummary };
}
