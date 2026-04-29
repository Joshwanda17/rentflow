import { useState } from 'react';
import { AdvanceRequestsQueue } from '@/components/ops/AdvanceRequestsQueue';
import { BusinessAdvanceQueue } from '@/components/ops/BusinessAdvanceQueue';
import { RentHistoryVerificationQueue } from '@/components/ops/RentHistoryVerificationQueue';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { RentPipelineQueue } from './RentPipelineQueue';
import { RejectedRequestsQueue } from './RejectedRequestsQueue';
import { ApprovalHistoryLog } from './ApprovalHistoryLog';
import { TenantBehaviorDashboard } from './TenantBehaviorDashboard';
import { DailyPaymentTracker } from './DailyPaymentTracker';
import { MissedDaysTracker } from './MissedDaysTracker';
import { TenantAgentLinker } from './TenantAgentLinker';
import { TenantTransferAuditTrail } from './TenantTransferAuditTrail';
import { TenantRentCollector } from './TenantRentCollector';
import { AgentTenantSearch } from './AgentTenantSearch';
import { TenantOverviewList } from './TenantOverviewList';
import { TenantDetailPanel } from './TenantDetailPanel';
import { TenantRegistrationReview } from './TenantRegistrationReview';
import { AgentAllocationReport } from './AgentAllocationReport';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

import {
  FileCheck, Clock, AlertTriangle, CheckCircle2, Banknote,
  ArrowRight, Activity, ClipboardList, CalendarCheck, CalendarX2,
  ArrowLeft, History, Table2, Link2, HandCoins, Users, Trash2, Loader2, FileSearch, Printer, Network, Shield, CalendarIcon
} from 'lucide-react';
import { generateTenantOpsReportPdf } from '@/lib/generateTenantOpsReportPdf';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

type ActiveView = 'overview' | 'pipeline' | 'daily' | 'missed' | 'behavior' | 'history' | 'all-requests' | 'link-agent' | 'transfer-audit' | 'collect-rent' | 'agent-tenants' | 'tenant-detail' | 'registration-review' | 'advance-requests' | 'agent-allocations';

interface NavCard {
  id: ActiveView;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  badge?: number;
  badgeColor?: string;
}

