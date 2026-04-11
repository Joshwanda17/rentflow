import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, Banknote, Home, TrendingUp, Users, Wallet, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { TreasuryImpactBanner } from './TreasuryImpactBanner';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

interface ApprovedRentItem {
  id: string;
  rent_amount: number;
  tenant_id: string;
  landlord_id: string;
  agent_id: string | null;
  assigned_agent_id: string | null;
  access_fee: number;
  request_fee: number;
  total_repayment: number;
  created_at: string;
  tenant_name: string;
  landlord_name: string;
  agent_name: string;
  has_landlord_wallet: boolean;
  payout_target: 'landlord_wallet' | 'agent_float';
}

export function RentDisbursementQueue() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchRef, setBatchRef] = useState('');
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['rent-disbursement-queue'],
    queryFn: async () => {
      // Get COO-approved rent requests
      const { data: requests, error } = await supabase
        .from('rent_requests')
        .select('id, rent_amount, tenant_id, landlord_id, agent_id, assigned_agent_id, access_fee, request_fee, total_repayment, created_at')
        .eq('status', 'coo_approved')
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (!requests?.length) return [];

      // Gather unique IDs
      const tenantIds = [...new Set(requests.map(r => r.tenant_id))];
      const landlordIds = [...new Set(requests.map(r => r.landlord_id).filter(Boolean))];
      const agentIds = [...new Set(requests.flatMap(r => [r.agent_id, r.assigned_agent_id].filter(Boolean) as string[]))];

      // Fetch profiles for tenants and agents
      const allUserIds = [...new Set([...tenantIds, ...agentIds])];
      const profileMap = new Map<string, string>();
      if (allUserIds.length) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', allUserIds);
        for (const p of profiles || []) profileMap.set(p.id, p.full_name || 'Unknown');
      }

      // Fetch landlord names
      const landlordMap = new Map<string, string>();
      if (landlordIds.length) {
        const { data: landlords } = await supabase.from('landlords').select('id, name').in('id', landlordIds);
        for (const l of landlords || []) landlordMap.set(l.id, l.name || 'Unknown');
      }

      // Check which landlords have wallets (via profiles matching landlord user references)
      // Landlords in our system may or may not have user accounts with wallets
      const walletSet = new Set<string>();
      if (landlordIds.length) {
        const { data: wallets } = await supabase
          .from('wallets')
          .select('user_id')
          .in('user_id', landlordIds);
        for (const w of wallets || []) walletSet.add(w.user_id);
      }

      return requests.map(r => {
        const agentId = r.assigned_agent_id || r.agent_id;
        const hasWallet = walletSet.has(r.landlord_id);
        return {
          ...r,
          access_fee: r.access_fee ?? 0,
          request_fee: r.request_fee ?? 0,
          total_repayment: r.total_repayment ?? 0,
          tenant_name: profileMap.get(r.tenant_id) || 'Unknown Tenant',
          landlord_name: landlordMap.get(r.landlord_id) || 'Unknown Landlord',
          agent_name: agentId ? (profileMap.get(agentId) || 'Unknown Agent') : 'No Agent',
          has_landlord_wallet: hasWallet,
          payout_target: hasWallet ? 'landlord_wallet' as const : 'agent_float' as const,
        };
      });
    },
    staleTime: 15_000,
  });

  const selectedItems = useMemo(() => items.filter(i => selected.has(i.id)), [items, selected]);
  const totalRent = useMemo(() => selectedItems.reduce((s, i) => s + i.rent_amount, 0), [selectedItems]);
  const totalRevenue = useMemo(() => selectedItems.reduce((s, i) => s + i.access_fee + i.request_fee, 0), [selectedItems]);
  const totalRepaymentExpected = useMemo(() => selectedItems.reduce((s, i) => s + i.total_repayment, 0), [selectedItems]);
  const allSelected = items.length > 0 && selected.size === items.length;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const batchDisburse = useMutation({
    mutationFn: async () => {
      if (!batchRef.trim()) throw new Error('Enter a batch reference');
      const errors: string[] = [];
      for (const id of selected) {
        const { error } = await supabase.functions.invoke('fund-agent-landlord-float', {
          body: { rent_request_id: id, notes: `Batch: ${batchRef}` },
        });
        if (error) errors.push(`${id.slice(0, 8)}: ${error.message}`);
      }
      if (errors.length) throw new Error(`${errors.length} failed: ${errors[0]}`);
    },
    onSuccess: () => {
      toast.success(`${selected.size} rent payouts disbursed`);
      setSelected(new Set());
      setBatchRef('');
      qc.invalidateQueries({ queryKey: ['rent-disbursement-queue'] });
      qc.invalidateQueries({ queryKey: ['batch-payout-pending'] });
      qc.invalidateQueries({ queryKey: ['treasury-cash-snapshot'] });
      qc.invalidateQueries({ queryKey: ['cfo-overview'] });
    },
    onError: (e: any) => toast.error(e.message || 'Batch disbursement failed'),
  });

  const singleDisburse = useMutation({
    mutationFn: async (id: string) => {
      const { error, data } = await supabase.functions.invoke('fund-agent-landlord-float', {
        body: { rent_request_id: id, notes: 'Single CFO disbursement' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Rent payout disbursed');
      qc.invalidateQueries({ queryKey: ['rent-disbursement-queue'] });
      qc.invalidateQueries({ queryKey: ['treasury-cash-snapshot'] });
      qc.invalidateQueries({ queryKey: ['cfo-overview'] });
    },
    onError: (e: any) => toast.error(e.message || 'Disbursement failed'),
  });

  // Summary totals for ALL queued items
  const queueTotalRent = useMemo(() => items.reduce((s, i) => s + i.rent_amount, 0), [items]);
  const queueTotalRevenue = useMemo(() => items.reduce((s, i) => s + i.access_fee + i.request_fee, 0), [items]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Home className="h-4 w-4 text-primary" />
          Rent Disbursement Queue
          {items.length > 0 && (
            <Badge variant="outline" className="text-[10px] ml-1 bg-primary/10 text-primary border-primary/30">
              {items.length} approved · {fmt(queueTotalRent)}
            </Badge>
          )}
        </CardTitle>
        {items.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            COO-approved rent requests ready for CFO disbursement. Revenue earned: <span className="font-bold text-emerald-600">{fmt(queueTotalRevenue)}</span>
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500" />
            <p className="font-medium">No Pending Rent Payouts</p>
            <p className="text-xs">All approved rent requests have been disbursed</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Select all */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                Select all ({items.length})
              </label>
              {selected.size > 0 && (
                <Badge className="bg-primary/10 text-primary border-primary/30">
                  {selected.size} selected · {fmt(totalRent)}
                </Badge>
              )}
            </div>

            {/* Revenue summary for selection */}
            {selected.size > 0 && (
              <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-3 space-y-2">
                <p className="text-xs font-bold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Revenue from this disbursement
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Rent Out</p>
                    <p className="font-bold text-sm text-orange-600">{fmt(totalRent)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">We Earn (Fees)</p>
                    <p className="font-bold text-sm text-emerald-600">{fmt(totalRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Total Repayment</p>
                    <p className="font-bold text-sm text-primary">{fmt(totalRepaymentExpected)}</p>
                  </div>
                </div>
                <TreasuryImpactBanner payoutAmount={totalRent} />
              </div>
            )}

            {/* List */}
            <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
              {items.map(item => (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-start gap-3 p-2.5 rounded-lg border text-sm transition-colors',
                    selected.has(item.id) && 'bg-primary/5 border-primary/20'
                  )}
                >
                  <Checkbox
                    checked={selected.has(item.id)}
                    onCheckedChange={() => toggle(item.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{item.tenant_name}</p>
                      <span className="text-[10px] text-muted-foreground">→</span>
                      <p className="font-medium truncate text-primary">{item.landlord_name}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                        <Users className="h-2.5 w-2.5 mr-0.5" />
                        {item.agent_name}
                      </Badge>
                      {item.payout_target === 'landlord_wallet' ? (
                        <Badge className="text-[9px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200">
                          <Wallet className="h-2.5 w-2.5 mr-0.5" />
                          Landlord Wallet
                        </Badge>
                      ) : (
                        <Badge className="text-[9px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                          Agent Float
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(item.created_at), 'dd MMM')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span>Rent: <b className="text-orange-600">{fmt(item.rent_amount)}</b></span>
                      <span>Fees: <b className="text-emerald-600">{fmt(item.access_fee + item.request_fee)}</b></span>
                      <span>Repay: <b>{fmt(item.total_repayment)}</b></span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs h-7"
                    onClick={() => singleDisburse.mutate(item.id)}
                    disabled={singleDisburse.isPending}
                  >
                    {singleDisburse.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Banknote className="h-3 w-3 mr-1" />}
                    Pay
                  </Button>
                </div>
              ))}
            </div>

            {/* Batch actions */}
            {selected.size > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <Input
                  placeholder="Batch ref (e.g. MoMo-2024-01)"
                  value={batchRef}
                  onChange={e => setBatchRef(e.target.value)}
                  className="h-8 text-sm flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => batchDisburse.mutate()}
                  disabled={batchDisburse.isPending || !batchRef.trim()}
                >
                  {batchDisburse.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Banknote className="h-3 w-3 mr-1" />}
                  Disburse ({selected.size})
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
