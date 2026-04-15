import { useState } from 'react';
import { AdvanceRequestsQueue } from '@/components/ops/AdvanceRequestsQueue';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { RentPipelineQueue } from './RentPipelineQueue';
import { ApprovalHistoryLog } from './ApprovalHistoryLog';
import { TenantBehaviorDashboard } from './TenantBehaviorDashboard';
import { DailyPaymentTracker } from './DailyPaymentTracker';
import { MissedDaysTracker } from './MissedDaysTracker';
import { TenantAgentLinker } from './TenantAgentLinker';
import { TenantRentCollector } from './TenantRentCollector';
import { AgentTenantSearch } from './AgentTenantSearch';
import { TenantOverviewList } from './TenantOverviewList';
import { TenantDetailPanel } from './TenantDetailPanel';
import { TenantRegistrationReview } from './TenantRegistrationReview';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

import {
  FileCheck, Clock, AlertTriangle, CheckCircle2, Banknote,
  ArrowRight, Activity, ClipboardList, CalendarCheck, CalendarX2,
  ArrowLeft, History, Table2, Link2, HandCoins, Users, Trash2, Loader2, FileSearch, Printer
} from 'lucide-react';
import { generateTenantOpsReportPdf } from '@/lib/generateTenantOpsReportPdf';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

type ActiveView = 'overview' | 'pipeline' | 'daily' | 'missed' | 'behavior' | 'history' | 'all-requests' | 'link-agent' | 'collect-rent' | 'agent-tenants' | 'tenant-detail' | 'registration-review' | 'advance-requests';

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
  const [deleting, setDeleting] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<{ id: string; name: string } | null>(null);
  const [overviewFilter, setOverviewFilter] = useState<string | undefined>(undefined);
  const [printingPdf, setPrintingPdf] = useState(false);

  const handlePrintReport = async () => {
    setPrintingPdf(true);
    try {
      // Fetch rent requests with agent_id
      const { data: requests } = await supabase
        .from('rent_requests')
        .select('tenant_id, agent_id, rent_amount, total_repayment, amount_repaid, duration_days, number_of_payments, status, created_at')
        .in('status', ['funded', 'disbursed', 'repaying', 'fully_repaid', 'defaulted']);

      if (!requests || requests.length === 0) {
        toast.error('No tenant rent data found');
        return;
      }

      const tenantIds = [...new Set(requests.map(r => r.tenant_id).filter(Boolean))];
      const agentIds = [...new Set(requests.map(r => r.agent_id).filter(Boolean))];

      const [tenantRes, agentRes, chargeRes] = await Promise.all([
        tenantIds.length > 0
          ? supabase.from('profiles').select('id, full_name, phone').in('id', tenantIds)
          : { data: [] },
        agentIds.length > 0
          ? supabase.from('profiles').select('id, full_name').in('id', agentIds)
          : { data: [] },
        tenantIds.length > 0
          ? supabase.from('subscription_charge_logs').select('tenant_id').in('tenant_id', tenantIds)
          : { data: [] },
      ]);

      const tenantMap = new Map((tenantRes.data || []).map(p => [p.id, p]));
      const agentMap = new Map((agentRes.data || []).map(p => [p.id, p]));
      const paymentCounts = new Map<string, number>();
      (chargeRes.data || []).forEach((c: any) => {
        paymentCounts.set(c.tenant_id, (paymentCounts.get(c.tenant_id) || 0) + 1);
      });

      const rows = requests.map(r => ({
        tenant_name: tenantMap.get(r.tenant_id)?.full_name || '—',
        tenant_phone: tenantMap.get(r.tenant_id)?.phone || '—',
        start_date: r.created_at || '',
        rent_given: Number(r.rent_amount || 0),
        amount_paid: Number(r.amount_repaid || 0),
        outstanding: Number(r.total_repayment || 0) - Number(r.amount_repaid || 0),
        agent_name: agentMap.get(r.agent_id)?.full_name || '—',
        duration_days: r.duration_days || 0,
        payments_made: paymentCounts.get(r.tenant_id) || r.number_of_payments || 0,
      }));

      const blob = generateTenantOpsReportPdf(rows);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Tenant_Rent_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
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
        body: { user_id: deleteDialog.tenantId },
      });
      if (error) throw error;
      toast.success(`Tenant "${deleteDialog.tenantName}" has been deleted`);
      setDeleteDialog({ open: false, tenantId: '', tenantName: '' });
      queryClient.invalidateQueries({ queryKey: ['exec-tenant-ops'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete tenant');
    } finally {
      setDeleting(false);
    }
  };

  const { data: rentRequests, isLoading } = useQuery({
    queryKey: ['exec-tenant-ops'],
    queryFn: async () => {
      const { data } = await supabase.from('rent_requests')
        .select('id, status, rent_amount, amount_repaid, created_at, tenant_id, landlord_id')
        .order('created_at', { ascending: false }).limit(200);
      const items = data || [];

      const tenantIds = [...new Set(items.map(r => r.tenant_id).filter(Boolean))];
      const landlordIds = [...new Set(items.map(r => r.landlord_id).filter(Boolean))];

      const [profilesRes, landlordsRes] = await Promise.all([
        tenantIds.length > 0
          ? supabase.from('profiles').select('id, full_name, phone').in('id', tenantIds.slice(0, 100))
          : { data: [] },
        landlordIds.length > 0
          ? supabase.from('landlords').select('id, name, phone').in('id', landlordIds.slice(0, 100))
          : { data: [] },
      ]);

      const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p]));
      const landlordMap = new Map((landlordsRes.data || []).map(l => [l.id, l]));

      return items.map(r => ({
        ...r,
        tenant_name: profileMap.get(r.tenant_id)?.full_name || '—',
        tenant_phone: profileMap.get(r.tenant_id)?.phone || '—',
        landlord_name: landlordMap.get(r.landlord_id)?.name || '—',
        landlord_phone: landlordMap.get(r.landlord_id)?.phone || '—',
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
        return <AdvanceRequestsQueue stage="tenant_ops" />;
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
            <div className="flex justify-end">
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
            <AlertDialogTitle>Delete Tenant</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteDialog.tenantName}</strong> and all their data. This action cannot be undone.
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
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-2" />Delete Tenant</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
