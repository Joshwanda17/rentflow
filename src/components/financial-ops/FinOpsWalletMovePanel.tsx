import { useState } from 'react';
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
  ArrowRightLeft, Search, Loader2, Wallet, Building2, Undo2, Users, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { toast } from 'sonner';

type Bucket = 'withdrawable' | 'float';
type Mode = 'user_to_user' | 'error_correction';

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

  const [term, setTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<UserHit[]>([]);

  const [source, setSource] = useState<UserHit | null>(null);
  const [sourceBucket, setSourceBucket] = useState<Bucket>('withdrawable');
  const [dest, setDest] = useState<UserHit | null>(null);
  const [destBucket, setDestBucket] = useState<Bucket>('withdrawable');
  const [picking, setPicking] = useState<'source' | 'dest'>('source');

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const search = async () => {
    const q = term.trim();
    if (q.length < 2) {
      toast.error('Enter at least 2 characters to search.');
      return;
    }
    setSearching(true);
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(15);
      if (error) throw error;
      const ids = (profiles || []).map((p) => p.id);
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
        (profiles || []).map((p) => ({
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
  const enough = !!source && amountNum <= sourceAvail;
  const destOk = mode === 'error_correction' || (!!dest && dest.id !== source?.id);
  const canSubmit =
    !!source && destOk && validAmount && enough && reason.trim().length >= 10 && !submitting;

  const reset = () => {
    setSource(null);
    setDest(null);
    setAmount('');
    setReason('');
    setHits([]);
    setTerm('');
    setPicking('source');
  };

  const submit = async () => {
    if (!source) return;
    setSubmitting(true);
    const { data, error } = await invokeEdgeFunction<{ message: string }>('finops-wallet-move', {
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
    if (error || !data) return;
    toast.success(data.message);
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
          Move money from any user to any other user, or pull it back to the platform
          as an error correction. You can never move more than the chosen balance.
        </p>
      </div>

      {/* Mode switch */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { setMode('user_to_user'); reset(); }}
          className={`rounded-lg border p-3 text-left transition-colors ${
            mode === 'user_to_user' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
          }`}
        >
          <span className="flex items-center gap-2 font-medium text-sm"><Users className="h-4 w-4" /> User → User</span>
          <span className="block text-xs text-muted-foreground mt-1">Move money to another person's wallet.</span>
        </button>
        <button
          type="button"
          onClick={() => { setMode('error_correction'); reset(); }}
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
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-muted-foreground">Take from bucket</span>
            <BucketToggle value={sourceBucket} onChange={setSourceBucket} />
          </div>
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
      {source && (mode === 'error_correction' || dest) && (
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
              {amount && !enough && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> More than the available {sourceBucket} balance.
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
            <Button onClick={() => setConfirmOpen(true)} disabled={!canSubmit} className="w-full gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              {mode === 'user_to_user' ? 'Move money' : 'Recover to platform'}
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