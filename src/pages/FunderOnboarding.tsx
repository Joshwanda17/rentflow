import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { roleToSlug } from '@/lib/roleRoutes';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  Loader2, UserCheck, UserX, Phone, Clock, Shield, AlertTriangle, Search,
  CheckCircle2, XCircle, Users, Calendar,
} from 'lucide-react';
import COODetailLayout, { KPICard } from '@/components/coo/COODetailLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type Status = 'pending' | 'approved' | 'rejected';

interface PartnerOnboardingRow {
  id: string;
  agent_id: string;
  beneficiary_id: string;
  beneficiary_role: string;
  reason: string | null;
  rejection_reason: string | null;
  approval_status: Status;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  agent: { full_name: string | null; phone: string | null } | null;
  beneficiary: { full_name: string | null; phone: string | null; email: string | null } | null;
  reviewer: { full_name: string | null } | null;
}

type FilterStatus = 'all' | Status;

const STATUS_META: Record<Status, { label: string; cls: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', cls: 'bg-warning/15 text-warning border-warning/30', icon: Clock },
  approved: { label: 'Approved', cls: 'bg-success/15 text-success border-success/30', icon: CheckCircle2 },
  rejected: { label: 'Rejected', cls: 'bg-destructive/15 text-destructive border-destructive/30', icon: XCircle },
};

