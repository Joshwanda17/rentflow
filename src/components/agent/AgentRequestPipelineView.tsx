import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Send,
  CheckCircle2,
  XCircle,
  User,
  Building,
  Calendar,
  MessageSquare,
  Banknote,
  Pencil,
} from 'lucide-react';
import { format } from 'date-fns';
import { formatUGX } from '@/lib/rentCalculations';
import { useAgentRejectedRequests } from '@/hooks/useAgentRejectedRequests';
import { AgentEditRentRequestDialog } from './AgentEditRentRequestDialog';
import type { AgentRejectedRequest } from '@/hooks/useAgentRejectedRequests';

type PipelineTab = 'submitted' | 'approved' | 'rejected';

const PAGE_SIZE = 10;

const SUBMITTED_STATUSES = [
  'pending',
  'tenant_ops_approved',
  'agent_verified',
  'agent_ops_approved',
  'landlord_ops_approved',
  'coo_approved',
];

const APPROVED_STATUSES = ['funded', 'disbursed'];

const STAGE_LABEL: Record<string, string> = {
  pending: 'Tenant Ops review',
  tenant_ops_approved: 'Agent Ops review',
  agent_verified: 'Landlord Ops review',
  agent_ops_approved: 'Landlord Ops review',
  landlord_ops_approved: 'COO review',
  coo_approved: 'CFO funding',
  funded: 'Funded — awaiting disbursal',
  disbursed: 'Disbursed — ready to collect',
};

interface PipelineRow {
  id: string;
  rent_amount: number;
  total_repayment: number;
  duration_days: number;
  amount_repaid: number;
  status: string;
  created_at: string;
  disbursed_at: string | null;
  tenant_id: string;
  landlord_id: string;
  tenant_name?: string;
  tenant_phone?: string;
  landlord_name?: string;
  landlord_address?: string;
}

function usePipelineRequests(
  statuses: string[],
  page: number,
  enabled: boolean,
  cacheKey: string,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['agent-pipeline', cacheKey, user?.id, page],
    enabled: enabled && !!user,
    queryFn: async (): Promise<{ rows: PipelineRow[]; total: number }> => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from('rent_requests')
        .select(
          'id, rent_amount, total_repayment, duration_days, amount_repaid, status, created_at, disbursed_at, tenant_id, landlord_id',
          { count: 'exact' },
        )
        .eq('agent_id', user!.id)
        .in('status', statuses)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      const rows = (data ?? []) as PipelineRow[];
      if (rows.length === 0) return { rows: [], total: count ?? 0 };

      const tenantIds = [...new Set(rows.map((r) => r.tenant_id).filter(Boolean))];
      const landlordIds = [...new Set(rows.map((r) => r.landlord_id).filter(Boolean))];
      const [{ data: profiles }, { data: landlords }] = await Promise.all([
        tenantIds.length
          ? supabase.from('profiles').select('id, full_name, phone').in('id', tenantIds)
          : Promise.resolve({ data: [] as any[] }),
        landlordIds.length
          ? supabase.from('landlords').select('id, name, property_address').in('id', landlordIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const lmap = new Map((landlords ?? []).map((l: any) => [l.id, l]));
      return {
        rows: rows.map((r) => ({
          ...r,
          tenant_name: pmap.get(r.tenant_id)?.full_name ?? 'Unknown tenant',
          tenant_phone: pmap.get(r.tenant_id)?.phone ?? '',
          landlord_name: lmap.get(r.landlord_id)?.name ?? '',
          landlord_address: lmap.get(r.landlord_id)?.property_address ?? '',
        })),
        total: count ?? rows.length,
      };
    },
  });
}

