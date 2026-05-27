import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Wallet, Banknote, ArrowRight, AlertTriangle, UserCog, ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight, Receipt, WifiOff, Wifi } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { UserSearchPicker } from '@/components/cfo/UserSearchPicker';
import { formatUGX } from '@/lib/rentCalculations';

/**
 * Fetches current wallet bucket balances (cache view) for a user so the
 * confirmation step can render before → after deltas.
 */
function useWalletBuckets(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['route-email-wallet-buckets', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase.from('wallets') as any)
        .select('withdrawable_balance, float_balance')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return {
        withdrawable: Number(data?.withdrawable_balance ?? 0),
        float: Number(data?.float_balance ?? 0),
      };
    },
    staleTime: 5_000,
  });
}

function BucketDelta({ label, before, after, sign }: { label: string; before: number; after: number; sign: '+' | '−' }) {
  const tone = sign === '+' ? 'text-emerald-600' : 'text-destructive';
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">
        {formatUGX(before)}
        <span className="mx-1 text-muted-foreground">→</span>
        <span className={`font-semibold ${tone}`}>{formatUGX(after)}</span>
      </span>
    </div>
  );
}

/**
 * Inline preview: last 5 wallet-scope ledger entries for a user filtered to
 * a specific bucket. Helps Financial Ops sanity-check what's currently in
 * the wallet before initiating a transfer. Respects the user-facing ledger
 * filter (no admin_correction / system_balance_correction).
 */
