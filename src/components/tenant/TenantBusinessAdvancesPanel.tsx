import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/businessAdvanceCalculations';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Briefcase, Banknote, TrendingUp, CheckCircle2, Loader2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending review', color: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
  agent_ops_approved: { label: 'Agent Ops approved', color: 'bg-blue-500/10 text-blue-700 border-blue-500/30' },
  tenant_ops_approved: { label: 'Tenant Ops approved', color: 'bg-blue-500/10 text-blue-700 border-blue-500/30' },
  landlord_ops_approved: { label: 'Verification complete', color: 'bg-blue-500/10 text-blue-700 border-blue-500/30' },
  coo_approved: { label: 'Awaiting disbursement', color: 'bg-violet-500/10 text-violet-700 border-violet-500/30' },
  active: { label: 'Active', color: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' },
  completed: { label: 'Paid off', color: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' },
  rejected: { label: 'Rejected', color: 'bg-red-500/10 text-red-700 border-red-500/30' },
  defaulted: { label: 'Defaulted', color: 'bg-red-500/10 text-red-700 border-red-500/30' },
};

export function TenantBusinessAdvancesPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const { data: advances = [], isLoading } = useQuery({
    queryKey: ['tenant-business-advances', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_advances').select('*')
        .eq('tenant_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const payMutation = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const { data, error } = await supabase.functions.invoke('repay-business-advance', {
        body: { advance_id: id, amount },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(data?.completed ? 'Advance paid off! 🎉' : `Paid UGX ${data?.applied?.toLocaleString()}`);
      setPayingId(null); setPayAmount('');
      qc.invalidateQueries({ queryKey: ['tenant-business-advances'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (advances.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Briefcase className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">No business advances yet.</p>
          <p className="text-xs mt-1">Ask your agent if you need a business advance.</p>
        </CardContent>
      </Card>
    );
  }

  const paying = advances.find((a: any) => a.id === payingId);

  return (
    <>
      <div className="space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" />Your Business Advances</h3>
        {advances.map((adv: any) => {
          const s = STATUS_LABEL[adv.status] || { label: adv.status, color: 'bg-muted' };
          const outstanding = Number(adv.outstanding_balance);
          const principal = Number(adv.principal);
          const interest = Number(adv.total_interest_accrued || 0);
          const repaid = Number(adv.total_repaid || 0);
          const canPay = adv.status === 'active' && outstanding > 0;

          return (
            <Card key={adv.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{adv.business_name}</p>
                    <p className="text-[10px] text-muted-foreground">{adv.business_type} • {format(new Date(adv.created_at), 'MMM d, yyyy')}</p>
                  </div>
                  <Badge className={`${s.color} text-[10px]`} variant="outline">{s.label}</Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-muted/40">
                    <p className="text-[10px] text-muted-foreground">Borrowed</p>
                    <p className="font-bold">{formatUGX(principal)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40">
                    <p className="text-[10px] text-muted-foreground">Repaid</p>
                    <p className="font-bold text-emerald-600">{formatUGX(repaid)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <p className="text-[10px] text-muted-foreground">Outstanding</p>
                    <p className="font-bold text-amber-700">{formatUGX(outstanding)}</p>
                  </div>
                </div>

                {interest > 0 && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Interest accrued so far: {formatUGX(interest)} (1%/day compounding)
                  </p>
                )}

                {canPay && (
                  <Button
                    className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => { setPayingId(adv.id); setPayAmount(String(Math.min(outstanding, 50000))); }}
                  >
                    <Banknote className="h-4 w-4" /> Make a payment
                  </Button>
                )}

                {adv.status === 'completed' && (
                  <p className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Fully repaid — well done!</p>
                )}
                {['pending','agent_ops_approved','tenant_ops_approved','landlord_ops_approved','coo_approved'].includes(adv.status) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Funds will land in your wallet once approved & disbursed.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!payingId} onOpenChange={(o) => !o && setPayingId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pay {paying?.business_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-muted/40 text-sm">
              <p>Outstanding: <strong>{formatUGX(Number(paying?.outstanding_balance || 0))}</strong></p>
            </div>
            <Input
              type="text"
              inputMode="numeric"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value.replace(/\D/g, ''))}
              placeholder="Amount in UGX"
            />
            <div className="grid grid-cols-3 gap-2">
              {[10000, 50000, 100000].map((q) => (
                <Button key={q} variant="outline" size="sm" onClick={() => setPayAmount(String(q))}>
                  {formatUGX(q)}
                </Button>
              ))}
            </div>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={payMutation.isPending || !payAmount || Number(payAmount) <= 0}
              onClick={() => payMutation.mutate({ id: payingId!, amount: Number(payAmount) })}
            >
              {payMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Pay ${formatUGX(Number(payAmount || 0))}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
