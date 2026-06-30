import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import {
  Banknote, CheckCircle2, Loader2, Building2, Clock, Smartphone,
  UserCheck, ArrowRight, Phone, CreditCard, ChevronDown, XCircle,
  Copy, AlertTriangle,
} from 'lucide-react';

export interface WithdrawalPayoutCardProps {
  withdrawal: any;
  isClaimed?: boolean;
  isClaimedByOther?: boolean;
  onClaim?: () => void;
  onComplete?: (data: { id: string; reference: string; method: string }) => void;
  /** ID of the withdrawal currently being claimed (for per-request loading) */
  claimingId?: string | null;
  /** ID of the withdrawal currently being completed (for per-request loading) */
  completingId?: string | null;
  /** Read-only mode: hide Claim/Confirm actions (used by CFO viewer) */
  readOnly?: boolean;
}

export function WithdrawalPayoutCard({
  withdrawal,
  isClaimed = false,
  isClaimedByOther = false,
  onClaim,
  onComplete,
  claimingId = null,
  completingId = null,
  readOnly = false,
}: WithdrawalPayoutCardProps) {
  const [reference, setReference] = useState('');
  const [open, setOpen] = useState(false);
  const [confirmClaimOpen, setConfirmClaimOpen] = useState(false);
  const [claimDetailsConfirmed, setClaimDetailsConfirmed] = useState(false);
  const [enteredPayoutName, setEnteredPayoutName] = useState('');
  const [mismatchAcknowledged, setMismatchAcknowledged] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [rejectNotes, setRejectNotes] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const qc = useQueryClient();

  const REJECT_REASONS = [
    'Customer no-show',
    'Wrong amount',
    'ID mismatch',
    'Suspected fraud',
    'Recipient details invalid',
    'Other',
  ];

  async function handleReject() {
    if (!rejectReason) return;
    const composed = `${rejectReason}${rejectNotes.trim() ? ` — ${rejectNotes.trim()}` : ''}`;
    if (composed.length < 10) {
      toast.error('Please add a few more details (min 10 characters total)');
      return;
    }
    setRejecting(true);
    try {
      // Merchant Agent reject = RELEASE the claim back into the queue so
      // another agent (or Financial Ops) can pick it up. We do NOT mark the
      // withdrawal itself as rejected — that's a Financial Ops decision.
      // The withdrawal stays in its original status (pending / approved) and
      // simply returns to the unclaimed pool. We log the release reason for
      // audit so repeated releases by the same agent can be flagged.
      const { data: { user } } = await supabase.auth.getUser();
      const { error: relErr } = await supabase
        .from('withdrawal_requests')
        .update({
          assigned_cashout_agent_id: null,
          dispatched_at: null,
        } as any)
        .eq('id', withdrawal.id);
      if (relErr) throw relErr;

      // Audit the release (mandatory 10+ char reason already enforced above).
      try {
        await supabase.from('audit_logs').insert({
          user_id: user?.id ?? null,
          action_type: 'merchant_payout_released',
          table_name: 'withdrawal_requests',
          record_id: withdrawal.id,
          reason: composed.slice(0, 500),
          metadata: {
            amount: Number(withdrawal.amount || 0),
            payout_method: withdrawal.payout_method,
            previous_status: withdrawal.status,
            released_at: new Date().toISOString(),
          },
        });
      } catch (auditErr) {
        console.warn('[withdrawal-release] audit log failed', auditErr);
      }

      // Notify the recipient (on the MoMo number they wanted to be paid on,
      // falling back to their profile phone) that their request returned to
      // the queue. Fire-and-forget — never block the release on the SMS.
      supabase.functions
        .invoke('notify-withdrawal-released', {
          body: { withdrawal_id: withdrawal.id, reason: 'manual' },
        })
        .catch((e) => console.warn('[withdrawal-release] notify failed', e));

      toast.success('Released back to queue · another agent can pick it up');
      setRejectOpen(false);
      setRejectReason('');
      setRejectNotes('');
      qc.invalidateQueries({ queryKey: ['cashout-agent-all-withdrawals'] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRejecting(false);
    }
  }

  const method = withdrawal.payout_method || 'cash';
  const isMoMo = ['mobile_money', 'mtn_mobile_money', 'airtel_money'].includes(method);
  const isBank = method === 'bank_transfer';
  const isCash = !isMoMo && !isBank;

  const methodLabel = isBank ? 'Bank Transfer' : isMoMo ? 'Mobile Money' : 'Cash';
  const MethodIcon = isBank ? Building2 : isMoMo ? Smartphone : Banknote;

  const recipientName = withdrawal.profiles?.full_name || 'Unknown';
  const recipientPhone = withdrawal.profiles?.phone || '—';

  const momoNumber = withdrawal.mobile_money_number || recipientPhone;
  const momoRegisteredName = withdrawal.mobile_money_name || '';

  // Normalize names for a forgiving comparison (case-insensitive, collapse
  // whitespace, ignore punctuation) so only meaningful differences flag.
  const normalizeName = (s: string) =>
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const enteredNameTrimmed = enteredPayoutName.trim();
  const hasEnteredName = enteredNameTrimmed.length > 0;
  const nameMismatch =
    isMoMo &&
    !!momoRegisteredName &&
    hasEnteredName &&
    normalizeName(enteredNameTrimmed) !== normalizeName(momoRegisteredName);

  function copyToClipboard(value: string, label: string) {
    const v = (value || '').toString().trim();
    if (!v || v === '—') return;
    // Strip whitespace only for numeric fields (number/account); keep spaces in names.
    const isNumericField = /number|account|contact|code/i.test(label);
    const payload = isNumericField ? v.replace(/\s+/g, '') : v;
    navigator.clipboard?.writeText(payload)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error('Could not copy'));
  }

  // Has it been claimed by SOMEONE (me or other) and not yet completed?
  const isAwaitingPayment =
    !!withdrawal.assigned_cashout_agent_id &&
    withdrawal.status !== 'completed' &&
    withdrawal.status !== 'approved';

  // How long ago was it claimed? (for stale-claim warning)
  const claimedMinutesAgo = withdrawal.dispatched_at
    ? Math.floor((Date.now() - new Date(withdrawal.dispatched_at).getTime()) / 60000)
    : null;
  const isStale = claimedMinutesAgo !== null && claimedMinutesAgo >= 15;

  return (
    <Card className={`rounded-2xl ${isClaimedByOther && !readOnly ? 'opacity-50' : ''}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        {/* Collapsed header — name + amount */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors rounded-t-2xl"
          >
            <div className="min-w-0 flex-1">
              <p className="font-bold text-lg truncate leading-tight">{recipientName}</p>
              {/* Payout target at a glance — visible before claiming/expanding */}
              {isMoMo && (
                <p className="text-sm font-mono font-semibold text-foreground/80 truncate mt-0.5">
                  {momoNumber}
                  {momoRegisteredName ? <span className="font-sans font-medium"> · {momoRegisteredName}</span> : ''}
                </p>
              )}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <Badge variant="secondary" className="text-xs gap-1 h-5 px-2">
                  <MethodIcon className="h-3 w-3" />
                  {methodLabel}
                </Badge>
                {/* AWAITING PAYMENT — shown to claiming agent AND to read-only viewers (CFO)
                    so a stuck/sitting claim is always visible, no matter how long ago. */}
                {isAwaitingPayment && (
                  <Badge
                    className={`text-xs h-5 px-2 gap-1 ${
                      isStale
                        ? 'bg-destructive text-destructive-foreground hover:bg-destructive'
                        : 'bg-warning text-warning-foreground hover:bg-warning'
                    }`}
                  >
                    <Clock className="h-3 w-3" />
                    {isStale && claimedMinutesAgo !== null
                      ? `AWAITING PAYMENT · ${claimedMinutesAgo}m`
                      : 'AWAITING PAYMENT'}
                  </Badge>
                )}
                {isClaimedByOther && !readOnly && (
                  <Badge variant="outline" className="text-xs h-5 px-2 text-muted-foreground">
                    Taken
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <p className="font-bold text-xl text-primary tabular-nums">{formatUGX(withdrawal.amount)}</p>
              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>
          </button>
        </CollapsibleTrigger>

        {/* Expanded body */}
        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            {/* Contact + status row */}
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Phone className="h-4 w-4" />
                {recipientPhone}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {format(new Date(withdrawal.created_at), 'MMM d, HH:mm')}
              </span>
            </div>

            {/* Recipient Payout Details — kept prominent so the merchant agent can
                verify exactly WHO and WHERE to pay BEFORE claiming. */}
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3.5 space-y-3 text-sm">
              <p className="font-bold text-xs uppercase tracking-wider text-primary flex items-center gap-1">
                <CreditCard className="h-3.5 w-3.5" />
                Pay out to
              </p>

              {isMoMo && (
                <>
                  <Badge variant="secondary" className="gap-1 h-6 px-2.5 text-xs font-semibold">
                    <Smartphone className="h-3.5 w-3.5" />
                    {withdrawal.mobile_money_provider || methodLabel}
                  </Badge>

                  {/* Number — large, prominent tap-to-copy button */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Mobile Money Number</p>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(momoNumber, 'Number')}
                      className="mt-1 w-full flex items-center justify-between gap-3 rounded-xl border-2 border-primary/40 bg-background px-3.5 py-2.5 text-left transition-colors hover:bg-primary/10 active:scale-[0.99]"
                      title="Tap to copy number"
                    >
                      <span className="font-mono font-extrabold text-2xl leading-none tracking-wide tabular-nums break-all">{momoNumber}</span>
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-primary">
                        <Copy className="h-4 w-4" /> Copy
                      </span>
                    </button>
                  </div>

                  {/* Registered name — large, one-tap copy + verify reminder */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Registered name on this number</p>
                    {momoRegisteredName ? (
                      <>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(momoRegisteredName, 'Name')}
                          className="mt-1 w-full flex items-center justify-between gap-3 rounded-xl border-2 border-primary/40 bg-background px-3.5 py-2.5 text-left transition-colors hover:bg-primary/10 active:scale-[0.99]"
                          title="Tap to copy name"
                        >
                          <span className="font-extrabold text-lg leading-tight break-words">{momoRegisteredName}</span>
                          <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-primary">
                            <Copy className="h-4 w-4" /> Copy
                          </span>
                        </button>
                        <p className="mt-1 text-[11px] text-muted-foreground flex items-start gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 mt-px shrink-0 text-primary" />
                          Confirm your MTN/Airtel screen shows this exact name before sending.
                        </p>
                      </>
                    ) : (
                      <p className="mt-0.5 font-semibold text-sm text-warning flex items-start gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        Not provided — verify the name on your screen with the recipient by phone.
                      </p>
                    )}
                  </div>
                </>
              )}

              {isBank && (
                <>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Bank</span><span className="font-medium truncate">{withdrawal.bank_name || '—'}</span></div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Account Number</p>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(withdrawal.bank_account_number, 'Account number')}
                      className="mt-0.5 flex items-center gap-2 group"
                      title="Tap to copy"
                    >
                      <span className="font-mono font-extrabold text-2xl leading-none tracking-wide tabular-nums">{withdrawal.bank_account_number || '—'}</span>
                      <Copy className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                    </button>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Account name</p>
                    <p className="mt-0.5 font-extrabold text-lg leading-tight break-words">{withdrawal.bank_account_name || '—'}</p>
                  </div>
                </>
              )}

              {isCash && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recipient contact</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(recipientPhone, 'Contact')}
                    className="mt-0.5 flex items-center gap-2 group"
                    title="Tap to copy"
                  >
                    <span className="font-mono font-extrabold text-2xl leading-none tracking-wide tabular-nums">{recipientPhone}</span>
                    <Copy className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                  </button>
                </div>
              )}

              {/* Account holder (who is withdrawing) — always shown for cross-check */}
              <div className="pt-2 border-t border-primary/15 flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Account holder</span>
                <span className="font-semibold truncate text-right">{recipientName}</span>
              </div>
            </div>

            {/* Status pill */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">{withdrawal.status?.replace(/_/g, ' ')}</Badge>
              {readOnly && !isClaimed && !isClaimedByOther && (
                <Badge variant="outline" className="text-xs">Unclaimed</Badge>
              )}
            </div>

            {withdrawal.reason && (
              <p className="text-sm text-muted-foreground italic break-words">"{withdrawal.reason}"</p>
            )}

            {/* Actions */}
            {readOnly ? null : isClaimedByOther ? null : !isClaimed ? (
              <div className="space-y-2">
                {claimingId === withdrawal.id && (
                  <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 px-3 py-2 text-sm font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span>Submitting claim… please wait</span>
                  </div>
                )}
                <Button
                  className="w-full h-12 gap-2 font-semibold text-base"
                  variant="outline"
                  onClick={() => {
                    setClaimDetailsConfirmed(false);
                    setEnteredPayoutName('');
                    setMismatchAcknowledged(false);
                    setConfirmClaimOpen(true);
                  }}
                  disabled={claimingId === withdrawal.id}
                  title={claimingId === withdrawal.id ? 'Request is being processed…' : 'Claim this withdrawal'}
                >
                  {claimingId === withdrawal.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <><UserCheck className="h-5 w-5" /> Claim This Withdrawal</>}
                </Button>
              </div>
            ) : (
              <div className="space-y-2 pt-2 border-t border-border/50">
                {completingId === withdrawal.id && (
                  <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 px-3 py-2 text-sm font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span>Confirming payment… please wait</span>
                  </div>
                )}
                <div className="rounded-lg bg-warning/10 border border-warning/30 px-3 py-2.5 text-sm font-semibold text-warning flex items-start gap-1.5">
                  <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>NOT PAID YET — execute the payout via <strong>{methodLabel}</strong> first, then enter the {isBank ? 'bank reference / TID' : isMoMo ? 'MoMo Transaction ID' : 'payout code shared by the user'} and press <strong>Confirm Paid</strong>.</span>
                </div>
                <p className="text-sm font-semibold text-primary flex items-start gap-1.5">
                  <ArrowRight className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{isBank ? 'Send bank transfer to the account above, then enter the bank reference / TID' : isMoMo ? 'Send MoMo to the number above, then enter the TID from your confirmation SMS' : 'Coordinate with the user by phone, hand over cash, then enter the payout code they share'}</span>
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder={isBank ? 'Bank reference / TID...' : isMoMo ? 'MoMo Transaction ID (TID)...' : 'Payout code from user...'}
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    className="text-base h-12 font-mono flex-1 min-w-0"
                  />
                  <Button
                    className="h-12 gap-1.5 px-5 sm:w-auto w-full text-base font-semibold"
                    disabled={!reference.trim() || reference.trim().length < 3 || completingId === withdrawal.id}
                    onClick={() => onComplete?.({ id: withdrawal.id, reference, method: methodLabel })}
                    title={completingId === withdrawal.id ? 'Request is being processed…' : 'Confirm this payout'}
                  >
                    {completingId === withdrawal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {completingId === withdrawal.id ? 'Confirming…' : 'Confirm Paid'}
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  className="w-full h-11 text-sm text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                  onClick={() => setRejectOpen(true)}
                  disabled={completingId === withdrawal.id || rejecting}
                  title={completingId === withdrawal.id ? 'Request is being processed…' : 'Release this withdrawal back to the queue'}
                >
                  <XCircle className="h-4 w-4" />
                  Release back to queue
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={rejectOpen} onOpenChange={(v) => !rejecting && setRejectOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Release payout · {formatUGX(withdrawal.amount)}</DialogTitle>
            <DialogDescription>
              This withdrawal will be returned to the queue so another Merchant Agent (or Financial Ops) can pick it up. The recipient's funds stay on hold — only Financial Ops can fully reject. This action is logged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Reason</label>
              <Select value={rejectReason} onValueChange={setRejectReason}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {REJECT_REASONS.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">
                Notes {rejectReason === 'Other' ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}
              </label>
              <Textarea
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="Add context for the audit log..."
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejecting}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={
                rejecting ||
                !rejectReason ||
                (rejectReason === 'Other' && rejectNotes.trim().length < 5)
              }
            >
              {rejecting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <XCircle className="h-4 w-4 mr-1.5" />}
              Release to queue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pre-claim confirmation — agent must confirm the payout target matches
          what they'll send on their MTN/Airtel screen BEFORE claiming. */}
      <Dialog open={confirmClaimOpen} onOpenChange={(v) => claimingId !== withdrawal.id && setConfirmClaimOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm payout details · {formatUGX(withdrawal.amount)}</DialogTitle>
            <DialogDescription>
              Check these against your MTN/Airtel screen before you claim. You are responsible for paying the correct number and name.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {isMoMo ? (
              <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3.5 space-y-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pay out to (Mobile Money number)</p>
                  <p className="mt-0.5 font-mono font-extrabold text-2xl leading-none tracking-wide tabular-nums break-all">{momoNumber}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Registered name on this number</p>
                  {momoRegisteredName ? (
                    <p className="mt-0.5 font-extrabold text-lg leading-tight break-words">{momoRegisteredName}</p>
                  ) : (
                    <p className="mt-0.5 font-semibold text-sm text-warning flex items-start gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      Not provided — verify the name on your screen with the recipient by phone.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3.5 space-y-2 text-sm">
                <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Method</span><span className="font-semibold truncate text-right">{methodLabel}</span></div>
                {isBank && (
                  <>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Account number</span><span className="font-mono font-semibold truncate text-right">{withdrawal.bank_account_number || '—'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Account name</span><span className="font-semibold truncate text-right">{withdrawal.bank_account_name || '—'}</span></div>
                  </>
                )}
                {isCash && (
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Recipient contact</span><span className="font-mono font-semibold truncate text-right">{recipientPhone}</span></div>
                )}
                <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Account holder</span><span className="font-semibold truncate text-right">{recipientName}</span></div>
              </div>
            )}

            <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-border/60 p-3">
              <Checkbox
                checked={claimDetailsConfirmed}
                onCheckedChange={(v) => setClaimDetailsConfirmed(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm font-medium leading-snug">
                {isMoMo
                  ? 'I confirm the Mobile Money number and the registered MTN/Airtel name above match what I will pay out.'
                  : 'I confirm the payout details above match what I will pay out.'}
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClaimOpen(false)} disabled={claimingId === withdrawal.id}>Cancel</Button>
            <Button
              disabled={!claimDetailsConfirmed || claimingId === withdrawal.id}
              onClick={() => {
                setConfirmClaimOpen(false);
                onClaim?.();
              }}
            >
              {claimingId === withdrawal.id ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <UserCheck className="h-4 w-4 mr-1.5" />}
              Confirm & Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