export function TenantOpsDashboard() {
  const [activeView, setActiveView] = useState<ActiveView>('overview');
  const queryClient = useQueryClient();
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; tenantId: string; tenantName: string }>({ open: false, tenantId: '', tenantName: '' });
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<{ id: string; name: string } | null>(null);
  const [overviewFilter, setOverviewFilter] = useState<string | undefined>(undefined);
  const [printingPdf, setPrintingPdf] = useState(false);
  const [reportFrom, setReportFrom] = useState<Date | undefined>(undefined);
  const [reportTo, setReportTo] = useState<Date | undefined>(undefined);

  const handlePrintReport = async () => {
    setPrintingPdf(true);
    try {
      // Date window — payments collected in this period.
      // Normalize both ends to LOCAL midnight / end-of-day so the user
      // gets exactly the calendar days they picked (no UTC drift).
      let fromDate = reportFrom ? new Date(reportFrom) : null;
      let toDate = reportTo ? new Date(reportTo) : null;
      // Defensive swap if user inverted the range.
      if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
        const tmp = fromDate; fromDate = toDate; toDate = tmp;
        toast('Date range was reversed — swapped automatically.', { icon: '↔️' });
      }
      if (fromDate) fromDate.setHours(0, 0, 0, 0);
      if (toDate) toDate.setHours(23, 59, 59, 999);
      const fromIso = fromDate ? fromDate.toISOString() : null;
      const toIso = toDate ? toDate.toISOString() : null;

      // 1. Pull tenant payments from the ledger (source of truth)
      let ledgerQ = supabase
        .from('general_ledger')
        .select('user_id, amount, source_id, source_table, transaction_date, transaction_group_id')
        .in('category', ['tenant_repayment', 'rent_repayment'])
        .eq('direction', 'cash_in');
      if (fromIso) ledgerQ = ledgerQ.gte('transaction_date', fromIso);
      if (toIso) ledgerQ = ledgerQ.lte('transaction_date', toIso);
      const { data: payments, error: payErr } = await ledgerQ;
      if (payErr) throw payErr;

      if (!payments || payments.length === 0) {
        toast.error('No tenant payments found for the selected period');
        return;
      }

      // 2a. Resolve responsible agent via agent_collections
      //     (legacy manual-collect-rent path — kept for backward compat).
      const collectionIds = [...new Set(
        payments.filter(p => p.source_table === 'agent_collections' && p.source_id).map(p => p.source_id as string)
      )];
      const { data: collections } = collectionIds.length
        ? await supabase.from('agent_collections').select('id, agent_id, tenant_id').in('id', collectionIds)
        : { data: [] as any[] };
      const collectionMap = new Map((collections || []).map(c => [c.id, c]));

      // 2b. Resolve responsible agent via the SAME transaction_group_id
      //     (Float-Allocation path — covers virtually all production agent
     //      collections today). Each tenant_repayment is part of a 4-leg
     //      group: agent_float_used_for_rent (cash_out, user_id=AGENT) +
     //      tenant_repayment (cash_in, user_id=TENANT) + 2 commission legs.
     //      The agent identity lives on the float / commission legs, never
     //      on the tenant leg. Looking it up via source_id alone — which is
     //      what the previous version did — silently misses every Float-
     //      Allocation payment, producing AGENT-COLLECTED = 0 (FIX-46).
      const groupIds = [...new Set(
        payments.map(p => (p as any).transaction_group_id).filter(Boolean) as string[]
      )];
      const { data: groupLegs } = groupIds.length
        ? await supabase
            .from('general_ledger')
            .select('user_id, category, direction, transaction_group_id')
            .in('transaction_group_id', groupIds)
            .in('category', ['agent_float_used_for_rent', 'agent_commission_earned'])
        : { data: [] as any[] };
      const agentByGroup = new Map<string, string>();
      // Pass 1 — preferred signal: the float being drawn down.
      for (const leg of (groupLegs || []) as any[]) {
        if (leg.category === 'agent_float_used_for_rent' && leg.direction === 'cash_out' && leg.user_id) {
          agentByGroup.set(leg.transaction_group_id, leg.user_id);
        }
      }
      // Pass 2 — fallback: the agent's commission credit (when float leg
      // is absent for any reason).
      for (const leg of (groupLegs || []) as any[]) {
        if (
          leg.category === 'agent_commission_earned'
          && leg.direction === 'cash_in'
          && leg.user_id
          && !agentByGroup.has(leg.transaction_group_id)
        ) {
          agentByGroup.set(leg.transaction_group_id, leg.user_id);
        }
      }

      // 3. Tenant + agent profile lookups
      const tenantIds = [...new Set(payments.map(p => p.user_id).filter(Boolean) as string[])];
      // Also fetch rent_requests (assigned agent fallback) AND profiles.referrer_id
      // (onboarding agent fallback). Outstanding now comes from the ledger so
      // it's accurate even for tenants without a rent_request row.
      const [tenantRes, rentReqRes, ledgerLifetimeRes] = await Promise.all([
        tenantIds.length
          ? supabase.from('profiles').select('id, full_name, phone, referrer_id').in('id', tenantIds)
          : Promise.resolve({ data: [] as any[] }),
        tenantIds.length
          ? supabase.from('rent_requests')
              .select('tenant_id, agent_id, total_repayment, amount_repaid, status')
              .in('tenant_id', tenantIds)
              .in('status', ['funded', 'disbursed', 'repaying', 'fully_repaid', 'defaulted'])
          : Promise.resolve({ data: [] as any[] }),
        tenantIds.length
          ? supabase.from('general_ledger')
              .select('user_id, category, direction, amount')
              .in('user_id', tenantIds)
              .in('category', ['rent_obligation', 'tenant_repayment', 'rent_repayment'])
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const tenantMap = new Map((tenantRes.data || []).map((p: any) => [p.id, p]));

      // Assigned-agent fallback per tenant (from rent_requests).
      const outstandingByTenant = new Map<string, number>();
      const assignedAgentByTenant = new Map<string, string>();
      for (const r of (rentReqRes.data || [])) {
        if (r.agent_id && !assignedAgentByTenant.has(r.tenant_id)) {
          assignedAgentByTenant.set(r.tenant_id, r.agent_id);
        }
      }

      // Lifetime outstanding straight from the ledger (source of truth).
      // outstanding = SUM(rent_obligation cash_out) − SUM(repayments cash_in).
      // Negative results clamp to 0 (overpayment / credit).
      for (const tid of tenantIds) outstandingByTenant.set(tid, 0);
      for (const r of (ledgerLifetimeRes.data || []) as any[]) {
        if (!r.user_id) continue;
        const amt = Number(r.amount || 0);
        const cur = outstandingByTenant.get(r.user_id) || 0;
        if (r.category === 'rent_obligation' && r.direction === 'cash_out') {
          outstandingByTenant.set(r.user_id, cur + amt);
        } else if (r.direction === 'cash_in') {
          outstandingByTenant.set(r.user_id, cur - amt);
        }
      }
      for (const [k, v] of outstandingByTenant) {
        if (v < 0) outstandingByTenant.set(k, 0);
      }

      // Referrer-as-agent fallback: only count referrers who actually hold the agent role.
      const referrerIds = [...new Set(
        (tenantRes.data || [])
          .map((p: any) => p.referrer_id)
          .filter((id: any) => !!id)
      )] as string[];
      const { data: agentRoleRows } = referrerIds.length
        ? await supabase.from('user_roles').select('user_id').in('user_id', referrerIds).eq('role', 'agent')
        : { data: [] as any[] };
      const agentReferrerSet = new Set((agentRoleRows || []).map((r: any) => r.user_id));
      const referrerAgentByTenant = new Map<string, string>();
      for (const p of (tenantRes.data || []) as any[]) {
        if (p.referrer_id && agentReferrerSet.has(p.referrer_id)) {
          referrerAgentByTenant.set(p.id, p.referrer_id);
        }
      }

      // Resolve agent profiles for collection-based, rent-request and referrer fallbacks
      const allAgentIds = [...new Set([
        ...((collections || []).map(c => c.agent_id).filter(Boolean) as string[]),
        ...Array.from(agentByGroup.values()),
        ...Array.from(assignedAgentByTenant.values()),
        ...Array.from(referrerAgentByTenant.values()),
      ])];
      const { data: agentProfiles } = allAgentIds.length
        ? await supabase.from('profiles').select('id, full_name').in('id', allAgentIds)
        : { data: [] as any[] };
      const agentMap = new Map((agentProfiles || []).map((p: any) => [p.id, p]));

      // 4. Aggregate one row per tenant — paid IN RANGE
      const byTenant = new Map<string, {
        tenant_name: string; tenant_phone: string;
        amount_paid: number; outstanding: number;
        paid_direct: number; paid_via_agent: number;
        agent_names: Set<string>;
        payment_count: number;
      }>();
      for (const p of payments) {
        const tenantId = p.user_id as string | null;
        if (!tenantId) continue;
        // Per-row attribution priority:
        //   (1) Float-Allocation agent — same transaction_group_id has an
        //       agent_float_used_for_rent / commission leg (the dominant
        //       agent path in production).
        //   (2) Legacy collection — source_id matches an agent_collections row.
        //   Either of (1) or (2) flips the row into "agent-collected".
        //   (3) Assigned agent on an active rent_request — display only.
        //   (4) Onboarding agent (profiles.referrer_id) — display only.
        const groupAgentId = (p as any).transaction_group_id
          ? agentByGroup.get((p as any).transaction_group_id)
          : undefined;
        const collection = p.source_id ? collectionMap.get(p.source_id) : null;
        const collectingAgentId = collection?.agent_id;
        const isAgentCollection = !!groupAgentId || !!collectingAgentId;
        const attributedAgentId =
          groupAgentId
          || collectingAgentId
          || assignedAgentByTenant.get(tenantId)
          || referrerAgentByTenant.get(tenantId);
        let agentName = '—';
        if (attributedAgentId) {
          const profileName = agentMap.get(attributedAgentId)?.full_name;
          if (profileName) {
            agentName = profileName;
            // Multi-role test/sandbox case: the same UUID acts as agent +
            // tenant. Still counted as agent-collected (it really was), but
            // tagged so reviewers don't think it's a bug.
            if (attributedAgentId === tenantId) agentName = `${profileName} (self)`;
          } else if (isAgentCollection) {
            agentName = 'Agent (deleted)';
          }
        }
        const amt = Number(p.amount || 0);

        let row = byTenant.get(tenantId);
        if (!row) {
          row = {
            tenant_name: tenantMap.get(tenantId)?.full_name || '—',
            tenant_phone: tenantMap.get(tenantId)?.phone || '—',
            amount_paid: 0,
            outstanding: outstandingByTenant.get(tenantId) || 0,
            paid_direct: 0,
            paid_via_agent: 0,
            agent_names: new Set<string>(),
            payment_count: 0,
          };
          byTenant.set(tenantId, row);
        }
        row.amount_paid += amt;
        if (isAgentCollection) row.paid_via_agent += amt; else row.paid_direct += amt;
        row.payment_count += 1;
        if (agentName && agentName !== '—') row.agent_names.add(agentName);
      }

      const rows = Array.from(byTenant.values())
        .map(t => ({
          tenant_name: t.tenant_name,
          tenant_phone: t.tenant_phone,
          rent_plans: t.payment_count,
          rent_given: 0,
          amount_paid: t.amount_paid,
          paid_direct: t.paid_direct,
          paid_via_agent: t.paid_via_agent,
          outstanding: t.outstanding,
          agent_name: t.agent_names.size === 0 ? 'Direct (no agent)' : Array.from(t.agent_names).join(', '),
        }))
        .sort((a, b) => b.amount_paid - a.amount_paid);

      const blob = generateTenantOpsReportPdf(rows, { from: fromDate, to: toDate });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const suffix = reportFrom || reportTo
        ? `${reportFrom ? format(reportFrom, 'yyyyMMdd') : 'start'}_${reportTo ? format(reportTo, 'yyyyMMdd') : format(new Date(), 'yyyyMMdd')}`
        : format(new Date(), 'yyyy-MM-dd');
      a.download = `Tenant_Rent_Report_${suffix}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate report');
    } finally {
      setPrintingPdf(false);
    }
  };

  const handleDeleteTenant = async () => {
    if (!deleteDialog.tenantId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-user', {
        body: { user_id: deleteDialog.tenantId, preserve_history: true },
      });
      if (error) throw error;
      toast.success(`Tenant "${deleteDialog.tenantName}" has been archived; payment history is preserved`);
      setDeleteDialog({ open: false, tenantId: '', tenantName: '' });
      queryClient.invalidateQueries({ queryKey: ['exec-tenant-ops'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete tenant');
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTenantIds.length === 0) return;
    setBulkDeleting(true);
    let success = 0;
    let failed = 0;
    const failures: string[] = [];
    for (const id of selectedTenantIds) {
      try {
        const { error } = await supabase.functions.invoke('delete-user', { body: { user_id: id, preserve_history: true } });
        if (error) throw error;
        success += 1;
      } catch (err: any) {
        failed += 1;
        failures.push(err?.message || id);
      }
    }
    setBulkDeleting(false);
    setBulkDeleteOpen(false);
    setSelectedTenantIds([]);
    queryClient.invalidateQueries({ queryKey: ['exec-tenant-ops'] });
    if (failed === 0) {
      toast.success(`Archived ${success} tenant${success === 1 ? '' : 's'}; payment history is preserved`);
    } else {
      toast.error(`Archived ${success}, failed ${failed}. ${failures[0] || ''}`);
    }
  };

  const { data: rentRequests, isLoading } = useQuery({
    queryKey: ['exec-tenant-ops'],
    queryFn: async () => {
      const { data } = await supabase.from('rent_requests')
        .select('id, status, rent_amount, amount_repaid, created_at, tenant_id, landlord_id, agent_id')
        .order('created_at', { ascending: false }).limit(200);
      const items = data || [];

      const tenantIds = [...new Set(items.map(r => r.tenant_id).filter(Boolean))];
      const landlordIds = [...new Set(items.map(r => r.landlord_id).filter(Boolean))];
      const agentIds = [...new Set(items.map(r => r.agent_id).filter(Boolean))];

      const [profilesRes, landlordsRes, agentsRes] = await Promise.all([
        tenantIds.length > 0
          ? supabase.from('profiles').select('id, full_name, phone, tenant_status').in('id', tenantIds.slice(0, 100))
          : { data: [] },
        landlordIds.length > 0
          ? supabase.from('landlords').select('id, name, phone').in('id', landlordIds.slice(0, 100))
          : { data: [] },
        agentIds.length > 0
          ? supabase.from('profiles').select('id, full_name').in('id', agentIds.slice(0, 100))
          : { data: [] },
      ]);

      const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p]));
      const landlordMap = new Map((landlordsRes.data || []).map(l => [l.id, l]));
      const agentMap = new Map((agentsRes.data || []).map((a: any) => [a.id, a]));

      return items
        .filter(r => profileMap.get(r.tenant_id)?.tenant_status !== 'inactive')
        .map(r => ({
          ...r,
          tenant_name: profileMap.get(r.tenant_id)?.full_name || '—',
          tenant_phone: profileMap.get(r.tenant_id)?.phone || '—',
          landlord_name: landlordMap.get(r.landlord_id)?.name || '—',
          landlord_phone: landlordMap.get(r.landlord_id)?.phone || '—',
          agent_name: r.agent_id ? (agentMap.get(r.agent_id)?.full_name || '—') : 'Unassigned',
        }));
    },
    staleTime: 600000,
  });

  const rows = rentRequests || [];
  const pending = rows.filter(r => r.status === 'pending').length;
  const funded = rows.filter(r => ['funded', 'disbursed'].includes(r.status)).length;
  const repaying = rows.filter(r => r.status === 'repaying').length;
  const fullyRepaid = rows.filter(r => r.status === 'fully_repaid').length;
  const defaulted = rows.filter(r => r.status === 'defaulted').length;
  const inPipeline = rows.filter(r => ['tenant_ops_approved', 'agent_verified', 'landlord_ops_approved', 'coo_approved'].includes(r.status)).length;

  const navCards: NavCard[] = [
    {
      id: 'pipeline',
      label: 'Review Requests',
      description: 'Approve or reject pending rent requests',
      icon: ClipboardList,
      color: 'bg-amber-500/10 text-amber-600 border-amber-200',
      badge: pending,
      badgeColor: 'bg-amber-500 text-white',
    },
    {
      id: 'daily',
      label: 'Daily Payments',
      description: 'Who paid today & who hasn\'t',
      icon: CalendarCheck,
      color: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
      badge: repaying,
      badgeColor: 'bg-emerald-500 text-white',
    },
    {
      id: 'missed',
      label: 'Missed Days',
      description: 'Tenants behind on payments',
      icon: CalendarX2,
      color: 'bg-destructive/10 text-destructive border-destructive/20',
      badge: defaulted,
      badgeColor: 'bg-destructive text-white',
    },
    {
      id: 'behavior',
      label: 'Tenant Behavior',
      description: 'Risk scores & payment patterns',
      icon: Activity,
      color: 'bg-purple-500/10 text-purple-600 border-purple-200',
    },
    {
      id: 'history',
      label: 'Approval History',
      description: 'Past approvals & rejections log',
      icon: History,
      color: 'bg-blue-500/10 text-blue-600 border-blue-200',
    },
    {
      id: 'all-requests',
      label: 'All Requests',
      description: 'Full table of every request',
      icon: Table2,
      color: 'bg-muted text-foreground border-border',
    },
    {
      id: 'link-agent',
      label: 'Link Agent',
      description: 'Assign an agent to a tenant',
      icon: Link2,
      color: 'bg-primary/10 text-primary border-primary/20',
    },
    {
      id: 'transfer-audit' as ActiveView,
      label: 'Transfer Audit',
      description: 'Geo-stamped link & transfer history',
      icon: Shield,
      color: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
    },
    {
      id: 'collect-rent',
      label: 'Collect Rent',
      description: 'Charge tenant or agent wallet',
      icon: HandCoins,
      color: 'bg-orange-500/10 text-orange-600 border-orange-200',
    },
    {
      id: 'agent-tenants' as ActiveView,
      label: 'Search by Agent',
      description: 'Find tenants via their agent',
      icon: Users,
      color: 'bg-cyan-500/10 text-cyan-600 border-cyan-200',
    },
    {
      id: 'registration-review' as ActiveView,
      label: 'Review Registration',
      description: 'View & edit tenant info',
      icon: FileSearch,
      color: 'bg-teal-500/10 text-teal-600 border-teal-200',
    },
    {
      id: 'advance-requests' as ActiveView,
      label: 'Agent Advances',
      description: 'Review advance requests',
      icon: Banknote,
      color: 'bg-purple-500/10 text-purple-600 border-purple-200',
    },
    {
      id: 'agent-allocations' as ActiveView,
      label: 'Agent Allocations',
      description: 'Holistic per-agent tenant repayment view',
      icon: Network,
      color: 'bg-indigo-500/10 text-indigo-600 border-indigo-200',
    },
  ];

  const goBack = () => {
    setActiveView('overview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const columns: Column<any>[] = [
    { key: 'created_at', label: 'Date', render: (v) => v ? format(new Date(v as string), 'dd MMM yy') : '—' },
    { key: 'tenant_name', label: 'Tenant' },
    { key: 'tenant_phone', label: 'Phone' },
    { key: 'status', label: 'Status', render: (v) => {
      const colors: Record<string, string> = {
        pending: 'bg-amber-100 text-amber-700',
        tenant_ops_approved: 'bg-blue-100 text-blue-700',
        agent_verified: 'bg-purple-100 text-purple-700',
        landlord_ops_approved: 'bg-indigo-100 text-indigo-700',
        coo_approved: 'bg-emerald-100 text-emerald-700',
        funded: 'bg-green-100 text-green-700',
        disbursed: 'bg-teal-100 text-teal-700',
        repaying: 'bg-purple-100 text-purple-700',
        fully_repaid: 'bg-emerald-100 text-emerald-700',
        defaulted: 'bg-destructive/10 text-destructive',
      };
      return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[String(v)] || 'bg-muted'}`}>{String(v).replace(/_/g, ' ')}</span>;
    }},
    { key: 'rent_amount', label: 'Amount', render: (v) => Number(v || 0).toLocaleString() },
    { key: 'amount_repaid', label: 'Repaid', render: (v) => Number(v || 0).toLocaleString() },
    { key: 'agent_name', label: 'Current Agent', render: (v) => (
      <span className={`text-xs ${v === 'Unassigned' ? 'text-muted-foreground italic' : 'font-medium'}`}>
        {String(v ?? '—')}
      </span>
    )},
    { key: 'landlord_name', label: 'Landlord' },
    { key: 'landlord_phone', label: 'L. Phone' },
    { key: 'tenant_id', label: 'Action', render: (_v, row) => (
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          setDeleteDialog({ open: true, tenantId: row.tenant_id, tenantName: row.tenant_name || 'Unknown' });
        }}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1" />
        Delete
      </Button>
    )},
  ];

  const renderSubView = () => {
    switch (activeView) {
      case 'pipeline':
        return (
          <div className="space-y-4">
            <RentPipelineQueue stage="pending" />
            <RejectedRequestsQueue stageFilter="pending" title="Rejected at Tenant Ops" />
            <div className="grid grid-cols-2 gap-2">
              <KPICard title="Pending" value={pending} icon={Clock} loading={isLoading} color="bg-amber-500/10 text-amber-600" />
              <KPICard title="In Pipeline" value={inPipeline} icon={ArrowRight} loading={isLoading} color="bg-blue-500/10 text-blue-600" />
              <KPICard title="Funded" value={funded} icon={Banknote} loading={isLoading} color="bg-green-500/10 text-green-600" />
              <KPICard title="Repaying" value={repaying} icon={FileCheck} loading={isLoading} color="bg-purple-500/10 text-purple-600" />
              <KPICard title="Fully Repaid" value={fullyRepaid} icon={CheckCircle2} loading={isLoading} color="bg-emerald-500/10 text-emerald-600" />
              <KPICard title="Defaulted" value={defaulted} icon={AlertTriangle} loading={isLoading} color="bg-destructive/10 text-destructive" />
            </div>
          </div>
        );
      case 'daily':
        return <DailyPaymentTracker />;
      case 'missed':
        return <MissedDaysTracker />;
      case 'behavior':
        return <TenantBehaviorDashboard />;
      case 'history':
        return <ApprovalHistoryLog />;
      case 'all-requests':
        return (
          <ExecutiveDataTable
            data={rows}
            columns={columns}
            loading={isLoading}
            title="All Requests"
            getRowId={(r: any) => String(r.tenant_id || r.id)}
            selectedIds={selectedTenantIds}
            onSelectionChange={setSelectedTenantIds}
            bulkActions={(ids) => (
              <Button
                variant="destructive"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete {ids.length}
              </Button>
            )}
            filters={[{
              key: 'status',
              label: 'Status',
              options: [
                { value: 'pending', label: 'Pending' },
                { value: 'tenant_ops_approved', label: 'Tenant Ops Approved' },
                { value: 'agent_verified', label: 'Agent Verified' },
                { value: 'landlord_ops_approved', label: 'Landlord Ops Approved' },
                { value: 'coo_approved', label: 'COO Approved' },
                { value: 'funded', label: 'Funded' },
                { value: 'repaying', label: 'Repaying' },
                { value: 'fully_repaid', label: 'Fully Repaid' },
                { value: 'defaulted', label: 'Defaulted' },
              ],
            }]}
          />
        );
      case 'link-agent':
        return <TenantAgentLinker />;
      case 'transfer-audit':
        return <TenantTransferAuditTrail />;
      case 'collect-rent':
        return <TenantRentCollector />;
      case 'agent-tenants':
        return <AgentTenantSearch />;
      case 'tenant-detail':
        return selectedTenant ? (
          <TenantDetailPanel
            tenantId={selectedTenant.id}
            tenantName={selectedTenant.name}
            onBack={goBack}
            onViewRegistration={() => setActiveView('registration-review')}
          />
        ) : null;
      case 'registration-review':
        return selectedTenant ? (
          <TenantRegistrationReview
            tenantId={selectedTenant.id}
            tenantName={selectedTenant.name}
            onBack={goBack}
          />
        ) : (
          <TenantOverviewList
            data={rows}
            loading={isLoading}
            onSelectTenant={(id, name) => {
              setSelectedTenant({ id, name });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        );
      case 'advance-requests':
        return (
          <div className="space-y-6">
            <AdvanceRequestsQueue stage="tenant_ops" />
            <BusinessAdvanceQueue stage="tenant_ops" />
            <RentHistoryVerificationQueue dept="tenant_ops" />
          </div>
        );
      case 'agent-allocations':
        return <AgentAllocationReport />;
      default:
        return null;
    }
  };

  const activeLabel = navCards.find(n => n.id === activeView)?.label || '';

  return (
    <div className="space-y-3">
      <AnimatePresence mode="wait">
        {activeView === 'overview' ? (
          <motion.div
            key="overview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            {/* Quick KPI summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Card className="border bg-amber-500/5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setOverviewFilter('pending')}>
                <CardContent className="p-2.5 text-center">
                  <p className="text-2xl font-extrabold text-amber-600">{pending}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Pending</p>
                </CardContent>
              </Card>
              <Card className="border bg-green-500/5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setOverviewFilter('active')}>
                <CardContent className="p-2.5 text-center">
                  <p className="text-2xl font-extrabold text-green-600">{funded}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Funded</p>
                </CardContent>
              </Card>
              <Card className="border bg-purple-500/5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setOverviewFilter('repaying')}>
                <CardContent className="p-2.5 text-center">
                  <p className="text-2xl font-extrabold text-purple-600">{repaying}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Repaying</p>
                </CardContent>
              </Card>
              <Card className="border bg-destructive/5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setOverviewFilter('defaulted')}>
                <CardContent className="p-2.5 text-center">
                  <p className="text-2xl font-extrabold text-destructive">{defaulted}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Defaulted</p>
                </CardContent>
              </Card>
            </div>

            {/* Print Report Button */}
            <div className="flex flex-wrap justify-end items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("gap-1.5 font-normal", !reportFrom && "text-muted-foreground")}>
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {reportFrom ? format(reportFrom, 'dd MMM yyyy') : 'From'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={reportFrom}
                    onSelect={setReportFrom}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("gap-1.5 font-normal", !reportTo && "text-muted-foreground")}>
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {reportTo ? format(reportTo, 'dd MMM yyyy') : 'To'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={reportTo}
                    onSelect={setReportTo}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {(reportFrom || reportTo) && (
                <Button variant="ghost" size="sm" onClick={() => { setReportFrom(undefined); setReportTo(undefined); }}>
                  Clear
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handlePrintReport}
                disabled={printingPdf}
              >
                {printingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Print Report
              </Button>
            </div>

            {/* Navigation Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-2.5">
              {navCards.map((card) => {
                const Icon = card.icon;
                return (
                  <motion.button
                    key={card.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setActiveView(card.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-left w-full"
                  >
                    <Card className={`border h-full hover:shadow-md transition-shadow ${card.color.includes('amber') ? 'border-amber-200' : card.color.includes('emerald') ? 'border-emerald-200' : card.color.includes('destructive') ? 'border-destructive/20' : card.color.includes('purple') ? 'border-purple-200' : card.color.includes('blue') ? 'border-blue-200' : 'border-border'}`}>
                      <CardContent className="p-3.5 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className={`p-2 rounded-xl ${card.color.split(' ').slice(0, 1).join(' ')}`}>
                            <Icon className={`h-5 w-5 ${card.color.split(' ').slice(1, 2).join(' ')}`} />
                          </div>
                          {card.badge !== undefined && card.badge > 0 && (
                            <Badge className={`text-[10px] px-1.5 py-0 font-bold ${card.badgeColor}`}>
                              {card.badge}
                            </Badge>
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-foreground leading-tight">{card.label}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{card.description}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.button>
                );
              })}
            </div>
            {/* Tenant List */}
            <TenantOverviewList
              data={rows}
              loading={isLoading}
              initialCategory={overviewFilter}
              onSelectTenant={(id, name) => {
                setSelectedTenant({ id, name });
                setActiveView('tenant-detail');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key={activeView}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            {/* Back button - skip for tenant-detail which has its own */}
            {activeView !== 'tenant-detail' && (
              <Button
                variant="ghost"
                onClick={goBack}
                className="h-11 px-3 gap-2 text-sm font-semibold -ml-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Overview
                <span className="text-muted-foreground font-normal">· {activeLabel}</span>
              </Button>
            )}

            {renderSubView()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Tenant Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, tenantId: '', tenantName: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Tenant</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{deleteDialog.tenantName}</strong> from the active tenant list and disable access, while preserving payment history and ledger records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTenant}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Archiving...</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-2" />Archive Tenant</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => !open && !bulkDeleting && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {selectedTenantIds.length} tenant{selectedTenantIds.length === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{selectedTenantIds.length}</strong> selected tenant{selectedTenantIds.length === 1 ? '' : 's'} from active tenant views and disable access, while preserving payment history and ledger records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Archiving…</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-2" />Archive {selectedTenantIds.length}</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
