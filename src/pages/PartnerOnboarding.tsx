import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { roleToSlug } from '@/lib/roleRoutes';
import { format } from 'date-fns';
import {
  Loader2, Phone, Search, Users, Calendar, ShieldCheck, ShieldAlert, CheckCircle2, XCircle, Clock,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import COODetailLayout, { KPICard } from '@/components/coo/COODetailLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { buildPartnerReference } from '@/lib/partnerReference';
import { useToast } from '@/hooks/use-toast';

interface FunderProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  frozen_at: string | null;
  verified: boolean | null;
  funder_verified_at: string | null;
  funder_rejected_at: string | null;
  funder_rejection_reason: string | null;
}

const PAGE_SIZE = 50;

export default function FunderOnboarding() {
  const { user, roles, loading, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<FunderProfileRow | null>(null);
  const [actionMode, setActionMode] = useState<null | 'approve' | 'reject'>(null);
  const [actionReason, setActionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset to first page whenever search term changes
  useEffect(() => { setPage(0); }, [search]);

  // Gate: managers only
  useEffect(() => {
    if (loading) return;
    if (!user || !roles.includes('manager')) {
      navigate(roleToSlug(role));
    }
  }, [user, loading, roles, role, navigate]);

  const trimmedSearch = search.trim();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['funder-onboarding-self-registered', page, trimmedSearch],
    enabled: !!user && roles.includes('manager'),
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('id, full_name, phone, email, created_at, frozen_at, verified, funder_verified_at, funder_rejected_at, funder_rejection_reason', { count: 'exact' })
        .eq('signup_source', 'funder-onboarding');

      if (trimmedSearch) {
        const q = trimmedSearch.replace(/[%,]/g, '');
        query = query.or(
          `full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`
        );
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: rows, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return { rows: (rows || []) as FunderProfileRow[], total: count || 0 };
    },
    staleTime: 30_000,
  });

  // Lightweight KPI counts (independent of pagination/search)
  const { data: kpis } = useQuery({
    queryKey: ['funder-onboarding-kpis'],
    enabled: !!user && roles.includes('manager'),
    queryFn: async () => {
      const [{ count: total }, { count: pending }, { count: verified }, { count: rejected }] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('signup_source', 'funder-onboarding'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('signup_source', 'funder-onboarding').is('funder_verified_at', null).is('funder_rejected_at', null),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('signup_source', 'funder-onboarding').not('funder_verified_at', 'is', null),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('signup_source', 'funder-onboarding').not('funder_rejected_at', 'is', null),
      ]);
      return { total: total || 0, pending: pending || 0, verified: verified || 0, rejected: rejected || 0 };
    },
    staleTime: 60_000,
  });

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const headerStatus: 'green' | 'yellow' | 'red' = (kpis?.pending || 0) > 10 ? 'red' : (kpis?.pending || 0) > 0 ? 'yellow' : 'green';

  const openAction = (mode: 'approve' | 'reject') => {
    setActionMode(mode);
    setActionReason('');
  };

  const submitAction = async () => {
    if (!selected || !actionMode) return;
    if (actionReason.trim().length < 10) {
      toast({ title: 'Reason required', description: 'Please provide at least 10 characters.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const rpcName = actionMode === 'approve' ? 'approve_self_registered_funder' : 'reject_self_registered_funder';
    const { error } = await supabase.rpc(rpcName, {
      _target_user: selected.id,
      _reason: actionReason.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast({ title: 'Action failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: actionMode === 'approve' ? 'Funder verified' : 'Funder rejected',
      description: selected.full_name || selected.email || 'Updated',
    });
    setActionMode(null);
    setActionReason('');
    setSelected(null);
    queryClient.invalidateQueries({ queryKey: ['funder-onboarding-self-registered'] });
    queryClient.invalidateQueries({ queryKey: ['funder-onboarding-kpis'] });
  };

  return (
    <COODetailLayout
      title="Partner Onboarding"
      subtitle="Self-Registered Funders"
      status={headerStatus}
    >
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Total Funders" value={kpis?.total ?? '—'} status="green" sub="Via funder-onboarding" />
        <KPICard label="Pending Review" value={kpis?.pending ?? '—'} status={(kpis?.pending || 0) > 0 ? 'yellow' : 'green'} />
        <KPICard label="Verified" value={kpis?.verified ?? '—'} status="green" />
        <KPICard label="Rejected" value={kpis?.rejected ?? '—'} status={(kpis?.rejected || 0) > 0 ? 'red' : 'green'} />
      </div>

      {/* Search */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground sm:ml-auto">
          {total === 0 ? 'No records' : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`}
        </p>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center">
              <Users className="h-8 w-8 mx-auto text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground mt-2">No self-registered funders found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Partner</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">Reference</TableHead>
                    <TableHead className="text-xs hidden sm:table-cell">Phone</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Email</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Joined</TableHead>
                    <TableHead className="text-xs text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const isFrozen = !!r.frozen_at;
                    const partnerRef = buildPartnerReference(r.id, r.created_at);
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer"
                        onClick={() => setSelected(r)}
                      >
                        <TableCell className="py-2.5">
                          <p className="text-sm font-semibold truncate max-w-[160px]">
                            {r.full_name || '—'}
                          </p>
                          <p className="text-[10px] text-muted-foreground sm:hidden">
                            {r.phone || '—'}
                          </p>
                          <p className="text-[10px] font-mono text-muted-foreground lg:hidden">
                            {partnerRef}
                          </p>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {partnerRef}
                          </span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs">
                          {r.phone || '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs truncate max-w-[180px]">
                          {r.email || '—'}
                        </TableCell>
                        <TableCell>
                          {isFrozen ? (
                            <Badge variant="outline" className="text-[10px] gap-1 bg-destructive/15 text-destructive border-destructive/30">
                              <ShieldAlert className="h-2.5 w-2.5" /> Suspended
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] gap-1 bg-success/15 text-success border-success/30">
                              <ShieldCheck className="h-2.5 w-2.5" /> Active
                            </Badge>
                          )}
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

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            disabled={page === 0 || isFetching}
            onClick={() => setPage(p => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <p className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            disabled={page >= totalPages - 1 || isFetching}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Partner Details</DialogTitle>
                <DialogDescription className="text-xs">
                  Self-registered via the funder onboarding flow.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                  <p className="text-base font-bold">{selected.full_name || 'Unknown'}</p>
                  <p className="text-[11px] font-mono text-muted-foreground">
                    Ref: {buildPartnerReference(selected.id, selected.created_at)}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {selected.phone || '—'}
                    </span>
                    {selected.email && <span className="truncate">{selected.email}</span>}
                  </div>
                  <div className="pt-1">
                    {selected.frozen_at ? (
                      <Badge variant="outline" className="text-[10px] gap-1 bg-destructive/15 text-destructive border-destructive/30">
                        <ShieldAlert className="h-2.5 w-2.5" /> Suspended
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-1 bg-success/15 text-success border-success/30">
                        <ShieldCheck className="h-2.5 w-2.5" /> Active
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 text-xs">
                  <Row label="Joined">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(selected.created_at), 'dd MMM yyyy, HH:mm')}
                    </span>
                  </Row>
                  <Row label="Verified">{selected.verified ? 'Yes' : 'No'}</Row>
                </div>
              </div>

              <DialogFooter>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/admin/partners/${selected.id}`)}
                >
                  Open profile
                </Button>
                <Button size="sm" onClick={() => setSelected(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
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
