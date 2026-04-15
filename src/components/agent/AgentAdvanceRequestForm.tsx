import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCreditAccessLimit } from '@/hooks/useCreditAccessLimit';
import { calculateAccessFee, calculateRegistrationFee, calculateTotalPayable, calculateDailyPayment, REPAYMENT_PERIODS, formatUGX } from '@/lib/agentAdvanceCalculations';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2, ArrowRight, Shield, Banknote, Calendar, FileText, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface AgentAdvanceRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  pending: { label: 'Pending', icon: Clock, color: 'bg-orange-500' },
  agent_ops_approved: { label: 'Agent Ops ✓', icon: CheckCircle2, color: 'bg-blue-500' },
  tenant_ops_approved: { label: 'Tenant Ops ✓', icon: CheckCircle2, color: 'bg-indigo-500' },
  landlord_ops_approved: { label: 'Landlord Ops ✓', icon: CheckCircle2, color: 'bg-purple-500' },
  coo_approved: { label: 'COO Approved', icon: CheckCircle2, color: 'bg-emerald-500' },
  cfo_paid: { label: 'Paid', icon: CheckCircle2, color: 'bg-green-600' },
  rejected: { label: 'Rejected', icon: XCircle, color: 'bg-red-500' },
};

export function AgentAdvanceRequestForm({ open, onOpenChange }: AgentAdvanceRequestFormProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { limit, loading: limitLoading } = useCreditAccessLimit(user?.id);

  const [amount, setAmount] = useState('');
  const [cycleDays, setCycleDays] = useState<number>(30);
  const [reason, setReason] = useState('');

  const principal = Math.max(0, parseInt(amount) || 0);
  const monthlyRate = 0.33;
  const accessFee = calculateAccessFee(principal, cycleDays, monthlyRate);
  const registrationFee = calculateRegistrationFee(principal);
  const totalPayable = calculateTotalPayable(principal, cycleDays, monthlyRate);
  const dailyPayment = calculateDailyPayment(principal, cycleDays, monthlyRate);
  const maxAmount = limit?.totalLimit || 0;
  const overLimit = principal > maxAmount;

  const { data: myRequests = [], isLoading: historyLoading } = useQuery({
    queryKey: ['my-advance-requests', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('agent_advance_requests')
        .select('*')
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      if (principal <= 0) throw new Error('Amount must be greater than zero');
      if (overLimit) throw new Error(`Amount exceeds your credit limit of ${formatUGX(maxAmount)}`);
      if (reason.trim().length < 10) throw new Error('Reason must be at least 10 characters');

      // Check for existing pending requests
      const { data: existing } = await supabase
        .from('agent_advance_requests')
        .select('id')
        .eq('agent_id', user.id)
        .in('status', ['pending', 'agent_ops_approved', 'tenant_ops_approved', 'landlord_ops_approved', 'coo_approved'])
        .limit(1);
      if (existing && existing.length > 0) throw new Error('You already have a pending advance request');

      const { error } = await supabase.from('agent_advance_requests').insert({
        agent_id: user.id,
        principal,
        cycle_days: cycleDays,
        monthly_rate: monthlyRate,
        access_fee: accessFee,
        registration_fee: registrationFee,
        total_payable: totalPayable,
        daily_payment: dailyPayment,
        reason: reason.trim(),
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Advance request submitted for review');
      setAmount('');
      setReason('');
      setCycleDays(30);
      queryClient.invalidateQueries({ queryKey: ['my-advance-requests'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] overflow-y-auto rounded-t-2xl px-4 pb-6 pt-5">
        {/* Header */}
        <div className="mb-5">
          <Badge className="bg-primary/15 text-primary border-0 text-[10px] font-bold tracking-widest uppercase mb-2">
            Agent Advance
          </Badge>
          <h1 className="text-2xl font-bold text-foreground">Request an Advance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Request funds credited to your wallet. Daily deductions apply.
          </p>
        </div>

        {/* Credit limit indicator */}
        <div className="rounded-2xl bg-muted/50 p-3 mb-4 flex items-center gap-3">
          <div className="rounded-full bg-primary/15 p-2 shrink-0">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Your Credit Limit</p>
            <p className="text-lg font-bold text-foreground">
              {limitLoading ? '...' : formatUGX(maxAmount)}
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-2xl bg-muted/50 p-4 space-y-4 mb-4">
          {/* Amount */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Amount (UGX)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">UGX</span>
              <Input
                type="number"
                placeholder="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                min="1"
                max={maxAmount}
                className={cn("pl-12 bg-background border-0 rounded-xl h-12 text-base font-semibold", overLimit && "ring-2 ring-red-500")}
              />
            </div>
            {overLimit && (
              <p className="text-[10px] text-red-500 font-semibold flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Exceeds credit limit
              </p>
            )}
          </div>

          {/* Repayment Period */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Repayment Period</label>
            <div className="grid grid-cols-5 gap-1.5">
              {REPAYMENT_PERIODS.map(d => (
                <button
                  key={d}
                  onClick={() => setCycleDays(d)}
                  className={cn(
                    "py-2.5 rounded-xl text-xs font-bold transition-all",
                    cycleDays === d
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reason</label>
            <Textarea
              placeholder="Why do you need this advance? (min 10 characters)"
              value={reason}
              onChange={e => setReason(e.target.value)}
              maxLength={250}
              rows={3}
              className="bg-background border-0 rounded-xl text-sm"
            />
          </div>

          {/* Breakdown */}
          {principal > 0 && (
            <div className="space-y-2 p-3 rounded-xl bg-background/80">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Principal</span>
                <span className="font-semibold">{formatUGX(principal)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Access Fee (33%/mo)</span>
                <span className="font-semibold text-orange-600">+ {formatUGX(accessFee)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Registration Fee</span>
                <span className="font-semibold">+ {formatUGX(registrationFee)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="font-bold">Total Payable</span>
                <span className="font-bold text-primary">{formatUGX(totalPayable)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Daily Deduction</span>
                <span className="font-bold text-red-500">{formatUGX(dailyPayment)} / day</span>
              </div>
            </div>
          )}

          {/* Submit */}
          <Button
            className="w-full gap-2 bg-gradient-to-r from-purple-600 via-purple-500 to-pink-500 text-white rounded-full py-6 text-base font-semibold shadow-lg hover:opacity-90"
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || principal <= 0 || overLimit || reason.trim().length < 10}
          >
            {submitMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>Submit Request <ArrowRight className="h-4 w-4" /></>
            )}
          </Button>
        </div>

        {/* History */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">My Advance Requests</h3>
          {historyLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : myRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No advance requests yet</p>
          ) : (
            <div className="space-y-2.5">
              {myRequests.map((req: any) => {
                const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                const StatusIcon = cfg.icon;
                return (
                  <div key={req.id} className="flex items-center gap-3 rounded-2xl bg-muted/40 p-3.5">
                    <div className={cn("rounded-full p-2 shrink-0", cfg.color)}>
                      <StatusIcon className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {formatUGX(Number(req.principal))} × {req.cycle_days}d
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-muted text-muted-foreground border-0">
                          {cfg.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(req.created_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                      {req.rejection_reason && (
                        <p className="text-[10px] text-red-500 mt-1 truncate">{req.rejection_reason}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-foreground">{formatUGX(Number(req.total_payable))}</p>
                      <p className="text-[10px] text-muted-foreground">total</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
