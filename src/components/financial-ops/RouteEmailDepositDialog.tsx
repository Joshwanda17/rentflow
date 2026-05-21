import { useEffect, useState } from 'react';
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
import { Loader2, Wallet, Banknote, ArrowRight, AlertTriangle, UserCog } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { UserSearchPicker } from '@/components/cfo/UserSearchPicker';
import { formatUGX } from '@/lib/rentCalculations';

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
}

export interface PrefilledUser { id: string; full_name: string; phone: string }

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
}

/**
 * Financial-Ops tool to redirect a confirmed inbound transaction email to a
 * specific user — either as a Personal Deposit (Withdrawable) or as
 * Operational Float. Routes through the `cfo-direct-credit` edge function so
 * the existing Wallet Routing v2 + ledger rules apply.
 */
export function RouteEmailDepositDialog({ open, onOpenChange, row, suggestedUser, mode = 'credit' }: Props) {
  const { toast } = useToast();
  const [user, setUser] = useState<PrefilledUser | null>(null);
  const [amount, setAmount] = useState('');
  const [route, setRoute] = useState<Route>('personal_deposit');
  const [debitRoute, setDebitRoute] = useState<DebitRoute>('withdrawable');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open && row) {
      setUser(suggestedUser ?? null);
      setAmount(row.amount ? String(Math.round(row.amount)) : '');
      setRoute('personal_deposit');
      setDebitRoute('withdrawable');
      const tid = row.transaction_id ? ` TID ${row.transaction_id}` : '';
      const from = row.from_name || row.from_email || 'email';
      setReason(mode === 'debit'
        ? `Charged outgoing payment email from ${from}${tid} against user wallet.`
        : `Routed inbound deposit email from ${from}${tid}.`);
    }
  }, [open, row, suggestedUser, mode]);

  // ── Detect managed-proxy partner ─────────────────────────────────
  // If the picked user is a partner with an active+approved+managed proxy
  // assignment, the debit MUST hit the proxy agent's wallet (not the
  // partner's). Mirrors the rule in `resolveManagedProxy` used server-side
  // for credits.
  const proxy = useQuery({
    queryKey: ['route-email-managed-proxy', user?.id, mode],
    enabled: open && mode === 'debit' && !!user?.id,
    queryFn: async () => {
      if (!user?.id) return null;
      const { data: assignment } = await (supabase.from('proxy_agent_assignments') as any)
        .select('id, agent_id')
        .eq('beneficiary_id', user.id)
        .eq('is_active', true)
        .eq('is_managed_account', true)
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

  const send = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error('No email row');
      if (!user) throw new Error('Pick a recipient user');
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a valid amount');
      if (reason.trim().length < 10) throw new Error('Reason must be at least 10 characters');

      // ─── DEBIT MODE (money-out) ────────────────────────────────
      if (mode === 'debit') {
        const managed = proxy.data;
        // Hard rule: when the picked user is a managed-proxy partner, the
        // debit redirects to the proxy agent's wallet. The partner's wallet
        // is never touched (mirrors managed-proxy payout routing).
        const debitTargetId = managed ? managed.agentId : user.id;
        const debitTargetName = managed ? managed.agentName : user.full_name;
        const debitTargetPhone = managed ? managed.agentPhone : user.phone;
        const isFloat = debitRoute === 'landlord_float';
        const debitBody = {
          target_user_id: debitTargetId,
          amount: amt,
          reason: managed
            ? `Outgoing email charged to proxy agent wallet (on behalf of partner ${user.full_name}): ${reason.trim()}`
            : reason.trim(),
          operation: 'debit' as const,
          // Float bucket: agent_float_deposit (locked to float in cfo-direct-credit).
          // Withdrawable bucket: wallet_transfer (user-owned, allowed for user recipient).
          wallet_category: isFloat ? 'agent_float_deposit' : 'wallet_transfer',
          platform_category: isFloat ? 'agent_float_deposit' : 'wallet_transfer',
          financial_impact: 'neutral' as const,
          category_label: isFloat ? 'Email charge → Landlord-Payout Float' : 'Email charge → Withdrawable',
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
              route: isFloat ? 'landlord_float_debit' : 'withdrawable_debit',
              reference_id: referenceId,
              from_label: fromLabel,
              transaction_id: row.transaction_id,
              debit: true,
              on_behalf_of_partner: managed ? user.full_name : null,
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
              route: isFloat ? 'landlord_float_debit' : 'withdrawable_debit',
              target_user_id: debitTargetId,
              target_user_name: debitTargetName,
              target_user_phone: debitTargetPhone,
              reason: managed
                ? `DEBIT (proxy redirect from partner ${user.full_name}): ${reason.trim()}`
                : `DEBIT: ${reason.trim()}`,
              ledger_reference_id: referenceId,
              routed_by: me.user.id,
              routed_by_name: routedByName,
              sms_sent: smsSent,
              sms_error: smsError,
            });
          }
        } catch (e) { console.warn('[RouteEmailDeposit] debit history insert failed', e); }

        return { ...(debitData as any), smsSent, smsError, debit: true, proxyRedirected: !!managed, debitTargetName };
      }

      const isFloat = route === 'operational_float';

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
        };
        const { data: revData, error: revErr } = await supabase.functions.invoke('cfo-direct-credit', { body: debitBody });
        if (revErr) throw new Error(`Reversal failed: ${(revErr as any)?.message || 'unknown'}`);
        if ((revData as any)?.error) throw new Error(`Reversal failed: ${(revData as any).error}`);
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

      return { ...(data as any), smsSent, smsError, reversed: mustReverse };
    },
    onSuccess: (res: any) => {
      if (mode === 'debit') {
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
      const reversedPart = res?.reversed ? ' Original auto-credit reversed.' : '';
      toast({
        title: 'Deposit routed',
        description: res?.smsSent
          ? `${formatUGX(Number(amount))} credited to ${user?.full_name} as ${routeLabel}. SMS sent.${reversedPart}`
          : `${formatUGX(Number(amount))} credited to ${user?.full_name} as ${routeLabel}. SMS could not be sent${res?.smsError ? ` (${res.smsError})` : ''}.${reversedPart}`,
      });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: mode === 'debit' ? 'Could not debit wallet' : 'Could not route deposit', description: e.message, variant: 'destructive' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'debit' ? 'Charge outgoing payment to user wallet' : 'Redirect deposit to user'}</DialogTitle>
          <DialogDescription>
            {mode === 'debit'
              ? 'Debits this outbound transaction from a user\'s wallet (never from Welile operational float). Auto-redirects to the proxy agent\'s wallet when the picked user is a partner with a managed-proxy assignment.'
              : 'Credit this inbound transaction to a specific user as Personal Deposit (withdrawable) or Operational Float.'}
          </DialogDescription>
        </DialogHeader>

        {row && (
          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-0.5">
            <p><span className="text-muted-foreground">From:</span> {row.from_name || row.from_email || '—'}</p>
            {row.transaction_id && (
              <p className="font-mono"><span className="text-muted-foreground font-sans">TID:</span> {row.transaction_id}</p>
            )}
            <p><span className="text-muted-foreground">Subject:</span> {row.subject || '—'}</p>
          </div>
        )}

        {mode === 'credit' && existing.data && user && existing.data.original_user_id !== user.id && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs flex gap-2 dark:bg-amber-950/30 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-medium text-amber-900 dark:text-amber-200">Will reverse prior auto-credit</p>
              <p className="text-amber-800 dark:text-amber-300">
                {formatUGX(existing.data.original_amount)} was auto-credited to <span className="font-semibold">{existing.data.original_user_name}</span>. Routing now will debit them and credit the chosen user. Both users will be SMS-notified.
              </p>
            </div>
          </div>
        )}
        {mode === 'credit' && existing.data && user && existing.data.original_user_id === user.id && (
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            This deposit was already auto-credited to {existing.data.original_user_name}. Routing will add another credit — confirm this is intentional.
          </div>
        )}

        {mode === 'debit' && proxy.data && (
          <div className="rounded-lg border border-violet-300 bg-violet-50 p-3 text-xs flex gap-2 dark:bg-violet-950/30 dark:border-violet-800">
            <UserCog className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-medium text-violet-900 dark:text-violet-200">Managed-proxy partner detected</p>
              <p className="text-violet-800 dark:text-violet-300">
                <span className="font-semibold">{user?.full_name}</span> is managed by proxy agent <span className="font-semibold">{proxy.data.agentName}</span>. The debit will hit the <span className="font-semibold">proxy agent's wallet</span> — the partner's wallet will not be touched.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <UserSearchPicker
            label={mode === 'debit' ? 'Charge wallet of user' : 'Route to user'}
            placeholder="Search by name or phone…"
            selectedUser={user}
            onSelect={setUser}
          />

          <div>
            <Label className="text-xs">Amount (UGX)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-10"
            />
          </div>

          {mode === 'credit' && (
          <div>
            <Label className="text-xs">Route as</Label>
            <RadioGroup value={route} onValueChange={(v) => setRoute(v as Route)} className="mt-1 space-y-2">
              <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="personal_deposit" id="route-personal" className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Banknote className="h-3.5 w-3.5 text-primary" /> Personal Deposit
                  </div>
                  <p className="text-[11px] text-muted-foreground">Lands in the user's withdrawable balance.</p>
                </div>
              </label>
              <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="operational_float" id="route-float" className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Wallet className="h-3.5 w-3.5 text-primary" /> Operational Float
                  </div>
                  <p className="text-[11px] text-muted-foreground">Lands in float balance (cannot be withdrawn; for rent collection).</p>
                </div>
              </label>
            </RadioGroup>
          </div>
          )}

          {mode === 'debit' && (
          <div>
            <Label className="text-xs">Deduct from</Label>
            <RadioGroup value={debitRoute} onValueChange={(v) => setDebitRoute(v as DebitRoute)} className="mt-1 space-y-2">
              <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="withdrawable" id="debit-withdrawable" className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Banknote className="h-3.5 w-3.5 text-primary" /> Withdrawable balance
                  </div>
                  <p className="text-[11px] text-muted-foreground">Reduces the user's withdrawable wallet. Use when the payment was for personal money the user owns.</p>
                </div>
              </label>
              <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="landlord_float" id="debit-landlord-float" className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Wallet className="h-3.5 w-3.5 text-primary" /> Landlord-Payout Float
                  </div>
                  <p className="text-[11px] text-muted-foreground">Reduces the agent's float balance. Use when a landlord was paid out of the agent's collected rent float.</p>
                </div>
              </label>
            </RadioGroup>
          </div>
          )}

          <div>
            <Label className="text-xs">Reason (min 10 chars)</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending || !user || !amount || Number(amount) <= 0 || reason.trim().length < 10}
            className="w-full h-11 gap-2"
            variant={mode === 'debit' ? 'destructive' : 'default'}
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {mode === 'debit'
              ? `Debit ${amount ? formatUGX(Number(amount)) : 'wallet'}`
              : `Route ${amount ? formatUGX(Number(amount)) : 'deposit'}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}