import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/agentAdvanceCalculations';
import { cn } from '@/lib/utils';
import {
  Search, Pencil, History, Loader2, Save, X, UserPlus, Users, ChevronRight,
  List, CalendarDays, Filter, CalendarIcon, ArrowUpDown, Clock, User,
} from 'lucide-react';

interface TenantRentRow {
  rent_request_id: string;
  tenant_id: string;
  tenant_name: string | null;
  tenant_phone: string | null;
  agent_id: string | null;
  agent_name: string | null;
  landlord_name: string | null;
  status: string | null;
  rent_amount: number | null;
  total_repayment: number | null;
  amount_repaid: number | null;
  daily_repayment: number | null;
  outstanding: number | null;
  created_at: string;
}

interface BalanceEditRow {
  id: string;
  editor_name: string | null;
  old_rent_amount: number | null;
  new_rent_amount: number | null;
  old_outstanding: number | null;
  new_outstanding: number | null;
  old_daily_repayment: number | null;
  new_daily_repayment: number | null;
  reason: string;
  created_at: string;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function TenantBalanceEditPanel({
  onOpenAgent,
}: {
  onOpenAgent?: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const term = search.trim();
  const [editing, setEditing] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    enabled: term.length >= 2,
    queryKey: ['ops-tenant-rents', term],
    staleTime: 15_000,
    queryFn: async (): Promise<TenantRentRow[]> => {
      const { data, error } = await supabase.rpc('ops_search_tenant_rents' as any, { p_search: term });
      if (error) throw error;
      return (data ?? []) as TenantRentRow[];
    },
  });

