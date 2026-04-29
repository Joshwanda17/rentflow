import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Clock, Download, Search, Filter, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const ALL_CFO_ACTIONS = [
  // Direct wallet operations
  'cfo_direct_credit', 'cfo_direct_debit',
  // Wallet deductions & retractions
  'wallet_deduction',
  // ROI
  'cfo_roi_payout_approved', 'cfo_roi_payout_rejected', 'roi_payout',
  // Deposits & withdrawals
  'deposit_approval', 'withdrawal_approval', 'cfo_approve_withdrawal',
  'withdrawal_approved_ledger', 'withdrawal_rejected', 'proxy_partner_withdrawal',
  'fin_ops_complete_withdrawal', 'fin_ops_approve_withdrawal', 'bulk_approve_wallet_withdrawals',
  // Commissions & requisitions
  'commission_payout', 'requisition_approved', 'requisition_rejected',
  // Agent float
  'agent_float_funded',
  // Landlord payouts
  'landlord_payout_cfo_approve', 'landlord_payout_cfo_reject',
  'landlord_payout_landlord_ops_approve', 'landlord_payout_landlord_ops_reject',
  // Partner payouts
  'partner_withdrawal_treasury_payout_processed', 'partner_withdrawal_treasury_payout_rejected',
  // Rent payouts
  'rent_payout_approved', 'cfo_batch_payout_processed',
  // Service centre
  'cfo_service_centre_payout',
  // Cashout agents
  'cfo_cashout_agent_assigned', 'cfo_cashout_agent_deactivated',
  // Advances
  'cfo_advance_deleted',
  // Payroll
  'cfo_payroll_batch_created', 'cfo_payroll_processed',
];

const ACTION_ICONS: Record<string, string> = {
  cfo_direct_credit: '💰',
  cfo_direct_debit: '🔻',
  wallet_deduction: '🔄',
  roi_payout: '📈',
  cfo_roi_payout_approved: '📈',
  cfo_roi_payout_rejected: '📉',
  deposit_approval: '✅',
  withdrawal_approval: '💸',
  cfo_approve_withdrawal: '💸',
  withdrawal_approved_ledger: '💸',
  withdrawal_rejected: '🚫',
  proxy_partner_withdrawal: '💸',
  fin_ops_complete_withdrawal: '💸',
  fin_ops_approve_withdrawal: '✅',
  bulk_approve_wallet_withdrawals: '💸',
  commission_payout: '👤',
  requisition_approved: '✅',
  requisition_rejected: '❌',
  agent_float_funded: '🏦',
  landlord_payout_cfo_approve: '🏠',
  landlord_payout_cfo_reject: '🚫',
  landlord_payout_landlord_ops_approve: '🏠',
  landlord_payout_landlord_ops_reject: '🚫',
  partner_withdrawal_treasury_payout_processed: '💵',
  partner_withdrawal_treasury_payout_rejected: '🚫',
  rent_payout_approved: '🏠',
  cfo_batch_payout_processed: '📦',
  cfo_service_centre_payout: '🏪',
  cfo_cashout_agent_assigned: '🤝',
  cfo_cashout_agent_deactivated: '⛔',
  cfo_advance_deleted: '🗑️',
  cfo_payroll_batch_created: '📋',
  cfo_payroll_processed: '💰',
};

const ACTION_LABELS: Record<string, string> = {
  cfo_direct_credit: 'Wallet Credit',
  cfo_direct_debit: 'Wallet Debit',
  wallet_deduction: 'Wallet Deduction',
  roi_payout: 'ROI Payout',
  cfo_roi_payout_approved: 'ROI Approved',
  cfo_roi_payout_rejected: 'ROI Rejected',
  deposit_approval: 'Deposit Approved',
  withdrawal_approval: 'Withdrawal Approved',
  cfo_approve_withdrawal: 'Withdrawal Approved',
  withdrawal_approved_ledger: 'Withdrawal Paid Out',
  withdrawal_rejected: 'Withdrawal Rejected',
  proxy_partner_withdrawal: 'Partner Withdrawal',
  fin_ops_complete_withdrawal: 'Withdrawal Completed',
  fin_ops_approve_withdrawal: 'Withdrawal Approved (Ops)',
  bulk_approve_wallet_withdrawals: 'Bulk Withdrawal Approval',
  commission_payout: 'Commission Payout',
  requisition_approved: 'Requisition Approved',
  requisition_rejected: 'Requisition Rejected',
  agent_float_funded: 'Agent Float Funded',
  landlord_payout_cfo_approve: 'Landlord Payout Approved',
  landlord_payout_cfo_reject: 'Landlord Payout Rejected',
  landlord_payout_landlord_ops_approve: 'Landlord Ops Approved',
  landlord_payout_landlord_ops_reject: 'Landlord Ops Rejected',
  partner_withdrawal_treasury_payout_processed: 'Partner Payout Processed',
  partner_withdrawal_treasury_payout_rejected: 'Partner Payout Rejected',
  rent_payout_approved: 'Rent Payout',
  cfo_batch_payout_processed: 'Batch Payout',
  cfo_service_centre_payout: 'Service Centre Payout',
  cfo_cashout_agent_assigned: 'Cashout Agent Assigned',
  cfo_cashout_agent_deactivated: 'Cashout Agent Removed',
  cfo_advance_deleted: 'Advance Deleted',
  cfo_payroll_batch_created: 'Payroll Batch Created',
  cfo_payroll_processed: 'Payroll Processed',
};

