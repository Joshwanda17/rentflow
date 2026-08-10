import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { KeyRound, RefreshCw, Loader2, Copy, Check, Clock, Radio, ChevronDown, Smartphone } from 'lucide-react';
import { StartCashDepositDialog } from './StartCashDepositDialog';

interface CashCodeRow {
  verification_id: string;
  deposit_request_id: string;
  depositor_name: string | null;
  depositor_phone: string | null;
  amount: number | null;
  code: string | null; // only present while awaiting & not expired
  status: string;
  attempts: number | null;
  max_attempts: number | null;
  deposit_purpose: string | null;
  expires_at: string | null;
  created_at: string;
}

const fmtUgx = (n: number | null) =>
  n === null || n === undefined ? '—' : `UGX ${Math.round(n).toLocaleString()}`;

const purposeLabel = (p: string | null) =>
  p === 'operational_float' ? 'Operational Float' : p === 'other' ? 'Other' : 'Personal Deposit';

function StatusBadge({ status }: { status: string }) {
  if (status === 'awaiting_code')
    return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">Awaiting code</Badge>;
  if (status === 'verified')
    return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Verified</Badge>;
  return <Badge variant="outline" className="text-muted-foreground capitalize">{status.replace(/_/g, ' ')}</Badge>;
}

/** Live mm:ss countdown to expiry; color shifts from emerald → amber → rose as time runs low. */
function Countdown({ expiresAt, inline = false }: { expiresAt: string | null; inline?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);
  if (!expiresAt) return <span className="text-muted-foreground">—</span>;
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return <span className="text-rose-500 font-medium">expired</span>;
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  // Color tier: >90s emerald, 31-90s amber, ≤30s rose
  const colorClass =
    ms > 90_000
      ? 'text-emerald-600'
      : ms > 30_000
        ? 'text-amber-600'
        : 'text-rose-600 animate-pulse';
  return (
    <span className={`inline-flex items-center gap-1 font-medium tabular-nums ${colorClass} ${inline ? 'text-xs' : 'text-sm'}`}>
      <Clock className="h-3 w-3" />
      {mm}:{String(ss).padStart(2, '0')}
    </span>
  );
}

/**
 * Financial Ops view of recent CASH deposit codes. The plaintext code is sent
 * to the verifier inbox by `cash-deposit-request-code`; this panel surfaces it
 * in-app via the role-gated `fin_ops_recent_cash_codes` RPC so the operator can
 * read it back to the depositor without opening the shared mailbox. The actual
 * code is only revealed while the deposit is still awaiting the code and not
 * expired — crediting still requires the depositor to enter it.
 */
