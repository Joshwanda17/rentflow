import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Wallet, Banknote, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { UserSearchPicker } from '@/components/cfo/UserSearchPicker';
import { formatUGX } from '@/lib/rentCalculations';

type Route = 'personal_deposit' | 'operational_float';

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
}

/**
 * Financial-Ops tool to redirect a confirmed inbound transaction email to a
 * specific user — either as a Personal Deposit (Withdrawable) or as
 * Operational Float. Routes through the `cfo-direct-credit` edge function so
 * the existing Wallet Routing v2 + ledger rules apply.
 */
export function RouteEmailDepositDialog({ open, onOpenChange, row, suggestedUser }: Props) {
  const { toast } = useToast();
  const [user, setUser] = useState<PrefilledUser | null>(null);
  const [amount, setAmount] = useState('');
  const [route, setRoute] = useState<Route>('personal_deposit');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open && row) {
      setUser(suggestedUser ?? null);
      setAmount(row.amount ? String(Math.round(row.amount)) : '');
      setRoute('personal_deposit');
      const tid = row.transaction_id ? ` TID ${row.transaction_id}` : '';
      const from = row.from_name || row.from_email || 'email';
      setReason(`Routed inbound deposit email from ${from}${tid}.`);
    }
  }, [open, row, suggestedUser]);

  const send = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error('No email row');
      if (!user) throw new Error('Pick a recipient user');
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a valid amount');
      if (reason.trim().length < 10) throw new Error('Reason must be at least 10 characters');

      const isFloat = route === 'operational_float';
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

      return { ...(data as any), smsSent, smsError };
    },
    onSuccess: (res: any) => {
      const routeLabel = route === 'operational_float' ? 'Operational Float' : 'Personal Deposit';
      toast({
        title: 'Deposit routed',
        description: res?.smsSent
          ? `${formatUGX(Number(amount))} credited to ${user?.full_name} as ${routeLabel}. SMS sent.`
          : `${formatUGX(Number(amount))} credited to ${user?.full_name} as ${routeLabel}. SMS could not be sent${res?.smsError ? ` (${res.smsError})` : ''}.`,
      });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: 'Could not route deposit', description: e.message, variant: 'destructive' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Redirect deposit to user</DialogTitle>
          <DialogDescription>
            Credit this inbound transaction to a specific user as Personal Deposit (withdrawable) or Operational Float.
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

        <div className="space-y-3">
          <UserSearchPicker
            label="Route to user"
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

          <div>
            <Label className="text-xs">Reason (min 10 chars)</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending || !user || !amount || Number(amount) <= 0 || reason.trim().length < 10}
            className="w-full h-11 gap-2"
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Route {amount ? formatUGX(Number(amount)) : 'deposit'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}