export default function FunderOnboarding() {
  const { user, roles, loading, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PartnerOnboardingRow | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Gate: managers (COO/Partner Ops are also routed through manager role guard elsewhere)
  useEffect(() => {
    if (loading) return;
    if (!user || !roles.includes('manager')) {
      navigate(roleToSlug(role));
    }
  }, [user, loading, roles, role, navigate]);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['funder-onboarding-list'],
    enabled: !!user && roles.includes('manager'),
    queryFn: async (): Promise<PartnerOnboardingRow[]> => {
      const { data, error } = await supabase
        .from('proxy_agent_assignments')
        .select('id, agent_id, beneficiary_id, beneficiary_role, reason, rejection_reason, approval_status, approved_at, approved_by, created_at')
        .eq('beneficiary_role', 'supporter')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const base = data || [];
      if (base.length === 0) return [];

      const ids = Array.from(new Set(
        base.flatMap(r => [r.agent_id, r.beneficiary_id, r.approved_by]).filter(Boolean) as string[]
      ));
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone, email')
        .in('id', ids);
      const pmap = new Map((profiles || []).map(p => [p.id, p]));

      return base.map(r => ({
        ...r,
        approval_status: (r.approval_status as Status) || 'pending',
        agent: r.agent_id ? (pmap.get(r.agent_id) ? { full_name: pmap.get(r.agent_id)!.full_name, phone: pmap.get(r.agent_id)!.phone } : null) : null,
        beneficiary: r.beneficiary_id
          ? (pmap.get(r.beneficiary_id)
              ? {
                  full_name: pmap.get(r.beneficiary_id)!.full_name,
                  phone: pmap.get(r.beneficiary_id)!.phone,
                  email: (pmap.get(r.beneficiary_id) as any)?.email ?? null,
                }
              : null)
          : null,
        reviewer: r.approved_by && pmap.get(r.approved_by)
          ? { full_name: pmap.get(r.approved_by)!.full_name }
          : null,
      }));
    },
    staleTime: 30_000,
  });

  const counts = useMemo(() => {
    const c = { all: 0, pending: 0, approved: 0, rejected: 0 };
    (rows || []).forEach(r => {
      c.all += 1;
      c[r.approval_status] = (c[r.approval_status] || 0) + 1;
    });
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows || [];
    if (filter !== 'all') out = out.filter(r => r.approval_status === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(r => {
        const pieces = [
          r.beneficiary?.full_name,
          r.beneficiary?.phone,
          r.beneficiary?.email,
          r.agent?.full_name,
          r.agent?.phone,
          r.reason,
        ].filter(Boolean).join(' ').toLowerCase();
        return pieces.includes(q);
      });
    }
    return out;
  }, [rows, filter, search]);

  const approveMutation = useMutation({
    mutationFn: async (row: PartnerOnboardingRow) => {
      // Always re-fetch fresh — never trust cache for high-stakes transitions
      const { data: fresh, error: fetchError } = await supabase
        .from('proxy_agent_assignments')
        .select('approval_status')
        .eq('id', row.id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!fresh) throw new Error('Record not found');
      if (fresh.approval_status === 'approved') throw new Error('Partner is already approved.');
      if (fresh.approval_status === 'rejected') throw new Error('Partner was previously rejected.');

      const { error } = await supabase
        .from('proxy_agent_assignments')
        .update({
          approval_status: 'approved',
          is_active: true,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('approval_status', 'pending');
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'approve_partner_onboarding',
        table_name: 'proxy_agent_assignments',
        record_id: row.id,
        reason: 'Partner approved from onboarding queue',
        metadata: {
          partner_name: row.beneficiary?.full_name,
          partner_phone: row.beneficiary?.phone,
          agent_name: row.agent?.full_name,
        },
      });
    },
    onSuccess: () => {
      toast({ title: 'Partner approved', description: 'They are now an active funder.' });
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: ['funder-onboarding-list'] });
      queryClient.invalidateQueries({ queryKey: ['pending-funder-approvals'] });
    },
    onError: (e: any) => {
      toast({ title: 'Approval failed', description: e.message, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ row, reason }: { row: PartnerOnboardingRow; reason: string }) => {
      const { error } = await supabase
        .from('proxy_agent_assignments')
        .update({
          approval_status: 'rejected',
          is_active: false,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', row.id);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'reject_partner_onboarding',
        table_name: 'proxy_agent_assignments',
        record_id: row.id,
        reason,
        metadata: {
          partner_name: row.beneficiary?.full_name,
          partner_phone: row.beneficiary?.phone,
          agent_name: row.agent?.full_name,
        },
      });
    },
    onSuccess: () => {
      toast({ title: 'Partner rejected', description: 'The registration was declined.' });
      setRejectOpen(false);
      setRejectReason('');
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: ['funder-onboarding-list'] });
      queryClient.invalidateQueries({ queryKey: ['pending-funder-approvals'] });
    },
    onError: (e: any) => {
      toast({ title: 'Rejection failed', description: e.message, variant: 'destructive' });
    },
  });

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const headerStatus: 'green' | 'yellow' | 'red' = counts.pending > 5 ? 'red' : counts.pending > 0 ? 'yellow' : 'green';

  return (
    <COODetailLayout
      title="Partner Onboarding"
      subtitle="Funder Approval Queue"
      status={headerStatus}
    >
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Approved" value={counts.approved} status="green" />
        <KPICard label="Rejected" value={counts.rejected} status={counts.rejected > 0 ? 'red' : 'green'} />
        <KPICard label="Pending" value={counts.pending} status={counts.pending > 0 ? 'yellow' : 'green'} />
        <KPICard label="All" value={counts.all} status="green" sub="Total registrations" />
      </div>

      {/* Filter + search */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
          {(['all', 'pending', 'approved', 'rejected'] as FilterStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors',
                filter === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
              )}
            >
              {s === 'all' ? 'All' : STATUS_META[s].label}
              <span className="ml-1.5 opacity-80">({counts[s]})</span>
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, agent…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <Users className="h-8 w-8 mx-auto text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground mt-2">No partner registrations found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Partner</TableHead>
                    <TableHead className="text-xs hidden sm:table-cell">Phone</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Registered By</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Date</TableHead>
                    <TableHead className="text-xs text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const Meta = STATUS_META[r.approval_status];
                    const Icon = Meta.icon;
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer"
                        onClick={() => setSelected(r)}
                      >
                        <TableCell className="py-2.5">
                          <p className="text-sm font-semibold truncate max-w-[160px]">
                            {r.beneficiary?.full_name || '—'}
                          </p>
                          <p className="text-[10px] text-muted-foreground sm:hidden">
                            {r.beneficiary?.phone || '—'}
                          </p>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs">
                          {r.beneficiary?.phone || '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs">
                          {r.agent?.full_name || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px] gap-1', Meta.cls)}>
                            <Icon className="h-2.5 w-2.5" /> {Meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {format(new Date(r.created_at), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={(e) => { e.stopPropagation(); setSelected(r); }}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selected && !rejectOpen} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-lg">
          {selected && (() => {
            const Meta = STATUS_META[selected.approval_status];
            const Icon = Meta.icon;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    Partner Details
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Review the registration before approving or rejecting.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  {/* Partner identity */}
                  <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                    <p className="text-base font-bold">{selected.beneficiary?.full_name || 'Unknown'}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {selected.beneficiary?.phone || '—'}
                      </span>
                      {selected.beneficiary?.email && (
                        <span className="truncate">{selected.beneficiary.email}</span>
                      )}
                    </div>
                    <div className="pt-1">
                      <Badge variant="outline" className={cn('text-[10px] gap-1', Meta.cls)}>
                        <Icon className="h-2.5 w-2.5" /> {Meta.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Agent + meta */}
                  <div className="grid grid-cols-1 gap-2 text-xs">
                    <Row label="Registered by">
                      {selected.agent?.full_name || 'Unknown agent'}
                      {selected.agent?.phone && (
                        <span className="ml-1 text-muted-foreground">({selected.agent.phone})</span>
                      )}
                    </Row>
                    <Row label="Reason">{selected.reason || '—'}</Row>
                    <Row label="Submitted">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(selected.created_at), 'dd MMM yyyy, HH:mm')}
                      </span>
                    </Row>
                    {selected.approval_status !== 'pending' && (
                      <>
                        <Row label="Reviewed by">
                          {selected.reviewer?.full_name || '—'}
                          {selected.approved_at && (
                            <span className="ml-1 text-muted-foreground">
                              ({format(new Date(selected.approved_at), 'dd MMM yyyy, HH:mm')})
                            </span>
                          )}
                        </Row>
                        {selected.approval_status === 'rejected' && (
                          <Row label="Rejection reason">
                            <span className="text-destructive">{selected.rejection_reason || '—'}</span>
                          </Row>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <DialogFooter className="gap-2">
                  {selected.approval_status === 'pending' ? (
                    <>
                      <Button
                        variant="outline"
                        className="flex-1 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => { setRejectReason(''); setRejectOpen(true); }}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                      >
                        <UserX className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                      <Button
                        className="flex-1 gap-1.5 bg-success hover:bg-success/90 text-white"
                        onClick={() => approveMutation.mutate(selected)}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                      >
                        {approveMutation.isPending
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <UserCheck className="h-3.5 w-3.5" />}
                        Approve
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" className="ml-auto" onClick={() => setSelected(null)}>
                      Close
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Reject reason modal */}
      <Dialog open={rejectOpen} onOpenChange={(o) => { if (!o) { setRejectOpen(false); setRejectReason(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Reject Partner Registration
            </DialogTitle>
            <DialogDescription className="text-xs">
              Provide a reason (min 10 characters). This will be recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="Reason for rejection"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              maxLength={200}
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground">{rejectReason.length}/200</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { setRejectOpen(false); setRejectReason(''); }}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={rejectReason.trim().length < 10 || rejectMutation.isPending}
              onClick={() => selected && rejectMutation.mutate({ row: selected, reason: rejectReason.trim() })}
            >
              {rejectMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </COODetailLayout>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right font-medium break-words">{children}</span>
    </div>
  );
}