export function CashDepositCodesPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<CashCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(Date.now());
  const [realtimeHealthy, setRealtimeHealthy] = useState(false);
  const [secondsToRefresh, setSecondsToRefresh] = useState<number>(3);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reissuing, setReissuing] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fast fallback poll while realtime is down; relaxed safety-net poll while it's healthy.
  const FAST_POLL_SECONDS = 3;
  const SAFETY_POLL_SECONDS = 15;
  const pollSeconds = realtimeHealthy ? SAFETY_POLL_SECONDS : FAST_POLL_SECONDS;

  const load = useCallback(async () => {
    const { data, error } = await (supabase.rpc as any)('fin_ops_recent_cash_codes', { p_limit: 50 });
    if (error) {
      if (/not_authorized/i.test(error.message)) setDenied(true);
      else setLoadError(error.message);
      setLoading(false);
      return;
    }
    setLoadError(null);
    setRows((data ?? []) as CashCodeRow[]);
    setLoading(false);
    setLastRefreshedAt(Date.now());
  }, []);

  // Adaptive polling fallback: keeps codes fresh even if realtime events stop
  // arriving. Cadence tightens automatically whenever realtime is unhealthy.
  useEffect(() => {
    load();
    setSecondsToRefresh(pollSeconds);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(load, pollSeconds * 1_000);
    // Countdown ticker so the UI shows when the next safety refresh happens
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setSecondsToRefresh((prev) => (prev > 1 ? prev - 1 : pollSeconds));
    }, 1_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [load, pollSeconds]);

  // Refetch immediately when the tab regains focus/visibility — covers the case
  // where realtime dropped silently while the tab was backgrounded.
  useEffect(() => {
    const onActive = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener('focus', onActive);
    document.addEventListener('visibilitychange', onActive);
    return () => {
      window.removeEventListener('focus', onActive);
      document.removeEventListener('visibilitychange', onActive);
    };
  }, [load]);

  // Realtime subscription for instant updates when new cash deposit verifications are created
  useEffect(() => {
    const channel = supabase
      .channel('cash-deposit-codes-panel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cash_deposit_verifications',
        },
        () => {
          // New or updated verification — refresh immediately
          load();
        },
      )
      .subscribe((status) => {
        // Mark realtime healthy only when fully subscribed; any error/closure
        // flips us back to the fast fallback polling cadence.
        if (status === 'SUBSCRIBED') {
          setRealtimeHealthy(true);
          load();
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          setRealtimeHealthy(false);
        }
      });
    return () => {
      setRealtimeHealthy(false);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 1500);
    } catch {
      toast({ title: 'Copy failed', description: 'Could not copy the code.', variant: 'destructive' });
    }
  };

  if (denied) return null;

  const reissue = async (verificationId: string) => {
    setReissuing(verificationId);
    const { data, error } = await (supabase.rpc as any)('fin_ops_reissue_cash_code', {
      p_verification_id: verificationId,
    });
    setReissuing(null);
    if (error) {
      toast({ title: 'Could not reissue code', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `New code: ${data}`, description: 'Valid for 10 minutes. Read it back to the depositor.' });
    load();
  };

  const activeRows = rows.filter(
    (r) => r.status === 'awaiting_code' && r.expires_at && new Date(r.expires_at).getTime() > Date.now(),
  );

  // Show every recent code — including expired ones — so verifiers can still
  // read a code back to a depositor after the active window has lapsed.
  const displayRows = rows;

  const activeCount = activeRows.length;

  const [open, setOpen] = useState(true);
  const [startOpen, setStartOpen] = useState(false);

  return (
    <>
    <StartCashDepositDialog open={startOpen} onOpenChange={setStartOpen} onIssued={load} />
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border bg-card">
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between gap-3 cursor-pointer p-4 sm:p-5 hover:bg-muted/30 transition-colors rounded-t-xl">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> Cash Deposit Codes
              {activeCount > 0 && (
                <Badge className="bg-amber-500 text-white hover:bg-amber-500">{activeCount} active</Badge>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Read the active code back to the depositor only after you have received the matching cash. Codes expire in 10 minutes.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); setStartOpen(true); }}
              className="gap-1.5"
            >
              <Smartphone className="h-4 w-4" />
              <span className="hidden sm:inline">Start deposit by SMS</span>
              <span className="sm:hidden">SMS code</span>
            </Button>
            <Badge
              variant="outline"
              className="hidden sm:inline-flex items-center gap-1 text-[10px] font-normal text-muted-foreground border-dashed"
            >
              <Radio className={`h-3 w-3 animate-pulse ${realtimeHealthy ? 'text-emerald-500' : 'text-amber-500'}`} />
              {realtimeHealthy ? `Live · safety refresh ${secondsToRefresh}s` : `Fallback refresh ${secondsToRefresh}s`}
            </Badge>
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); load(); }} className="gap-1.5">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-4">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Radio className={`h-3 w-3 ${realtimeHealthy ? 'text-emerald-500' : 'text-amber-500'}`} />
            <span>
              {realtimeHealthy
                ? 'Realtime connected'
                : 'Realtime unavailable — polling fallback active'}
              {' '}— last updated {new Date(lastRefreshedAt).toLocaleTimeString()}
            </span>
          </div>

          {loading && displayRows.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading codes…
            </div>
          ) : loadError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Could not load cash deposit codes: {loadError}
            </div>
          ) : displayRows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No cash deposit codes yet.</div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 px-2 font-medium">Code</th>
                    <th className="py-2 px-2 font-medium">Amount</th>
                    <th className="py-2 px-2 font-medium">Depositor</th>
                    <th className="py-2 px-2 font-medium">Purpose</th>
                    <th className="py-2 px-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((r) => (
                    <tr key={r.verification_id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-2 px-2 align-top">
                        {r.code ? (
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => copy(r.code!)}
                              className="inline-flex items-center gap-1.5 font-mono text-base font-bold tracking-widest text-foreground rounded-md px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 transition-colors w-fit"
                              title="Click to copy"
                            >
                              {r.code}
                              {copied === r.code ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                            </button>
                            <Countdown expiresAt={r.expires_at} inline />
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">Code not stored</span>
                            {r.status !== 'verified' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-fit gap-1 text-xs"
                                disabled={reissuing === r.verification_id}
                                onClick={() => reissue(r.verification_id)}
                              >
                                {reissuing === r.verification_id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <KeyRound className="h-3 w-3" />
                                )}
                                Reissue code
                              </Button>
                            )}
                            <Countdown expiresAt={r.expires_at} inline />
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2 font-medium whitespace-nowrap">{fmtUgx(r.amount)}</td>
                      <td className="py-2 px-2">
                        <div className="font-medium truncate max-w-[160px]">{r.depositor_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.depositor_phone || ''}</div>
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap text-xs">{purposeLabel(r.deposit_purpose)}</td>
                      <td className="py-2 px-2"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
