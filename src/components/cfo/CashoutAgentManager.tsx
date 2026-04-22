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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Banknote, UserPlus, Loader2, XCircle, Building2, Smartphone, Phone, Mail, MapPin,
  CreditCard, Calendar, Shield, Wallet, Users, TrendingUp, ArrowLeft, Search, CheckCircle2, Clock,
  Network, Activity, Zap, Pencil, Trash2,
} from 'lucide-react';
import { UserSearchPicker } from './UserSearchPicker';
import { CashoutPendingWithdrawalsDialog } from './CashoutPendingWithdrawalsDialog';
import { formatUGX } from '@/lib/rentCalculations';

// A payout only counts as "processed" once the Merchant Agent has executed disbursement.
// `approved` / `cfo_approved` / `manager_approved` are pipeline sign-off stages — NOT execution.
// Only `fin_ops_approved` and `completed` represent money actually delivered to the user.
const COMPLETED_STATUSES = ['fin_ops_approved', 'completed'];
type MethodFilter = 'all' | 'momo' | 'bank' | 'cash';
type StatusFilter = 'all' | 'active' | 'idle';

const isMomo = (m: string | null) => ['mobile_money', 'mtn_mobile_money', 'airtel_money'].includes(m || '');
const isBank = (m: string | null) => m === 'bank_transfer';
const isCash = (m: string | null) => ['cash', 'cash_pickup'].includes(m || '') || !m;

