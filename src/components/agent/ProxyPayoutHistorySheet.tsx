import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/hooks/useCurrency';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { History, ArrowUpRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SettlementRow {
  id: string;
  approval_id: string;
  withdrawal_id: string | null;
  partner_id: string;
  amount_settled: number;
  settled_at: string;
  notes: string | null;
  partner_name?: string;
  partner_phone?: string;
  reference?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProxyPayoutHistorySheet({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !user?.id) return;
    void load();
    // Refresh when a new settlement lands for this agent
    const ch = supabase
      .channel(`proxy-payout-history-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'proxy_payout_settlements',
          filter: `agent_id=eq.${user.id}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: settlements, error } = await supabase
        .from('proxy_payout_settlements')
        .select('id, approval_id, withdrawal_id, partner_id, amount_settled, settled_at, notes')
        .eq('agent_id', user.id)
        .order('settled_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      const partnerIds = Array.from(new Set((settlements || []).map((r: any) => r.partner_id)));
      const wrIds = Array.from(
        new Set((settlements || []).map((r: any) => r.withdrawal_id).filter(Boolean)),
      ) as string[];

      const [{ data: profiles }, { data: wrs }] = await Promise.all([
        partnerIds.length
          ? supabase.from('profiles').select('id, full_name, phone').in('id', partnerIds)
          : Promise.resolve({ data: [] as any[] }),
        wrIds.length
          ? supabase
              .from('withdrawal_requests')
              .select('id, fin_ops_reference, payout_reference')
              .in('id', wrIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const wrMap = new Map((wrs || []).map((w: any) => [w.id, w]));

      const enriched: SettlementRow[] = (settlements || []).map((s: any) => {
        const p = profileMap.get(s.partner_id);
        const w = s.withdrawal_id ? wrMap.get(s.withdrawal_id) : null;
        return {
          ...s,
          partner_name: p?.full_name || 'Partner',
          partner_phone: p?.phone || '',
          reference: w?.fin_ops_reference || w?.payout_reference || null,
        };
      });
      setRows(enriched);
    } catch (err: any) {
      console.error('[ProxyPayoutHistory] load error:', err);
      toast.error('Failed to load history', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const totalSettled = rows.reduce((s, r) => s + Number(r.amount_settled || 0), 0);

  const downloadCsv = () => {
    const headers = ['Date', 'Partner', 'Phone', 'Amount (UGX)', 'Reference', 'Withdrawal ID'];
    const esc = (v: any) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    rows.forEach((r) => {
      lines.push([
        format(new Date(r.settled_at), 'yyyy-MM-dd HH:mm'),
        r.partner_name,
        r.partner_phone,
        Number(r.amount_settled || 0),
        r.reference || '',
        r.withdrawal_id || '',
      ].map(esc).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proxy-payout-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${rows.length} settlement${rows.length === 1 ? '' : 's'}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] rounded-t-2xl p-0 flex flex-col">
        <SheetHeader className="p-4 pb-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5 text-emerald-500" />
            Proxy Payout History
          </SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-2 p-4 pb-2">
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Total settled</p>
            <p className="text-base font-bold tabular-nums">{formatAmount(totalSettled)}</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Settlements</p>
            <p className="text-base font-bold tabular-nums">{rows.length}</p>
          </div>
        </div>

        <div className="px-4 pb-2 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={downloadCsv}
            disabled={rows.length === 0}
          >
            <Download className="h-3 w-3" />
            Download CSV
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 pt-2 space-y-2 pb-8">
            {loading ? (
              [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
            ) : rows.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No proxy payouts settled yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Once a partner withdrawal is paid from the bulk bank batch,
                  the matching debit from your wallet will appear here.
                </p>
              </div>
            ) : (
              rows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <ArrowUpRight className="h-4 w-4 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        Settled for {r.partner_name}
                      </p>
                      <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
                        Wallet debit
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.reference ? `${r.reference} • ` : ''}
                      {format(new Date(r.settled_at), 'MMM d, yyyy HH:mm')}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-destructive">
                    -{formatAmount(Number(r.amount_settled || 0))}
                  </p>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}