function Pager({
  page,
  total,
  onPage,
  loading,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
  loading: boolean;
}) {
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      <Button
        variant="outline"
        size="sm"
        disabled={page === 0 || loading}
        onClick={() => onPage(Math.max(0, page - 1))}
        className="gap-1"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Prev
      </Button>
      <p className="text-xs text-muted-foreground">
        Page {page + 1} of {lastPage + 1} · {total} total
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= lastPage || loading}
        onClick={() => onPage(Math.min(lastPage, page + 1))}
        className="gap-1"
      >
        Next
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function RowCard({
  row,
  tone,
  stageLabel,
  rightSlot,
}: {
  row: PipelineRow;
  tone: 'amber' | 'emerald' | 'destructive';
  stageLabel: string;
  rightSlot?: React.ReactNode;
}) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-500/40 bg-amber-500/5'
      : tone === 'emerald'
        ? 'border-emerald-500/40 bg-emerald-500/5'
        : 'border-destructive/40 bg-destructive/5';
  const badgeVariant: 'secondary' | 'default' | 'destructive' =
    tone === 'destructive' ? 'destructive' : tone === 'emerald' ? 'default' : 'secondary';
  return (
    <Card className={`border-2 overflow-hidden ${toneClass}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <User className="h-4 w-4 text-primary shrink-0" />
              <span className="font-semibold truncate text-sm">{row.tenant_name}</span>
              <Badge variant={badgeVariant} className="text-[10px]">
                {stageLabel}
              </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground space-y-0.5">
              {row.landlord_name && (
                <div className="flex items-center gap-1.5">
                  <Building className="h-3 w-3" />
                  <span className="truncate">
                    {row.landlord_name}
                    {row.landlord_address ? ` · ${row.landlord_address}` : ''}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                <span>Submitted {format(new Date(row.created_at), 'MMM d, yyyy')}</span>
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold tabular-nums">{formatUGX(row.rent_amount)}</p>
            <p className="text-[10px] text-muted-foreground">{row.duration_days} days</p>
          </div>
        </div>
        {rightSlot}
      </CardContent>
    </Card>
  );
}

export function AgentRequestPipelineView() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<PipelineTab>('submitted');
  const [submittedPage, setSubmittedPage] = useState(0);
  const [approvedPage, setApprovedPage] = useState(0);
  const [rejectedPage, setRejectedPage] = useState(0);
  const [editing, setEditing] = useState<AgentRejectedRequest | null>(null);

  const submitted = usePipelineRequests(
    SUBMITTED_STATUSES,
    submittedPage,
    tab === 'submitted',
    'submitted',
  );
  const approved = usePipelineRequests(
    APPROVED_STATUSES,
    approvedPage,
    tab === 'approved',
    'approved',
  );
  const rejectedQuery = useAgentRejectedRequests();
  const rejectedAll = rejectedQuery.data ?? [];
  const rejectedPaged = useMemo(
    () => rejectedAll.slice(rejectedPage * PAGE_SIZE, rejectedPage * PAGE_SIZE + PAGE_SIZE),
    [rejectedAll, rejectedPage],
  );

  const tabs: { key: PipelineTab; label: string; icon: typeof Send; count: number; tone: string }[] = [
    {
      key: 'submitted',
      label: 'Submitted',
      icon: Send,
      count: submitted.data?.total ?? 0,
      tone: 'bg-amber-500 text-white',
    },
    {
      key: 'approved',
      label: 'Ready to pay',
      icon: CheckCircle2,
      count: approved.data?.total ?? 0,
      tone: 'bg-emerald-600 text-white',
    },
    {
      key: 'rejected',
      label: 'Rejected',
      icon: XCircle,
      count: rejectedAll.length,
      tone: 'bg-destructive text-destructive-foreground',
    },
  ];

  return (
    <div className="space-y-3">
      {/* Tab strip */}
      <div className="flex gap-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                active ? t.tone + ' shadow-sm' : 'bg-muted/50 text-muted-foreground'
              }`}
              style={{ touchAction: 'manipulation', minHeight: '44px' }}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              <span
                className={`min-w-[20px] h-[20px] rounded-full flex items-center justify-center text-[11px] font-bold ${
                  active ? 'bg-background/25' : 'bg-background/60'
                }`}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Submitted */}
      {tab === 'submitted' && (
        <div className="space-y-2">
          {submitted.isLoading ? (
            <Skeleton className="h-28 w-full rounded-xl" />
          ) : !submitted.data || submitted.data.rows.length === 0 ? (
            <EmptyState
              icon={Send}
              title="Nothing submitted yet"
              subtitle="Rent requests waiting on review will appear here."
            />
          ) : (
            <>
              {submitted.data.rows.map((r) => (
                <RowCard
                  key={r.id}
                  row={r}
                  tone="amber"
                  stageLabel={STAGE_LABEL[r.status] ?? 'In review'}
                />
              ))}
              <Pager
                page={submittedPage}
                total={submitted.data.total}
                onPage={setSubmittedPage}
                loading={submitted.isFetching}
              />
            </>
          )}
        </div>
      )}

      {/* Approved (ready to pay) */}
      {tab === 'approved' && (
        <div className="space-y-2">
          {approved.isLoading ? (
            <Skeleton className="h-28 w-full rounded-xl" />
          ) : !approved.data || approved.data.rows.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing ready to pay"
              subtitle="Approved requests awaiting tenant repayment will appear here."
            />
          ) : (
            <>
              {approved.data.rows.map((r) => (
                <RowCard
                  key={r.id}
                  row={r}
                  tone="emerald"
                  stageLabel={STAGE_LABEL[r.status] ?? 'Approved'}
                  rightSlot={
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-emerald-500/20">
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                        <Banknote className="h-3 w-3" />
                        Total to repay:{' '}
                        <span className="font-semibold text-foreground tabular-nums">
                          {formatUGX(r.total_repayment)}
                        </span>
                      </span>
                      <span className="text-[11px] text-emerald-700 font-semibold">
                        Collect from tenant
                      </span>
                    </div>
                  }
                />
              ))}
              <Pager
                page={approvedPage}
                total={approved.data.total}
                onPage={setApprovedPage}
                loading={approved.isFetching}
              />
            </>
          )}
        </div>
      )}

      {/* Rejected */}
      {tab === 'rejected' && (
        <div className="space-y-2">
          {rejectedQuery.isLoading ? (
            <Skeleton className="h-28 w-full rounded-xl" />
          ) : rejectedAll.length === 0 ? (
            <EmptyState
              icon={XCircle}
              title="No rejections"
              subtitle="When a request is rejected, the reviewer's reason will show here."
            />
          ) : (
            <>
              {rejectedPaged.map((r) => (
                <Card
                  key={r.id}
                  className="border-2 border-destructive/40 bg-destructive/5 overflow-hidden"
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <User className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-semibold truncate text-sm">{r.tenant_name}</span>
                          <Badge variant="destructive" className="text-[10px]">
                            Rejected at {r.stage_label}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <Building className="h-3 w-3" />
                            <span className="truncate">{r.landlord_name}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {r.rejected_at
                                ? `Rejected ${format(new Date(r.rejected_at), 'MMM d, yyyy')}`
                                : `Submitted ${format(new Date(r.created_at), 'MMM d, yyyy')}`}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums">{formatUGX(r.rent_amount)}</p>
                        <p className="text-[10px] text-muted-foreground">{r.duration_days} days</p>
                      </div>
                    </div>
                    {/* Prominent reason block */}
                    <div className="rounded-lg border-2 border-destructive/40 bg-background p-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <MessageSquare className="h-3.5 w-3.5 text-destructive" />
                        <p className="text-[10px] font-bold uppercase tracking-wide text-destructive">
                          Reason — {r.reviewer_name}
                        </p>
                      </div>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap font-medium">
                        {r.rejected_reason || 'No reason provided.'}
                      </p>
                    </div>
                      <div className="flex justify-end pt-1">
                        <Button
                          size="sm"
                          onClick={() => setEditing(r)}
                          className="gap-1.5 h-8"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit & Resubmit
                        </Button>
                      </div>
                  </CardContent>
                </Card>
              ))}
              <Pager
                page={rejectedPage}
                total={rejectedAll.length}
                onPage={setRejectedPage}
                loading={rejectedQuery.isFetching}
              />
            </>
          )}
        </div>
      )}

      <AgentEditRentRequestDialog
        request={editing}
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        onResubmitted={() => {
          setEditing(null);
          rejectedQuery.refetch();
        }}
      />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Send;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="text-center py-12 px-4">
      <Icon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}