export function CashoutAgentManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [pickedAgent, setPickedAgent] = useState<any>(null);
  const [handlesCash, setHandlesCash] = useState(true);
  const [handlesBank, setHandlesBank] = useState(true);
  const [handlesMomo, setHandlesMomo] = useState(true);
  const [label, setLabel] = useState('');
  const [cashoutAgent, setCashoutAgent] = useState<any>(null);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Edit dialog state
  const [editAgent, setEditAgent] = useState<any>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editHandlesCash, setEditHandlesCash] = useState(true);
  const [editHandlesBank, setEditHandlesBank] = useState(true);
  const [editHandlesMomo, setEditHandlesMomo] = useState(true);

  // Delete confirmation state
  const [deleteAgent, setDeleteAgent] = useState<any>(null);

  const openEdit = (a: any) => {
    setEditAgent(a);
    setEditLabel(a.label || '');
    setEditHandlesCash(!!a.handles_cash);
    setEditHandlesBank(!!a.handles_bank);
    setEditHandlesMomo(!!(a.handles_mtn || a.handles_airtel));
  };

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['merchant-agents'],
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

  const { data: payouts = [] } = useQuery({
    queryKey: ['merchant-agent-payouts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('id, amount, payout_method, status, created_at, processed_at, fin_ops_reference, assigned_cashout_agent_id, user_id, mobile_money_name, mobile_money_number')
        .in('status', COMPLETED_STATUSES)
        .not('assigned_cashout_agent_id', 'is', null)
        .order('processed_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: pendingClaims = 0 } = useQuery({
    queryKey: ['merchant-agent-active-claims'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('withdrawal_requests')
        .select('id', { count: 'exact', head: true })
        .not('assigned_cashout_agent_id', 'is', null)
        .in('status', ['pending', 'requested', 'approved', 'manager_approved', 'cfo_approved']);
      if (error) throw error;
      return count || 0;
    },
  });

  // Per-merchant active claim list — drives the "pending" badge on each card AND
  // powers the "Release stuck claims" recovery action in the delete dialog.
  const { data: pendingClaimRows = [] } = useQuery({
    queryKey: ['merchant-agent-active-claims-rows'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('id, status, amount, assigned_cashout_agent_id, created_at')
        .not('assigned_cashout_agent_id', 'is', null)
        .in('status', ['pending', 'requested', 'approved', 'manager_approved', 'cfo_approved']);
      if (error) throw error;
      return data || [];
    },
  });

  const pendingByAgent = useMemo(() => {
    const m = new Map<string, { count: number; ids: string[]; oldestAt: string | null }>();
    for (const r of pendingClaimRows as any[]) {
      const id = r.assigned_cashout_agent_id;
      if (!id) continue;
      const cur = m.get(id) || { count: 0, ids: [] as string[], oldestAt: null as string | null };
      cur.count += 1;
      cur.ids.push(r.id);
      if (!cur.oldestAt || (r.created_at && r.created_at < cur.oldestAt)) cur.oldestAt = r.created_at;
      m.set(id, cur);
    }
    return m;
  }, [pendingClaimRows]);

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!pickedAgent) throw new Error('Please select an agent');
      const { error } = await supabase.from('cashout_agents').upsert({
        agent_id: pickedAgent.id,
        assigned_by: user!.id,
        handles_cash: handlesCash,
        handles_bank: handlesBank,
        handles_mtn: handlesMomo,
        handles_airtel: handlesMomo,
        label: label || 'Merchant Agent',
        is_active: true,
      }, { onConflict: 'agent_id' });
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user!.id,
        action_type: 'cfo_merchant_agent_assigned',
        table_name: 'cashout_agents',
        record_id: pickedAgent.id,
        metadata: { agent_name: pickedAgent.full_name || pickedAgent.id, handles_cash: handlesCash, handles_bank: handlesBank, handles_momo: handlesMomo, label: label || 'Merchant Agent' },
      });
    },
    onSuccess: () => {
      toast({ title: '✅ Merchant Agent assigned' });
      qc.invalidateQueries({ queryKey: ['merchant-agents'] });
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
        action_type: 'cfo_merchant_agent_deactivated',
        table_name: 'cashout_agents',
        record_id: id,
        metadata: {},
      });
    },
    onSuccess: () => {
      toast({ title: 'Merchant Agent removed' });
      qc.invalidateQueries({ queryKey: ['merchant-agents'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (agent: any) => {
      // Block delete if there are active claims still routed to this merchant
      const { count, error: countError } = await supabase
        .from('withdrawal_requests')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_cashout_agent_id', agent.id)
        .in('status', ['pending', 'requested', 'approved', 'manager_approved', 'cfo_approved']);
      if (countError) throw countError;
      if ((count || 0) > 0) {
        throw new Error(`Cannot delete: ${count} active payout claim${count === 1 ? '' : 's'} still routed to this merchant. Reassign or complete them first.`);
      }
      const { error } = await supabase.from('cashout_agents').delete().eq('id', agent.id);
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user!.id,
        action_type: 'cfo_merchant_agent_deleted',
        table_name: 'cashout_agents',
        record_id: agent.id,
        metadata: {
          agent_name: agent.profiles?.full_name || agent.agent_id,
          label: agent.label,
          handles_cash: agent.handles_cash,
          handles_bank: agent.handles_bank,
          handles_mtn: agent.handles_mtn,
          handles_airtel: agent.handles_airtel,
        },
      });
    },
    onSuccess: () => {
      toast({ title: '🗑️ Merchant Agent deleted', description: 'Record permanently removed.' });
      qc.invalidateQueries({ queryKey: ['merchant-agents'] });
      qc.invalidateQueries({ queryKey: ['merchant-agent-active-claims'] });
      qc.invalidateQueries({ queryKey: ['merchant-agent-active-claims-rows'] });
      if (selectedAgent && deleteAgent && selectedAgent.id === deleteAgent.id) {
        setSelectedAgent(null);
      }
      setDeleteAgent(null);
    },
    onError: (e: any) => toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });

  // Release all stuck claims still routed to a merchant — unassigns them so the
  // open-pool routing can pick them up again. Used to unblock deletion when a
  // merchant has stale or orphan claims they can't / won't process.
  const releaseClaimsMutation = useMutation({
    mutationFn: async (agent: any) => {
      const info = pendingByAgent.get(agent.id);
      // Guard: only release when there are actually claims (> 0) routed to this merchant.
      if (!info || info.count <= 0 || !info.ids?.length) {
        throw new Error('No active claims to release — queue is already empty');
      }
      const { error } = await supabase
        .from('withdrawal_requests')
        .update({ assigned_cashout_agent_id: null })
        .in('id', info.ids);
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user!.id,
        action_type: 'cfo_merchant_agent_claims_released',
        table_name: 'withdrawal_requests',
        record_id: agent.id,
        metadata: {
          agent_name: agent.profiles?.full_name || agent.agent_id,
          released_count: info.count,
          released_ids: info.ids,
        },
      });
    },
    onSuccess: (_d, agent) => {
      toast({
        title: '🔓 Claims released',
        description: 'Stuck claims returned to the open pool. You can now delete this merchant.',
      });
      qc.invalidateQueries({ queryKey: ['merchant-agent-active-claims'] });
      qc.invalidateQueries({ queryKey: ['merchant-agent-active-claims-rows'] });
      qc.invalidateQueries({ queryKey: ['cfo-pending-withdrawals'] });
    },
    onError: (e: any) => toast({ title: 'Release failed', description: e.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editAgent) throw new Error('No merchant selected');
      if (!editHandlesCash && !editHandlesBank && !editHandlesMomo) {
        throw new Error('Enable at least one payout method');
      }
      const patch = {
        label: editLabel.trim() || 'Merchant Agent',
        handles_cash: editHandlesCash,
        handles_bank: editHandlesBank,
        handles_mtn: editHandlesMomo,
        handles_airtel: editHandlesMomo,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('cashout_agents').update(patch).eq('id', editAgent.id);
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user!.id,
        action_type: 'cfo_merchant_agent_updated',
        table_name: 'cashout_agents',
        record_id: editAgent.id,
        metadata: {
          agent_name: editAgent.profiles?.full_name || editAgent.agent_id,
          before: {
            label: editAgent.label,
            handles_cash: editAgent.handles_cash,
            handles_bank: editAgent.handles_bank,
            handles_mtn: editAgent.handles_mtn,
            handles_airtel: editAgent.handles_airtel,
          },
          after: patch,
        },
      });
    },
    onSuccess: () => {
      toast({ title: '✅ Merchant Agent updated' });
      qc.invalidateQueries({ queryKey: ['merchant-agents'] });
      // Refresh the drill-down view if it's open on the same agent
      if (selectedAgent && editAgent && selectedAgent.id === editAgent.id) {
        setSelectedAgent({
          ...selectedAgent,
          label: editLabel.trim() || 'Merchant Agent',
          handles_cash: editHandlesCash,
          handles_bank: editHandlesBank,
          handles_mtn: editHandlesMomo,
          handles_airtel: editHandlesMomo,
        });
      }
      setEditAgent(null);
    },
    onError: (e: any) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const formatDateTime = (d: string | null) => d ? new Date(d).toLocaleString('en-UG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  // Per-agent stats with method breakdown + last activity
  const agentStats = useMemo(() => {
    const map = new Map<string, { count: number; volume: number; bank: number; momo: number; cash: number; bankCount: number; momoCount: number; cashCount: number; lastAt: string | null; todayCount: number }>();
    const todayStr = new Date().toDateString();
    for (const p of payouts) {
      const id = p.assigned_cashout_agent_id;
      if (!id) continue;
      const cur = map.get(id) || { count: 0, volume: 0, bank: 0, momo: 0, cash: 0, bankCount: 0, momoCount: 0, cashCount: 0, lastAt: null, todayCount: 0 };
      const amt = Number(p.amount || 0);
      cur.count += 1;
      cur.volume += amt;
      if (isBank(p.payout_method)) { cur.bank += amt; cur.bankCount += 1; }
      else if (isMomo(p.payout_method)) { cur.momo += amt; cur.momoCount += 1; }
      else { cur.cash += amt; cur.cashCount += 1; }
      const stamp = p.processed_at || p.created_at;
      if (!cur.lastAt || (stamp && stamp > cur.lastAt)) cur.lastAt = stamp;
      if (stamp && new Date(stamp).toDateString() === todayStr) cur.todayCount += 1;
      map.set(id, cur);
    }
    return map;
  }, [payouts]);

  // KPIs
  const kpis = useMemo(() => {
    const totalPaid = payouts.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const bank = payouts.filter((p: any) => isBank(p.payout_method));
    const momo = payouts.filter((p: any) => isMomo(p.payout_method));
    const cash = payouts.filter((p: any) => isCash(p.payout_method));
    const todayStr = new Date().toDateString();
    const todayPayouts = payouts.filter((p: any) => {
      const s = p.processed_at || p.created_at;
      return s && new Date(s).toDateString() === todayStr;
    });
    const activeToday = new Set(todayPayouts.map((p: any) => p.assigned_cashout_agent_id).filter(Boolean)).size;
    return {
      agentsCount: agents.length,
      activeToday,
      totalPaid,
      payoutsCount: payouts.length,
      todayCount: todayPayouts.length,
      pendingClaims,
      bankAmount: bank.reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
      momoAmount: momo.reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
      cashAmount: cash.reduce((s: number, p: any) => s + Number(p.amount || 0), 0),
      bankCount: bank.length,
      momoCount: momo.length,
      cashCount: cash.length,
    };
  }, [agents, payouts, pendingClaims]);

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    return agents.filter((a: any) => {
      // Search
      if (q) {
        const name = (a.profiles?.full_name || '').toLowerCase();
        const phone = (a.profiles?.phone || '').toLowerCase();
        const lbl = (a.label || '').toLowerCase();
        if (!name.includes(q) && !phone.includes(q) && !lbl.includes(q)) return false;
      }
      // Method capability
      if (methodFilter === 'momo' && !(a.handles_mtn || a.handles_airtel)) return false;
      if (methodFilter === 'bank' && !a.handles_bank) return false;
      if (methodFilter === 'cash' && !a.handles_cash) return false;
      // Activity
      if (statusFilter !== 'all') {
        const stats = agentStats.get(a.id);
        const recent = stats?.lastAt && new Date(stats.lastAt).getTime() > sevenDaysAgo;
        if (statusFilter === 'active' && !recent) return false;
        if (statusFilter === 'idle' && recent) return false;
      }
      return true;
    });
  }, [agents, search, methodFilter, statusFilter, agentStats]);

  const selectedAgentPayouts = useMemo(() => {
    if (!selectedAgent) return [];
    return payouts.filter((p: any) => p.assigned_cashout_agent_id === selectedAgent.id);
  }, [selectedAgent, payouts]);

  const selectedAgentStats = selectedAgent ? agentStats.get(selectedAgent.id) || { count: 0, volume: 0, bank: 0, momo: 0, cash: 0, bankCount: 0, momoCount: 0, cashCount: 0, lastAt: null, todayCount: 0 } : null;

  const methodBadges = (a: any) => {
    const handlesMomoAny = a.handles_mtn || a.handles_airtel;
    return (
      <>
        {handlesMomoAny && <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5"><Smartphone className="h-2.5 w-2.5" />MoMo</Badge>}
        {a.handles_bank && <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5"><Building2 className="h-2.5 w-2.5" />Bank</Badge>}
        {a.handles_cash && <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5"><Banknote className="h-2.5 w-2.5" />Cash</Badge>}
        {handlesMomoAny && a.handles_bank && a.handles_cash && (
          <Badge variant="primary" className="text-[9px] h-4 px-1 gap-0.5"><Zap className="h-2.5 w-2.5" />Multi-Method</Badge>
        )}
      </>
    );
  };

  // ============ DRILL-DOWN VIEW ============
  if (selectedAgent) {
    const p = selectedAgent.profiles || {};
    const handlesMomoAny = selectedAgent.handles_mtn || selectedAgent.handles_airtel;
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedAgent(null)} className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back to Merchant Agents
        </Button>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
              {(p.full_name || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-base truncate">{p.full_name || 'Unknown'}</p>
              <p className="text-xs text-muted-foreground truncate">{p.phone} · {selectedAgent.label}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {methodBadges(selectedAgent)}
                {(() => {
                  const pending = pendingByAgent.get(selectedAgent.id);
                  return pending && pending.count > 0 ? (
                    <Badge variant="destructive" className="text-[9px] h-4 px-1 gap-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {pending.count} in queue
                    </Badge>
                  ) : null;
                })()}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <KpiTile icon={<CheckCircle2 className="h-4 w-4" />} label="Completed Payouts" value={String(selectedAgentStats?.count || 0)} tone="primary" sub={`${selectedAgentStats?.todayCount || 0} today`} />
          <KpiTile icon={<TrendingUp className="h-4 w-4" />} label="Volume Total" value={formatUGX(selectedAgentStats?.volume || 0)} tone="primary" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <KpiTile icon={<Smartphone className="h-4 w-4" />} label="MoMo" value={formatUGX(selectedAgentStats?.momo || 0)} tone="muted" sub={`${selectedAgentStats?.momoCount || 0}`} compact />
          <KpiTile icon={<Building2 className="h-4 w-4" />} label="Bank" value={formatUGX(selectedAgentStats?.bank || 0)} tone="muted" sub={`${selectedAgentStats?.bankCount || 0}`} compact />
          <KpiTile icon={<Banknote className="h-4 w-4" />} label="Cash" value={formatUGX(selectedAgentStats?.cash || 0)} tone="muted" sub={`${selectedAgentStats?.cashCount || 0}`} compact />
        </div>

        <Tabs defaultValue="transactions">
          <TabsList className="w-full grid grid-cols-2 h-auto p-1">
            <TabsTrigger value="transactions" className="text-xs py-2">Payouts Processed</TabsTrigger>
            <TabsTrigger value="profile" className="text-xs py-2">Profile & Capabilities</TabsTrigger>
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
                        <p className="font-semibold text-sm truncate">{py.beneficiary_name || py.mobile_money_name || 'Beneficiary'}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{py.beneficiary_phone || py.mobile_money_number || '—'}</p>
                      </div>
                      <p className="font-bold text-sm shrink-0">{formatUGX(py.amount)}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          {isBank(py.payout_method) ? <Building2 className="h-2.5 w-2.5" /> :
                           isMomo(py.payout_method) ? <Smartphone className="h-2.5 w-2.5" /> :
                           <Banknote className="h-2.5 w-2.5" />}
                          {py.payout_method?.replace(/_/g, ' ') || 'cash'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" /> {py.status}
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
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Status & Capabilities</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant={p.verified ? 'default' : 'secondary'} className="text-[10px]">{p.verified ? '✅ Verified' : '⏳ Unverified'}</Badge>
                    {p.is_frozen && <Badge variant="destructive" className="text-[10px]">🔒 Frozen</Badge>}
                    <Badge variant="outline" className="text-[10px]">Merchant Agent</Badge>
                    {handlesMomoAny && <Badge variant="outline" className="text-[10px] gap-1"><Smartphone className="h-3 w-3" />MoMo Enabled</Badge>}
                    {selectedAgent.handles_bank && <Badge variant="outline" className="text-[10px] gap-1"><Building2 className="h-3 w-3" />Bank Enabled</Badge>}
                    {selectedAgent.handles_cash && <Badge variant="outline" className="text-[10px] gap-1"><Banknote className="h-3 w-3" />Cash Enabled</Badge>}
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
                  <DetailRow icon={<Activity className="h-3.5 w-3.5" />} label="Last Payout" value={formatDateTime(selectedAgentStats?.lastAt || null)} />
                  <DetailRow icon={<Calendar className="h-3.5 w-3.5" />} label="Onboarded" value={formatDate(selectedAgent.created_at)} />
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
                <Wallet className="h-4 w-4" /> Active Queue
              </Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => openEdit(selectedAgent)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => { deactivateMutation.mutate(selectedAgent.id); setSelectedAgent(null); }}>
                <XCircle className="h-4 w-4" /> Deactivate
              </Button>
              <Button variant="destructive" size="sm" className="flex-1 gap-1.5" onClick={() => setDeleteAgent(selectedAgent)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <CashoutPendingWithdrawalsDialog open={!!cashoutAgent} onOpenChange={v => { if (!v) setCashoutAgent(null); }} agent={cashoutAgent} />

        {/* Edit dialog (also reachable from drill-down) */}
        <EditMerchantDialog
          editAgent={editAgent}
          setEditAgent={setEditAgent}
          editLabel={editLabel}
          setEditLabel={setEditLabel}
          editHandlesMomo={editHandlesMomo}
          setEditHandlesMomo={setEditHandlesMomo}
          editHandlesBank={editHandlesBank}
          setEditHandlesBank={setEditHandlesBank}
          editHandlesCash={editHandlesCash}
          setEditHandlesCash={setEditHandlesCash}
          isPending={updateMutation.isPending}
          onSave={() => updateMutation.mutate()}
        />

        <DeleteMerchantConfirm
          deleteAgent={deleteAgent}
          setDeleteAgent={setDeleteAgent}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteAgent && deleteMutation.mutate(deleteAgent)}
          pendingInfo={deleteAgent ? pendingByAgent.get(deleteAgent.id) || null : null}
          isReleasing={releaseClaimsMutation.isPending}
          onRelease={() => deleteAgent && releaseClaimsMutation.mutate(deleteAgent)}
        />
      </div>
    );
  }

  // ============ MAIN VIEW ============
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Merchant Agents
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-md">
            Execution network for <span className="font-semibold text-foreground">Financial Ops</span>. Merchant Agents process user withdrawal payouts across <span className="font-semibold text-foreground">Mobile Money, Bank, and Cash</span>.
          </p>
        </div>
        <Dialog open={showAssign} onOpenChange={v => { setShowAssign(v); if (!v) setPickedAgent(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 shrink-0"><UserPlus className="h-4 w-4" /> Add Merchant</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm overflow-visible" onInteractOutside={e => e.preventDefault()} onPointerDownOutside={e => e.preventDefault()}>
            <DialogHeader><DialogTitle>Onboard Merchant Agent</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">
              This agent joins the <span className="font-semibold">payout execution network</span>, authorised to fulfil user withdrawals across the methods you enable below.
            </p>
            <div className="space-y-3">
              <UserSearchPicker label="Search Agent" placeholder="Search agent by name or phone..." selectedUser={pickedAgent} onSelect={setPickedAgent} roleFilter="agent" />
              <div>
                <Label>Label / Cluster</Label>
                <Input placeholder="e.g. Kampala CBD · Branch 02" value={label} onChange={e => setLabel(e.target.value)} />
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-2.5 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payout Capabilities</p>
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" />Mobile Money</Label>
                  <Switch checked={handlesMomo} onCheckedChange={setHandlesMomo} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />Bank Transfer</Label>
                  <Switch checked={handlesBank} onCheckedChange={setHandlesBank} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5" />Cash Payout</Label>
                  <Switch checked={handlesCash} onCheckedChange={setHandlesCash} />
                </div>
              </div>
              <Button className="w-full" onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending || !pickedAgent || (!handlesCash && !handlesBank && !handlesMomo)}>
                {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Activate Merchant Agent
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <KpiTile icon={<Users className="h-4 w-4" />} label="Total Merchants" value={String(kpis.agentsCount)} tone="primary" sub={`${kpis.activeToday} active today`} />
        <KpiTile icon={<TrendingUp className="h-4 w-4" />} label="Total Processed" value={formatUGX(kpis.totalPaid)} tone="primary" sub={`${kpis.payoutsCount} payouts`} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <KpiTile icon={<CheckCircle2 className="h-4 w-4" />} label="Completed Today" value={String(kpis.todayCount)} tone="muted" />
        <KpiTile icon={<Clock className="h-4 w-4" />} label="Active Claims" value={String(kpis.pendingClaims)} tone="muted" sub="in queue" />
      </div>

      {/* Method breakdown */}
      <div className="rounded-2xl border border-border bg-card p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Execution by Method</p>
        <div className="grid grid-cols-3 gap-2">
          <MethodTile icon={<Smartphone className="h-4 w-4" />} label="Mobile Money" amount={kpis.momoAmount} count={kpis.momoCount} total={kpis.totalPaid} />
          <MethodTile icon={<Building2 className="h-4 w-4" />} label="Bank" amount={kpis.bankAmount} count={kpis.bankCount} total={kpis.totalPaid} />
          <MethodTile icon={<Banknote className="h-4 w-4" />} label="Cash" amount={kpis.cashAmount} count={kpis.cashCount} total={kpis.totalPaid} />
        </div>
      </div>

      {/* Search + filters */}
      {agents.length > 0 && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search merchant by name, phone or cluster..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
            <FilterChip active={methodFilter === 'all'} onClick={() => setMethodFilter('all')}>All Methods</FilterChip>
            <FilterChip active={methodFilter === 'momo'} onClick={() => setMethodFilter('momo')}><Smartphone className="h-3 w-3" />MoMo</FilterChip>
            <FilterChip active={methodFilter === 'bank'} onClick={() => setMethodFilter('bank')}><Building2 className="h-3 w-3" />Bank</FilterChip>
            <FilterChip active={methodFilter === 'cash'} onClick={() => setMethodFilter('cash')}><Banknote className="h-3 w-3" />Cash</FilterChip>
            <span className="h-4 w-px bg-border mx-1 shrink-0" />
            <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</FilterChip>
            <FilterChip active={statusFilter === 'active'} onClick={() => setStatusFilter('active')}><Activity className="h-3 w-3" />Active</FilterChip>
            <FilterChip active={statusFilter === 'idle'} onClick={() => setStatusFilter('idle')}>Idle 7d+</FilterChip>
          </div>
        </div>
      )}

      {/* Agent List */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filteredAgents.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
          <Network className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          {agents.length === 0 ? 'No Merchant Agents onboarded. Add agents to execute payouts across MoMo, Bank, and Cash.' : 'No merchants match your filters.'}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filteredAgents.map((a: any) => {
            const stats = agentStats.get(a.id) || { count: 0, volume: 0, lastAt: null, todayCount: 0 } as any;
            const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
            const isRecent = stats.lastAt && new Date(stats.lastAt).getTime() > sevenDaysAgo;
            const pending = pendingByAgent.get(a.id);
            return (
              <Card key={a.id} className="hover:bg-muted/40 active:bg-muted transition-colors cursor-pointer" onClick={() => setSelectedAgent(a)}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {(a.profiles?.full_name || 'A').charAt(0).toUpperCase()}
                    </div>
                    {isRecent && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success border-2 border-card" title="Active in last 7 days" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{a.profiles?.full_name || 'Merchant Agent'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{a.profiles?.phone} · {a.label || 'Merchant Agent'}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {methodBadges(a)}
                      {pending && pending.count > 0 && (
                        <Badge variant="destructive" className="text-[9px] h-4 px-1 gap-0.5" title={`${pending.count} active claim${pending.count === 1 ? '' : 's'} in queue — blocks deletion`}>
                          <Clock className="h-2.5 w-2.5" />
                          {pending.count} in queue
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm">{formatUGX(stats.volume)}</p>
                    <p className="text-[10px] text-muted-foreground">{stats.count} payout{stats.count !== 1 ? 's' : ''}</p>
                    {stats.todayCount > 0 && <p className="text-[10px] text-success font-medium">+{stats.todayCount} today</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={(e) => { e.stopPropagation(); openEdit(a); }}
                    title="Edit Merchant Agent"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeleteAgent(a); }}
                    title="Delete Merchant Agent"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CashoutPendingWithdrawalsDialog open={!!cashoutAgent} onOpenChange={v => { if (!v) setCashoutAgent(null); }} agent={cashoutAgent} />

      <EditMerchantDialog
        editAgent={editAgent}
        setEditAgent={setEditAgent}
        editLabel={editLabel}
        setEditLabel={setEditLabel}
        editHandlesMomo={editHandlesMomo}
        setEditHandlesMomo={setEditHandlesMomo}
        editHandlesBank={editHandlesBank}
        setEditHandlesBank={setEditHandlesBank}
        editHandlesCash={editHandlesCash}
        setEditHandlesCash={setEditHandlesCash}
        isPending={updateMutation.isPending}
        onSave={() => updateMutation.mutate()}
      />

      <DeleteMerchantConfirm
        deleteAgent={deleteAgent}
        setDeleteAgent={setDeleteAgent}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteAgent && deleteMutation.mutate(deleteAgent)}
        pendingInfo={deleteAgent ? pendingByAgent.get(deleteAgent.id) || null : null}
        isReleasing={releaseClaimsMutation.isPending}
        onRelease={() => deleteAgent && releaseClaimsMutation.mutate(deleteAgent)}
      />
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

function MethodTile({ icon, label, amount, count, total }: { icon: React.ReactNode; label: string; amount: number; count: number; total: number }) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-border/60 bg-background p-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <span className="text-primary">{icon}</span>
        <span className="text-[10px] font-medium uppercase tracking-wider truncate">{label}</span>
      </div>
      <p className="font-bold text-xs tabular-nums truncate">{formatUGX(amount)}</p>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-muted-foreground">{count} payout{count !== 1 ? 's' : ''}</span>
        <span className="text-[10px] font-semibold text-primary">{pct}%</span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2.5 h-7 rounded-full border transition-colors ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:bg-muted'
      }`}
    >
      {children}
    </button>
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

function EditMerchantDialog({
  editAgent, setEditAgent,
  editLabel, setEditLabel,
  editHandlesMomo, setEditHandlesMomo,
  editHandlesBank, setEditHandlesBank,
  editHandlesCash, setEditHandlesCash,
  isPending, onSave,
}: {
  editAgent: any; setEditAgent: (v: any) => void;
  editLabel: string; setEditLabel: (v: string) => void;
  editHandlesMomo: boolean; setEditHandlesMomo: (v: boolean) => void;
  editHandlesBank: boolean; setEditHandlesBank: (v: boolean) => void;
  editHandlesCash: boolean; setEditHandlesCash: (v: boolean) => void;
  isPending: boolean; onSave: () => void;
}) {
  const noMethod = !editHandlesCash && !editHandlesBank && !editHandlesMomo;
  return (
    <Dialog open={!!editAgent} onOpenChange={v => { if (!v) setEditAgent(null); }}>
      <DialogContent
        className="max-w-sm overflow-visible"
        onInteractOutside={e => e.preventDefault()}
        onPointerDownOutside={e => e.preventDefault()}
      >
        <DialogHeader><DialogTitle>Edit Merchant Agent</DialogTitle></DialogHeader>
        {editAgent && (
          <>
            <p className="text-xs text-muted-foreground">
              Updating <span className="font-semibold text-foreground">{editAgent.profiles?.full_name || 'this merchant'}</span>.
              Changes apply immediately to their payout routing capabilities.
            </p>
            <div className="space-y-3">
              <div>
                <Label>Label / Cluster</Label>
                <Input
                  placeholder="e.g. Kampala CBD · Branch 02"
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                />
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-2.5 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payout Capabilities</p>
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" />Mobile Money</Label>
                  <Switch checked={editHandlesMomo} onCheckedChange={setEditHandlesMomo} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />Bank Transfer</Label>
                  <Switch checked={editHandlesBank} onCheckedChange={setEditHandlesBank} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5" />Cash Payout</Label>
                  <Switch checked={editHandlesCash} onCheckedChange={setEditHandlesCash} />
                </div>
                {noMethod && (
                  <p className="text-[11px] text-destructive">Enable at least one method.</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditAgent(null)}>Cancel</Button>
                <Button className="flex-1" onClick={onSave} disabled={isPending || noMethod}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteMerchantConfirm({
  deleteAgent, setDeleteAgent, isPending, onConfirm,
  pendingInfo, isReleasing, onRelease,
}: {
  deleteAgent: any;
  setDeleteAgent: (v: any) => void;
  isPending: boolean;
  onConfirm: () => void;
  pendingInfo: { count: number; ids: string[]; oldestAt: string | null } | null;
  isReleasing: boolean;
  onRelease: () => void;
}) {
  const blocked = !!pendingInfo && pendingInfo.count > 0;
  const oldestDays = pendingInfo?.oldestAt
    ? Math.floor((Date.now() - new Date(pendingInfo.oldestAt).getTime()) / 86400000)
    : 0;
  return (
    <AlertDialog open={!!deleteAgent} onOpenChange={v => { if (!v && !isPending && !isReleasing) setDeleteAgent(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Merchant Agent?</AlertDialogTitle>
          <AlertDialogDescription>
            This will <span className="font-semibold text-destructive">permanently remove</span>{' '}
            <span className="font-semibold text-foreground">{deleteAgent?.profiles?.full_name || 'this merchant'}</span>{' '}
            from the payout execution network. Their completed payout history is preserved in audit logs,
            but they will no longer appear in routing or assignment.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {blocked && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
            <p className="text-sm font-semibold text-destructive flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {pendingInfo!.count} active claim{pendingInfo!.count === 1 ? '' : 's'} blocking deletion
            </p>
            <p className="text-xs text-muted-foreground">
              {oldestDays > 0
                ? `Oldest is ${oldestDays} day${oldestDays === 1 ? '' : 's'} old. `
                : ''}
              Release them to return the payout{pendingInfo!.count === 1 ? '' : 's'} to the open pool so any other
              Merchant Agent can pick {pendingInfo!.count === 1 ? 'it' : 'them'} up — then retry deletion.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={onRelease}
              disabled={isReleasing || isPending}
            >
              {isReleasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Release {pendingInfo!.count} stuck claim{pendingInfo!.count === 1 ? '' : 's'} to open pool
            </Button>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending || isReleasing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            disabled={isPending || isReleasing || blocked}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Delete Permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
