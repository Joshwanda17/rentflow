import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Mail, RefreshCw, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface GmailTx {
  id: string;
  gmail_message_id: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  snippet: string | null;
  amount: number | null;
  transaction_id: string | null;
  tx_date: string | null;
  tx_time: string | null;
  parsed: boolean;
  internal_date: string | null;
  created_at: string;
}

interface PollState {
  last_polled_at: string | null;
  last_status: string | null;
  last_error: string | null;
}

const fmtUgx = (n: number | null) =>
  n === null || n === undefined ? '—' : `UGX ${Math.round(n).toLocaleString()}`;

export default function EmailTransactionsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<GmailTx[]>([]);
  const [state, setState] = useState<PollState | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);

  const load = async () => {
    const [{ data: txs }, { data: ps }] = await Promise.all([
      supabase
        .from('gmail_transactions')
        .select('*')
        .order('internal_date', { ascending: false, nullsFirst: false })
        .limit(200),
      supabase.from('gmail_poll_state').select('*').eq('id', 1).maybeSingle(),
    ]);
    setRows((txs as GmailTx[]) ?? []);
    setState((ps as PollState) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('gmail_transactions_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gmail_transactions' }, (payload) => {
        setRows((cur) => [payload.new as GmailTx, ...cur].slice(0, 200));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const pollNow = async () => {
    setPolling(true);
    const { data, error } = await supabase.functions.invoke('gmail-poll-transactions', { body: {} });
    setPolling(false);
    if (error) {
      toast({ title: 'Poll failed', description: error.message, variant: 'destructive' });
    } else {
      const inserted = (data as any)?.inserted ?? 0;
      const scanned = (data as any)?.scanned ?? 0;
      toast({ title: `Scanned ${scanned} emails`, description: `Imported ${inserted} new transaction${inserted === 1 ? '' : 's'}.` });
      await load();
    }
  };

  const parsedCount = rows.filter((r) => r.parsed).length;
  const totalAmount = rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/dashboard')} className="gap-2 text-sm text-muted-foreground hover:text-foreground -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2"><Mail className="h-6 w-6 text-primary" /> Email Transaction Extractor</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live feed from the connected Gmail inbox. Polls every minute and parses MoMo, Airtel & bank confirmation emails.
            </p>
          </div>
          <Button onClick={pollNow} disabled={polling} className="gap-2">
            {polling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Poll now
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Emails captured" value={rows.length.toString()} />
          <StatCard label="Parsed transactions" value={parsedCount.toString()} />
          <StatCard label="Total amount (parsed)" value={fmtUgx(totalAmount)} />
          <StatCard
            label="Last poll"
            value={state?.last_polled_at ? format(new Date(state.last_polled_at), 'HH:mm:ss') : '—'}
            sub={state?.last_status === 'error' ? (
              <span className="inline-flex items-center gap-1 text-destructive text-xs"><AlertCircle className="h-3 w-3" /> {state.last_error?.slice(0, 60)}</span>
            ) : state?.last_status === 'ok' ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 className="h-3 w-3" /> ok</span>
            ) : null}
          />
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-sm">Recent emails</h2>
          </div>
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground space-y-2">
              <Mail className="h-8 w-8 mx-auto opacity-30" />
              <p>No transaction emails captured yet.</p>
              <p className="text-xs">Click <strong>Poll now</strong> to fetch from Gmail, or wait for the next minute.</p>
            </div>
          ) : (
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {rows.map((r) => (
                <div key={r.id} className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{r.from_name || r.from_email || 'Unknown'}</span>
                        {r.parsed ? (
                          <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/20">parsed</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">unparsed</Badge>
                        )}
                        {r.transaction_id && <Badge variant="outline" className="text-[10px] font-mono">{r.transaction_id}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{r.subject || '(no subject)'}</p>
                      <p className="text-xs text-muted-foreground/80 line-clamp-2 mt-1">{r.snippet}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-mono font-semibold text-sm ${r.amount ? 'text-emerald-600' : 'text-muted-foreground'}`}>{fmtUgx(r.amount)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {r.internal_date ? format(new Date(r.internal_date), 'MMM d, HH:mm') : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="font-black text-lg mt-1">{value}</p>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}