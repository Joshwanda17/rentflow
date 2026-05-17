import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import BusinessAdvanceStatusTracker, { AdvanceStatusRow } from '@/components/business-advance/BusinessAdvanceStatusTracker';

const ACTIVE_STATUSES = ['pending','agent_ops_approved','tenant_ops_approved','landlord_ops_approved','coo_approved','active'] as const;

/**
 * Prominent banner on the tenant dashboard surfacing any in-flight or active
 * Business Advance. Shows the live multi-stage approval timeline at the top so
 * tenants always know exactly where their request stands.
 */
export function BusinessAdvanceStatusHero() {
  const { user } = useAuth();

  const { data, refetch } = useQuery({
    queryKey: ['tenant-active-business-advance', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_advances')
        .select('id,status,business_name,principal,outstanding_balance,reason,created_at,agent_ops_reviewed_at,tenant_ops_reviewed_at,landlord_ops_reviewed_at,coo_approved_at,cfo_disbursed_at,disbursed_at,completed_at,rejection_reason,agent_id')
        .eq('tenant_id', user!.id)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      let agentName: string | null = null;
      if (data.agent_id) {
        const { data: ap } = await supabase.from('profiles').select('full_name').eq('id', data.agent_id).maybeSingle();
        agentName = ap?.full_name ?? null;
      }
      return { ...data, agent_name: agentName } as AdvanceStatusRow & { agent_id: string };
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('tenant-business-advance-hero-' + user.id)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'business_advances', filter: `tenant_id=eq.${user.id}` },
        () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, refetch]);

  if (!data) return null;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-primary/5 shadow-md">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-primary">
          <Sparkles className="h-3 w-3" />
          {data.status === 'active' ? 'Your Business Advance is active' : 'Your Business Advance is being reviewed'}
        </div>
        <BusinessAdvanceStatusTracker row={data} compact />
      </CardContent>
    </Card>
  );
}

export default BusinessAdvanceStatusHero;
