import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowDownToLine, AlertCircle, Smartphone, Landmark, Banknote, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

type PayoutMode = 'mobile_money' | 'bank_transfer' | 'cash';

interface PayoutRoute {
  key: string;
  source: 'saved' | 'portfolio';
  label: string;
  sublabel: string;
  is_default: boolean;
  payout_mode: PayoutMode;
  momo_provider: 'MTN' | 'Airtel' | null;
  momo_number: string | null;
  momo_name: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  portfolio_id?: string;
  portfolio_code?: string | null;
}

interface AgentProxyWithdrawalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funderId: string;
  funderName: string;
  funderPhone: string;
  walletBalance: number;
  onSuccess?: () => void;
}

export function AgentProxyWithdrawalDialog({
  open, onOpenChange, funderId, funderName, funderPhone, walletBalance, onSuccess,
}: AgentProxyWithdrawalDialogProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [routes, setRoutes] = useState<PayoutRoute[]>([]);
  const [selectedRouteKey, setSelectedRouteKey] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const clientRequestIdRef = useRef<string | null>(null);
  // The partner's OWN strict withdrawable (ledger-derived). The DB trigger
  // `enforce_withdrawal_ledger_match` validates the request against this,
  // NOT against the agent's wallet. If we cap on the agent's wallet only,
  // partners whose ROI/capital hasn't been credited to their own wallet
  // post the custody-v2 cutoff will hit `Ledger mismatch detected`.
  const [partnerAvailable, setPartnerAvailable] = useState<number | null>(null);
  const [loadingPartnerBalance, setLoadingPartnerBalance] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(0);
    setReason('');
    clientRequestIdRef.current = null;
    setRoutes([]);
    setSelectedRouteKey(null);
    if (!funderId) return;

    let cancelled = false;
    (async () => {
      setLoadingRoutes(true);
      setLoadingPartnerBalance(true);
      // Fetch the partner's real ledger-strict withdrawable in parallel with routes.
      (async () => {
        const { data, error } = await supabase.rpc(
          'get_user_available_balance',
          { p_user_id: funderId } as any,
        );
        if (cancelled) return;
        if (error) {
          setPartnerAvailable(0);
        } else {
          setPartnerAvailable(Number(data ?? 0));
        }
        setLoadingPartnerBalance(false);
      })();
      try {
        const [savedRes, portfoliosRes] = await Promise.all([
          supabase
            .from('saved_payout_methods' as never)
            .select('*')
            .eq('user_id', funderId)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false }),
          supabase
            .from('investor_portfolios')
            .select('id, portfolio_code, account_name, status, payment_method, mobile_network, mobile_money_number, bank_name, bank_account_name, account_number')
            .eq('investor_id', funderId)
            .in('status', ['active', 'pending', 'pending_approval', 'matured'])
            .not('payment_method', 'is', null)
            .order('created_at', { ascending: false })
            .limit(50),
        ]);
        if (cancelled) return;

        const list: PayoutRoute[] = [];
        for (const s of ((savedRes.data ?? []) as any[])) {
          list.push({
            key: `saved:${s.id}`,
            source: 'saved',
            label: s.nickname || (s.payout_mode === 'mobile_money' ? `${s.momo_provider} MoMo` : s.payout_mode === 'bank_transfer' ? (s.bank_name || 'Bank') : 'Cash'),
            sublabel: s.payout_mode === 'mobile_money'
              ? `${s.momo_number ?? '—'} · ${s.momo_name ?? ''}`.trim()
              : s.payout_mode === 'bank_transfer'
                ? `${s.bank_account_number ?? '—'} · ${s.bank_account_name ?? ''}`.trim()
                : 'Cash pickup',
            is_default: !!s.is_default,
            payout_mode: s.payout_mode,
            momo_provider: s.momo_provider,
            momo_number: s.momo_number,
            momo_name: s.momo_name,
            bank_name: s.bank_name,
            bank_account_name: s.bank_account_name,
            bank_account_number: s.bank_account_number,
          });
        }
        for (const p of ((portfoliosRes.data ?? []) as any[])) {
          list.push({
            key: `portfolio:${p.id}`,
            source: 'portfolio',
            label: p.portfolio_code || p.account_name || `Portfolio ${p.id.slice(0, 6)}`,
            sublabel: p.payment_method === 'mobile_money'
              ? `${p.mobile_network ?? 'MoMo'} · ${p.mobile_money_number ?? '—'}`
              : p.payment_method === 'bank_transfer'
                ? `${p.bank_name ?? 'Bank'} · ${p.account_number ?? '—'}`
                : 'Cash pickup',
            is_default: false,
            payout_mode: p.payment_method,
            momo_provider: p.mobile_network,
            momo_number: p.mobile_money_number,
            momo_name: p.account_name,
            bank_name: p.bank_name,
            bank_account_name: p.bank_account_name,
            bank_account_number: p.account_number,
            portfolio_id: p.id,
            portfolio_code: p.portfolio_code,
          });
        }

        setRoutes(list);
        const preferred = list.find(r => r.is_default) ?? list[0] ?? null;
        setSelectedRouteKey(preferred?.key ?? null);
      } catch (e: any) {
        toast.error('Failed to load saved payment options', { description: e.message });
      } finally {
        if (!cancelled) setLoadingRoutes(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, funderId]);

  const selectedRoute = routes.find(r => r.key === selectedRouteKey) ?? null;

  // The effective ceiling is the PARTNER's own strict withdrawable — that is
  // what the server-side trigger enforces. We keep the agent-wallet check as
  // a secondary guard (funds have to physically leave the agent's pool too),
  // but the primary limit is the partner's balance.
  const partnerCeiling = partnerAvailable ?? 0;
  const effectiveCeiling = Math.min(partnerCeiling, walletBalance);

  const isValid =
    amount >= 500 &&
    amount <= effectiveCeiling &&
    partnerAvailable !== null &&
    reason.trim().length >= 10 &&
    !!selectedRoute;

  const handleSubmit = async () => {
    if (!user || !isValid) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setLoading(true);
    try {
      if (!clientRequestIdRef.current) {
        clientRequestIdRef.current =
          (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      const clientRequestId = clientRequestIdRef.current;
      const route = selectedRoute!;
      const routeMeta = route.source === 'portfolio'
        ? ` | Route: portfolio ${route.portfolio_code ?? route.portfolio_id}`
        : ` | Route: saved method "${route.label}"`;
      // CUSTODY-V2: partner is the legal owner of the funds.
      // user_id  = partner (so v_user_wallet_strict auto-deducts partner.withdrawable
      //            and existing approve-withdrawal flow debits the partner's wallet).
      // initiated_by / agent_id = agent (audit trail; trg_force_proxy_finops_visibility
      //            forces auto_dispatched=false so FinOps always sees the row).
      // beneficiary_id = partner (legal owner, matches user_id).
      // No `linked_party` is set — that field is reserved for legacy custody rows
      // and is now blocked at the ledger level by trg_block_proxy_custody_writes.
      const { error } = await supabase.from('withdrawal_requests').insert({
        user_id: funderId,
        agent_id: user.id,
        initiated_by: user.id,
        beneficiary_id: funderId,
        amount,
        status: 'pending' as const,
        reason: `[Proxy initiated by agent ${user.id}] ${reason.trim()}${routeMeta}`,
        proxy_partner_id: funderId,
        client_request_id: clientRequestId,
        auto_dispatched: false,
        // Pre-populate the payout route the partner has on file so Financial Ops
        // does not need to re-key MoMo / bank details. This pulls from the
        // selected saved method or per-portfolio route.
        payout_method: route.payout_mode,
        mobile_money_provider: route.payout_mode === 'mobile_money' ? route.momo_provider : null,
        mobile_money_number: route.payout_mode === 'mobile_money' ? route.momo_number : null,
        mobile_money_name: route.payout_mode === 'mobile_money' ? route.momo_name : null,
        bank_name: route.payout_mode === 'bank_transfer' ? route.bank_name : null,
        bank_account_name: route.payout_mode === 'bank_transfer' ? route.bank_account_name : null,
        bank_account_number: route.payout_mode === 'bank_transfer' ? route.bank_account_number : null,
      } as any);
      if (error) {
        // 23505 = unique_violation. Either the idempotency key collided
        // (genuine network retry — treat as success) or the dedupe
        // trigger fired because an identical proxy withdrawal is already
        // waiting. Surface a friendly message in the latter case so the
        // agent doesn't keep tapping.
        if ((error as any).code === '23505') {
          const msg = String((error as any).message || '');
          if (msg.includes('DUPLICATE_PENDING_WITHDRAWAL')) {
            toast.error(
              `A withdrawal of ${formatUGX(amount)} for ${funderName} was just submitted a few minutes ago. Wait about 15 minutes (or for it to be settled) before submitting the same amount again.`,
              { duration: 8000 },
            );
            clientRequestIdRef.current = null;
            isSubmittingRef.current = false;
            setLoading(false);
            return;
          }
          // Idempotency-key collision: original insert succeeded.
        } else if (
          String((error as any).message || '').includes('Ledger mismatch detected')
        ) {
          // Server-side trigger: partner's own ledger-strict withdrawable is
          // less than the requested amount. Refresh the partner balance and
          // surface a clear, non-generic message.
          const { data: fresh } = await supabase.rpc(
            'get_user_available_balance',
            { p_user_id: funderId } as any,
          );
          const freshAvail = Number(fresh ?? 0);
          setPartnerAvailable(freshAvail);
          toast.error(
            `${funderName} only has ${formatUGX(freshAvail)} available to withdraw right now.`,
            {
              description:
                `You requested ${formatUGX(amount)}. Partner-level available balance is set by CFO credits (ROI/capital) posted to this partner. Ask CFO to credit the outstanding amount, or lower the request.`,
              duration: 10000,
            },
          );
          clientRequestIdRef.current = null;
          isSubmittingRef.current = false;
          setLoading(false);
          return;
        } else {
          throw error;
        }
      }

      // Get the newly created withdrawal request ID for audit
      const { data: newRow } = await supabase
        .from('withdrawal_requests')
        .select('id')
        .eq('user_id', funderId)
        .eq('initiated_by', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'proxy_withdrawal_request',
        table_name: 'withdrawal_requests',
        record_id: newRow?.id || funderId,
        metadata: {
          funder_id: funderId,
          funder_name: funderName,
          amount,
          reason: reason.trim(),
          payout_route_source: route.source,
          payout_route_key: route.key,
          portfolio_id: route.portfolio_id ?? null,
          payout_method: route.payout_mode,
        },
      } as any);

      toast.success('Withdrawal request submitted', {
        description: `${formatUGX(amount)} withdrawal for ${funderName} is pending Financial Ops approval`,
      });
      onOpenChange(false);
      onSuccess?.();
      clientRequestIdRef.current = null;
    } catch (err: any) {
      toast.error('Failed to submit', { description: err.message });
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
            Withdraw for {funderName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Balance */}
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground">Available Balance</p>
            <p className="text-lg font-bold">{formatUGX(walletBalance)}</p>
          </div>

          {walletBalance < 500 && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Insufficient balance for withdrawal
            </div>
          )}

          {/* Saved payout routes */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Payout Destination
            </Label>
            {loadingRoutes ? (
              <div className="py-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : routes.length === 0 ? (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  No payment details on file for {funderName}. Ask Partner Ops to save MoMo or bank details
                  before requesting a withdrawal.
                </span>
              </div>
            ) : (
              <div className="space-y-1.5 mt-1">
                {routes.map(r => {
                  const active = r.key === selectedRouteKey;
                  const Icon = r.payout_mode === 'mobile_money' ? Smartphone : r.payout_mode === 'bank_transfer' ? Landmark : Banknote;
                  return (
                    <button
                      type="button"
                      key={r.key}
                      onClick={() => setSelectedRouteKey(r.key)}
                      className={cn(
                        'w-full flex items-start gap-2 p-2.5 rounded-md border text-left transition-colors',
                        active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                      )}
                    >
                      <Icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0 text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold truncate">{r.label}</span>
                          {r.source === 'portfolio' ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary flex items-center gap-1">
                              <Wallet className="h-2.5 w-2.5" /> Per-portfolio
                            </span>
                          ) : r.is_default ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-success/10 text-success">Default</span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Saved</span>
                          )}
                        </div>
                        <p className="text-muted-foreground truncate">{r.sublabel}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Amount */}
          <div>
            <Label className="text-xs">Amount (UGX) *</Label>
            <Input
              type="number"
              placeholder="e.g. 50000"
              value={amount || ''}
              onChange={e => setAmount(Number(e.target.value))}
              min={500}
              max={walletBalance}
            />
            {amount > walletBalance && (
              <p className="text-[10px] text-destructive mt-1">Exceeds available balance</p>
            )}
          </div>

          {/* Reason */}
          <div>
            <Label className="text-xs">Reason (min 10 chars) *</Label>
            <Textarea
              placeholder="e.g. Funder requested cash withdrawal for personal needs"
              value={reason}
              onChange={e => setReason(e.target.value)}
              maxLength={500}
              rows={2}
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">{reason.length}/500</p>
          </div>

          <div className="rounded-lg bg-warning/10 p-2.5 text-[10px] text-warning">
            ⚠️ Submitted on behalf of <strong>{funderName}</strong> and fully audited.
            {selectedRoute
              ? <> Financial Ops will pay out to the selected destination above.</>
              : <> Select a payout destination first.</>}
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!isValid || loading || walletBalance < 500}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Request Withdrawal – {formatUGX(amount || 0)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
