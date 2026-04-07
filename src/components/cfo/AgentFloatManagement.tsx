import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import {
  Banknote, Send, Loader2, Building2, TrendingUp,
  Scale, Download, AlertTriangle, CheckCircle2, Hash
} from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Tab 1: Float Transfers ───────────────────────────────────────────────────
function FloatTransfersTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState('');
  const [amount, setAmount] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [bankName, setBankName] = useState('Equity Bank Uganda');
  const [notes, setNotes] = useState('');

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['cashout-agents-for-float'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cashout_agents')
        .select('agent_id, label, profiles:agent_id(id, full_name, phone)')
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: transfers = [], isLoading: transfersLoading } = useQuery({
    queryKey: ['float-transfers-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_float_funding')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      const agentIds = [...new Set((data || []).map((t: any) => t.agent_id))];
      const profiles: Record<string, any> = {};
      for (const id of agentIds) {
        const { data: p } = await supabase.from('profiles').select('full_name, phone').eq('id', id).single();
        if (p) profiles[id] = p;
      }
      return (data || []).map((t: any) => ({ ...t, profile: profiles[t.agent_id] }));
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent) throw new Error('Select an agent');
      if (!amount || Number(amount) <= 0) throw new Error('Enter valid amount');
      if (!bankRef.trim()) throw new Error('Bank reference (TID) is mandatory');

      const { error } = await supabase.from('agent_float_funding').insert({
        agent_id: selectedAgent,
        amount: Number(amount),
        funded_by: user!.id,
        notes: notes || null,
        bank_reference: bankRef.trim(),
        bank_name: bankName || 'Equity Bank Uganda',
      } as any);
      if (error) throw error;

      // Bridge ledger entry
      await supabase.from('general_ledger').insert([
        {
          user_id: selectedAgent,
          entry_type: 'credit',
          amount: Number(amount),
          category: 'agent_float_transfer',
          description: `Float funded via ${bankName}. Ref: ${bankRef.trim()}`,
          ledger_scope: 'bridge',
          source_table: 'agent_float_funding',
        },
        {
          user_id: user!.id,
          entry_type: 'debit',
          amount: Number(amount),
          category: 'agent_float_transfer',
          description: `Float sent to agent via ${bankName}. Ref: ${bankRef.trim()}`,
          ledger_scope: 'bridge',
          source_table: 'agent_float_funding',
        },
      ]);

      await supabase.from('audit_logs').insert({
        user_id: user!.id,
        action_type: 'agent_float_funded',
        table_name: 'agent_float_funding',
        metadata: { agent_id: selectedAgent, amount: Number(amount), bank_reference: bankRef.trim(), bank_name: bankName },
      });
    },
    onSuccess: () => {
      toast.success('Float sent to agent successfully');
      setAmount(''); setBankRef(''); setNotes(''); setSelectedAgent('');
      qc.invalidateQueries({ queryKey: ['float-transfers-history'] });
      qc.invalidateQueries({ queryKey: ['agent-float-balances'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Record Bank Float Transfer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Cash-Out Agent</Label>
            <select
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
              value={selectedAgent}
              onChange={e => setSelectedAgent(e.target.value)}
            >
              <option value="">Select agent…</option>
              {agents.map((a: any) => (
                <option key={a.agent_id} value={a.agent_id}>
                  {(a.profiles as any)?.full_name || 'Unknown'} — {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Amount (UGX)</Label>
              <Input type="number" placeholder="500000" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Bank Reference (TID) *</Label>
              <Input placeholder="TRF-12345" value={bankRef} onChange={e => setBankRef(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Bank Name</Label>
            <Input value={bankName} onChange={e => setBankName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea placeholder="Optional notes…" className="h-16" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending} className="w-full">
            {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Record Float Transfer
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" /> Transfer History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transfersLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No float transfers recorded yet</p>
          ) : (
            <ScrollArea className="max-h-[40vh]">
              <div className="space-y-2">
                {transfers.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between p-2 rounded-lg border text-xs">
                    <div className="min-w-0">
                      <p className="font-bold truncate">{t.profile?.full_name || 'Unknown'}</p>
                      <p className="text-muted-foreground">
                        {t.bank_name || 'Bank'} · Ref: {t.bank_reference || 'N/A'}
                      </p>
                      <p className="text-muted-foreground">{format(new Date(t.created_at), 'dd MMM yyyy HH:mm')}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-primary">{formatUGX(t.amount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 2: Agent Float Balances ──────────────────────────────────────────────
function AgentFloatBalancesTab() {
  const { data: balances = [], isLoading } = useQuery({
    queryKey: ['agent-float-balances'],
    queryFn: async () => {
      // Get all cashout agents
      const { data: agents } = await supabase
        .from('cashout_agents')
        .select('agent_id, label, profiles:agent_id(full_name, phone)')
        .eq('is_active', true);
      if (!agents) return [];

      const results = await Promise.all(agents.map(async (agent: any) => {
        // Total funded
        const { data: funding } = await supabase
          .from('agent_float_funding')
          .select('amount')
          .eq('agent_id', agent.agent_id);
        const totalFunded = (funding || []).reduce((s: number, f: any) => s + Number(f.amount), 0);

        // Total disbursed (completed withdrawals assigned to this agent)
        const { data: withdrawals } = await supabase
          .from('withdrawal_requests')
          .select('amount')
          .eq('assigned_cashout_agent_id', agent.agent_id)
          .eq('status', 'completed');
        const totalDisbursed = (withdrawals || []).reduce((s: number, w: any) => s + Number(w.amount), 0);

        const balance = totalFunded - totalDisbursed;
        const commission = totalDisbursed * 0.01;
        const healthPct = totalFunded > 0 ? (balance / totalFunded) * 100 : 0;

        return {
          ...agent,
          totalFunded,
          totalDisbursed,
          balance,
          commission,
          healthPct,
        };
      }));

      return results;
    },
  });

  const getHealthColor = (pct: number) => {
    if (pct > 20) return 'border-emerald-500/50 bg-emerald-500/5';
    if (pct > 0) return 'border-amber-500/50 bg-amber-500/5';
    return 'border-destructive/50 bg-destructive/5';
  };

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : balances.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No cashout agents found</p>
      ) : (
        balances.map((a: any) => (
          <Card key={a.agent_id} className={`border-2 ${getHealthColor(a.healthPct)}`}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">{(a.profiles as any)?.full_name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">{a.label} · {(a.profiles as any)?.phone}</p>
                </div>
                <Badge className={`text-xs ${a.healthPct > 20 ? 'bg-emerald-500/20 text-emerald-700' : a.healthPct > 0 ? 'bg-amber-500/20 text-amber-700' : 'bg-destructive/20 text-destructive'}`}>
                  {a.healthPct.toFixed(0)}% available
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded bg-muted/50">
                  <p className="text-muted-foreground">Float Sent</p>
                  <p className="font-bold">{formatUGX(a.totalFunded)}</p>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <p className="text-muted-foreground">Disbursed</p>
                  <p className="font-bold">{formatUGX(a.totalDisbursed)}</p>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <p className="text-muted-foreground">Available</p>
                  <p className={`font-bold ${a.balance < 0 ? 'text-destructive' : 'text-emerald-600'}`}>{formatUGX(a.balance)}</p>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <p className="text-muted-foreground">Commission (1%)</p>
                  <p className="font-bold text-primary">{formatUGX(a.commission)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ─── Tab 3: Float Reconciliation ──────────────────────────────────────────────
function FloatReconciliationTab() {
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const { data: reconciliation = [], isLoading, refetch } = useQuery({
    queryKey: ['float-reconciliation', dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      const { data: agents } = await supabase
        .from('cashout_agents')
        .select('agent_id, label, profiles:agent_id(full_name)')
        .eq('is_active', true);
      if (!agents) return [];

      return Promise.all(agents.map(async (agent: any) => {
        // Opening: all funding before dateFrom minus completed withdrawals before dateFrom
        let openingFunded = 0;
        let openingDisbursed = 0;

        if (dateFrom) {
          const { data: preFunding } = await supabase
            .from('agent_float_funding')
            .select('amount')
            .eq('agent_id', agent.agent_id)
            .lt('created_at', dateFrom.toISOString());
          openingFunded = (preFunding || []).reduce((s: number, f: any) => s + Number(f.amount), 0);

          const { data: preWithdrawals } = await supabase
            .from('withdrawal_requests')
            .select('amount')
            .eq('assigned_cashout_agent_id', agent.agent_id)
            .eq('status', 'completed')
            .lt('updated_at', dateFrom.toISOString());
          openingDisbursed = (preWithdrawals || []).reduce((s: number, w: any) => s + Number(w.amount), 0);
        }

        const openingBalance = openingFunded - openingDisbursed;

        // Period: funding and withdrawals within range
        let fundingQuery = supabase.from('agent_float_funding').select('amount').eq('agent_id', agent.agent_id);
        let withdrawQuery = supabase.from('withdrawal_requests').select('amount').eq('assigned_cashout_agent_id', agent.agent_id).eq('status', 'completed');

        if (dateFrom) {
          fundingQuery = fundingQuery.gte('created_at', dateFrom.toISOString());
          withdrawQuery = withdrawQuery.gte('updated_at', dateFrom.toISOString());
        }
        if (dateTo) {
          const endDate = new Date(dateTo);
          endDate.setHours(23, 59, 59, 999);
          fundingQuery = fundingQuery.lte('created_at', endDate.toISOString());
          withdrawQuery = withdrawQuery.lte('updated_at', endDate.toISOString());
        }

        const [{ data: periodFunding }, { data: periodWithdrawals }] = await Promise.all([fundingQuery, withdrawQuery]);
        const received = (periodFunding || []).reduce((s: number, f: any) => s + Number(f.amount), 0);
        const executed = (periodWithdrawals || []).reduce((s: number, w: any) => s + Number(w.amount), 0);
        const expectedClosing = openingBalance + received - executed;

        return {
          agent_id: agent.agent_id,
          name: (agent.profiles as any)?.full_name || 'Unknown',
          label: agent.label,
          openingBalance,
          received,
          executed,
          expectedClosing,
        };
      }));
    },
    enabled: true,
  });

  const exportCSV = () => {
    if (reconciliation.length === 0) return;
    const headers = 'Agent,Opening Balance,Float Received,Withdrawals Executed,Expected Closing\n';
    const rows = reconciliation.map((r: any) =>
      `"${r.name}",${r.openingBalance},${r.received},${r.executed},${r.expectedClosing}`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `float-reconciliation-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" /> Float Reconciliation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left text-xs", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {dateFrom ? format(dateFrom, 'dd MMM yyyy') : 'Start date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left text-xs", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {dateTo ? format(dateTo, 'dd MMM yyyy') : 'End date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <Scale className="h-3 w-3 mr-1" /> Reconcile
            </Button>
            <Button size="sm" variant="outline" onClick={exportCSV} disabled={reconciliation.length === 0}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : reconciliation.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No agents to reconcile</p>
      ) : (
        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-2">
            {reconciliation.map((r: any) => {
              const hasVariance = r.expectedClosing < 0;
              return (
                <Card key={r.agent_id} className={`border ${hasVariance ? 'border-destructive/50' : ''}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-sm">{r.name}</p>
                      {hasVariance && (
                        <Badge variant="destructive" className="text-[10px]">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Variance
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2 rounded bg-muted/50">
                        <p className="text-muted-foreground">Opening</p>
                        <p className="font-bold">{formatUGX(r.openingBalance)}</p>
                      </div>
                      <div className="p-2 rounded bg-emerald-500/10">
                        <p className="text-muted-foreground">+ Received</p>
                        <p className="font-bold text-emerald-600">{formatUGX(r.received)}</p>
                      </div>
                      <div className="p-2 rounded bg-amber-500/10">
                        <p className="text-muted-foreground">− Executed</p>
                        <p className="font-bold text-amber-600">{formatUGX(r.executed)}</p>
                      </div>
                      <div className="p-2 rounded bg-primary/10">
                        <p className="text-muted-foreground">Expected Closing</p>
                        <p className={`font-bold ${r.expectedClosing < 0 ? 'text-destructive' : 'text-primary'}`}>
                          {formatUGX(r.expectedClosing)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AgentFloatManagement() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Agent Float Management
        </h1>
        <p className="text-sm text-muted-foreground">
          Track bank-to-agent float transfers, monitor balances, and reconcile payouts.
        </p>
      </div>
      <Tabs defaultValue="transfers" className="space-y-4">
        <TabsList className="w-full">
          <TabsTrigger value="transfers" className="flex-1 text-xs">
            <Send className="h-3 w-3 mr-1" /> Transfers
          </TabsTrigger>
          <TabsTrigger value="balances" className="flex-1 text-xs">
            <TrendingUp className="h-3 w-3 mr-1" /> Balances
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="flex-1 text-xs">
            <Scale className="h-3 w-3 mr-1" /> Reconciliation
          </TabsTrigger>
        </TabsList>
        <TabsContent value="transfers"><FloatTransfersTab /></TabsContent>
        <TabsContent value="balances"><AgentFloatBalancesTab /></TabsContent>
        <TabsContent value="reconciliation"><FloatReconciliationTab /></TabsContent>
      </Tabs>
    </div>
  );
}
