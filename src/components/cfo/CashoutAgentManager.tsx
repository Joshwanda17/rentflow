import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Banknote, UserPlus, Loader2, XCircle, Building2, Smartphone, Eye, Phone, Mail, MapPin,
  CreditCard, Calendar, Shield, Wallet, Users, TrendingUp, ArrowLeft, Search, CheckCircle2, Clock,
} from 'lucide-react';
import { UserSearchPicker } from './UserSearchPicker';
import { CashoutPendingWithdrawalsDialog } from './CashoutPendingWithdrawalsDialog';
import { formatUGX } from '@/lib/rentCalculations';

const COMPLETED_STATUSES = ['approved', 'fin_ops_approved', 'completed'];

export function CashoutAgentManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [pickedAgent, setPickedAgent] = useState<any>(null);
  const [handlesCash, setHandlesCash] = useState(true);
  const [handlesBank, setHandlesBank] = useState(true);
  const [label, setLabel] = useState('');
  const [cashoutAgent, setCashoutAgent] = useState<any>(null);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [search, setSearch] = useState('');

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['cashout-agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cashout_agents')
        .select('*, profiles:agent_id(id, full_name, phone, email, city, country, territory, mobile_money_number, mobile_money_provider, national_id, agent_type, verified, is_frozen, frozen_reason, created_at, last_active_at)')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all completed payouts handled by cash-out agents (for KPIs + drill-down)
  const { data: payouts = [] } = useQuery({
    queryKey: ['cashout-agent-payouts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('id, amount, payout_method, status, created_at, processed_at, fin_ops_reference, assigned_cashout_agent_id, user_id, beneficiary_name, beneficiary_phone')
        .in('status', COMPLETED_STATUSES)
        .not('assigned_cashout_agent_id', 'is', null)
        .order('processed_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!pickedAgent) throw new Error('Please select an agent');
      const { error } = await supabase.from('cashout_agents').upsert({
        agent_id: pickedAgent.id,
        assigned_by: user!.id,
        handles_cash: handlesCash,
        handles_bank: handlesBank,
        label: label || 'Cash-Out Agent',
        is_active: true,
      }, { onConflict: 'agent_id' });
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user!.id,
        action_type: 'cfo_cashout_agent_assigned',
        table_name: 'cashout_agents',
        record_id: pickedAgent.id,
        metadata: { agent_name: pickedAgent.full_name || pickedAgent.id, handles_cash: handlesCash, handles_bank: handlesBank, label: label || 'Cash-Out Agent' },
      });
    },
    onSuccess: () => {
      toast({ title: '✅ Cash-Out Agent assigned' });
      qc.invalidateQueries({ queryKey: ['cashout-agents'] });
      setShowAssign(false);
      setPickedAgent(null);
      setLabel('');
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cashout_agents').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user!.id,
        action_type: 'cfo_cashout_agent_deactivated',
        table_name: 'cashout_agents',
        record_id: id,
        metadata: {},
      });
    },
    onSuccess: () => {
      toast({ title: 'Agent removed from cash-out duty' });
      qc.invalidateQueries({ queryKey: ['cashout-agents'] });
    },
  });

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const formatDateTime = (d: string | null) => d ? new Date(d).toLocaleString('en-UG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  // KPIs
  const kpis = useMemo(() => {
    const totalPaid = payouts.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const bank = payouts.filter((p: any) => p.payout_method === 'bank_transfer');
    const momo = payouts.filter((p: any) => ['mobile_money', 'mtn_mobile_money', 'airtel_money'].includes(p.payout_method));
    const cash = payouts.filter((p: any) => ['cash', 'cash_pickup'].includes(p.payout_method) || !p.payout_method);
    return {
      agentsCount: agents.length,
      totalPaid,
      payoutsCount: payouts.length,
      bankAmount: bank.reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
      momoAmount: momo.reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
      cashAmount: cash.reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
      bankCount: bank.length,
      momoCount: momo.length,
      cashCount: cash.length,
    };
  }, [agents, payouts]);

  // Per-agent stats
  const agentStats = useMemo(() => {
    const map = new Map<string, { count: number; volume: number; bank: number; momo: number; cash: number }>();
    for (const p of payouts) {
      const id = p.assigned_cashout_agent_id;
      if (!id) continue;
      const cur = map.get(id) || { count: 0, volume: 0, bank: 0, momo: 0, cash: 0 };
      cur.count += 1;
      cur.volume += Number(p.amount || 0);
      if (p.payout_method === 'bank_transfer') cur.bank += Number(p.amount || 0);
      else if (['mobile_money', 'mtn_mobile_money', 'airtel_money'].includes(p.payout_method)) cur.momo += Number(p.amount || 0);
      else cur.cash += Number(p.amount || 0);
      map.set(id, cur);
    }
    return map;
  }, [payouts]);

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a: any) => {
      const name = (a.profiles?.full_name || '').toLowerCase();
      const phone = (a.profiles?.phone || '').toLowerCase();
      const lbl = (a.label || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || lbl.includes(q);
    });
  }, [agents, search]);

  // Drill-down: payouts for the selected agent
  const selectedAgentPayouts = useMemo(() => {
    if (!selectedAgent) return [];
    return payouts.filter((p: any) => p.assigned_cashout_agent_id === selectedAgent.id);
  }, [selectedAgent, payouts]);

  const selectedAgentStats = selectedAgent ? agentStats.get(selectedAgent.id) || { count: 0, volume: 0, bank: 0, momo: 0, cash: 0 } : null;

  // ============ DRILL-DOWN VIEW ============
  if (selectedAgent) {
    const p = selectedAgent.profiles || {};
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedAgent(null)} className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back to Cash-Out Agents
        </Button>

        {/* Agent Header */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
              {(p.full_name || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-base truncate">{p.full_name || 'Unknown'}</p>
              <p className="text-xs text-muted-foreground truncate">{p.phone} · {selectedAgent.label}</p>
            </div>
          </CardContent>
        </Card>

        {/* Per-Agent KPIs */}
        <div className="grid grid-cols-2 gap-2">
          <KpiTile icon={<CheckCircle2 className="h-4 w-4" />} label="Completed Payouts" value={String(selectedAgentStats?.count || 0)} tone="primary" />
          <KpiTile icon={<TrendingUp className="h-4 w-4" />} label="Volume Total" value={formatUGX(selectedAgentStats?.volume || 0)} tone="primary" />
          <KpiTile icon={<Building2 className="h-4 w-4" />} label="Bank" value={formatUGX(selectedAgentStats?.bank || 0)} tone="muted" />
          <KpiTile icon={<Smartphone className="h-4 w-4" />} label="Mobile Money" value={formatUGX(selectedAgentStats?.momo || 0)} tone="muted" />
        </div>

        <Tabs defaultValue="transactions">
          <TabsList className="w-full grid grid-cols-2 h-auto p-1">
            <TabsTrigger value="transactions" className="text-xs py-2">Transactions</TabsTrigger>
            <TabsTrigger value="profile" className="text-xs py-2">Profile & Financial</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="space-y-2 mt-3">
            {selectedAgentPayouts.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No completed payouts yet</CardContent></Card>
            ) : (
              selectedAgentPayouts.map((py: any) => (
                <Card key={py.id}>
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{py.beneficiary_name || 'Beneficiary'}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{py.beneficiary_phone || '—'}</p>
                      </div>
                      <p className="font-bold text-sm shrink-0">{formatUGX(py.amount)}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          {py.payout_method === 'bank_transfer' ? <Building2 className="h-2.5 w-2.5" /> :
                           ['mobile_money','mtn_mobile_money','airtel_money'].includes(py.payout_method) ? <Smartphone className="h-2.5 w-2.5" /> :
                           <Banknote className="h-2.5 w-2.5" />}
                          {py.payout_method?.replace(/_/g, ' ') || 'cash'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5 text-green-600" /> {py.status}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" /> {formatDateTime(py.processed_at || py.created_at)}
                      </span>
                    </div>
                    {py.fin_ops_reference && (
                      <p className="text-[10px] text-muted-foreground font-mono truncate">Ref: {py.fin_ops_reference}</p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="profile" className="space-y-3 mt-3">
            <Card>
              <CardContent className="p-3 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Status</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant={p.verified ? 'default' : 'secondary'} className="text-[10px]">{p.verified ? '✅ Verified' : '⏳ Unverified'}</Badge>
                    {p.is_frozen && <Badge variant="destructive" className="text-[10px]">🔒 Frozen</Badge>}
                    {p.agent_type && <Badge variant="outline" className="text-[10px] capitalize">{p.agent_type}</Badge>}
                    {selectedAgent.handles_cash && <Badge variant="outline" className="text-[10px] gap-1"><Banknote className="h-3 w-3" />Cash</Badge>}
                    {selectedAgent.handles_bank && <Badge variant="outline" className="text-[10px] gap-1"><Building2 className="h-3 w-3" />Bank</Badge>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</p>
                  <DetailRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={p.phone} />
                  <DetailRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={p.email} />
                  <DetailRow icon={<MapPin className="h-3.5 w-3.5" />} label="Location" value={[p.city, p.country].filter(Boolean).join(', ')} />
                  {p.territory && <DetailRow icon={<MapPin className="h-3.5 w-3.5" />} label="Territory" value={p.territory} />}
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Financial</p>
                  <DetailRow icon={<CreditCard className="h-3.5 w-3.5" />} label="MoMo" value={p.mobile_money_number ? `${p.mobile_money_provider || ''} ${p.mobile_money_number}`.trim() : null} />
                  <DetailRow icon={<Shield className="h-3.5 w-3.5" />} label="National ID" value={p.national_id} />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity</p>
                  <DetailRow icon={<Calendar className="h-3.5 w-3.5" />} label="Joined" value={formatDate(p.created_at)} />
                  <DetailRow icon={<Calendar className="h-3.5 w-3.5" />} label="Last Active" value={formatDate(p.last_active_at)} />
                  <DetailRow icon={<Calendar className="h-3.5 w-3.5" />} label="Assigned" value={formatDate(selectedAgent.created_at)} />
                </div>
                {p.is_frozen && p.frozen_reason && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
                    <p className="text-xs font-semibold text-destructive">Frozen Reason</p>
                    <p className="text-sm text-destructive/80">{p.frozen_reason}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => setCashoutAgent(selectedAgent)}>
                <Wallet className="h-4 w-4" /> Pending Withdrawals
              </Button>
              <Button variant="destructive" size="sm" className="flex-1 gap-1.5" onClick={() => { deactivateMutation.mutate(selectedAgent.id); setSelectedAgent(null); }}>
                <XCircle className="h-4 w-4" /> Remove
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <CashoutPendingWithdrawalsDialog open={!!cashoutAgent} onOpenChange={v => { if (!v) setCashoutAgent(null); }} agent={cashoutAgent} />
      </div>
    );
  }

  // ============ MAIN VIEW ============
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Cash-Out Agents
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-md">
            Field extension of <span className="font-semibold text-foreground">Financial Ops</span>. Authorised only to complete withdrawal payouts (cash &amp; bank).
          </p>
        </div>
        <Dialog open={showAssign} onOpenChange={v => { setShowAssign(v); if (!v) setPickedAgent(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 shrink-0"><UserPlus className="h-4 w-4" /> Assign</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm overflow-visible" onInteractOutside={e => e.preventDefault()} onPointerDownOutside={e => e.preventDefault()}>
            <DialogHeader><DialogTitle>Assign Cash-Out Agent</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">
              This agent becomes a field extension of Financial Ops, authorised <span className="font-semibold">only</span> to complete withdrawal payouts (cash and/or bank).
            </p>
            <div className="space-y-3">
              <UserSearchPicker label="Search Agent" placeholder="Search agent by name or phone..." selectedUser={pickedAgent} onSelect={setPickedAgent} roleFilter="agent" />
              <div>
                <Label>Label</Label>
                <Input placeholder="e.g. Kampala CBD Cash Point" value={label} onChange={e => setLabel(e.target.value)} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Handles Cash Payouts</Label>
                <Switch checked={handlesCash} onCheckedChange={setHandlesCash} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Handles Bank Payouts</Label>
                <Switch checked={handlesBank} onCheckedChange={setHandlesBank} />
              </div>
              <Button className="w-full" onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending || !pickedAgent}>
                {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Assign Cash-Out Agent
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <KpiTile icon={<Users className="h-4 w-4" />} label="Cashout Agents" value={String(kpis.agentsCount)} tone="primary" />
        <KpiTile icon={<TrendingUp className="h-4 w-4" />} label="Amount Paid" value={formatUGX(kpis.totalPaid)} tone="primary" sub={`${kpis.payoutsCount} payouts`} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <KpiTile icon={<Building2 className="h-4 w-4" />} label="Bank" value={formatUGX(kpis.bankAmount)} tone="muted" sub={`${kpis.bankCount}`} compact />
        <KpiTile icon={<Smartphone className="h-4 w-4" />} label="Mobile" value={formatUGX(kpis.momoAmount)} tone="muted" sub={`${kpis.momoCount}`} compact />
        <KpiTile icon={<Banknote className="h-4 w-4" />} label="Cash" value={formatUGX(kpis.cashAmount)} tone="muted" sub={`${kpis.cashCount}`} compact />
      </div>

      {/* Search */}
      {agents.length > 0 && (
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search agent by name, phone or label..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
      )}

      {/* Agent List */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filteredAgents.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
          <Smartphone className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          {agents.length === 0 ? 'No cash-out agents assigned. Assign agents to handle cash & bank payouts.' : 'No agents match your search.'}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filteredAgents.map((a: any) => {
            const stats = agentStats.get(a.id) || { count: 0, volume: 0 };
            return (
              <Card key={a.id} className="hover:bg-muted/40 active:bg-muted transition-colors cursor-pointer" onClick={() => setSelectedAgent(a)}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                    {(a.profiles?.full_name || 'A').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{a.profiles?.full_name || 'Agent'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{a.profiles?.phone} · {a.label}</p>
                    <div className="flex gap-1 mt-1">
                      {a.handles_cash && <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5"><Banknote className="h-2.5 w-2.5" />Cash</Badge>}
                      {a.handles_bank && <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5"><Building2 className="h-2.5 w-2.5" />Bank</Badge>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm">{formatUGX(stats.volume)}</p>
                    <p className="text-[10px] text-muted-foreground">{stats.count} payout{stats.count !== 1 ? 's' : ''}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CashoutPendingWithdrawalsDialog open={!!cashoutAgent} onOpenChange={v => { if (!v) setCashoutAgent(null); }} agent={cashoutAgent} />
    </div>
  );
}

function KpiTile({ icon, label, value, sub, tone = 'muted', compact = false }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'primary' | 'muted'; compact?: boolean }) {
  return (
    <Card className={tone === 'primary' ? 'bg-primary/5' : ''}>
      <CardContent className={compact ? 'p-2.5' : 'p-3'}>
        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
          <span className={tone === 'primary' ? 'text-primary' : ''}>{icon}</span>
          <span className="text-[10px] font-medium uppercase tracking-wider truncate">{label}</span>
        </div>
        <p className={`font-bold tabular-nums truncate ${compact ? 'text-xs' : 'text-sm'}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground min-w-[80px] text-xs">{label}:</span>
      <span className="font-medium truncate text-xs">{value || '—'}</span>
    </div>
  );
}