  const rows = data ?? [];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search any tenant by name, phone or national ID…"
          className="pl-7 h-9 text-sm"
        />
        {isFetching && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      <ScrollArea className="max-h-[55vh] pr-1">
        {term.length < 2 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Type at least 2 characters to find a tenant.</p>
        ) : isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No tenants match your search.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.rent_request_id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-sm truncate flex-1">{r.tenant_name || 'Tenant'}</span>
                  {r.status && <Badge variant="outline" className="text-[10px] shrink-0">{r.status}</Badge>}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                  {r.tenant_phone && <span>{r.tenant_phone}</span>}
                  {r.landlord_name && <span>Landlord: {r.landlord_name}</span>}
                  {r.agent_id && (
                    <button
                      onClick={() => onOpenAgent?.(r.agent_id!)}
                      className="flex items-center gap-0.5 text-blue-600 hover:underline"
                    >
                      <UserPlus className="h-3 w-3" /> {r.agent_name || 'Agent'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                  <div className="rounded-md bg-muted/50 py-1">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Rent</p>
                    <p className="text-xs font-bold">{formatUGX(r.rent_amount || 0)}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 py-1">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Balance</p>
                    <p className="text-xs font-bold text-amber-600">{formatUGX(r.outstanding || 0)}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 py-1">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Daily</p>
                    <p className="text-xs font-bold">{formatUGX(r.daily_repayment || 0)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <Button
                    size="sm" variant="outline"
                    className="h-7 text-[11px] gap-1 flex-1"
                    onClick={() => { setEditing(editing === r.rent_request_id ? null : r.rent_request_id); setHistoryFor(null); }}
                  >
                    <Pencil className="h-3 w-3" /> {editing === r.rent_request_id ? 'Close' : 'Edit balance / rent'}
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 text-[11px] gap-1"
                    onClick={() => { setHistoryFor(historyFor === r.rent_request_id ? null : r.rent_request_id); setEditing(null); }}
                  >
                    <History className="h-3 w-3" /> History
                  </Button>
                </div>

                {editing === r.rent_request_id && (
                  <BalanceEditForm row={r} onDone={() => setEditing(null)} />
                )}
                {historyFor === r.rent_request_id && (
                  <BalanceHistory rentRequestId={r.rent_request_id} />
                )}
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function BalanceEditForm({ row, onDone }: { row: TenantRentRow; onDone: () => void }) {
  const qc = useQueryClient();
  const [rent, setRent] = useState(String(row.rent_amount ?? ''));
  const [outstanding, setOutstanding] = useState(String(row.outstanding ?? ''));
  const [reason, setReason] = useState('');

  const rentChanged = rent !== '' && Number(rent) !== Number(row.rent_amount ?? 0);
  const balChanged = outstanding !== '' && Number(outstanding) !== Number(row.outstanding ?? 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('ops_edit_tenant_balance' as any, {
        p_rent_request_id: row.rent_request_id,
        p_new_rent_amount: rentChanged ? Number(rent) : null,
        p_new_outstanding: balChanged ? Number(outstanding) : null,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Tenant balance updated — agent daily target recalculated');
      qc.invalidateQueries({ queryKey: ['ops-tenant-rents'] });
      qc.invalidateQueries({ queryKey: ['ops-balance-history', row.rent_request_id] });
      qc.invalidateQueries({ queryKey: ['welile-mission-placements'] });
      qc.invalidateQueries({ queryKey: ['agent-capacity-map'] });
      qc.invalidateQueries({ queryKey: ['agent-daily-eligibility'] });
      onDone();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update balance'),
  });

  const canSave = (rentChanged || balChanged) && reason.trim().length >= 10 && !mutation.isPending;

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Rent amount (UGX)</label>
          <Input type="number" inputMode="numeric" value={rent} onChange={(e) => setRent(e.target.value)} className="h-9 text-sm mt-0.5" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Outstanding balance (UGX)</label>
          <Input type="number" inputMode="numeric" value={outstanding} onChange={(e) => setOutstanding(e.target.value)} className="h-9 text-sm mt-0.5" />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Changing the rent amount recalculates the daily repayment, which updates the agent's daily collection target. Setting the balance to 0 removes this tenant from the agent's target.
      </p>
      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Reason (required, min 10 chars)</label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this correction being made?"
          className="text-sm mt-0.5 min-h-[60px]"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-8 text-xs gap-1 flex-1" disabled={!canSave} onClick={() => mutation.mutate()}>
          {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save correction
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={onDone} disabled={mutation.isPending}>
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>
      </div>
    </div>
  );
}

function BalanceHistory({ rentRequestId }: { rentRequestId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['ops-balance-history', rentRequestId],
    staleTime: 15_000,
    queryFn: async (): Promise<BalanceEditRow[]> => {
      const { data, error } = await supabase.rpc('ops_tenant_balance_history' as any, { p_rent_request_id: rentRequestId });
      if (error) throw error;
      return (data ?? []) as BalanceEditRow[];
    },
  });

  if (isLoading) return <div className="mt-3"><Skeleton className="h-16 w-full" /></div>;
  const rows = data ?? [];
  if (rows.length === 0) return <p className="mt-3 text-[11px] text-muted-foreground text-center py-2">No edits yet.</p>;

  return (
    <ul className="mt-3 space-y-1.5">
      {rows.map((h) => (
        <li key={h.id} className="rounded-md border border-border bg-muted/20 p-2 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold">{h.editor_name || 'Staff'}</span>
            <span className="text-muted-foreground">{fmtDateTime(h.created_at)}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-muted-foreground">
            {Number(h.old_rent_amount) !== Number(h.new_rent_amount) && (
              <span>Rent: {formatUGX(h.old_rent_amount || 0)} → <span className="text-foreground font-medium">{formatUGX(h.new_rent_amount || 0)}</span></span>
            )}
            {Number(h.old_outstanding) !== Number(h.new_outstanding) && (
              <span>Balance: {formatUGX(h.old_outstanding || 0)} → <span className="text-foreground font-medium">{formatUGX(h.new_outstanding || 0)}</span></span>
            )}
            {Number(h.old_daily_repayment) !== Number(h.new_daily_repayment) && (
              <span>Daily: {formatUGX(h.old_daily_repayment || 0)} → <span className="text-foreground font-medium">{formatUGX(h.new_daily_repayment || 0)}</span></span>
            )}
          </div>
          <p className="mt-1 italic text-muted-foreground">"{h.reason}"</p>
        </li>
      ))}
    </ul>
  );
}