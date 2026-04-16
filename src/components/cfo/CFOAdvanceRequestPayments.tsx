import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX, calculateAccessFee } from '@/lib/agentAdvanceCalculations';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CheckCircle2, Loader2, Pencil, User, Banknote, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CFOAdvanceRequestPayments() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [adjustedRates, setAdjustedRates] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch fee config
  const { data: feeConfig } = useQuery({
    queryKey: ['advance-fee-config'],
    queryFn: async () => {
      const { data } = await supabase.from('advance_fee_config').select('*').limit(1).maybeSingle();
      return data;
    },
  });

  // Fetch COO-approved requests
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['cfo-advance-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_advance_requests')
        .select('*, profiles!agent_advance_requests_agent_id_fkey(full_name, phone)')
        .eq('status', 'coo_approved')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Update global default rate
  const updateConfigMutation = useMutation({
    mutationFn: async (newRate: number) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('advance_fee_config')
        .update({ default_monthly_rate: newRate, updated_by: user.id })
        .not('id', 'is', null); // update the single row
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Default rate updated');
      queryClient.invalidateQueries({ queryKey: ['advance-fee-config'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Pay advance to agent wallet
  const payMutation = useMutation({
    mutationFn: async (req: any) => {
      if (!user?.id) throw new Error('Not authenticated');
      const adjustedRate = adjustedRates[req.id] ?? Number(req.monthly_rate);
      const newAccessFee = calculateAccessFee(Number(req.principal), Number(req.cycle_days), adjustedRate);
      const newTotal = Number(req.principal) + newAccessFee + Number(req.registration_fee);
      const newDaily = Math.ceil(newTotal / Number(req.cycle_days));

      // 1. Update the request as paid
      const { error: updateErr } = await supabase.from('agent_advance_requests').update({
        status: 'cfo_paid',
        paid_by_cfo: user.id,
        cfo_paid_at: new Date().toISOString(),
        cfo_adjusted_rate: adjustedRate !== Number(req.monthly_rate) ? adjustedRate : null,
        cfo_notes: notes[req.id] || null,
        access_fee: newAccessFee,
        total_payable: newTotal,
        daily_payment: newDaily,
        monthly_rate: adjustedRate,
      }).eq('id', req.id);
      if (updateErr) throw updateErr;

      // 2. Create agent_advances record (starts daily deductions via existing edge function)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Number(req.cycle_days));
      
      const { error: advErr } = await supabase.from('agent_advances').insert({
        agent_id: req.agent_id,
        issued_by: user.id,
        principal: Number(req.principal),
        outstanding_balance: newTotal,
        cycle_days: Number(req.cycle_days),
        monthly_rate: adjustedRate,
        daily_rate: adjustedRate,
        access_fee: newAccessFee,
        registration_fee: Number(req.registration_fee),
        access_fee_collected: 0,
        access_fee_status: 'unpaid',
        status: 'active',
        expires_at: expiresAt.toISOString(),
      });
      if (advErr) throw advErr;

      // 3. Credit agent wallet via ledger RPC
      const { error: rpcErr } = await supabase.rpc('create_ledger_transaction', {
        entries: [
          {
            user_id: req.agent_id,
            ledger_scope: 'wallet',
            direction: 'cash_in',
            amount: Number(req.principal),
            category: 'agent_advance_credit',
            source_table: 'agent_advance_requests',
            source_id: req.id,
            description: `Agent advance disbursement - ${Number(req.cycle_days)}d @ ${Math.round(adjustedRate * 100)}%`,
            currency: 'UGX',
            transaction_date: new Date().toISOString(),
          },
          {
            user_id: req.agent_id,
            ledger_scope: 'platform',
            direction: 'cash_out',
            amount: Number(req.principal),
            category: 'rent_disbursement',
            source_table: 'agent_advance_requests',
            source_id: req.id,
            description: `Agent advance disbursed to wallet`,
            currency: 'UGX',
            transaction_date: new Date().toISOString(),
          },
        ],
      });
      if (rpcErr) throw rpcErr;

      // 4. Record registration fee revenue
      if (Number(req.registration_fee) > 0) {
        await supabase.rpc('create_ledger_transaction', {
          entries: [
            {
              user_id: req.agent_id,
              ledger_scope: 'platform',
              direction: 'cash_in',
              amount: Number(req.registration_fee),
              category: 'registration_fee_collected',
              source_table: 'agent_advance_requests',
              source_id: req.id,
              description: `Registration fee for agent advance`,
              currency: 'UGX',
              transaction_date: new Date().toISOString(),
            },
            {
              user_id: req.agent_id,
              ledger_scope: 'wallet',
              direction: 'cash_out',
              amount: Number(req.registration_fee),
              category: 'registration_fee_collected',
              source_table: 'agent_advance_requests',
              source_id: req.id,
              description: `Registration fee deducted`,
              currency: 'UGX',
              transaction_date: new Date().toISOString(),
            },
          ],
        });
      }
    },
    onSuccess: () => {
      toast.success('Advance paid to agent wallet!');
      queryClient.invalidateQueries({ queryKey: ['cfo-advance-requests'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Global Fee Config */}
      {feeConfig && (
        <Card className="border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Global Default Rate</p>
                <p className="text-2xl font-bold text-primary">{Math.round(Number(feeConfig.default_monthly_rate) * 100)}%</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingRate(editingRate ? null : 'global')}
                className="gap-1"
              >
                <Pencil className="h-3 w-3" /> Edit
              </Button>
            </div>
            {editingRate === 'global' && (
              <div className="space-y-2 mt-3 p-3 rounded-xl bg-muted/50">
                <p className="text-xs text-muted-foreground">
                  Range: {Math.round(Number(feeConfig.min_rate) * 100)}% – {Math.round(Number(feeConfig.max_rate) * 100)}%
                </p>
                <Slider
                  min={Number(feeConfig.min_rate) * 100}
                  max={Number(feeConfig.max_rate) * 100}
                  step={1}
                  value={[Math.round(Number(feeConfig.default_monthly_rate) * 100)]}
                  onValueChange={([v]) => {
                    updateConfigMutation.mutate(v / 100);
                    setEditingRate(null);
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Requests */}
      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Banknote className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No advance requests pending payment</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">COO-Approved Advance Requests</h3>
            <Badge variant="secondary">{requests.length} ready</Badge>
          </div>
          {requests.map((req: any) => {
            const profile = req.profiles;
            const isExpanded = expandedId === req.id;
            const currentRate = adjustedRates[req.id] ?? Number(req.monthly_rate);
            const adjAccessFee = calculateAccessFee(Number(req.principal), Number(req.cycle_days), currentRate);
            const adjTotal = Number(req.principal) + adjAccessFee + Number(req.registration_fee);
            const adjDaily = Math.ceil(adjTotal / Number(req.cycle_days));

            return (
              <Card key={req.id}>
                <CardContent className="p-4">
                  <button onClick={() => setExpandedId(isExpanded ? null : req.id)} className="w-full text-left">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{profile?.full_name || 'Agent'}</p>
                        <p className="text-[10px] text-muted-foreground">{profile?.phone} • {format(new Date(req.created_at), 'MMM d')}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-primary">{formatUGX(Number(req.principal))}</p>
                        <p className="text-[10px] text-muted-foreground">{req.cycle_days}d</p>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-4 space-y-3">
                      {/* Fee adjustment */}
                      <div className="p-3 rounded-xl bg-muted/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold">Access Fee Rate</p>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-primary">{Math.round(currentRate * 100)}%</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => setEditingRate(editingRate === req.id ? null : req.id)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {editingRate === req.id && (
                          <Slider
                            min={28}
                            max={33}
                            step={1}
                            value={[Math.round(currentRate * 100)]}
                            onValueChange={([v]) => setAdjustedRates(prev => ({ ...prev, [req.id]: v / 100 }))}
                          />
                        )}
                      </div>

                      {/* Breakdown */}
                      <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-muted/30 text-xs">
                        <div><span className="text-muted-foreground">Principal</span><br /><span className="font-bold">{formatUGX(Number(req.principal))}</span></div>
                        <div><span className="text-muted-foreground">Access Fee</span><br /><span className="font-bold text-orange-600">{formatUGX(adjAccessFee)}</span></div>
                        <div><span className="text-muted-foreground">Total Payable</span><br /><span className="font-bold text-primary">{formatUGX(adjTotal)}</span></div>
                        <div><span className="text-muted-foreground">Daily</span><br /><span className="font-bold text-red-500">{formatUGX(adjDaily)}/d</span></div>
                      </div>

                      <div className="p-3 rounded-xl bg-muted/30">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Reason</p>
                        <p className="text-xs">{req.reason}</p>
                      </div>

                      <Textarea
                        placeholder="CFO notes..."
                        value={notes[req.id] || ''}
                        onChange={e => setNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                        rows={2}
                        className="text-sm"
                      />

                      <Button
                        onClick={() => payMutation.mutate(req)}
                        disabled={payMutation.isPending}
                        className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {payMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Pay to Wallet</>}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
