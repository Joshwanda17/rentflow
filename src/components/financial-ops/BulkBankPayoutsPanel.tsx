import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface BulkEmail {
  id: string;
  subject: string | null;
  amount: number | null;
  bulk_payout_allocated_total: number | null;
  bulk_payout_settled_at: string | null;
  internal_date: string | null;
  transaction_id: string | null;
}
interface Allocation {
  id: string;
  gmail_transaction_id: string;
  withdrawal_request_id: string;
  partner_id: string;
  proxy_agent_id: string;
  allocated_amount: number;
  status: string;
  error_message: string | null;
  created_at: string;
  partner_name?: string;
  proxy_name?: string;
}

const ugx = (n: number | null | undefined) =>
  `UGX ${Math.round(Number(n || 0)).toLocaleString()}`;

export function BulkBankPayoutsPanel() {
  const [emails, setEmails] = useState<BulkEmail[]>([]);
  const [allocs, setAllocs] = useState<Record<string, Allocation[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [reversing, setReversing] = useState<Record<string, boolean>>({});

  const load = async () => {
    const { data: rows } = await (supabase.from('gmail_transactions') as any)
      .select('id, subject, amount, bulk_payout_allocated_total, bulk_payout_settled_at, internal_date, transaction_id')
      .eq('is_bulk_bank_payout', true)
      .order('internal_date', { ascending: false })
      .limit(50);
    setEmails(rows || []);

    if (rows && rows.length) {
      const ids = rows.map((r: any) => r.id);
      const { data: a } = await (supabase.from('bulk_bank_payout_allocations') as any)
        .select('*')
        .in('gmail_transaction_id', ids);
      const partnerIds = Array.from(new Set((a || []).map((x: any) => x.partner_id).concat((a || []).map((x: any) => x.proxy_agent_id))));
      const { data: profs } = await (supabase.from('profiles') as any)
        .select('id, full_name, phone')
        .in('id', partnerIds);
      const pmap: Record<string, any> = {};
      (profs || []).forEach((p: any) => { pmap[p.id] = p; });
      const grouped: Record<string, Allocation[]> = {};
      (a || []).forEach((row: any) => {
        const enriched: Allocation = {
          ...row,
          partner_name: pmap[row.partner_id]?.full_name || pmap[row.partner_id]?.phone || row.partner_id.slice(0, 8),
          proxy_name: pmap[row.proxy_agent_id]?.full_name || pmap[row.proxy_agent_id]?.phone || row.proxy_agent_id.slice(0, 8),
        };
        (grouped[row.gmail_transaction_id] ||= []).push(enriched);
      });
      setAllocs(grouped);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('bulk_bank_payout_allocs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bulk_bank_payout_allocations' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Loading bulk bank payouts…</div>;
  if (!emails.length) return null;

  const handleReverse = async (withdrawalId: string) => {
    const reason = window.prompt('Reason for reversal (min 10 chars):', '')?.trim();
    if (!reason || reason.length < 10) {
      toast.error('Reason must be at least 10 characters');
      return;
    }
    setReversing((p) => ({ ...p, [withdrawalId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('reverse-auto-routed-withdrawal', {
        body: { withdrawal_id: withdrawalId, reason },
      });
      if (error) throw error;
      if ((data as any)?.already_reversed) {
        toast.info('Already reversed');
      } else {
        toast.success('Reversal posted — proxy wallet refunded');
      }
      await load();
    } catch (e: any) {
      toast.error(`Reversal failed: ${e?.message || 'unknown error'}`);
    } finally {
      setReversing((p) => ({ ...p, [withdrawalId]: false }));
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-foreground">SKYBUBBLES Bulk Bank Payouts</h3>
        <span className="text-xs text-muted-foreground">{emails.length} email(s)</span>
      </div>
      <div className="space-y-2">
        {emails.map((e) => {
          const list = allocs[e.id] || [];
          const total = Number(e.amount || 0);
          const allocated = Number(e.bulk_payout_allocated_total || 0);
          const remaining = Math.max(0, total - allocated);
          const isOpen = open[e.id];
          return (
            <div key={e.id} className="rounded border border-border">
              <button
                type="button"
                onClick={() => setOpen((p) => ({ ...p, [e.id]: !p[e.id] }))}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/40 text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{e.subject || '(no subject)'}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.transaction_id || '—'} · {e.internal_date ? new Date(e.internal_date).toLocaleString() : '—'}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">{ugx(total)}</div>
                  <div className="text-xs">
                    <span className="text-emerald-600">{ugx(allocated)} allocated</span>
                    {' · '}
                    <span className={remaining > 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                      {ugx(remaining)} remaining
                    </span>
                  </div>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-border bg-muted/20 px-3 py-2">
                  {list.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2">No partner withdrawals settled by this email yet.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b border-border">
                            <th className="py-1 pr-3">Partner</th>
                            <th className="py-1 pr-3">Proxy Agent (debited)</th>
                            <th className="py-1 pr-3 text-right">Amount</th>
                            <th className="py-1 pr-3">Status</th>
                            <th className="py-1 pr-3">Withdrawal</th>
                            <th className="py-1 pr-3">When</th>
                            <th className="py-1 pr-3">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((a) => (
                            <tr key={a.id} className="border-b border-border/50">
                              <td className="py-1 pr-3">{a.partner_name}</td>
                              <td className="py-1 pr-3">{a.proxy_name}</td>
                              <td className="py-1 pr-3 text-right font-medium">{ugx(a.allocated_amount)}</td>
                              <td className="py-1 pr-3">
                                <span className={
                                  a.status === 'settled'
                                    ? 'text-emerald-600'
                                    : a.status === 'reversed'
                                      ? 'text-amber-600'
                                      : 'text-destructive'
                                }>
                                  {a.status}
                                  {a.error_message ? ` — ${a.error_message}` : ''}
                                </span>
                              </td>
                              <td className="py-1 pr-3 font-mono">{a.withdrawal_request_id.slice(0, 8)}</td>
                              <td className="py-1 pr-3">{new Date(a.created_at).toLocaleString()}</td>
                              <td className="py-1 pr-3">
                                {a.status === 'settled' ? (
                                  <button
                                    type="button"
                                    disabled={!!reversing[a.withdrawal_request_id]}
                                    onClick={() => handleReverse(a.withdrawal_request_id)}
                                    className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted disabled:opacity-50"
                                  >
                                    {reversing[a.withdrawal_request_id] ? 'Reversing…' : 'Reverse'}
                                  </button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}