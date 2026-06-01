import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Banknote, Clock } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface CashSession {
  id: string;
  depositor_name: string | null;
  amount: number;
  pin: string;
  status: string;
  expires_at: string;
  created_at: string;
}

/**
 * Live panel shown on the agent dashboard. Whenever a user starts a
 * "cash with agent" deposit targeting THIS agent, a pending session lands
 * here in realtime with the 4-digit code displayed large. The agent reads
 * the code back to the depositor AFTER receiving the cash. RLS guarantees
 * only the targeted agent can read the code.
 */
export function AgentCashDepositCodesPanel() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('agent_cash_deposit_sessions')
      .select('id, depositor_name, amount, pin, status, expires_at, created_at')
      .eq('agent_id', user.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    setSessions((data ?? []) as CashSession[]);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  // Tick every 15s to drop expired sessions and refresh the countdown.
  useEffect(() => {
    const iv = window.setInterval(() => {
      setNow(Date.now());
      void load();
    }, 15_000);
    return () => window.clearInterval(iv);
  }, [load]);

  // Realtime: instantly surface / remove sessions for this agent.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`agent-cash-sessions-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agent_cash_deposit_sessions', filter: `agent_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, load]);

  const live = sessions.filter((s) => new Date(s.expires_at).getTime() > now);
  if (live.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Banknote className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold">Cash deposit codes</h3>
        <span className="text-xs text-muted-foreground">Read the code to the customer after you receive the cash</span>
      </div>
      {live.map((s) => {
        const minsLeft = Math.max(0, Math.round((new Date(s.expires_at).getTime() - now) / 60000));
        return (
          <Card key={s.id} className="border-emerald-500/40 bg-emerald-500/5">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.depositor_name || 'Welile user'}</p>
                <p className="text-xs text-muted-foreground">wants {formatUGX(s.amount)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> expires in {minsLeft} min
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Code</p>
                <p className="text-3xl font-bold tracking-[0.3em] tabular-nums text-emerald-700 dark:text-emerald-400">
                  {s.pin}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default AgentCashDepositCodesPanel;