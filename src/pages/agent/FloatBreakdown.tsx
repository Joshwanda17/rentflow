import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Wallet, Info, Calendar, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/hooks/useCurrency';
import { hapticTap } from '@/lib/haptics';

interface FloatRow {
  entry_id: string;
  occurred_at: string;
  category: string;
  direction: string;
  amount: number;
  signed_amount: number;
  running_balance: number;
  description: string | null;
  transaction_group_id: string | null;
  linked_party: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  agent_float_deposit: 'Float Deposit',
  agent_float_used_for_rent: 'Tenant Rent Allocation',
  agent_float_settlement: 'Float Settlement',
  rent_float_funding: 'Landlord Rent Funding',
  rent_payment_for_tenant: 'Tenant Rent Allocation',
  partner_funding: 'Partner Funding',
  wallet_deduction: 'Admin Float Correction',
  system_balance_correction: 'Admin Float Correction',
};

function labelFor(cat: string): string {
  return CATEGORY_LABEL[cat] ?? cat.replace(/_/g, ' ');
}

type Preset = 'all' | '7d' | '30d' | 'month' | 'custom';

function toInputDate(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export default function AgentFloatBreakdown() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();
  const [rows, setRows] = useState<FloatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      const { data, error } = await supabase.rpc('get_agent_float_breakdown', {
        p_user_id: user.id,
        p_limit: 500,
      });
      if (cancelled) return;
      if (error) setErr(error.message);
      else setRows((data ?? []) as FloatRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const currentFloat = rows[0]?.running_balance ?? 0;

  const filteredRows = useMemo(() => {
    if (!fromDate && !toDate) return rows;
    const fromMs = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : -Infinity;
    const toMs = toDate ? new Date(toDate + 'T23:59:59.999').getTime() : Infinity;
    return rows.filter((r) => {
      const t = new Date(r.occurred_at).getTime();
      return t >= fromMs && t <= toMs;
    });
  }, [rows, fromDate, toDate]);

  const totalIn = filteredRows.filter(r => r.signed_amount > 0).reduce((s, r) => s + Number(r.signed_amount), 0);
  const totalOut = filteredRows.filter(r => r.signed_amount < 0).reduce((s, r) => s + Number(r.signed_amount), 0);

  function applyPreset(p: Preset) {
    setPreset(p);
    const now = new Date();
    if (p === 'all') { setFromDate(''); setToDate(''); return; }
    if (p === '7d') {
      const from = new Date(now); from.setDate(from.getDate() - 6);
      setFromDate(toInputDate(from)); setToDate(toInputDate(now)); return;
    }
    if (p === '30d') {
      const from = new Date(now); from.setDate(from.getDate() - 29);
      setFromDate(toInputDate(from)); setToDate(toInputDate(now)); return;
    }
    if (p === 'month') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(toInputDate(from)); setToDate(toInputDate(now)); return;
    }
  }

  const presets: { key: Preset; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: 'month', label: 'This month' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => { hapticTap(); navigate(-1); }}
            className="p-2 -ml-2 rounded-lg hover:bg-muted active:scale-95"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-base font-bold">Float Breakdown</h1>
            <p className="text-xs text-muted-foreground">Every deposit and tenant allocation</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        {/* Summary card */}
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="h-4 w-4 text-blue-500" />
            <span className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">Current Float</span>
          </div>
          <p className="text-3xl font-black tracking-tight">{formatAmount(Number(currentFloat))}</p>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-xl bg-emerald-500/10 p-3">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <ArrowDownCircle className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase font-bold tracking-wider">Deposits In</span>
              </div>
              <p className="text-lg font-bold mt-1">{formatAmount(totalIn)}</p>
            </div>
            <div className="rounded-xl bg-rose-500/10 p-3">
              <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                <ArrowUpCircle className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase font-bold tracking-wider">Used / Out</span>
              </div>
              <p className="text-lg font-bold mt-1">{formatAmount(Math.abs(totalOut))}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 mt-3 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <p>
              Float is company money for tenant rent collection. It is never withdrawable as cash.
              {(fromDate || toDate) && ' Totals reflect the selected date range.'}
            </p>
          </div>
        </div>

        {/* Date range filter */}
        <div className="rounded-2xl border bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">Date Range</span>
            {(fromDate || toDate) && (
              <button
                onClick={() => { hapticTap(); applyPreset('all'); }}
                className="ml-auto text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {presets.map((p) => (
              <button
                key={p.key}
                onClick={() => { hapticTap(); applyPreset(p.key); }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  preset === p.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-border text-muted-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">From</span>
                <input
                  type="date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">To</span>
                <input
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          )}
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : err ? (
          <div className="py-12 text-center text-sm text-rose-500">{err}</div>
        ) : filteredRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? 'No float activity yet.' : 'No activity in this date range.'}
          </div>
        ) : (
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b bg-muted/30">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                Activity ({filteredRows.length}{filteredRows.length !== rows.length ? ` of ${rows.length}` : ''})
              </span>
            </div>
            <ul className="divide-y">
              {filteredRows.map((r) => {
                const isIn = r.signed_amount > 0;
                return (
                  <li key={r.entry_id} className="px-4 py-3 flex items-start gap-3">
                    <div className={`mt-0.5 p-1.5 rounded-full ${isIn ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'}`}>
                      {isIn ? <ArrowDownCircle className="h-3.5 w-3.5" /> : <ArrowUpCircle className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold truncate">{labelFor(r.category)}</p>
                        <p className={`text-sm font-bold tabular-nums whitespace-nowrap ${isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {isIn ? '+' : '−'}{formatAmount(Math.abs(Number(r.signed_amount)))}
                        </p>
                      </div>
                      {r.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{r.description}</p>
                      )}
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(r.occurred_at).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          Bal: {formatAmount(Number(r.running_balance))}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}