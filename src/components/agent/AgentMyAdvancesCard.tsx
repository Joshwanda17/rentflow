import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Banknote, TrendingDown, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatUGX } from '@/lib/agentAdvanceCalculations';
import { differenceInDays } from 'date-fns';

const STATUS_META: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive'; icon: any }> = {
  active: { label: 'Active', variant: 'default', icon: Clock },
  overdue: { label: 'Overdue', variant: 'destructive', icon: AlertTriangle },
  completed: { label: 'Completed', variant: 'secondary', icon: CheckCircle2 },
};

/**
 * Agent-facing view of advances issued to THEM (the `agent_advances` table).
 * RLS already scopes selects to `agent_id = auth.uid()`, so agents see only
 * their own. Shows outstanding balance, daily deduction and days remaining so
 * the agent always knows what is being recovered from their wallet.
 */
export function AgentMyAdvancesCard() {
  const { user } = useAuth();

  const { data: advances = [], isLoading } = useQuery({
    queryKey: ['my-issued-advances', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_advances')
        .select('id, principal, outstanding_balance, status, issued_at, expires_at')
        .eq('agent_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Hide entirely when the agent has no advances at all.
  if (!isLoading && advances.length === 0) return null;

  const totalOutstanding = advances
    .filter((a: any) => a.status !== 'completed')
    .reduce((s: number, a: any) => s + Number(a.outstanding_balance || 0), 0);

  return (
    <Card className="border-border/60">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-primary/15 p-1.5">
              <Banknote className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold leading-none">My Advances</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Funds advanced to you</p>
            </div>
          </div>
          {totalOutstanding > 0 && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Outstanding</p>
              <p className="text-base font-black tabular-nums text-amber-600">{formatUGX(totalOutstanding)}</p>
            </div>
          )}
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground py-2">Loading your advances…</p>
        ) : (
          <div className="space-y-2">
            {advances.map((adv: any) => {
              const meta = STATUS_META[adv.status] || STATUS_META.active;
              const Icon = meta.icon;
              const daysLeft = Math.max(0, differenceInDays(new Date(adv.expires_at), new Date()));
              const interest = Math.max(0, Number(adv.outstanding_balance) - Number(adv.principal));
              const dailyDeduction = adv.status !== 'completed'
                ? (daysLeft > 0 ? Math.round(Number(adv.outstanding_balance) / daysLeft) : Number(adv.outstanding_balance))
                : 0;
              return (
                <div key={adv.id} className="rounded-xl bg-muted/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold tabular-nums">{formatUGX(adv.principal)}</span>
                    <Badge variant={meta.variant} className="gap-1 text-[10px]">
                      <Icon className="h-3 w-3" /> {meta.label}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Owed</p>
                      <p className="text-xs font-bold tabular-nums">{formatUGX(adv.outstanding_balance)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground flex items-center justify-center gap-0.5">
                        <TrendingDown className="h-2.5 w-2.5" /> Daily
                      </p>
                      <p className="text-xs font-bold tabular-nums text-red-500">
                        {adv.status === 'completed' ? '—' : formatUGX(dailyDeduction)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Days left</p>
                      <p className="text-xs font-bold tabular-nums">{adv.status === 'completed' ? '—' : `${daysLeft}d`}</p>
                    </div>
                  </div>
                  {interest > 0 && adv.status !== 'completed' && (
                    <p className="text-[10px] text-muted-foreground">
                      Includes {formatUGX(interest)} access fee
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AgentMyAdvancesCard;