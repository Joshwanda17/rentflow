import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, ShieldCheck, RefreshCw, Sparkles, Send, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinOpsAutoRefresh } from '@/hooks/useFinOpsAutoRefresh';
import { format } from 'date-fns';
import { normalizeUgPhone, extractToPhones } from './emailExtraction';

/**
 * Auto-detects PAYOUT confirmations in the connected inbox (money-out
 * emails from MTN MoMo / Airtel Money / banks) and pairs each one with
 * a pending withdrawal_request whose recipient phone + amount line up.
 * Exact matches are auto-approved via the `approve-withdrawal` edge
 * function using the email's Transaction ID as the FinOps reference.
 *
 * Safe-by-default: we only auto-approve when (1) the email is outgoing,
 * (2) the recipient phone in the email matches the withdrawal's
 * `mobile_money_number`, (3) the email amount equals the withdrawal
 * amount (no tolerance), and (4) the email's TID has not already been
 * used on any completed/processing/paid withdrawal.
 */

const fmtUgx = (n: number) => `UGX ${Math.round(n).toLocaleString()}`;

interface PendingWithdrawal {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  mobile_money_number: string | null;
  mobile_money_provider: string | null;
  payout_method: string | null;
  created_at: string;
}

interface OutEmail {
  id: string;
  amount: number | null;
  transaction_id: string | null;
  channel: string | null;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  snippet: string | null;
  counterparty: string | null;
  internal_date: string | null;
  toPhones: string[];
}

interface PayoutMatch {
  withdrawal: PendingWithdrawal;
  email: OutEmail;
  recipientPhone: string;
  payment_method: string;
}

function inferPaymentMethod(w: PendingWithdrawal, e: OutEmail): string {
  const explicit = (w.payout_method || w.mobile_money_provider || '').toLowerCase();
  if (explicit === 'mtn_momo' || explicit === 'airtel_money' || explicit === 'bank_transfer' || explicit === 'cash') {
    return explicit;
  }
  const hay = `${e.channel ?? ''} ${e.from_email ?? ''} ${e.from_name ?? ''}`.toLowerCase();
  if (hay.includes('mtn')) return 'mtn_momo';
  if (hay.includes('airtel')) return 'airtel_money';
  if (/bank|equity|stanbic|dfcu|centenary|absa/.test(hay)) return 'bank_transfer';
  return 'mtn_momo';
}

