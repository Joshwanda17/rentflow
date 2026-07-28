import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowRightLeft, Search, Loader2, Wallet, Building2, Undo2, Users, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useIsFetching } from '@tanstack/react-query';

type Bucket = 'withdrawable' | 'float';
type Mode = 'user_to_user' | 'error_correction' | 'same_user';
type MoveStep = 'idle' | 'posting' | 'refreshing' | 'done';
type SameUserDir = 'float_to_withdrawable' | 'withdrawable_to_float';

/** Matches every wallet/balance/ledger-backed panel query. */
const isWalletQuery = (key: readonly unknown[]) =>
  /wallet|balance|ledger|finops|withdraw|float|recon|drift|overview/.test(
    key.join(' ').toLowerCase(),
  );

interface MoveResult {
  message: string;
  amount: number;
  mode: Mode;
  reference_id: string;
  source: { name: string; withdrawable_after: number; float_after: number };
  dest: { name: string; withdrawable_after?: number; float_after?: number };
}

interface UserHit {
  id: string;
  full_name: string | null;
  phone: string | null;
  withdrawable_balance: number;
  float_balance: number;
  balance: number;
}

const fmt = (n: number) => `UGX ${Math.round(n).toLocaleString()}`;

/**
 * FinOpsWalletMovePanel — Financial-Ops power tool to move money from ANY user's
 * wallet to ANY other user's wallet, or back to the platform ("money we have")
 * as an error correction. All movement happens server-side via the
 * `finops-wallet-move` edge function (balanced double-entry ledger). Never
 * overdraws — the operator can only move up to the chosen bucket's balance.
 */
