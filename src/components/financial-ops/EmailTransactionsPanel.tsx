import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, RefreshCw, Loader2, CheckCircle2, AlertCircle, Smartphone } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog';
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
  parsed: boolean;
  internal_date: string | null;
  direction: string | null;
  channel: string | null;
  counterparty: string | null;
  fee: number | null;
  balance: number | null;
}

interface PollState {
  last_polled_at: string | null;
  last_status: string | null;
  last_error: string | null;
}

const fmtUgx = (n: number | null) =>
  n === null || n === undefined ? '—' : `UGX ${Math.round(n).toLocaleString()}`;

/**
 * Live feed of transaction confirmation emails extracted from the
 * connected Gmail inbox. A background cron polls every minute; this
 * panel mirrors the table in real time and exposes a manual "Poll now".
 */
export function EmailTransactionsPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<GmailTx[]>([]);
  const [state, setState] = useState<PollState | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);

  const load = async () => {
    const [{ data: txs }, { data: ps }] = await Promise.all([
      supabase
        .from('gmail_transactions')
        .select('id,gmail_message_id,from_email,from_name,subject,snippet,amount,transaction_id,parsed,internal_date,direction,channel,counterparty,fee,balance')
        .order('internal_date', { ascending: false, nullsFirst: false })
        .limit(200),
      supabase.from('gmail_poll_state').select('last_polled_at,last_status,last_error').eq('id', 1).maybeSingle(),
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
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2.5">
            <Mail className="h-6 w-6 text-primary" /> Email Transaction Extractor
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Live feed from the connected Gmail inbox. Polls every minute and parses MoMo, Airtel & bank confirmation emails.
          </p>
        </div>
        <Button onClick={pollNow} disabled={polling} className="gap-2">
          {polling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Poll now
        </Button>
        <SmsSetupGuide />
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
          <h3 className="font-semibold text-sm">Recent emails</h3>
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
                      {r.channel && r.channel !== 'other' && (
                        <Badge variant="outline" className="text-[10px] capitalize">{r.channel.replace('_',' ')}</Badge>
                      )}
                      {r.direction && (
                        <Badge variant="outline" className={`text-[10px] capitalize ${
                          r.direction === 'in' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                          : r.direction === 'out' ? 'bg-rose-500/10 text-rose-700 border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                        }`}>{r.direction === 'in' ? 'received' : r.direction === 'out' ? 'sent' : 'charge'}</Badge>
                      )}
                      {r.transaction_id && <Badge variant="outline" className="text-[10px] font-mono">{r.transaction_id}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{r.subject || '(no subject)'}</p>
                    {(r.counterparty || r.fee || r.balance !== null) && (
                      <p className="text-[11px] text-muted-foreground/80 mt-0.5 flex flex-wrap gap-x-3">
                        {r.counterparty && <span>↔ <strong className="text-foreground/80">{r.counterparty}</strong></span>}
                        {r.fee ? <span>fee {fmtUgx(r.fee)}</span> : null}
                        {r.balance !== null && r.balance !== undefined ? <span>bal {fmtUgx(r.balance)}</span> : null}
                      </p>
                    )}
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

function SmsSetupGuide() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Smartphone className="h-4 w-4" /> SMS → Gmail setup
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Auto-forward SMS to Gmail</DialogTitle>
          <DialogDescription>
            One-time phone setup. After this, every incoming SMS is forwarded to the connected Gmail and appears here within 1 minute.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold mb-1">Android (recommended)</p>
            <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
              <li>Install <strong>SMS Forwarder</strong> by Hannes Petri (free, open-source) from the Play Store.</li>
              <li>Open the app → tap <strong>Add rule</strong>.</li>
              <li>Sender filter: leave blank, or restrict to shortcodes like <code className="text-xs">MTNMoMo</code>, <code className="text-xs">Airtel</code>, <code className="text-xs">Stanbic</code>.</li>
              <li>Action: <strong>Email</strong>. Set the recipient to the Gmail address connected to Welile.</li>
              <li>Subject: <code className="text-xs">SMS from {'{sender}'}</code> &nbsp;|&nbsp; Body: <code className="text-xs">{'{content}'}</code></li>
              <li>Grant SMS permission and disable battery optimisation for the app.</li>
              <li>Send a test SMS to confirm it lands in Gmail and appears in this feed.</li>
            </ol>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3 text-xs">
            <p className="font-semibold mb-1">iPhone</p>
            <p className="text-muted-foreground">iOS does not allow apps to read SMS, so true auto-forwarding isn't possible. Use a dedicated Android device for the SIM, or route the SIM through a GSM gateway.</p>
          </div>
          <p className="text-xs text-muted-foreground">
            The poller already matches subjects starting with <code>SMS from…</code> and emails from any sender containing <code>smsforwarder</code>.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}