export function EmailPayoutAutoMatchPanel() {
  const { toast } = useToast();
  const autoRefresh = useFinOpsAutoRefresh();
  const [matches, setMatches] = useState<PayoutMatch[]>([]);
  const [running, setRunning] = useState(false);
  const [autoApproving, setAutoApproving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [autoApprovedCount, setAutoApprovedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const autoApprovedRef = useRef<Set<string>>(new Set()); // withdrawal ids already attempted
  const runningRef = useRef(false);

  /** Pull (a) pending withdrawals and (b) recent outgoing emails, then pair. */
  const scan = useCallback(async (): Promise<PayoutMatch[]> => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [wRes, eRes] = await Promise.all([
      supabase
        .from('withdrawal_requests')
        .select('id,user_id,amount,status,mobile_money_number,mobile_money_provider,payout_method,created_at')
        .in('status', ['pending', 'requested', 'manager_approved', 'cfo_approved', 'fin_ops_approved'])
        .not('mobile_money_number', 'is', null)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .limit(200),
      supabase
        .from('gmail_transactions')
        .select('id,amount,transaction_id,channel,from_email,from_name,subject,snippet,counterparty,internal_date,direction')
        .eq('direction', 'out')
        .not('transaction_id', 'is', null)
        .gte('internal_date', sevenDaysAgo)
        .order('internal_date', { ascending: false })
        .limit(500),
    ]);
    if (wRes.error) throw wRes.error;
    if (eRes.error) throw eRes.error;

    const withdrawals = (wRes.data ?? []) as PendingWithdrawal[];
    const emails: OutEmail[] = (eRes.data ?? [])
      .map((r: any) => ({
        id: r.id,
        amount: r.amount == null ? null : Number(r.amount),
        transaction_id: r.transaction_id,
        channel: r.channel,
        from_email: r.from_email,
        from_name: r.from_name,
        subject: r.subject,
        snippet: r.snippet,
        counterparty: r.counterparty,
        internal_date: r.internal_date,
        toPhones: extractToPhones(r),
      }))
      .filter((e) => e.transaction_id && e.amount && e.toPhones.length > 0);

    // Exclude TIDs already burned on a settled withdrawal (prevents
    // re-using the same physical payment on a second request).
    const candidateTids = Array.from(new Set(emails.map((e) => e.transaction_id!.trim().toUpperCase())));
    const burnedTids = new Set<string>();
    if (candidateTids.length > 0) {
      const { data: usedRows } = await supabase
        .from('withdrawal_requests')
        .select('fin_ops_reference')
        .in('status', ['completed', 'processing', 'paid', 'disbursed'])
        .in('fin_ops_reference', candidateTids);
      (usedRows ?? []).forEach((r: any) => {
        if (r.fin_ops_reference) burnedTids.add(String(r.fin_ops_reference).trim().toUpperCase());
      });
    }

    const out: PayoutMatch[] = [];
    const usedEmailIds = new Set<string>();
    for (const w of withdrawals) {
      const target = normalizeUgPhone(w.mobile_money_number || '');
      if (!target) continue;
      const wAmt = Math.round(Number(w.amount));
      const hit = emails.find(
        (e) =>
          !usedEmailIds.has(e.id) &&
          !burnedTids.has((e.transaction_id || '').trim().toUpperCase()) &&
          Math.round(Number(e.amount)) === wAmt &&
          e.toPhones.includes(target),
      );
      if (hit) {
        usedEmailIds.add(hit.id);
        out.push({
          withdrawal: w,
          email: hit,
          recipientPhone: target,
          payment_method: inferPaymentMethod(w, hit),
        });
      }
    }
    return out;
  }, []);

  const approveOne = useCallback(
    async (m: PayoutMatch): Promise<{ ok: boolean; error?: string }> => {
      try {
        const { data, error: invErr } = await supabase.functions.invoke('approve-withdrawal', {
          body: {
            withdrawal_id: m.withdrawal.id,
            reference: (m.email.transaction_id || '').trim().toUpperCase(),
            payment_method: m.payment_method,
          },
        });
        if (invErr) {
          const msg = (data as any)?.error || (data as any)?.message || invErr.message || 'Approve failed';
          return { ok: false, error: msg };
        }
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Approve failed' };
      }
    },
    [],
  );

  const runScan = useCallback(
    async (silent = false) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setRunning(true);
      setError(null);
      try {
        const found = await scan();

        // Auto-approve every fresh match in this scan that we haven't
        // already attempted in this session.
        const fresh = found.filter((m) => !autoApprovedRef.current.has(m.withdrawal.id));
        let approved = 0;
        const failures: PayoutMatch[] = [];
        if (fresh.length > 0) {
          setAutoApproving(true);
          for (const m of fresh) {
            autoApprovedRef.current.add(m.withdrawal.id);
            // eslint-disable-next-line no-await-in-loop
            const res = await approveOne(m);
            if (res.ok) approved += 1;
            else failures.push(m);
          }
          setAutoApproving(false);
        }

        setAutoApprovedCount((prev) => prev + approved);
        setMatches(failures); // Only show what still needs attention.
        setLastRunAt(new Date());

        if (!silent && approved > 0) {
          toast({
            title: `Auto-paid ${approved} withdrawal${approved === 1 ? '' : 's'}`,
            description: 'Matched outgoing MoMo confirmation emails to pending payouts and approved them.',
          });
        }
        if (!silent && failures.length > 0) {
          toast({
            title: `${failures.length} match${failures.length === 1 ? '' : 'es'} need review`,
            description: 'A matched email could not be auto-approved — see below.',
            variant: 'destructive',
          });
        }
        if (!silent && approved === 0 && failures.length === 0) {
          toast({ title: 'No new payout matches' });
        }
      } catch (e: any) {
        console.warn('[email-payout-match] failed', e);
        setError(e?.message ?? 'Scan failed');
        if (!silent) {
          toast({ title: 'Payout auto-match failed', description: e?.message ?? 'Unknown error', variant: 'destructive' });
        }
      } finally {
        setRunning(false);
        runningRef.current = false;
      }
    },
    [approveOne, scan, toast],
  );

  // Initial run + auto-rescan every 30s while the panel is mounted.
  useEffect(() => {
    runScan(true);
    if (!autoRefresh) return;
    const id = setInterval(() => runScan(true), 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, runScan]);

  const retryOne = useCallback(
    async (m: PayoutMatch) => {
      setApprovingId(m.withdrawal.id);
      const res = await approveOne(m);
      setApprovingId(null);
      if (res.ok) {
        setMatches((prev) => prev.filter((x) => x.withdrawal.id !== m.withdrawal.id));
        setAutoApprovedCount((c) => c + 1);
        toast({ title: 'Withdrawal approved', description: fmtUgx(m.withdrawal.amount) });
      } else {
        toast({ title: 'Approve failed', description: res.error ?? 'Unknown error', variant: 'destructive' });
      }
    },
    [approveOne, toast],
  );

  const headerRight = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => runScan(false)} disabled={running} className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Rescan
        </Button>
      </div>
    ),
    [runScan, running],
  );

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="p-4 border-b bg-gradient-to-r from-emerald-500/5 to-transparent flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm sm:text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            Auto-approve payouts from outgoing emails
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pairs pending withdrawals with parsed MoMo/Airtel/bank payout confirmations using recipient phone + exact amount.
            Approves automatically using the email's Transaction ID as the FinOps reference.
          </p>
          {lastRunAt && (
            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
              <span>Last scan: {format(lastRunAt, 'HH:mm:ss')} · auto-rescans every 30s</span>
              {autoApprovedCount > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  {autoApprovedCount} auto-approved this session
                </Badge>
              )}
              {autoApproving && (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <Loader2 className="h-3 w-3 animate-spin" /> approving…
                </span>
              )}
            </p>
          )}
        </div>
        {headerRight}
      </div>

      {error && (
        <div className="p-3 text-xs text-destructive bg-destructive/5 border-b border-destructive/20 flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </div>
      )}

      {matches.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          {running
            ? 'Scanning recent payout emails…'
            : 'No payout emails are currently waiting on manual approval. Auto-matched payouts are credited instantly.'}
        </div>
      ) : (
        <div className="divide-y">
          {matches.map((m) => (
            <div key={m.withdrawal.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Send className="h-3.5 w-3.5 text-emerald-600" />
                  {fmtUgx(m.withdrawal.amount)}
                  <Badge variant="outline" className="text-[10px]">{m.payment_method}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  To {m.recipientPhone} · TID <span className="font-mono">{m.email.transaction_id}</span>
                  {m.email.from_name ? ` · ${m.email.from_name}` : ''}
                </div>
                {m.email.snippet && (
                  <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{m.email.snippet}</div>
                )}
              </div>
              <Button
                size="sm"
                onClick={() => retryOne(m)}
                disabled={approvingId === m.withdrawal.id}
                className="gap-2"
              >
                {approvingId === m.withdrawal.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                Retry approve
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