export function FinOpsWalletMovePanel() {
  const [mode, setMode] = useState<Mode>('user_to_user');
  const queryClient = useQueryClient();

  const [term, setTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<UserHit[]>([]);

  const [source, setSource] = useState<UserHit | null>(null);
  const [sourceBucket, setSourceBucket] = useState<Bucket>('withdrawable');
  const [dest, setDest] = useState<UserHit | null>(null);
  const [destBucket, setDestBucket] = useState<Bucket>('withdrawable');
  const [picking, setPicking] = useState<'source' | 'dest'>('source');
  const [sameUserDir, setSameUserDir] = useState<SameUserDir>('float_to_withdrawable');

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  // Same-user Withdrawable → Float only: operator opt-in to fill an existing
  // Float overdraft. Without this, the edge function refuses moves where the
  // amount only fills (or partly fills) a negative Float shortfall.
  const [acknowledgeOverdraft, setAcknowledgeOverdraft] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<MoveResult | null>(null);
  const [before, setBefore] = useState<{
    source: { withdrawable: number; float: number };
    dest?: { withdrawable: number; float: number };
  } | null>(null);
  const [step, setStep] = useState<MoveStep>('idle');

  // Live count of in-flight wallet/balance refetches kicked off by the move.
  const refetching = useIsFetching({ predicate: (q) => isWalletQuery(q.queryKey) });
  const refreshStartedRef = useRef(false);

  // Once the refetch wave drains, mark the refresh complete. A fallback timer
  // guarantees completion even if no wallet panels are currently mounted
  // (invalidate only refetches active queries).
  useEffect(() => {
    if (step !== 'refreshing') return;
    if (refetching > 0) {
      refreshStartedRef.current = true;
      return;
    }
    if (refreshStartedRef.current) {
      setStep('done');
      return;
    }
    const fallback = setTimeout(() => setStep('done'), 1500);
    return () => clearTimeout(fallback);
  }, [step, refetching]);

  const search = async () => {
    const q = term.trim();
    if (q.length < 2) {
      toast.error('Enter at least 2 characters to search.');
      return;
    }
    setSearching(true);
    try {
      // Indexed server-side search — plain ilike on profiles times out at
      // our user volume.
      const { data: rpcRows, error } = await supabase.rpc('search_users_fast', {
        p_query: q,
        p_limit: 15,
      });
      if (error) throw error;
      const profiles = ((rpcRows as any[]) || []).map((r) => ({
        id: r.id as string,
        full_name: r.full_name as string | null,
        phone: r.phone as string | null,
      }));
      const ids = profiles.map((p) => p.id);
      const bal: Record<string, { w: number; f: number; t: number }> = {};
      if (ids.length) {
        const { data: wallets } = await supabase
          .from('wallets')
          .select('user_id, withdrawable_balance, float_balance, balance')
          .in('user_id', ids);
        for (const w of wallets || []) {
          bal[w.user_id] = {
            w: Number(w.withdrawable_balance ?? 0),
            f: Number(w.float_balance ?? 0),
            t: Number(w.balance ?? 0),
          };
        }
      }
      setHits(
        profiles.map((p) => ({
          id: p.id,
          full_name: p.full_name,
          phone: p.phone,
          withdrawable_balance: bal[p.id]?.w ?? 0,
          float_balance: bal[p.id]?.f ?? 0,
          balance: bal[p.id]?.t ?? 0,
        })),
      );
    } catch (e) {
      toast.error('Search failed', { description: (e as Error).message });
    } finally {
      setSearching(false);
    }
  };

  const pickUser = (u: UserHit) => {
    if (picking === 'source') setSource(u);
    else setDest(u);
    setHits([]);
    setTerm('');
  };

  const amountNum = Number(amount.replace(/[, _]/g, ''));
  const sourceAvail = source
    ? sourceBucket === 'withdrawable'
      ? source.withdrawable_balance
      : source.float_balance
    : 0;
  const validAmount = Number.isInteger(amountNum) && amountNum > 0 && amountNum <= 500_000_000;
  const exceedsBalance = !!source && amountNum > sourceAvail;
  const wouldGoNegative = exceedsBalance; // sourceAvail - amountNum < 0
  const destOk =
    mode !== 'user_to_user' || (!!dest && dest.id !== source?.id);
  const canSubmit =
    !!source && destOk && validAmount && !exceedsBalance && reason.trim().length >= 10 && !submitting;

  const reset = () => {
    setSource(null);
    setDest(null);
    setAmount('');
    setReason('');
    setHits([]);
    setTerm('');
    setPicking('source');
    setAcknowledgeOverdraft(false);
  };

  const submit = async () => {
    if (!source) return;
    setSubmitting(true);
    setStep('posting');

    // Real-time guard: re-fetch the source user's LATEST wallet balances right
    // before posting so we never act on a stale Operations Float / Withdrawable
    // figure. Aborts the move (and refreshes the on-screen card) if the chosen
    // bucket no longer covers the amount.
    try {
      const { data: fresh, error: freshErr } = await supabase
        .from('wallets')
        .select('withdrawable_balance, float_balance, balance')
        .eq('user_id', source.id)
        .maybeSingle();
      if (freshErr) throw freshErr;
      const freshW = Number(fresh?.withdrawable_balance ?? 0);
      const freshF = Number(fresh?.float_balance ?? 0);
      const freshT = Number(fresh?.balance ?? 0);
      const freshAvail = sourceBucket === 'withdrawable' ? freshW : freshF;
      // Keep the source card in sync with reality.
      setSource((prev) =>
        prev && prev.id === source.id
          ? { ...prev, withdrawable_balance: freshW, float_balance: freshF, balance: freshT }
          : prev,
      );
      // Snapshot the BEFORE balances so the result card can show before → after.
      setBefore({
        source: { withdrawable: freshW, float: freshF },
        dest:
          mode === 'user_to_user' && dest
            ? { withdrawable: dest.withdrawable_balance, float: dest.float_balance }
            : undefined,
      });
      if (amountNum > freshAvail) {
        setSubmitting(false);
        setConfirmOpen(false);
        setStep('idle');
        toast.error('Balance changed', {
          description: `${source.full_name || 'This user'}'s ${sourceBucket} is now ${fmt(freshAvail)}. Adjust the amount and try again.`,
        });
        return;
      }
    } catch (e) {
      setSubmitting(false);
      setConfirmOpen(false);
      setStep('idle');
      toast.error('Could not verify latest balance', { description: (e as Error).message });
      return;
    }

    // Same-user reclassification between the user's own buckets uses the
    // dedicated, balanced edge functions (never overdraws, leaves total balance
    // unchanged). Direction selects which way the money moves.
    if (mode === 'same_user') {
      const fnName =
        sameUserDir === 'float_to_withdrawable'
          ? 'admin-float-to-withdrawable'
          : 'admin-withdrawable-to-float';
      const { data, error } = await invokeEdgeFunction<{
        message: string;
        float_after: number;
        withdrawable_after: number;
      }>(fnName, {
        body: {
          target_user_id: source.id,
          amount: amountNum,
          reason: reason.trim(),
          acknowledge_float_overdraft:
            sameUserDir === 'withdrawable_to_float' && acknowledgeOverdraft
              ? true
              : undefined,
        },
        errorTitle: 'Move failed',
      });
      setSubmitting(false);
      setConfirmOpen(false);
      if (error || !data) {
        setStep('idle');
        return;
      }
      toast.success(data.message);
      setResult({
        message: data.message,
        amount: amountNum,
        mode: 'same_user',
        reference_id: '—',
        source: {
          name: source.full_name || 'User',
          withdrawable_after: data.withdrawable_after,
          float_after: data.float_after,
        },
        dest: { name: source.full_name || 'User' },
      });
      refreshStartedRef.current = false;
      setStep('refreshing');
      queryClient.invalidateQueries({ predicate: (q) => isWalletQuery(q.queryKey) });
      reset();
      return;
    }

    const { data, error } = await invokeEdgeFunction<MoveResult>('finops-wallet-move', {
      body: {
        mode,
        source_user_id: source.id,
        source_bucket: sourceBucket,
        dest_user_id: mode === 'user_to_user' ? dest?.id : undefined,
        dest_bucket: mode === 'user_to_user' ? destBucket : undefined,
        amount: amountNum,
        reason: reason.trim(),
      },
      errorTitle: 'Move failed',
    });
    setSubmitting(false);
    setConfirmOpen(false);
    if (error || !data) {
      setStep('idle');
      return;
    }
    toast.success(data.message);
    setResult(data);
    // Kick off the refresh wave: invalidate every wallet/balance/ledger-backed
    // panel so the new balances appear immediately everywhere.
    refreshStartedRef.current = false;
    setStep('refreshing');
    queryClient.invalidateQueries({ predicate: (q) => isWalletQuery(q.queryKey) });
    reset();
  };

  const BucketToggle = ({
    value, onChange,
  }: { value: Bucket; onChange: (b: Bucket) => void }) => (
    <div className="inline-flex rounded-lg border border-border overflow-hidden">
      {(['withdrawable', 'float'] as Bucket[]).map((b) => (
        <button
          key={b}
          type="button"
          onClick={() => onChange(b)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            value === b ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
          }`}
        >
          {b === 'withdrawable' ? 'Withdrawable' : 'Float'}
        </button>
      ))}
    </div>
  );

  const UserCard = ({
    user, role,
  }: { user: UserHit; role: 'source' | 'dest' }) => (
    <div className="rounded-lg border border-primary bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{user.full_name || 'Unknown'}</p>
          <p className="text-xs text-muted-foreground">{user.phone || '—'}</p>
        </div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground underline"
          onClick={() => (role === 'source' ? setSource(null) : setDest(null))}
        >
          Change
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <Badge variant="outline" className="gap-1 text-[10px]">
          <Wallet className="h-3 w-3" /> Withdrawable {fmt(user.withdrawable_balance)}
        </Badge>
        <Badge variant="secondary" className="gap-1 text-[10px]">
          <Building2 className="h-3 w-3" /> Float {fmt(user.float_balance)}
        </Badge>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2.5">
          <ArrowRightLeft className="h-5 w-5 text-primary" />
          Move Money Between Wallets
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Move money from any user to any other user, reclassify a single user's
          Operations Float into their own Withdrawable, or pull money back to the
          platform as an error correction. You can never move more than the chosen balance.
        </p>
      </div>

      {/* Post-move confirmation — proves the wallets actually changed */}
      {result && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">{result.message}</p>
                <p className="text-xs text-muted-foreground">Ref {result.reference_id}</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-medium">{result.source.name} <span className="text-muted-foreground">(from)</span></p>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex items-center gap-1 text-muted-foreground"><Wallet className="h-3 w-3" /> Withdrawable</span>
                    <span className="font-mono">
                      {before && <span className="text-muted-foreground">{fmt(before.source.withdrawable)} → </span>}
                      <span className="font-semibold">{fmt(result.source.withdrawable_after)}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex items-center gap-1 text-muted-foreground"><Building2 className="h-3 w-3" /> Float</span>
                    <span className="font-mono">
                      {before && <span className="text-muted-foreground">{fmt(before.source.float)} → </span>}
                      <span className="font-semibold">{fmt(result.source.float_after)}</span>
                    </span>
                  </div>
                </div>
              </div>
              {result.mode === 'user_to_user' && (
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs font-medium">{result.dest.name} <span className="text-muted-foreground">(to)</span></p>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="flex items-center gap-1 text-muted-foreground"><Wallet className="h-3 w-3" /> Withdrawable</span>
                      <span className="font-mono">
                        {before?.dest && <span className="text-muted-foreground">{fmt(before.dest.withdrawable)} → </span>}
                        <span className="font-semibold">{fmt(result.dest.withdrawable_after ?? 0)}</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="flex items-center gap-1 text-muted-foreground"><Building2 className="h-3 w-3" /> Float</span>
                      <span className="font-mono">
                        {before?.dest && <span className="text-muted-foreground">{fmt(before.dest.float)} → </span>}
                        <span className="font-semibold">{fmt(result.dest.float_after ?? 0)}</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Step-by-step refresh progress */}
            <div className="rounded-lg border border-border bg-background p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium">Move posted to the ledger</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {step === 'refreshing' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                )}
                <span className={step === 'refreshing' ? 'font-medium' : 'text-muted-foreground'}>
                  {step === 'refreshing'
                    ? `Refreshing wallet panels${refetching > 0 ? ` (${refetching} updating…)` : '…'}`
                    : 'All wallet panels refreshed'}
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={step === 'refreshing'}
              onClick={() => { setResult(null); setBefore(null); setStep('idle'); }}
              className="gap-2"
            >
              {step === 'refreshing' && <Loader2 className="h-4 w-4 animate-spin" />}
              {step === 'refreshing' ? 'Refreshing…' : 'Make another move'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Mode switch */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => { setMode('user_to_user'); reset(); setResult(null); setBefore(null); }}
          className={`rounded-lg border p-3 text-left transition-colors ${
            mode === 'user_to_user' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
          }`}
        >
          <span className="flex items-center gap-2 font-medium text-sm"><Users className="h-4 w-4" /> User → User</span>
          <span className="block text-xs text-muted-foreground mt-1">Move money to another person's wallet.</span>
        </button>
        <button
          type="button"
          onClick={() => { setMode('same_user'); reset(); setResult(null); setBefore(null); setSameUserDir('float_to_withdrawable'); setSourceBucket('float'); }}
          className={`rounded-lg border p-3 text-left transition-colors ${
            mode === 'same_user' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
          }`}
        >
          <span className="flex items-center gap-2 font-medium text-sm"><ArrowRightLeft className="h-4 w-4" /> Float ⇄ Withdrawable</span>
          <span className="block text-xs text-muted-foreground mt-1">Same user: move money between their Operations Float and Withdrawable.</span>
        </button>
        <button
          type="button"
          onClick={() => { setMode('error_correction'); reset(); setResult(null); setBefore(null); }}
          className={`rounded-lg border p-3 text-left transition-colors ${
            mode === 'error_correction' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
          }`}
        >
          <span className="flex items-center gap-2 font-medium text-sm"><Undo2 className="h-4 w-4" /> Back to Platform</span>
          <span className="block text-xs text-muted-foreground mt-1">Recover money as an error correction.</span>
        </button>
      </div>

      {/* Search */}
      {((picking === 'source' && !source) || (mode === 'user_to_user' && picking === 'dest' && !dest)) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Find the {picking === 'source' ? 'user to take money FROM' : 'user to send money TO'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Search by name or phone…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
              />
              <Button onClick={search} disabled={searching} className="gap-2 shrink-0">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </Button>
            </div>
            {hits.length > 0 && (
              <div className="space-y-2">
                {hits.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => pickUser(h)}
                    className="w-full text-left rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{h.full_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{h.phone || '—'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Wallet className="h-3 w-3" /> {fmt(h.withdrawable_balance)}
                        </Badge>
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Building2 className="h-3 w-3" /> {fmt(h.float_balance)}
                        </Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Source */}
      {source && (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">From</Label>
          <UserCard user={source} role="source" />
          {mode === 'same_user' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs text-muted-foreground">Direction</span>
                <div className="inline-flex rounded-lg border border-border overflow-hidden">
                  {([
                    ['float_to_withdrawable', 'Float → Withdrawable'],
                    ['withdrawable_to_float', 'Withdrawable → Float'],
                  ] as [SameUserDir, string][]).map(([dir, label]) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => {
                        setSameUserDir(dir);
                        setSourceBucket(dir === 'float_to_withdrawable' ? 'float' : 'withdrawable');
                      }}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        sameUserDir === dir ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {sameUserDir === 'float_to_withdrawable' ? (
                  <>Moving from their <span className="font-semibold text-foreground">Operations Float</span> into their{' '}
                  <span className="font-semibold text-foreground">Withdrawable</span>. Total balance is unchanged.</>
                ) : (
                  <>Moving from their <span className="font-semibold text-foreground">Withdrawable</span> into their{' '}
                  <span className="font-semibold text-foreground">Operations Float</span>. Total balance is unchanged.</>
                )}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">Take from bucket</span>
              <BucketToggle value={sourceBucket} onChange={setSourceBucket} />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Available in {sourceBucket === 'withdrawable' ? 'Withdrawable' : 'Float'}: <span className="font-semibold text-foreground">{fmt(sourceAvail)}</span>
          </p>
          {mode === 'user_to_user' && !dest && picking !== 'dest' && (
            <Button variant="outline" size="sm" onClick={() => setPicking('dest')} className="gap-2">
              <Search className="h-4 w-4" /> Choose recipient
            </Button>
          )}
        </div>
      )}

      {/* Destination */}
      {mode === 'user_to_user' && dest && (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">To</Label>
          <UserCard user={dest} role="dest" />
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-muted-foreground">Add to bucket</span>
            <BucketToggle value={destBucket} onChange={setDestBucket} />
          </div>
        </div>
      )}

      {/* Amount + reason */}
      {source && (mode === 'error_correction' || mode === 'same_user' || dest) && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div>
              <Label htmlFor="fwm-amount" className="text-xs">Amount (UGX)</Label>
              <Input
                id="fwm-amount"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="mt-1"
              />
              {amount && exceedsBalance && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Exceeds available {sourceBucket} balance. Maximum: {fmt(sourceAvail)}.
                </p>
              )}
              {amount && !exceedsBalance && validAmount && sourceAvail > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Balance after move: <span className="font-semibold text-foreground">{fmt(Math.max(0, sourceAvail - amountNum))}</span> {sourceBucket}
                  {mode === 'same_user' && (
                    sameUserDir === 'float_to_withdrawable' ? (
                      <> · Withdrawable becomes: <span className="font-semibold text-foreground">{fmt(source.withdrawable_balance + amountNum)}</span></>
                    ) : (
                      <> · Float becomes: <span className="font-semibold text-foreground">{fmt(source.float_balance + amountNum)}</span></>
                    )
                  )}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="fwm-reason" className="text-xs">Reason (min 10 characters)</Label>
              <Textarea
                id="fwm-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this money is being moved…"
                rows={2}
                className="mt-1"
              />
            </div>
            {mode === 'same_user'
              && sameUserDir === 'withdrawable_to_float'
              && source.float_balance < 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 space-y-2">
                  <div className="flex items-start gap-2 text-xs text-warning-foreground">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">
                        Float is overdrawn by {fmt(Math.abs(source.float_balance))}
                      </p>
                      <p className="text-muted-foreground mt-0.5">
                        The first {fmt(Math.abs(source.float_balance))} of this move fills the
                        overdraft. Visible Float after move:{' '}
                        <span className="font-semibold text-foreground">
                          {fmt(Math.max(0, source.float_balance + amountNum))}
                        </span>
                        .
                      </p>
                    </div>
                  </div>
                  <label className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={acknowledgeOverdraft}
                      onChange={(e) => setAcknowledgeOverdraft(e.target.checked)}
                    />
                    <span>
                      I acknowledge Float is overdrawn and want to proceed. Post this move even if
                      it only fills (or partly fills) the overdraft.
                    </span>
                  </label>
                </div>
              )}
            <Button onClick={() => setConfirmOpen(true)} disabled={!canSubmit} className="w-full gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              {mode === 'user_to_user'
                ? 'Move money'
                : mode === 'same_user'
                  ? (sameUserDir === 'float_to_withdrawable' ? 'Move to Withdrawable' : 'Move to Float')
                  : 'Recover to platform'}
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm money movement</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Move <span className="font-semibold">{fmt(amountNum || 0)}</span> from{' '}
                  <span className="font-semibold">{source?.full_name || 'user'}</span>'s{' '}
                  {sourceBucket} balance{' '}
                  {mode === 'user_to_user'
                    ? <>to <span className="font-semibold">{dest?.full_name || 'recipient'}</span>'s {destBucket} balance.</>
                    : mode === 'same_user'
                      ? (sameUserDir === 'float_to_withdrawable'
                          ? <>into their own <span className="font-semibold">Withdrawable</span> balance. Total balance is unchanged.</>
                          : <>into their own <span className="font-semibold">Operations Float</span> balance. Total balance is unchanged.</>)
                      : 'back to the platform as an error correction.'}
                </p>
                <p className="text-muted-foreground">{reason}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); submit(); }} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}