const FILTER_GROUPS: { label: string; value: string; actions: string[] }[] = [
  { label: 'All Actions', value: 'all', actions: ALL_CFO_ACTIONS },
  { label: 'Credits & Debits', value: 'credits', actions: ['cfo_direct_credit', 'cfo_direct_debit', 'wallet_deduction'] },
  { label: 'ROI', value: 'roi', actions: ['cfo_roi_payout_approved', 'cfo_roi_payout_rejected', 'roi_payout'] },
  { label: 'Withdrawals', value: 'withdrawals', actions: ['withdrawal_approved_ledger', 'withdrawal_rejected', 'proxy_partner_withdrawal', 'fin_ops_complete_withdrawal', 'fin_ops_approve_withdrawal', 'bulk_approve_wallet_withdrawals', 'withdrawal_approval', 'cfo_approve_withdrawal', 'partner_withdrawal_treasury_payout_processed', 'partner_withdrawal_treasury_payout_rejected'] },
  { label: 'Requisitions', value: 'requisitions', actions: ['requisition_approved', 'requisition_rejected'] },
  { label: 'Payroll', value: 'payroll', actions: ['cfo_payroll_batch_created', 'cfo_payroll_processed'] },
  { label: 'Payouts', value: 'payouts', actions: ['rent_payout_approved', 'cfo_batch_payout_processed', 'landlord_payout_cfo_approve', 'landlord_payout_cfo_reject', 'cfo_service_centre_payout'] },
  { label: 'Agent Ops', value: 'agent', actions: ['agent_float_funded', 'cfo_cashout_agent_assigned', 'cfo_cashout_agent_deactivated', 'cfo_advance_deleted'] },
];

const fmt = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

const DEBIT_ACTIONS = new Set([
  'cfo_direct_debit', 'wallet_deduction', 'cfo_roi_payout_rejected',
  'requisition_rejected', 'landlord_payout_cfo_reject', 'landlord_payout_landlord_ops_reject',
  'partner_withdrawal_treasury_payout_rejected', 'cfo_cashout_agent_deactivated', 'cfo_advance_deleted',
  'withdrawal_approved_ledger', 'proxy_partner_withdrawal', 'fin_ops_complete_withdrawal', 'bulk_approve_wallet_withdrawals',
]);