function MiniLedger({ userId, bucket, title }: { userId: string | null | undefined; bucket: 'withdrawable' | 'float'; title: string }) {
  const q = useQuery({
    queryKey: ['route-email-mini-ledger', userId, bucket],
    enabled: !!userId,
    queryFn: async () => {
      // Strictly user-facing wallet rows only:
      //   • ledger_scope = 'wallet'           (no platform/bridge legs)
      //   • wallet_bucket = <exact bucket>    (NOT NULL via eq)
      //   • classification ≠ 'admin_correction'
      //   • category ≠ 'system_balance_correction'
      // See mem://constraints/user-facing-ledger-filter — these two
      // exclusions are mandatory on every end-user ledger surface.
      const { data, error } = await (supabase.from('general_ledger') as any)
        .select('id, amount, direction, category, description, transaction_date, created_at, wallet_bucket, ledger_scope, classification')
        .eq('user_id', userId)
        .eq('ledger_scope', 'wallet')
        .eq('wallet_bucket', bucket)
        .neq('classification', 'admin_correction')
        .neq('category', 'system_balance_correction')
        .gt('amount', 0)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; amount: number; direction: 'cash_in' | 'cash_out'; category: string; description: string | null; transaction_date: string; created_at: string }>;
    },
    staleTime: 10_000,
  });
  return (
    <div className="rounded-lg border bg-muted/20 p-2 text-[11px] space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{bucket === 'withdrawable' ? 'Personal Deposits' : 'Float'}</span>
      </div>
      {!userId ? (
        <p className="text-muted-foreground">No user selected.</p>
      ) : q.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !q.data?.length ? (
        <p className="text-muted-foreground">No recent {bucket === 'withdrawable' ? 'personal deposits' : 'float'} activity.</p>
      ) : (
        <ul className="space-y-0.5">
          {q.data.map((tx) => (
            <li key={tx.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-muted-foreground">
                {new Date(tx.transaction_date).toLocaleDateString()} · {tx.description || tx.category}
              </span>
              <span className={tx.direction === 'cash_in' ? 'text-emerald-600 font-medium shrink-0' : 'text-destructive font-medium shrink-0'}>
                {tx.direction === 'cash_in' ? '+' : '−'}{formatUGX(Number(tx.amount) || 0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Full-width, high-contrast preview of the last 5 wallet transactions.
 * Designed for debit mode so low-vision operators can quickly scan
 * dates, amounts, and direction before confirming a deduction.
 */
function DebitHistoryPreview({ userId, bucket, userName }: { userId: string | null | undefined; bucket: 'withdrawable' | 'float'; userName: string }) {
  const q = useQuery({
    queryKey: ['route-email-debit-history-preview', userId, bucket],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase.from('general_ledger') as any)
        .select('id, amount, direction, category, description, transaction_date, created_at, wallet_bucket, ledger_scope, classification')
        .eq('user_id', userId)
        .eq('ledger_scope', 'wallet')
        .eq('wallet_bucket', bucket)
        .neq('classification', 'admin_correction')
        .neq('category', 'system_balance_correction')
        .gt('amount', 0)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; amount: number; direction: 'cash_in' | 'cash_out'; category: string; description: string | null; transaction_date: string; created_at: string }>;
    },
    staleTime: 10_000,
  });

  if (!userId) return null;

  return (
    <div className="rounded-xl border-2 border-foreground/10 bg-foreground text-background overflow-hidden">
      <div className="px-3 py-2.5 border-b border-background/10 bg-background/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold">Recent wallet activity · {userName}</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider bg-background/20 px-2 py-0.5 rounded-full font-medium">
          {bucket === 'float' ? 'Operational Float' : 'Personal Deposits'}
        </span>
      </div>
      {q.isLoading ? (
        <div className="px-3 py-4 text-center text-sm text-background/70">Loading transactions…</div>
      ) : !q.data?.length ? (
        <div className="px-3 py-4 text-center text-sm text-background/70">No recent transactions.</div>
      ) : (
        <div className="divide-y divide-background/10">
          {q.data.map((tx) => {
            const isCashIn = tx.direction === 'cash_in';
            const date = new Date(tx.transaction_date);
            const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={tx.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${isCashIn ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                    {isCashIn ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description || tx.category}</p>
                    <p className="text-xs text-background/60">{dateStr} · {timeStr}</p>
                  </div>
                </div>
                <span className={`text-sm font-bold font-mono shrink-0 ${isCashIn ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {isCashIn ? '+' : '−'}{formatUGX(Number(tx.amount) || 0)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type Route = 'personal_deposit' | 'operational_float';
type DebitRoute = 'withdrawable' | 'landlord_float' | 'proxy_agent_wallet';
export type RouteDialogMode = 'credit' | 'debit';

export interface EmailRowForRouting {
  id: string;
  gmail_message_id?: string | null;
  amount: number | null;
  transaction_id: string | null;
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  /** Recipient / counterparty extracted by the email parser. Used by the
   *  debit flow to compose a reason that names who actually received the
   *  money rather than the bank/MNO that sent the confirmation email. */
  counterparty?: string | null;
}

export interface PrefilledUser {
  id: string;
  full_name: string;
  phone: string;
  /** Phone number actually seen in the email body (e.g. after "to …").
   *  Optional — when present, surfaced in the auto-filled reason so the
   *  audit trail records the matched contact, not just the user's stored
   *  account phone. */
  matched_phone?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: EmailRowForRouting | null;
  suggestedUser?: PrefilledUser | null;
  /**
   * 'credit' (default) — inbound money-in email routed to a user's wallet.
   * 'debit'  — outbound money-out email charged against a user's wallet,
   *            never against Welile's operational float. Auto-redirects to
   *            the proxy agent's wallet when the picked user is a partner
   *            with an active managed-proxy assignment.
   */
  mode?: RouteDialogMode;
  /** Prev / Next navigation so Financial Ops can walk emails without closing the dialog. */
  onPrev?: () => void;
  onNext?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  currentIndex?: number;
  totalCount?: number;
}

/**
 * Financial-Ops tool to redirect a confirmed inbound transaction email to a
 * specific user — either as a Personal Deposit (Withdrawable) or as
 * Operational Float. Routes through the `cfo-direct-credit` edge function so
 * the existing Wallet Routing v2 + ledger rules apply.
 */
export function RouteEmailDepositDialog({ open, onOpenChange, row, suggestedUser, mode = 'credit', onPrev, onNext, canPrev, canNext, currentIndex, totalCount }: Props) {
  const { toast } = useToast();
  const [user, setUser] = useState<PrefilledUser | null>(null);
  const [amount, setAmount] = useState('');
  const [route, setRoute] = useState<Route>('personal_deposit');
  const [debitRoute, setDebitRoute] = useState<DebitRoute>('withdrawable');
  const [reason, setReason] = useState('');
  // Optional "wallet-to-wallet transfer" source user. When set in credit
  // mode, we first debit this user's withdrawable balance, then credit
  // the picked recipient. Used by Financial Ops on the Recent Emails page
  // to move money from one user's wallet to another's.
  const [sourceUser, setSourceUser] = useState<PrefilledUser | null>(null);
  const [transferFromUser, setTransferFromUser] = useState(false);
  // Which bucket of the source user to debit when transferring.
  // 'withdrawable' = personal balance, 'float' = operational/landlord-payout float.
  const [transferFromBucket, setTransferFromBucket] = useState<'withdrawable' | 'float'>('withdrawable');
  // Forced-reversal confirmation state. When the reversal step trips
  // NEGATIVE_WALLET_BLOCKED (original user already spent the auto-credit),
  // we surface a confirm panel; clicking "Force reverse & route" retries
  // the same mutation with allow_overdraw: true so the reversal posts as
  // a recoverable obligation (auto_recover=true).
  const [forcePending, setForcePending] = useState<null | { amount: number; name: string }>(null);
  const forceReversalRef = useRef(false);
  // Two-step confirmation gate. When the operator clicks the action button
  // the first time we flip this on, surface the source/destination preview +
  // before/after balances, and require a second click ("Confirm & route") to
  // actually invoke the mutation.
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  // One-tap "Confirm & retry with {bucket}" — when set, the next render
  // where debitRoute matches and the pre-flight gate is clear will auto-fire
  // the mutation. Cleared after firing, on close, or on any further edit.
  const [pendingAutoSubmit, setPendingAutoSubmit] = useState<DebitRoute | null>(null);

  // Per-transfer audit logger — writes one row to
  // `wallet_debit_bucket_attempts` for every meaningful step of the debit
  // flow (blocked-by-insufficient-funds, bucket switched, succeeded,
  // failed-other). Dedupes identical "blocked" entries within a single
  // dialog session so the table is not spammed on every re-render.
  const loggedBlockKeys = useRef<Set<string>>(new Set());
  async function logBucketAttempt(args: {
    targetUserId: string;
    targetUserName?: string | null;
    attemptedBucket: 'withdrawable' | 'float' | 'proxy_withdrawable';
    amount: number;
    availableAtAttempt: number;
    outcome: 'insufficient_funds_blocked' | 'switched' | 'succeeded' | 'failed_other';
    switchedToBucket?: 'withdrawable' | 'float' | 'proxy_withdrawable' | null;
    failureReason?: string | null;
    gmailTransactionId?: string | null;
    transactionReference?: string | null;
  }) {
    try {
      if (args.outcome === 'insufficient_funds_blocked') {
        const key = `${args.targetUserId}|${args.attemptedBucket}|${args.amount}`;
        if (loggedBlockKeys.current.has(key)) return;
        loggedBlockKeys.current.add(key);
      }
      const { data: me } = await supabase.auth.getUser();
      const createdBy = me?.user?.id ?? null;
      if (!createdBy) return;
      let createdByName: string | null = null;
      try {
        const { data: prof } = await (supabase.from('profiles') as any)
          .select('full_name')
          .eq('id', createdBy)
          .maybeSingle();
        createdByName = prof?.full_name ?? null;
      } catch { /* ignore */ }
      await (supabase.from('wallet_debit_bucket_attempts') as any).insert({
        target_user_id: args.targetUserId,
        target_user_name: args.targetUserName ?? null,
        attempted_bucket: args.attemptedBucket,
        amount: args.amount,
        available_at_attempt: args.availableAtAttempt,
        outcome: args.outcome,
        switched_to_bucket: args.switchedToBucket ?? null,
        failure_reason: args.failureReason ?? null,
        gmail_transaction_id: args.gmailTransactionId ?? null,
        transaction_reference: args.transactionReference ?? null,
        created_by: createdBy,
        created_by_name: createdByName,
      });
    } catch (e) {
      console.warn('[RouteEmailDeposit] bucket-attempt log failed', e);
    }
  }

  // Low-data / weak-connection mode: hides helper text & wallet-history
  // queries, enlarges tap targets, and reduces wrapping. Persisted per
  // operator so it survives page reloads on bad networks.
  const [lowData, setLowData] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return window.localStorage.getItem('welile.routeEmail.lowData') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('welile.routeEmail.lowData', lowData ? '1' : '0');
      }
    } catch { /* ignore */ }
  }, [lowData]);
  // Reusable class fragments — applied throughout the dialog body so a
  // single toggle reshapes the whole surface without per-element state.
  const radioCardCls = lowData ? 'p-4 min-h-[64px]' : 'p-3';
  const helperTextCls = lowData ? 'hidden' : 'text-[11px] text-muted-foreground';
  const helperTextSmCls = lowData ? 'hidden' : 'text-[11px]';

  const recipientBucket: 'withdrawable' | 'float' = route === 'operational_float' ? 'float' : 'withdrawable';
  const sourceBuckets = useWalletBuckets(transferFromUser ? sourceUser?.id : null);
  const destBuckets = useWalletBuckets(user?.id);
  const amtNum = Number(amount) || 0;

  // Smart-pick the source bucket so Financial Ops doesn't have to guess.
  // When the operator selects a source user (or changes the amount), choose
  // whichever bucket actually has enough funds to cover the transfer. This
  // is the single biggest reason a wallet→wallet move trips
  // NEGATIVE_WALLET_BLOCKED — the wrong bucket was selected even though the
  // money is sitting in the other one.
  const autoBucketPicked = useRef(false);
  useEffect(() => {
    if (!transferFromUser || !sourceUser?.id) {
      autoBucketPicked.current = false;
      return;
    }
    const b = sourceBuckets.data;
    if (!b) return;
    const need = amtNum;
    const wOk = b.withdrawable >= need && need > 0;
    const fOk = b.float >= need && need > 0;
    // Only auto-switch the first time the operator picks a source user, OR
    // when the currently selected bucket clearly can't cover the amount but
    // the other one can. Never overwrite a manual choice silently otherwise.
    if (!autoBucketPicked.current) {
      if (!wOk && fOk) setTransferFromBucket('float');
      else if (wOk && !fOk) setTransferFromBucket('withdrawable');
      else if (b.withdrawable === 0 && b.float > 0) setTransferFromBucket('float');
      autoBucketPicked.current = true;
      return;
    }
    if (transferFromBucket === 'withdrawable' && !wOk && fOk) {
      setTransferFromBucket('float');
    } else if (transferFromBucket === 'float' && !fOk && wOk) {
      setTransferFromBucket('withdrawable');
    }
  }, [transferFromUser, sourceUser?.id, sourceBuckets.data, amtNum, transferFromBucket]);

  useEffect(() => {
    if (open && row) {
      setUser(suggestedUser ?? null);
      setAmount(row.amount ? String(Math.round(row.amount)) : '');
      setRoute('personal_deposit');
      setDebitRoute('withdrawable');
      setForcePending(null);
      forceReversalRef.current = false;
      setSourceUser(null);
      setTransferFromUser(false);
      setTransferFromBucket('withdrawable');
      setAwaitingConfirm(false);
      setPendingAutoSubmit(null);
      const tid = row.transaction_id ? ` TID ${row.transaction_id}` : '';
      const from = row.from_name || row.from_email || 'email';
      // Outgoing emails (MTN/Airtel/bank send confirmations) carry the
      // beneficiary in `counterparty` — surface it so the auto-filled
      // reason names who actually received the money. Phone preference:
      // matched-in-body phone first, then the user's stored account phone.
      const recipientName = row.counterparty || (suggestedUser?.full_name ?? '');
      const recipientPhone = suggestedUser?.matched_phone || suggestedUser?.phone || '';
      const toClause = recipientName || recipientPhone
        ? ` to ${[recipientName, recipientPhone].filter(Boolean).join(' ')}`
        : '';
      setReason(mode === 'debit'
        ? `Charged outgoing payment email from ${from}${tid}${toClause} against user wallet.`
        : `Routed inbound deposit email from ${from}${tid}.`);
    }
  }, [open, row, suggestedUser, mode]);

  // ── Detect proxy-agent assignment for the picked user ────────────
  // Returns the most recent active+approved proxy assignment (managed OR
  // unmanaged). When `is_managed_account=true`, debits auto-redirect to
  // the proxy agent (the partner wallet must not be touched). When the
  // assignment is unmanaged, the operator can still manually choose to
  // debit the proxy agent's wallet via the "Proxy agent wallet" route.
  const proxy = useQuery({
    queryKey: ['route-email-proxy', user?.id, mode],
    enabled: open && !!user?.id,
    queryFn: async () => {
      if (!user?.id) return null;
      const { data: assignment } = await (supabase.from('proxy_agent_assignments') as any)
        .select('id, agent_id, is_managed_account')
        .eq('beneficiary_id', user.id)
        .eq('is_active', true)
        .eq('approval_status', 'approved')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!assignment?.agent_id) return null;
      const { data: prof } = await (supabase.from('profiles') as any)
        .select('id, full_name, phone')
        .eq('id', assignment.agent_id)
        .maybeSingle();
      return {
        assignmentId: assignment.id as string,
        agentId: assignment.agent_id as string,
        isManaged: !!assignment.is_managed_account,
        agentName: (prof?.full_name as string) ?? 'Proxy agent',
        agentPhone: (prof?.phone as string) ?? '',
      };
    },
  });

  // ── Detect any prior auto-credit linked to this email ──────────────
  // gmail-poll-transactions stamps `auto_match_audit.gmail_message_id`
  // and `gmail_transactions.linked_deposit_request_id` when it auto-
  // credits a matched user's Operational Float. We must reverse it
  // before crediting the newly chosen user, or both wallets end up
  // holding the same money.
  const existing = useQuery({
    queryKey: ['route-email-existing-credit', row?.id, row?.gmail_message_id],
    enabled: open && mode === 'credit' && !!row,
    queryFn: async () => {
      if (!row) return null;
      // 1) Find via gmail_transactions.linked_deposit_request_id (fast path)
      const { data: gmailRow } = await (supabase.from('gmail_transactions') as any)
        .select('linked_deposit_request_id')
        .eq('id', row.id)
        .maybeSingle();
      let depId: string | null = gmailRow?.linked_deposit_request_id ?? null;

      // 2) Fallback: search by auto_match_audit.gmail_message_id
      if (!depId && row.gmail_message_id) {
        const { data: depByAudit } = await (supabase.from('deposit_requests') as any)
          .select('id')
          .eq('auto_match_audit->>gmail_message_id', row.gmail_message_id)
          .not('status', 'in', '(rejected,cancelled,failed)')
          .limit(1)
          .maybeSingle();
        depId = depByAudit?.id ?? null;
      }
      if (!depId) return null;

      const { data: dep } = await (supabase.from('deposit_requests') as any)
        .select('id, user_id, amount, deposit_purpose, status, auto_approved')
        .eq('id', depId)
        .maybeSingle();
      if (!dep) return null;
      const terminalReversed = ['rejected', 'cancelled', 'failed', 'reversed'];
      if (terminalReversed.includes(dep.status)) return null;

      // Pull the original user's identity for display + SMS.
      const { data: prof } = await (supabase.from('profiles') as any)
        .select('id, full_name, phone')
        .eq('id', dep.user_id)
        .maybeSingle();
      return {
        deposit_id: dep.id as string,
        original_user_id: dep.user_id as string,
        original_user_name: (prof?.full_name as string) ?? 'Unknown user',
        original_user_phone: (prof?.phone as string) ?? '',
        original_amount: Number(dep.amount) || 0,
        deposit_purpose: (dep.deposit_purpose as string) ?? 'operational_float',
      };
    },
  });

  // ── Detect prior auto-debit for this outgoing email (debit mode) ──
  // If the platform already posted a wallet-scope cash_out leg whose
  // `sub_category` matches this email's transaction_id, the wallet has
  // ALREADY been reduced automatically — operator should not debit again
  // unless they confirm. Surfaces wallet owner, bucket, amount and date
  // so the operator can decide whether a manual action is still needed.
  const existingDebit = useQuery({
    queryKey: ['route-email-existing-debit', row?.transaction_id, row?.id],
    enabled: open && mode === 'debit' && !!row?.transaction_id,
    queryFn: async () => {
      if (!row?.transaction_id) return null;
      const { data, error } = await (supabase.from('general_ledger') as any)
        .select('id, user_id, amount, wallet_bucket, transaction_date, category, description, ledger_scope, classification')
        .eq('ledger_scope', 'wallet')
        .eq('direction', 'cash_out')
        .eq('sub_category', row.transaction_id)
        .neq('classification', 'admin_correction')
        .neq('category', 'system_balance_correction')
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data?.user_id) return null;
      const { data: prof } = await (supabase.from('profiles') as any)
        .select('id, full_name, phone')
        .eq('id', data.user_id)
        .maybeSingle();
      return {
        ledger_id: data.id as string,
        debited_user_id: data.user_id as string,
        debited_user_name: (prof?.full_name as string) ?? 'Unknown user',
        debited_user_phone: (prof?.phone as string) ?? '',
        amount: Number(data.amount) || 0,
        wallet_bucket: (data.wallet_bucket as 'withdrawable' | 'float' | null) ?? null,
        transaction_date: data.transaction_date as string,
        category: data.category as string,
      };
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error('No email row');
      if (!user) throw new Error('Pick a recipient user');
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a valid amount');
      if (reason.trim().length < 10) throw new Error('Reason must be at least 10 characters');

      // ─── DEBIT MODE (money-out) ────────────────────────────────
      if (mode === 'debit') {
        const proxyInfo = proxy.data;
        // Routing rules:
        // 1. Managed-proxy partner → ALWAYS debits proxy agent wallet
        //    (mirrors managed-proxy payout routing; partner wallet untouched).
        // 2. Operator explicitly picked "Proxy agent wallet" → debit proxy
        //    agent's withdrawable (requires a proxy assignment to exist).
        // 3. Otherwise → debit the picked user as normal.
        const useProxyAgent =
          (proxyInfo?.isManaged === true) || (debitRoute === 'proxy_agent_wallet' && !!proxyInfo);
        if (debitRoute === 'proxy_agent_wallet' && !proxyInfo) {
          throw new Error('No active proxy agent found for this user');
        }
        const debitTargetId = useProxyAgent ? proxyInfo!.agentId : user.id;
        const debitTargetName = useProxyAgent ? proxyInfo!.agentName : user.full_name;
        const debitTargetPhone = useProxyAgent ? proxyInfo!.agentPhone : user.phone;
        // Proxy-agent route always lands on the agent's withdrawable bucket.
        const isFloat = debitRoute === 'landlord_float' && !useProxyAgent;
        const isProxyAgentRoute = useProxyAgent;
        const debitBody = {
          target_user_id: debitTargetId,
          amount: amt,
          reason: useProxyAgent
            ? `Outgoing email charged to proxy agent wallet (on behalf of partner ${user.full_name}): ${reason.trim()}`
            : reason.trim(),
          operation: 'debit' as const,
          // Float bucket: agent_float_deposit (locked to float in cfo-direct-credit).
          // Withdrawable bucket: wallet_transfer (user-owned, allowed for user recipient).
          wallet_category: isFloat ? 'agent_float_deposit' : 'wallet_transfer',
          platform_category: isFloat ? 'agent_float_deposit' : 'wallet_transfer',
          financial_impact: 'neutral' as const,
          category_label: isFloat
            ? 'Email charge → Landlord-Payout Float'
            : isProxyAgentRoute
              ? `Email charge → Proxy agent wallet (for ${user.full_name})`
              : 'Email charge → Withdrawable',
          recipient_type: isFloat ? 'operational_wallet' : 'user',
          sub_category: row.transaction_id ?? null,
        };
        const { data: debitData, error: debitErr } = await supabase.functions.invoke('cfo-direct-credit', { body: debitBody });
        if (debitErr) throw new Error((debitErr as any)?.message || 'Debit failed');
        if ((debitData as any)?.error) throw new Error((debitData as any).error);
        const referenceId = (debitData as any)?.reference_id ?? null;

        // Best-effort routing history insert + SMS to the wallet owner.
        let smsSent = false;
        let smsError: string | null = null;
        try {
          const fromLabel = row.from_name || row.from_email || null;
          const { data: smsRes, error: smsErr } = await supabase.functions.invoke('notify-email-routing', {
            body: {
              phone: debitTargetPhone,
              target_user_name: debitTargetName,
              amount: amt,
              route: isFloat
                ? 'landlord_float_debit'
                : isProxyAgentRoute
                  ? 'proxy_agent_wallet_debit'
                  : 'withdrawable_debit',
              reference_id: referenceId,
              from_label: fromLabel,
              transaction_id: row.transaction_id,
              debit: true,
              on_behalf_of_partner: useProxyAgent ? user.full_name : null,
            },
          });
          if (smsErr) smsError = (smsErr as any)?.message || 'SMS dispatch failed';
          else if ((smsRes as any)?.success) smsSent = true;
          else smsError = (smsRes as any)?.error || 'SMS not delivered';
        } catch (e: any) {
          smsError = e?.message || 'SMS dispatch threw';
        }

        try {
          const { data: me } = await supabase.auth.getUser();
          if (me?.user?.id) {
            let routedByName: string | null = null;
            try {
              const { data: rp } = await (supabase.from('profiles') as any)
                .select('full_name').eq('id', me.user.id).maybeSingle();
              routedByName = rp?.full_name ?? null;
            } catch { /* ignore */ }
            await (supabase.from('email_routing_history') as any).insert({
              gmail_transaction_id: row.id,
              gmail_message_id: row.gmail_message_id ?? null,
              transaction_id: row.transaction_id,
              from_email: row.from_email,
              from_name: row.from_name,
              subject: row.subject,
              amount: amt,
              route: isFloat
                ? 'landlord_float_debit'
                : isProxyAgentRoute
                  ? 'proxy_agent_wallet_debit'
                  : 'withdrawable_debit',
              target_user_id: debitTargetId,
              target_user_name: debitTargetName,
              target_user_phone: debitTargetPhone,
              reason: useProxyAgent
                ? `DEBIT (proxy${proxyInfo?.isManaged ? ' redirect' : ' route'} from partner ${user.full_name}): ${reason.trim()}`
                : `DEBIT: ${reason.trim()}`,
              ledger_reference_id: referenceId,
              routed_by: me.user.id,
              routed_by_name: routedByName,
              sms_sent: smsSent,
              sms_error: smsError,
            });
          }
        } catch (e) { console.warn('[RouteEmailDeposit] debit history insert failed', e); }

        return { ...(debitData as any), smsSent, smsError, debit: true, proxyRedirected: useProxyAgent, proxyManaged: !!proxyInfo?.isManaged, debitTargetName };
      }

      const isFloat = route === 'operational_float';

      // ── 0a) Wallet-to-wallet transfer leg ─────────────────────────
      // When the operator picked a source user, debit that user's
      // withdrawable balance for the same amount before crediting the
      // chosen recipient. This makes the Recent Emails dialog a true
      // user→user transfer tool.
      if (transferFromUser) {
        if (!sourceUser) throw new Error('Pick the source user to debit');
        if (sourceUser.id === user.id) throw new Error('Source and recipient must be different users');
        const fromFloat = transferFromBucket === 'float';
        const transferDebitBody = {
          target_user_id: sourceUser.id,
          amount: amt,
          reason: `Transfer ${fromFloat ? '(from float) ' : ''}to ${user.full_name}: ${reason.trim()}`,
          operation: 'debit' as const,
          wallet_category: fromFloat ? 'agent_float_deposit' : 'wallet_transfer',
          platform_category: fromFloat ? 'agent_float_deposit' : 'wallet_transfer',
          financial_impact: 'neutral' as const,
          category_label: `${fromFloat ? 'Float' : 'Wallet'} transfer → ${user.full_name}`,
          recipient_type: fromFloat ? 'operational_wallet' : 'user',
          sub_category: row.transaction_id ?? null,
          allow_overdraw: forceReversalRef.current,
        };
        const { data: tdData, error: tdErr } = await supabase.functions.invoke('cfo-direct-credit', { body: transferDebitBody });
        const tdErrMsg = (tdErr as any)?.message || (tdData as any)?.error;
        if (tdErrMsg) {
          if (!forceReversalRef.current && String(tdErrMsg).includes('NEGATIVE_WALLET_BLOCKED')) {
            // Prefer a one-tap bucket switch over forcing an overdraw when the
            // funds actually exist in the OTHER bucket of the same source user.
            const b = sourceBuckets.data;
            if (b) {
              const otherBucket: 'withdrawable' | 'float' = fromFloat ? 'withdrawable' : 'float';
              const otherAvail = otherBucket === 'withdrawable' ? b.withdrawable : b.float;
              if (otherAvail >= amt) {
                setTransferFromBucket(otherBucket);
                throw new Error(`${sourceUser.full_name} has ${formatUGX(otherAvail)} in ${otherBucket === 'withdrawable' ? 'Withdrawable' : 'Float'} — switched. Tap "Confirm & route" again to retry.`);
              }
            }
            setForcePending({ amount: amt, name: sourceUser.full_name });
            throw new Error('FORCE_REVERSAL_CONFIRMATION_REQUIRED');
          }
          throw new Error(`Source debit failed: ${tdErrMsg}`);
        }
        // Best-effort SMS + history for the debited source user.
        try {
          if (sourceUser.phone) {
            await supabase.functions.invoke('notify-email-routing', {
              body: {
                phone: sourceUser.phone,
                target_user_name: sourceUser.full_name,
                amount: amt,
                route: fromFloat ? 'landlord_float_debit' : 'withdrawable_debit',
                reference_id: (tdData as any)?.reference_id ?? null,
                from_label: row.from_name || row.from_email || null,
                transaction_id: row.transaction_id,
                debit: true,
                on_behalf_of_partner: user.full_name,
              },
            });
          }
        } catch (e) { console.warn('[RouteEmailDeposit] transfer source SMS failed', e); }
        try {
          const { data: me } = await supabase.auth.getUser();
          if (me?.user?.id) {
            await (supabase.from('email_routing_history') as any).insert({
              gmail_transaction_id: row.id,
              gmail_message_id: row.gmail_message_id ?? null,
              transaction_id: row.transaction_id,
              from_email: row.from_email,
              from_name: row.from_name,
              subject: row.subject,
              amount: amt,
              route: fromFloat ? 'landlord_float_debit' : 'withdrawable_debit',
              target_user_id: sourceUser.id,
              target_user_name: sourceUser.full_name,
              target_user_phone: sourceUser.phone,
              reason: `TRANSFER OUT (${fromFloat ? 'float' : 'withdrawable'}) → ${user.full_name}. ${reason.trim()}`,
              ledger_reference_id: (tdData as any)?.reference_id ?? null,
              routed_by: me.user.id,
              routed_by_name: null,
              sms_sent: false,
              sms_error: null,
            });
          }
        } catch (e) { console.warn('[RouteEmailDeposit] transfer history insert failed', e); }
      }

      // ── 0) Reversal leg (only when prior auto-credit exists) ────────
      const prior = existing.data;
      const mustReverse = !!prior && prior.original_user_id !== user.id;
      if (mustReverse && prior) {
        const wasFloat = (prior.deposit_purpose ?? 'operational_float') === 'operational_float';
        const debitBody = {
          target_user_id: prior.original_user_id,
          amount: Math.min(prior.original_amount || amt, amt),
          reason: `Reversed auto-credit (re-routed to ${user.full_name}): ${reason.trim()}`,
          operation: 'debit' as const,
          wallet_category: wasFloat ? 'agent_float_deposit' : 'wallet_deposit',
          platform_category: wasFloat ? 'agent_float_deposit' : 'wallet_deposit',
          financial_impact: 'neutral' as const,
          category_label: wasFloat ? 'Reverse auto-credit (Float)' : 'Reverse auto-credit (Wallet)',
          recipient_type: wasFloat ? 'operational_wallet' : 'user',
          sub_category: row.transaction_id ?? null,
          allow_overdraw: forceReversalRef.current,
        };
        const { data: revData, error: revErr } = await supabase.functions.invoke('cfo-direct-credit', { body: debitBody });
        const revErrMsg = (revErr as any)?.message || (revData as any)?.error;
        if (revErrMsg) {
          if (!forceReversalRef.current && String(revErrMsg).includes('NEGATIVE_WALLET_BLOCKED')) {
            setForcePending({ amount: debitBody.amount, name: prior.original_user_name || 'the original user' });
            throw new Error('FORCE_REVERSAL_CONFIRMATION_REQUIRED');
          }
          throw new Error(`Reversal failed: ${revErrMsg}`);
        }
        const reversalRef = (revData as any)?.reference_id ?? null;

        // Mark the original deposit as reversed (best-effort; ignore if column rejects value).
        try {
          await (supabase.from('deposit_requests') as any)
            .update({ status: 'reversed', notes: `Reversed by Financial Ops — re-routed to ${user.full_name}.` })
            .eq('id', prior.deposit_id);
        } catch { /* ignore */ }

        // Log the reversal in routing history (best-effort).
        try {
          const { data: me } = await supabase.auth.getUser();
          if (me?.user?.id) {
            await (supabase.from('email_routing_history') as any).insert({
              gmail_transaction_id: row.id,
              gmail_message_id: row.gmail_message_id ?? null,
              transaction_id: row.transaction_id,
              from_email: row.from_email,
              from_name: row.from_name,
              subject: row.subject,
              amount: debitBody.amount,
              route: wasFloat ? 'operational_float' : 'personal_deposit',
              target_user_id: prior.original_user_id,
              target_user_name: prior.original_user_name,
              target_user_phone: prior.original_user_phone,
              reason: `REVERSAL → re-routed to ${user.full_name}. ${reason.trim()}`,
              ledger_reference_id: reversalRef,
              routed_by: me.user.id,
              routed_by_name: null,
              sms_sent: false,
              sms_error: null,
            });
          }
        } catch (e) { console.warn('[RouteEmailDeposit] reversal history insert failed', e); }

        // Notify the original user their auto-credit was reversed.
        if (prior.original_user_phone) {
          try {
            await supabase.functions.invoke('notify-email-routing', {
              body: {
                phone: prior.original_user_phone,
                target_user_name: prior.original_user_name,
                amount: debitBody.amount,
                route: wasFloat ? 'operational_float' : 'personal_deposit',
                reference_id: reversalRef,
                from_label: row.from_name || row.from_email || null,
                transaction_id: row.transaction_id,
                reversal: true,
              },
            });
          } catch (e) { console.warn('[RouteEmailDeposit] reversal SMS failed', e); }
        }
      }

      const body = {
        target_user_id: user.id,
        amount: amt,
        reason: reason.trim(),
        operation: 'credit' as const,
        wallet_category: isFloat ? 'agent_float_deposit' : 'wallet_deposit',
        platform_category: isFloat ? 'agent_float_deposit' : 'wallet_deposit',
        financial_impact: 'neutral' as const,
        category_label: isFloat ? 'Operational Float (from email)' : 'Personal Deposit (from email)',
        recipient_type: isFloat ? 'operational_wallet' : 'user',
        sub_category: row.transaction_id ?? null,
      };
      const { data, error } = await supabase.functions.invoke('cfo-direct-credit', { body });
      if (error) {
        const msg = (error as any)?.message || 'Routing failed';
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      const referenceId = (data as any)?.reference_id ?? null;

      // 2) Fire SMS notification to the routed user (best-effort).
      let smsSent = false;
      let smsError: string | null = null;
      try {
        const fromLabel = row.from_name || row.from_email || null;
        const { data: smsRes, error: smsErr } = await supabase.functions.invoke('notify-email-routing', {
          body: {
            phone: user.phone,
            target_user_name: user.full_name,
            amount: amt,
            route,
            reference_id: referenceId,
            from_label: fromLabel,
            transaction_id: row.transaction_id,
          },
        });
        if (smsErr) smsError = (smsErr as any)?.message || 'SMS dispatch failed';
        else if ((smsRes as any)?.success) smsSent = true;
        else smsError = (smsRes as any)?.error || 'SMS not delivered';
      } catch (e: any) {
        smsError = e?.message || 'SMS dispatch threw';
      }

      // 3) Record routing history (best-effort — never block the credit).
      try {
        const { data: me } = await supabase.auth.getUser();
        const routedBy = me?.user?.id;
        if (routedBy) {
          let routedByName: string | null = null;
          try {
            const { data: rp } = await (supabase.from('profiles') as any)
              .select('full_name')
              .eq('id', routedBy)
              .maybeSingle();
            routedByName = rp?.full_name ?? null;
          } catch { /* ignore */ }

          await (supabase.from('email_routing_history') as any).insert({
            gmail_transaction_id: row.id,
            gmail_message_id: row.gmail_message_id ?? null,
            transaction_id: row.transaction_id,
            from_email: row.from_email,
            from_name: row.from_name,
            subject: row.subject,
            amount: amt,
            route,
            target_user_id: user.id,
            target_user_name: user.full_name,
            target_user_phone: user.phone,
            reason: reason.trim(),
            ledger_reference_id: referenceId,
            routed_by: routedBy,
            routed_by_name: routedByName,
            sms_sent: smsSent,
            sms_error: smsError,
          });
        }
      } catch (e) {
        console.warn('[RouteEmailDeposit] history insert failed', e);
      }

      return { ...(data as any), smsSent, smsError, reversed: mustReverse, forcedReversal: forceReversalRef.current, transferredFrom: transferFromUser ? sourceUser?.full_name ?? null : null };
    },
    onSuccess: (res: any) => {
      if (mode === 'debit') {
        if (user) {
          const attempted = debitRoute === 'landlord_float' ? 'float' : debitRoute === 'proxy_agent_wallet' ? 'proxy_withdrawable' : 'withdrawable';
          const avail = destBuckets.data
            ? (attempted === 'float' ? destBuckets.data.float : destBuckets.data.withdrawable)
            : 0;
          logBucketAttempt({
            targetUserId: res?.debitTargetUserId ?? user.id,
            targetUserName: res?.debitTargetName ?? user.full_name,
            attemptedBucket: attempted as any,
            amount: amtNum,
            availableAtAttempt: avail,
            outcome: 'succeeded',
            gmailTransactionId: row?.id ?? null,
            transactionReference: row?.transaction_id ?? null,
          });
        }
        const routeLabel = debitRoute === 'landlord_float' ? 'Landlord-Payout Float' : 'Withdrawable';
        const proxyNote = res?.proxyRedirected ? ` (redirected to proxy agent ${res.debitTargetName})` : '';
        toast({
          title: 'Wallet debited',
          description: `${formatUGX(Number(amount))} debited from ${res?.debitTargetName ?? user?.full_name}${proxyNote} as ${routeLabel}.${res?.smsSent ? ' SMS sent.' : ''}`,
        });
        onOpenChange(false);
        return;
      }
      const routeLabel = route === 'operational_float' ? 'Operational Float' : 'Personal Deposit';
      const reversedPart = res?.forcedReversal
        ? ' Original auto-credit force-reversed; recoverable obligation recorded.'
        : res?.reversed ? ' Original auto-credit reversed.' : '';
      const transferPart = res?.transferredFrom ? ` Debited from ${res.transferredFrom}.` : '';
      toast({
        title: 'Deposit routed',
        description: res?.smsSent
          ? `${formatUGX(Number(amount))} credited to ${user?.full_name} as ${routeLabel}. SMS sent.${reversedPart}${transferPart}`
          : `${formatUGX(Number(amount))} credited to ${user?.full_name} as ${routeLabel}. SMS could not be sent${res?.smsError ? ` (${res.smsError})` : ''}.${reversedPart}${transferPart}`,
      });
      onOpenChange(false);
    },
    onError: (e: any) => {
      if (e.message === 'FORCE_REVERSAL_CONFIRMATION_REQUIRED') return;
      if (mode === 'debit' && user) {
        const attempted = debitRoute === 'landlord_float' ? 'float' : debitRoute === 'proxy_agent_wallet' ? 'proxy_withdrawable' : 'withdrawable';
        const avail = destBuckets.data
          ? (attempted === 'float' ? destBuckets.data.float : destBuckets.data.withdrawable)
          : 0;
        const isInsufficient = /NEGATIVE_WALLET_BLOCKED|strict available balance|insufficient/i.test(String(e?.message ?? ''));
        logBucketAttempt({
          targetUserId: user.id,
          targetUserName: user.full_name,
          attemptedBucket: attempted as any,
          amount: amtNum,
          availableAtAttempt: avail,
          outcome: isInsufficient ? 'insufficient_funds_blocked' : 'failed_other',
          failureReason: String(e?.message ?? '').slice(0, 500),
          gmailTransactionId: row?.id ?? null,
          transactionReference: row?.transaction_id ?? null,
        });
      }
      toast({ title: mode === 'debit' ? 'Could not debit wallet' : 'Could not route deposit', description: e.message, variant: 'destructive' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md sm:max-w-lg p-0 gap-0 max-h-[100dvh] sm:max-h-[90vh] h-[100dvh] sm:h-auto flex flex-col"
      >
        <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="text-base sm:text-lg truncate">
              {lowData
                ? (mode === 'debit' ? 'Debit wallet' : 'Route deposit')
                : (mode === 'debit' ? 'Charge outgoing payment to user wallet' : 'Redirect deposit to user')}
            </DialogTitle>
            <button
              type="button"
              onClick={() => setLowData((v) => !v)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                lowData
                  ? 'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                  : 'border-border bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
              aria-pressed={lowData}
              aria-label={lowData ? 'Low-data mode is on. Tap to turn off.' : 'Turn on low-data mode for weak connections'}
              title={lowData ? 'Low-data mode ON — hiding history & helper text' : 'Low-data mode OFF'}
            >
              {lowData ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
              {lowData ? 'Low-data' : 'Low-data'}
            </button>
          </div>
          {!lowData && (
            <DialogDescription className="text-xs sm:text-sm">
              {mode === 'debit'
                ? 'Debits this outbound transaction from a user\'s wallet (never from Welile operational float). Auto-redirects to the proxy agent\'s wallet when the picked user is a partner with a managed-proxy assignment.'
                : 'Credit this inbound transaction to a specific user as Personal Deposit (withdrawable) or Operational Float.'}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Prev / Next navigation bar — sticky, thumb-friendly for phones */}
        {(canPrev || canNext) && (
          <div className="shrink-0 border-b bg-muted/30 px-3 py-2.5 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 px-3 gap-1 text-xs flex-1"
              disabled={!canPrev}
              onClick={onPrev}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev email
            </Button>
            <span className="text-[11px] text-muted-foreground tabular-nums px-1">
              {currentIndex ?? 0} / {totalCount ?? 0}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 px-3 gap-1 text-xs flex-1"
              disabled={!canNext}
              onClick={onNext}
            >
              Next email
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {row && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <p><span className="text-muted-foreground">From:</span> <span className="font-medium">{row.from_name || row.from_email || '—'}</span></p>
            {!lowData && row.transaction_id && (
              <p className="font-mono text-sm break-all"><span className="text-muted-foreground font-sans">TID:</span> {row.transaction_id}</p>
            )}
            {!lowData && (
              <p className="line-clamp-2"><span className="text-muted-foreground">Subject:</span> {row.subject || '—'}</p>
            )}
          </div>
        )}

        {mode === 'credit' && existing.data && user && existing.data.original_user_id !== user.id && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs flex gap-2 dark:bg-amber-950/30 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-medium text-amber-900 dark:text-amber-200">Will reverse prior auto-credit</p>
              {!lowData && (
                <p className="text-amber-800 dark:text-amber-300">
                  {formatUGX(existing.data.original_amount)} was auto-credited to <span className="font-semibold">{existing.data.original_user_name}</span>. Routing now will debit them and credit the chosen user. Both users will be SMS-notified.
                </p>
              )}
            </div>
          </div>
        )}
        {forcePending && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs space-y-3">
            <div className="flex gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-destructive">Original user has UGX 0 available</p>
                <p className="text-muted-foreground">
                  Force reverse {formatUGX(forcePending.amount)} from {forcePending.name}; the system will record a recoverable obligation and clear it from future incoming credits.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setForcePending(null)} disabled={send.isPending}>Cancel</Button>
              <Button type="button" variant="destructive" size="sm" className="flex-1" onClick={() => { forceReversalRef.current = true; setForcePending(null); send.mutate(); }} disabled={send.isPending}>
                {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Force reverse & route'}
              </Button>
            </div>
          </div>
        )}
        {mode === 'credit' && existing.data && user && existing.data.original_user_id === user.id && (
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            This deposit was already auto-credited to {existing.data.original_user_name}. Routing will add another credit — confirm this is intentional.
          </div>
        )}

        {mode === 'debit' && proxy.data?.isManaged && (
          <div className="rounded-lg border border-violet-300 bg-violet-50 p-3 text-xs flex gap-2 dark:bg-violet-950/30 dark:border-violet-800">
            <UserCog className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-medium text-violet-900 dark:text-violet-200">Managed-proxy partner detected</p>
              {!lowData && (
                <p className="text-violet-800 dark:text-violet-300">
                  <span className="font-semibold">{user?.full_name}</span> is managed by proxy agent <span className="font-semibold">{proxy.data.agentName}</span>. The debit will hit the <span className="font-semibold">proxy agent's wallet</span> — the partner's wallet will not be touched.
                </p>
              )}
            </div>
          </div>
        )}

        {mode === 'debit' && existingDebit.data && (
          <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-xs flex gap-2 dark:bg-amber-950/30 dark:border-amber-700">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-900 dark:text-amber-200 uppercase tracking-wide">
                Wallet already auto-debited
              </p>
              {!lowData && (
              <p className="text-amber-800 dark:text-amber-300">
                {formatUGX(existingDebit.data.amount)} was already deducted from{' '}
                <span className="font-semibold">{existingDebit.data.debited_user_name}</span>
                {' '}({existingDebit.data.wallet_bucket === 'float' ? 'Operational Float' : 'Personal Deposits'})
                {' '}on {new Date(existingDebit.data.transaction_date).toLocaleDateString()} for this same TID.
                {' '}<span className="font-semibold">No further manual debit is needed</span> unless you intend to charge an additional party.
              </p>
              )}
            </div>
          </div>
        )}

        {!lowData && mode === 'debit' && proxy.data && !proxy.data.isManaged && (
          <div className="rounded-lg border bg-muted/30 p-3 text-xs flex gap-2">
            <UserCog className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-medium">Proxy agent available</p>
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">{user?.full_name}</span> has proxy agent <span className="font-semibold text-foreground">{proxy.data.agentName}</span>. Pick <span className="font-semibold">"Proxy agent wallet"</span> below to debit the agent instead of the partner.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {mode === 'credit' && (
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={transferFromUser}
                  onChange={(e) => {
                    setTransferFromUser(e.target.checked);
                    if (!e.target.checked) setSourceUser(null);
                  }}
                />
                <div className="text-xs">
                  <p className="font-medium">Transfer from another user's wallet</p>
                  {!lowData && (
                    <p className="text-muted-foreground">Debits the chosen source user's withdrawable balance and credits the recipient below for the same amount.</p>
                  )}
                </div>
              </label>
              {transferFromUser && (
                <div className="space-y-2">
                  <UserSearchPicker
                    label="Debit wallet of (source user)"
                    placeholder="Search source user by name or phone…"
                    selectedUser={sourceUser}
                    onSelect={setSourceUser}
                  />
                  <div>
                    <Label className="text-xs">Debit from bucket</Label>
                    <RadioGroup
                      value={transferFromBucket}
                      onValueChange={(v) => setTransferFromBucket(v as 'withdrawable' | 'float')}
                      className="mt-1 grid grid-cols-2 gap-2"
                    >
                      <label className={`flex items-start gap-2 rounded-lg border p-2 cursor-pointer hover:bg-muted/40 ${transferFromBucket === 'withdrawable' ? 'border-primary bg-primary/5' : ''}`}>
                        <RadioGroupItem value="withdrawable" id="src-bucket-w" className="mt-0.5" />
                        <div className="text-[11px]">
                          <div className="flex items-center gap-1 font-medium"><Banknote className="h-3 w-3 text-primary" /> Withdrawable</div>
                          <p className="text-muted-foreground">Personal balance</p>
                          {sourceBuckets.data && (
                            <p className={`mt-0.5 font-mono ${amtNum > 0 && sourceBuckets.data.withdrawable < amtNum ? 'text-destructive' : 'text-foreground'}`}>
                              {formatUGX(sourceBuckets.data.withdrawable)}
                              {amtNum > 0 && sourceBuckets.data.withdrawable < amtNum && (
                                <span className="ml-1 text-destructive">· short</span>
                              )}
                            </p>
                          )}
                        </div>
                      </label>
                      <label className={`flex items-start gap-2 rounded-lg border p-2 cursor-pointer hover:bg-muted/40 ${transferFromBucket === 'float' ? 'border-primary bg-primary/5' : ''}`}>
                        <RadioGroupItem value="float" id="src-bucket-f" className="mt-0.5" />
                        <div className="text-[11px]">
                          <div className="flex items-center gap-1 font-medium"><Wallet className="h-3 w-3 text-primary" /> Float</div>
                          <p className="text-muted-foreground">Landlord-payout float</p>
                          {sourceBuckets.data && (
                            <p className={`mt-0.5 font-mono ${amtNum > 0 && sourceBuckets.data.float < amtNum ? 'text-destructive' : 'text-foreground'}`}>
                              {formatUGX(sourceBuckets.data.float)}
                              {amtNum > 0 && sourceBuckets.data.float < amtNum && (
                                <span className="ml-1 text-destructive">· short</span>
                              )}
                            </p>
                          )}
                        </div>
                      </label>
                    </RadioGroup>
                    {/* One-tap "Switch to <other bucket>" hint when the selected bucket can't cover the amount but the other one can */}
                    {sourceBuckets.data && amtNum > 0 && (() => {
                      const cur = transferFromBucket === 'withdrawable' ? sourceBuckets.data.withdrawable : sourceBuckets.data.float;
                      const other = transferFromBucket === 'withdrawable' ? sourceBuckets.data.float : sourceBuckets.data.withdrawable;
                      const otherLabel = transferFromBucket === 'withdrawable' ? 'Float' : 'Withdrawable';
                      if (cur >= amtNum) return null;
                      if (other < amtNum) return (
                        <p className="mt-1 text-[11px] text-destructive">
                          Neither bucket has {formatUGX(amtNum)}. Lower the amount or use Force-reverse if this is a recovery.
                        </p>
                      );
                      return (
                        <button
                          type="button"
                          onClick={() => setTransferFromBucket(transferFromBucket === 'withdrawable' ? 'float' : 'withdrawable')}
                          className="mt-1 w-full rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/20"
                        >
                          Switch to {otherLabel} — has {formatUGX(other)} available
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          <UserSearchPicker
            label={mode === 'debit'
              ? 'Charge wallet of user'
              : existing.data
                ? `Route to user — ${formatUGX(existing.data.original_amount)} auto-credited`
                : 'Route to user'
            }
            placeholder="Search by name or phone…"
            selectedUser={user}
            onSelect={setUser}
          />

          {!lowData && mode === 'credit' && (user || (transferFromUser && sourceUser)) && (
            <div className={transferFromUser && sourceUser ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : ''}>
              {transferFromUser && sourceUser && (
                <MiniLedger
                  userId={sourceUser.id}
                  bucket={transferFromBucket}
                  title={`From · ${sourceUser.full_name} (last 5)`}
                />
              )}
              {user && (
                <MiniLedger
                  userId={user.id}
                  bucket={route === 'operational_float' ? 'float' : 'withdrawable'}
                  title={`To · ${user.full_name} (last 5)`}
                />
              )}
            </div>
          )}

          {mode === 'debit' && user && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">Wallet type:</span>
                {debitRoute === 'landlord_float' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                    <Wallet className="h-3 w-3" /> Operational Float
                  </span>
                ) : debitRoute === 'proxy_agent_wallet' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
                    <UserCog className="h-3 w-3" /> Proxy Agent · Personal
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <Banknote className="h-3 w-3" /> Personal Deposits
                  </span>
                )}
              </div>
              {!lowData && (
                <DebitHistoryPreview
                  userId={debitRoute === 'proxy_agent_wallet' && proxy.data ? proxy.data.agentId : user.id}
                  bucket={debitRoute === 'landlord_float' ? 'float' : 'withdrawable'}
                  userName={debitRoute === 'proxy_agent_wallet' && proxy.data ? proxy.data.agentName : user.full_name}
                />
              )}
            </div>
          )}

          {user && proxy.data && (
            <div className="flex items-center gap-2 -mt-1 text-xs text-muted-foreground">
              <UserCog className="h-3.5 w-3.5 text-violet-600" />
              <span>
                Proxy agent:{' '}
                <span className="font-semibold text-foreground">{proxy.data.agentName}</span>
                {proxy.data.agentPhone ? ` · ${proxy.data.agentPhone}` : ''}
                {proxy.data.isManaged && (
                  <span className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
                    managed
                  </span>
                )}
              </span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Amount (UGX)</Label>
              {(() => {
                const isFloat =
                  mode === 'credit'
                    ? route === 'operational_float'
                    : debitRoute === 'landlord_float';
                const verb = mode === 'credit' ? 'Crediting' : 'Debiting';
                return (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                      isFloat
                        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
                    }`}
                    aria-label={`${verb} ${isFloat ? 'Operational Float' : 'Personal Deposit'} wallet`}
                  >
                    {isFloat ? <Wallet className="h-3.5 w-3.5" /> : <Banknote className="h-3.5 w-3.5" />}
                    {verb} · {isFloat ? 'Operational Float' : 'Personal Deposit'}
                  </span>
                );
              })()}
            </div>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-12 text-lg font-semibold"
              inputMode="numeric"
              autoComplete="off"
            />
            {amount && Number(amount) > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">{formatUGX(Number(amount))}</p>
            )}
          </div>

          {mode === 'credit' && (
          <div>
            <Label className="text-xs">Route as</Label>
            <RadioGroup value={route} onValueChange={(v) => setRoute(v as Route)} className="mt-1 space-y-2">
              <label className={`flex items-start gap-2 rounded-lg border cursor-pointer hover:bg-muted/40 ${radioCardCls}`}>
                <RadioGroupItem value="personal_deposit" id="route-personal" className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Banknote className="h-3.5 w-3.5 text-primary" /> Personal Deposit
                  </div>
                  {!lowData && <p className="text-[11px] text-muted-foreground">Lands in the user's withdrawable balance.</p>}
                </div>
              </label>
              <label className={`flex items-start gap-2 rounded-lg border cursor-pointer hover:bg-muted/40 ${radioCardCls}`}>
                <RadioGroupItem value="operational_float" id="route-float" className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Wallet className="h-3.5 w-3.5 text-primary" /> Operational Float
                  </div>
                  {!lowData && <p className="text-[11px] text-muted-foreground">Lands in float balance (cannot be withdrawn; for rent collection).</p>}
                </div>
              </label>
            </RadioGroup>
            {transferFromUser && sourceUser && user && (
              <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px] flex items-center gap-1.5">
                <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                <span>
                  <span className="font-medium">{sourceUser.full_name}</span>
                  <span className="text-muted-foreground"> ({transferFromBucket === 'float' ? 'Float' : 'Withdrawable'})</span>
                  {' → '}
                  <span className="font-medium">{user.full_name}</span>
                  <span className="text-muted-foreground"> ({route === 'operational_float' ? 'Float' : 'Withdrawable'})</span>
                </span>
              </div>
            )}
          </div>
          )}

          {mode === 'debit' && (
          <div>
            <Label className="text-xs">Deduct from</Label>
            <RadioGroup value={debitRoute} onValueChange={(v) => setDebitRoute(v as DebitRoute)} className="mt-1 space-y-2">
              <label className={`flex items-start gap-2 rounded-lg border cursor-pointer hover:bg-muted/40 ${radioCardCls}`}>
                <RadioGroupItem value="withdrawable" id="debit-withdrawable" className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Banknote className="h-3.5 w-3.5 text-primary" /> Withdrawable balance
                  </div>
                  {!lowData && <p className="text-[11px] text-muted-foreground">Reduces the user's withdrawable wallet. Use when the payment was for personal money the user owns.</p>}
                </div>
              </label>
              <label className={`flex items-start gap-2 rounded-lg border cursor-pointer hover:bg-muted/40 ${radioCardCls}`}>
                <RadioGroupItem value="landlord_float" id="debit-landlord-float" className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Wallet className="h-3.5 w-3.5 text-primary" /> Landlord-Payout Float
                  </div>
                  {!lowData && <p className="text-[11px] text-muted-foreground">Reduces the agent's float balance. Use when a landlord was paid out of the agent's collected rent float.</p>}
                </div>
              </label>
              {proxy.data && (
                <label className={`flex items-start gap-2 rounded-lg border cursor-pointer hover:bg-muted/40 ${radioCardCls}`}>
                  <RadioGroupItem value="proxy_agent_wallet" id="debit-proxy-agent" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <UserCog className="h-3.5 w-3.5 text-primary" /> Proxy agent wallet
                      <span className="ml-1 text-[10px] text-muted-foreground font-normal">({proxy.data.agentName})</span>
                    </div>
                    {!lowData && <p className="text-[11px] text-muted-foreground">Reduces the proxy agent's withdrawable balance instead of the partner's. Use when the payout was funded out of the proxy agent's wallet on behalf of this partner.</p>}
                  </div>
                </label>
              )}
            </RadioGroup>
          </div>
          )}

          <div>
            <Label className="text-xs">Reason (min 10 chars)</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="text-sm" />
          </div>

          {awaitingConfirm && mode === 'credit' && user && (
            <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-primary" /> Confirm transfer
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {transferFromUser && sourceUser && (
                  <MiniLedger
                    userId={sourceUser.id}
                    bucket={transferFromBucket}
                    title={`From · ${sourceUser.full_name} (last 5)`}
                  />
                )}
                <MiniLedger
                  userId={user.id}
                  bucket={recipientBucket}
                  title={`To · ${user.full_name} (last 5)`}
                />
              </div>
              <div className="rounded-md border bg-background p-2 space-y-1">
                {transferFromUser && sourceUser && sourceBuckets.data && (
                  <BucketDelta
                    label={`${sourceUser.full_name} · ${transferFromBucket === 'withdrawable' ? 'Personal Deposits' : 'Float'}`}
                    before={transferFromBucket === 'withdrawable' ? sourceBuckets.data.withdrawable : sourceBuckets.data.float}
                    after={(transferFromBucket === 'withdrawable' ? sourceBuckets.data.withdrawable : sourceBuckets.data.float) - amtNum}
                    sign="−"
                  />
                )}
                {destBuckets.data && (
                  <BucketDelta
                    label={`${user.full_name} · ${recipientBucket === 'withdrawable' ? 'Personal Deposits' : 'Float'}`}
                    before={recipientBucket === 'withdrawable' ? destBuckets.data.withdrawable : destBuckets.data.float}
                    after={(recipientBucket === 'withdrawable' ? destBuckets.data.withdrawable : destBuckets.data.float) + amtNum}
                    sign="+"
                  />
                )}
                {(sourceBuckets.isLoading || destBuckets.isLoading) && (
                  <p className="text-[11px] text-muted-foreground">Loading current balances…</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1 h-10" onClick={() => setAwaitingConfirm(false)} disabled={send.isPending}>
                  Back to edit
                </Button>
                <Button
                  type="button"
                  className="flex-1 h-10 gap-2"
                  onClick={() => send.mutate()}
                  disabled={send.isPending}
                >
                  {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Confirm & route {amount ? formatUGX(amtNum) : ''}
                </Button>
              </div>
            </div>
          )}
        </div>
        </div>

        {!awaitingConfirm && (
          <div className="border-t bg-background px-4 py-3 shrink-0">
            {(() => {
              const isFloat =
                mode === 'credit'
                  ? route === 'operational_float'
                  : debitRoute === 'landlord_float';
              const walletLabel = isFloat ? 'Operational Float' : 'Personal Deposit';
              const verb = mode === 'credit' ? 'Credit' : 'Debit';
              const missing: string[] = [];
              if (!user) missing.push('pick recipient');
              if (transferFromUser && !sourceUser) missing.push('pick source user');
              if (!amount || Number(amount) <= 0) missing.push('enter amount');
              if (reason.trim().length < 10) missing.push(`reason (${reason.trim().length}/10)`);
              // Pre-flight balance gate — stops NEGATIVE_WALLET_BLOCKED at
              // the UI layer when the picked bucket is short, and tells the
              // operator which bucket *does* have the money.
              let bucketShort: { have: number; otherLabel: 'Withdrawable' | 'Float' | null; otherHave: number; otherRoute: DebitRoute | null } | null = null;
              if (mode === 'debit' && user && destBuckets.data && amtNum > 0 && debitRoute !== 'proxy_agent_wallet') {
                const w = destBuckets.data.withdrawable;
                const f = destBuckets.data.float;
                if (debitRoute === 'withdrawable' && w < amtNum) {
                  bucketShort = { have: w, otherLabel: f >= amtNum ? 'Float' : null, otherHave: f, otherRoute: f >= amtNum ? 'landlord_float' : null };
                } else if (debitRoute === 'landlord_float' && f < amtNum) {
                  bucketShort = { have: f, otherLabel: w >= amtNum ? 'Withdrawable' : null, otherHave: w, otherRoute: w >= amtNum ? 'withdrawable' : null };
                }
              }
              if (bucketShort) missing.push(`insufficient ${debitRoute === 'landlord_float' ? 'Float' : 'Withdrawable'}`);
              const ready = missing.length === 0 && !send.isPending;
              return (
                <div className="space-y-2">
                  {bucketShort && user && (() => {
                    const attempted = debitRoute === 'landlord_float' ? 'float' : 'withdrawable';
                    // Fire-and-forget; deduped inside logBucketAttempt by user+bucket+amount.
                    logBucketAttempt({
                      targetUserId: user.id,
                      targetUserName: user.full_name,
                      attemptedBucket: attempted as any,
                      amount: amtNum,
                      availableAtAttempt: bucketShort!.have,
                      outcome: 'insufficient_funds_blocked',
                      failureReason: `Pre-flight: ${attempted} has ${bucketShort!.have} < ${amtNum}`,
                      gmailTransactionId: row?.id ?? null,
                      transactionReference: row?.transaction_id ?? null,
                    });
                    return null;
                  })()}
                  {bucketShort && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] space-y-1.5">
                      <p className="text-destructive font-semibold">
                        {user?.full_name} · {debitRoute === 'landlord_float' ? 'Float' : 'Withdrawable'} has only {formatUGX(bucketShort.have)}
                      </p>
                      {bucketShort.otherRoute ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (user) {
                              const fromBucket = debitRoute === 'landlord_float' ? 'float' : 'withdrawable';
                              const toBucket = bucketShort!.otherRoute === 'landlord_float' ? 'float' : 'withdrawable';
                              logBucketAttempt({
                                targetUserId: user.id,
                                targetUserName: user.full_name,
                                attemptedBucket: fromBucket as any,
                                amount: amtNum,
                                availableAtAttempt: bucketShort!.have,
                                outcome: 'switched',
                                switchedToBucket: toBucket as any,
                                failureReason: `One-tap confirm-and-retry: ${fromBucket}=${bucketShort!.have} → ${toBucket}=${bucketShort!.otherHave}`,
                                gmailTransactionId: row?.id ?? null,
                                transactionReference: row?.transaction_id ?? null,
                              });
                            }
                            // One-tap: switch bucket AND queue the submit.
                            // An effect below fires send.mutate() on the next
                            // render where debitRoute matches and pre-flight
                            // is clear, so the operator completes the action
                            // in a single click.
                            setPendingAutoSubmit(bucketShort!.otherRoute!);
                            setDebitRoute(bucketShort!.otherRoute!);
                          }}
                          className="w-full rounded-md border border-primary/50 bg-primary/15 px-3 py-2.5 text-[13px] font-semibold text-primary hover:bg-primary/25 flex items-center justify-center gap-1.5"
                        >
                          <ArrowRight className="h-4 w-4" />
                          Confirm &amp; retry with {bucketShort.otherLabel} ({formatUGX(bucketShort.otherHave)})
                        </button>
                      ) : (
                        <p className="text-muted-foreground">Other bucket also short. Lower the amount or pick a different user.</p>
                      )}
                    </div>
                  )}
                  <Button
                    type="button"
                    onClick={() => send.mutate()}
                    disabled={!ready}
                    className="w-full h-14 gap-2 text-base font-semibold"
                    variant={mode === 'debit' ? 'destructive' : 'default'}
                    aria-label={
                      ready
                        ? `One-tap confirm: ${verb} ${formatUGX(amtNum)} ${mode === 'credit' ? 'to' : 'from'} ${user?.full_name} (${walletLabel})`
                        : `Cannot confirm: ${missing.join(', ')}`
                    }
                  >
                    {send.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                    {ready ? (
                      <span className="flex flex-col items-center leading-tight">
                        <span>Confirm · {verb} {formatUGX(amtNum)}</span>
                        <span className="text-[11px] font-medium opacity-90">
                          {mode === 'credit' ? '→ ' : '← '}{user?.full_name} · {walletLabel}
                        </span>
                      </span>
                    ) : (
                      <span>Complete: {missing.join(', ')}</span>
                    )}
                  </Button>
                  {mode === 'credit' && ready && (
                    <button
                      type="button"
                      onClick={() => setAwaitingConfirm(true)}
                      className="w-full text-center text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      Preview balances before confirming
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}