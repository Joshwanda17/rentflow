import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { RentPipelineQueue } from './RentPipelineQueue';
import { ApprovalHistoryLog } from './ApprovalHistoryLog';
import { TenantBehaviorDashboard } from './TenantBehaviorDashboard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileCheck, Clock, AlertTriangle, CheckCircle2, Banknote, ArrowRight, Activity, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';


export function TenantOpsDashboard() {
  const { data: rentRequests, isLoading } = useQuery({
    queryKey: ['exec-tenant-ops'],
    queryFn: async () => {
      const { data } = await supabase.from('rent_requests').select('id, status, rent_amount, amount_repaid, created_at')
        .order('created_at', { ascending: false }).limit(200);
      return data || [];
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

  const columns: Column<any>[] = [
    { key: 'created_at', label: 'Date', render: (v) => v ? format(new Date(v as string), 'dd MMM yy') : '—' },
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
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <Tabs defaultValue="pipeline" className="w-full">
        <TabsList className="w-full grid grid-cols-2 h-9">
          <TabsTrigger value="pipeline" className="text-xs gap-1">
            <ClipboardList className="h-3.5 w-3.5" />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="behavior" className="text-xs gap-1">
            <Activity className="h-3.5 w-3.5" />
            Tenant Behavior
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-3 space-y-4 sm:space-y-6">
          {/* 🔥 PRIORITY: Review Queue at the top */}
          <RentPipelineQueue stage="pending" />

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            <KPICard title="Pending Review" value={pending} icon={Clock} loading={isLoading} color="bg-amber-500/10 text-amber-600" />
            <KPICard title="In Pipeline" value={inPipeline} icon={ArrowRight} loading={isLoading} color="bg-blue-500/10 text-blue-600" />
            <KPICard title="Funded / Disbursed" value={funded} icon={Banknote} loading={isLoading} color="bg-green-500/10 text-green-600" />
            <KPICard title="Repaying" value={repaying} icon={FileCheck} loading={isLoading} color="bg-purple-500/10 text-purple-600" />
            <KPICard title="Fully Repaid" value={fullyRepaid} icon={CheckCircle2} loading={isLoading} color="bg-emerald-500/10 text-emerald-600" />
            <KPICard title="Defaulted" value={defaulted} icon={AlertTriangle} loading={isLoading} color="bg-destructive/10 text-destructive" />
          </div>

          <ApprovalHistoryLog />

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
        </TabsContent>

        <TabsContent value="behavior" className="mt-3">
          <TenantBehaviorDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