export function CFOActionsLog() {
  const [filterGroup, setFilterGroup] = useState('all');
  const [search, setSearch] = useState('');
  const { roles } = useAuth();
  const isCFO = (roles || []).includes('cfo');
  const qc = useQueryClient();

  const [editing, setEditing] = useState<any | null>(null);
  const [newTid, setNewTid] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newTargetQuery, setNewTargetQuery] = useState('');
  const [newTargetUserId, setNewTargetUserId] = useState<string | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');

  const activeActions = FILTER_GROUPS.find(g => g.value === filterGroup)?.actions || ALL_CFO_ACTIONS;

  const { data: actions, isLoading } = useQuery({
    queryKey: ['cfo-actions-log', filterGroup],
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('id, action_type, created_at, metadata, table_name, record_id, user_id')
        .in('action_type', activeActions)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!data?.length) return [];

      // Fetch actor names
      const userIds = [...new Set(data.map((a: any) => a.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      // Fetch roles for each actor
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds);

      const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.full_name]));
      const roleMap: Record<string, string[]> = {};
      (roles || []).forEach((r: any) => {
        if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
        roleMap[r.user_id].push(r.role);
      });

      return data.map((a: any) => ({
        ...a,
        actor_name: profileMap[a.user_id] || 'System',
        actor_roles: roleMap[a.user_id] || [],
        is_manager_acting_as_cfo: (roleMap[a.user_id] || []).includes('manager') && !(roleMap[a.user_id] || []).includes('cfo'),
      }));
    },
    staleTime: 30_000,
  });

  const { data: targetMatches } = useQuery({
    queryKey: ['cfo-trail-target-search', newTargetQuery],
    enabled: !!editing && newTargetQuery.trim().length >= 2,
    queryFn: async () => {
      const q = newTargetQuery.trim();
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(8);
      return data || [];
    },
    staleTime: 10_000,
  });

  const correct = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error('No row selected');
      if (correctionReason.trim().length < 10) {
        throw new Error('Correction reason must be at least 10 characters');
      }
      const { error } = await supabase.rpc('cfo_correct_trail_entry', {
        p_audit_id: editing.id,
        p_new_tid: newTid.trim() || null,
        p_new_reason: newReason.trim() || null,
        p_new_target_user_id: newTargetUserId,
        p_correction_reason: correctionReason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Trail entry corrected');
      setEditing(null);
      setNewTid(''); setNewReason(''); setNewTargetQuery(''); setNewTargetUserId(null); setCorrectionReason('');
      qc.invalidateQueries({ queryKey: ['cfo-actions-log'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Correction failed'),
  });

  const openEdit = (action: any) => {
    const meta = action.metadata || {};
    setEditing(action);
    setNewTid(meta.tid || meta.transaction_id || meta.tpay_reference || meta.batch_reference || '');
    setNewReason(meta.reason || meta.description || '');
    setNewTargetQuery('');
    setNewTargetUserId(null);
    setCorrectionReason('');
  };

  const currentTid = useMemo(() => {
    const m = editing?.metadata || {};
    return m.tid || m.transaction_id || m.tpay_reference || m.batch_reference || '—';
  }, [editing]);

  const filtered = (actions || []).filter((a: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    const meta = a.metadata || {};
    const label = ACTION_LABELS[a.action_type] || a.action_type;
    return (
      label.toLowerCase().includes(s) ||
      a.actor_name?.toLowerCase().includes(s) ||
      meta.target_name?.toLowerCase().includes(s) ||
      meta.target_user_name?.toLowerCase().includes(s) ||
      meta.user_name?.toLowerCase().includes(s) ||
      meta.agent_name?.toLowerCase().includes(s) ||
      meta.reason?.toLowerCase().includes(s) ||
      meta.description?.toLowerCase().includes(s) ||
      meta.batch_reference?.toLowerCase().includes(s)
    );
  });

  const handleExportCSV = () => {
    if (!filtered.length) return;
    const rows = filtered.map((a: any) => {
      const meta = a.metadata || {};
      return {
        date: format(new Date(a.created_at), 'yyyy-MM-dd HH:mm'),
        action: ACTION_LABELS[a.action_type] || a.action_type,
        amount: meta.amount || '',
        target: meta.target_name || meta.target_user_name || meta.user_name || meta.agent_name || '',
        performed_by: a.actor_name || '',
        role: a.is_manager_acting_as_cfo ? 'Manager (acting as CFO)' : (a.actor_roles || []).join(', '),
        reason: meta.reason || meta.description || meta.category_label || '',
        record_id: a.record_id || '',
        table: a.table_name || '',
      };
    });

    const header = 'Date,Action,Amount,Target,Performed By,Role,Reason,Record ID,Table\n';
    const csv = header + rows.map(r =>
      `"${r.date}","${r.action}","${r.amount}","${r.target}","${r.performed_by}","${r.role}","${r.reason?.replace(/"/g, '""') || ''}","${r.record_id}","${r.table}"`
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cfo-actions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-4 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            CFO Actions Trail
            {filtered.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px]">{filtered.length}</Badge>
            )}
          </p>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleExportCSV} disabled={!filtered.length}>
            <Download className="h-3 w-3" /> CSV
          </Button>
        </div>

        <div className="flex gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[120px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-7 text-xs pl-7"
            />
          </div>
          <Select value={filterGroup} onValueChange={setFilterGroup}>
            <SelectTrigger className="h-7 text-xs w-[140px]">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_GROUPS.map(g => (
                <SelectItem key={g.value} value={g.value} className="text-xs">{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!filtered.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">No actions found.</p>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filtered.map((action: any) => {
              const meta = action.metadata || {};
              const amount = meta.amount ? Number(meta.amount) : meta.total_amount ? Number(meta.total_amount) : 0;
              const targetName = meta.target_name || meta.target_user_name || meta.user_name || meta.agent_name || '';
              const reason = meta.reason || meta.description || '';
              const icon = ACTION_ICONS[action.action_type] || '📋';
              const label = ACTION_LABELS[action.action_type] || action.action_type.replace(/_/g, ' ');
              const isDebit = DEBIT_ACTIONS.has(action.action_type);
              const categoryLabel = meta.category_label || meta.batch_reference || '';

              return (
                <div key={action.id} className="flex items-start gap-3 p-2.5 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors">
                  <div className="text-lg shrink-0 mt-0.5">{icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold truncate">{label}</p>
                      {amount > 0 && (
                        <p className={`text-xs font-bold font-mono tabular-nums shrink-0 ${isDebit ? 'text-destructive' : 'text-emerald-600'}`}>
                          {isDebit ? '−' : '+'}{fmt(amount)}
                        </p>
                      )}
                    </div>
                    {targetName && (
                      <p className="text-[11px] text-foreground/80 truncate">{targetName}</p>
                    )}
                    {(reason || categoryLabel) && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {categoryLabel ? `${categoryLabel} • ` : ''}{reason}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <div className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(action.created_at), 'MMM d, h:mm a')}
                        </p>
                      </div>
                      {action.actor_name && (
                        <span className="text-[10px] text-primary font-medium">
                          by {action.actor_name}
                        </span>
                      )}
                      {action.is_manager_acting_as_cfo && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-orange-400 text-orange-600">
                          Manager
                        </Badge>
                      )}
                      {(action.metadata?.edit_history?.length ?? 0) > 0 && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-blue-400 text-blue-600">
                          Edited ×{action.metadata.edit_history.length}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {isCFO && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => openEdit(action)}
                      title="Correct TID / reason / target"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Correct trail entry</DialogTitle>
            <DialogDescription>
              Overwrite the transaction reference, reason, or target user. The original values are
              preserved in the entry's edit history and a separate audit row is recorded.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md bg-muted/40 p-2 text-xs space-y-0.5">
                <div><span className="text-muted-foreground">Action:</span> {ACTION_LABELS[editing.action_type] || editing.action_type}</div>
                <div><span className="text-muted-foreground">Current TID:</span> <span className="font-mono">{currentTid}</span></div>
                <div><span className="text-muted-foreground">Current target:</span> {editing.metadata?.target_name || editing.metadata?.user_name || editing.metadata?.agent_name || '—'}</div>
              </div>

              <div>
                <Label className="text-xs">New TID / reference</Label>
                <Input value={newTid} onChange={(e) => setNewTid(e.target.value)} className="h-8 text-xs font-mono" placeholder="Leave blank to keep current" />
              </div>

              <div>
                <Label className="text-xs">New reason / description</Label>
                <Textarea value={newReason} onChange={(e) => setNewReason(e.target.value)} rows={2} className="text-xs" placeholder="Leave blank to keep current" />
              </div>

              <div>
                <Label className="text-xs">Re-link target user (optional)</Label>
                <Input
                  value={newTargetQuery}
                  onChange={(e) => { setNewTargetQuery(e.target.value); setNewTargetUserId(null); }}
                  className="h-8 text-xs"
                  placeholder="Search by name or phone (min 2 chars)"
                />
                {newTargetQuery.length >= 2 && (targetMatches?.length ?? 0) > 0 && (
                  <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-border/50">
                    {targetMatches!.map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setNewTargetUserId(p.id); setNewTargetQuery(p.full_name); }}
                        className={`w-full text-left px-2 py-1 text-xs hover:bg-muted ${newTargetUserId === p.id ? 'bg-muted' : ''}`}
                      >
                        <div className="font-medium">{p.full_name}</div>
                        <div className="text-muted-foreground">{p.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
                {newTargetUserId && (
                  <p className="text-[10px] text-emerald-600 mt-1">Will re-link to this user.</p>
                )}
              </div>

              <div>
                <Label className="text-xs">Correction reason (min 10 chars) <span className="text-destructive">*</span></Label>
                <Textarea value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} rows={2} className="text-xs" placeholder="Why is this correction needed?" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => correct.mutate()} disabled={correct.isPending}>
              {correct.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
