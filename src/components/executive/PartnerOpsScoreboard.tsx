import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatUGX } from '@/lib/rentCalculations';

interface ScoreboardRow {
  lead_user_id: string;
  agents_attached: number;
  notes_pending: number;
  notes_approved: number;
  notes_rejected: number;
  override_total: number;
  target_value: number;
  attainment_pct: number;
  pace_pct: number;
  state: string;
}

const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const borderForState = (state: string) => {
  switch (state) {
    case 'on_track': return 'border-l-4 border-l-emerald-500';
    case 'amber': return 'border-l-4 border-l-amber-500';
    case 'red': return 'border-l-4 border-l-destructive';
    default: return 'border-l-4 border-l-muted';
  }
};

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="min-w-0">
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{label}</p>
    <p className="text-sm font-semibold text-foreground truncate">{value}</p>
  </div>
);

export function PartnerOpsScoreboard() {
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['partner-ops-scoreboard', monthStart()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('partner_ops_scoreboard', { p_month: monthStart() });
      if (error) throw error;
      const rows = (data || []) as ScoreboardRow[];
      const ids = Array.from(new Set(rows.map(r => r.lead_user_id).filter(Boolean)));
      const names: Record<string, string> = {};
      if (ids.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids);
        (profiles || []).forEach((p: { id: string; full_name: string | null }) => {
          if (p.full_name) names[p.id] = p.full_name;
        });
      }
      return { rows, names };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('partner-ops-scoreboard-notes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promissory_notes' }, () => {
        refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  const rows = data?.rows || [];

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading scoreboard…</p>;
  }
  if (!rows.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Lead scoreboard — this month</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.lead_user_id} className={cn('overflow-hidden', borderForState(r.state))}>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground truncate">
                {data?.names?.[r.lead_user_id] || r.lead_user_id}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Agents" value={Number(r.agents_attached || 0)} />
                <Stat label="Pending" value={Number(r.notes_pending || 0)} />
                <Stat label="Approved" value={Number(r.notes_approved || 0)} />
                <Stat label="Rejected" value={Number(r.notes_rejected || 0)} />
                <Stat label="Override" value={formatUGX(Number(r.override_total || 0))} />
                <Stat label="Target" value={formatUGX(Number(r.target_value || 0))} />
                <Stat label="Attainment" value={`${Number(r.attainment_pct || 0).toFixed(1)}%`} />
                <Stat label="Pace" value={`${Number(r.pace_pct || 0).toFixed(1)}%`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default PartnerOpsScoreboard;