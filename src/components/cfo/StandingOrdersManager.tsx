import * as React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { describeSchedule, type PayoutScheduleConfig } from './PayoutAutomationToggle';
import { Pause, Play, Trash2, RefreshCw, CalendarClock, Loader2 } from 'lucide-react';
import { logStandingOrderAction } from '@/lib/standingOrderAudit';
import { AutoPayoutHistory } from './AutoPayoutHistory';
import { StandingOrderProfileSheet } from './StandingOrderProfileSheet';

interface StandingOrder {
  id: string;
  target_user_id: string;
  amount: number;
  reason: string;
  frequency: PayoutScheduleConfig['frequency'];
  day_of_month: number | null;
  day_of_week: number | null;
  interval_days: number | null;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at?: string | null;
  recipient_name?: string | null;
}

function toConfig(o: StandingOrder): PayoutScheduleConfig {
  return {
    frequency: o.frequency,
    dayOfMonth: o.day_of_month ?? 1,
    dayOfWeek: o.day_of_week ?? 1,
    intervalDays: o.interval_days ?? 7,
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function StandingOrdersManager() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<StandingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [profileOrder, setProfileOrder] = useState<StandingOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('scheduled_payouts')
      .select('id, target_user_id, amount, reason, frequency, day_of_month, day_of_week, interval_days, enabled, next_run_at, last_run_at, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[StandingOrdersManager] load failed:', error);
      toast({ title: 'Could not load standing orders', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as StandingOrder[];
    const ids = Array.from(new Set(rows.map(r => r.target_user_id)));
    let nameMap: Record<string, string> = {};
    if (ids.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', ids);
      nameMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.full_name]));
    }
    setOrders(rows.map(r => ({ ...r, recipient_name: nameMap[r.target_user_id] })));
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const togglePause = async (o: StandingOrder) => {
    setBusyId(o.id);
    const next = !o.enabled;
    const { error } = await supabase
      .from('scheduled_payouts')
      .update({ enabled: next })
      .eq('id', o.id);
    setBusyId(null);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    setOrders(prev => prev.map(x => (x.id === o.id ? { ...x, enabled: next } : x)));
    await logStandingOrderAction({
      scheduledPayoutId: o.id,
      action: next ? 'resume' : 'pause',
      targetUserId: o.target_user_id,
      recipientName: o.recipient_name ?? null,
      amount: o.amount,
      reason: o.reason,
      scheduleDescription: describeSchedule(toConfig(o)),
    });
    toast({
      title: next ? '▶️ Standing order resumed' : '⏸️ Standing order paused',
      description: next ? 'Future payouts will run on schedule.' : 'No further payouts will run until you resume.',
    });
  };

  const cancelOrder = async (o: StandingOrder) => {
    setBusyId(o.id);
    const { error } = await supabase
      .from('scheduled_payouts')
      .delete()
      .eq('id', o.id);
    setBusyId(null);
    if (error) {
      toast({ title: 'Cancel failed', description: error.message, variant: 'destructive' });
      return;
    }
    setOrders(prev => prev.filter(x => x.id !== o.id));
    await logStandingOrderAction({
      scheduledPayoutId: o.id,
      action: 'cancel',
      targetUserId: o.target_user_id,
      recipientName: o.recipient_name ?? null,
      amount: o.amount,
      reason: o.reason,
      scheduleDescription: describeSchedule(toConfig(o)),
    });
    toast({ title: '🗑️ Standing order cancelled', description: 'This recurring payout was removed.' });
  };

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            Standing Orders ({orders.length})
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Pause, resume, or cancel recurring payouts. Changes only affect future runs.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : orders.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-4 text-center">No standing orders yet. Enable “Automate this payout” when paying out to create one.</p>
        ) : (
          orders.map(o => (
            <div key={o.id} className="rounded-lg border p-3 space-y-2 bg-muted/10">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setProfileOrder(o)}
                      className="text-sm font-semibold truncate text-primary underline-offset-2 hover:underline text-left"
                    >
                      {o.recipient_name || 'Unknown user'}
                    </button>
                    {o.enabled ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px]">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Paused</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{o.reason}</p>
                </div>
                <span className="text-sm font-bold whitespace-nowrap">UGX {Number(o.amount).toLocaleString()}</span>
              </div>

              <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" /> {describeSchedule(toConfig(o))}
                </span>
                <span>Next: {o.enabled ? formatDate(o.next_run_at) : 'Paused'}</span>
                <span>Last: {formatDate(o.last_run_at)}</span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs flex-1"
                  disabled={busyId === o.id}
                  onClick={() => togglePause(o)}
                >
                  {busyId === o.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : o.enabled ? (
                    <><Pause className="h-3.5 w-3.5 mr-1" /> Pause</>
                  ) : (
                    <><Play className="h-3.5 w-3.5 mr-1" /> Resume</>
                  )}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" disabled={busyId === o.id}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Cancel
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel this standing order?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently removes the recurring payout of{' '}
                        <strong>UGX {Number(o.amount).toLocaleString()}</strong> to{' '}
                        <strong>{o.recipient_name || 'this user'}</strong> ({describeSchedule(toConfig(o))}).
                        Past payouts are unaffected. To stop temporarily, use Pause instead.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep it</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => cancelOrder(o)}
                      >
                        Cancel standing order
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
    <AutoPayoutHistory />
    <StandingOrderProfileSheet
      open={!!profileOrder}
      onClose={() => setProfileOrder(null)}
      scheduledPayoutId={profileOrder?.id ?? null}
      targetUserId={profileOrder?.target_user_id ?? null}
      recipientName={profileOrder?.recipient_name ?? null}
      createdAt={profileOrder?.created_at ?? null}
      schedule={profileOrder ? describeSchedule(toConfig(profileOrder)) : null}
      amount={profileOrder?.amount ?? null}
    />
    </div>
  );
}