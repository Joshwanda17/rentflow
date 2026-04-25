import { useEffect, useState, useMemo, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, CheckCircle2, XCircle, Clock, Search, Banknote, AlertCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { getCachedTenants, type CachedTenant } from '@/lib/fieldCollectStore';
import { cn } from '@/lib/utils';

interface PendingFieldCollectionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PendingRow {
  id: string;
  tenant_id: string | null;
  tenant_name: string;
  tenant_phone: string | null;
  amount: number;
  notes: string | null;
  captured_at: string;
  synced_at: string;
  status: string;
  rejected_reason: string | null;
  confirmed_collection_id: string | null;
}

/**
 * Review screen for pending field_collections (offline captures already synced to server).
 * Tap **Confirm** to promote into agent_collections (validated, audited).
 * Tap **Reject** with reason to void.
 */
export function PendingFieldCollectionsSheet({ open, onOpenChange }: PendingFieldCollectionsSheetProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [tab, setTab] = useState<'pending' | 'confirmed' | 'rejected'>('pending');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [matchOpen, setMatchOpen] = useState<string | null>(null); // row id whose tenant picker is open
  const [tenants, setTenants] = useState<CachedTenant[]>([]);
  const [matchPick, setMatchPick] = useState<Record<string, string>>({}); // rowId -> tenantId

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase.from('field_collections') as any)
        .select('id, tenant_id, tenant_name, tenant_phone, amount, notes, captured_at, synced_at, status, rejected_reason, confirmed_collection_id')
        .eq('agent_id', user.id)
        .order('captured_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data as PendingRow[]) || []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load pending collections');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (open && user?.id) {
      refresh();
      getCachedTenants(user.id).then(setTenants).catch(() => { /* ignore */ });
    }
  }, [open, user?.id, refresh]);

  const filtered = useMemo(() => {
    const byStatus = rows.filter(r => r.status === tab);
    const q = search.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter(r =>
      (r.tenant_name || '').toLowerCase().includes(q) ||
      (r.tenant_phone || '').includes(q.replace(/\s+/g, ''))
    );
  }, [rows, tab, search]);

  const counts = useMemo(() => ({
    pending: rows.filter(r => r.status === 'pending').length,
    confirmed: rows.filter(r => r.status === 'confirmed').length,
    rejected: rows.filter(r => r.status === 'rejected').length,
  }), [rows]);

  const pendingTotal = useMemo(
    () => rows.filter(r => r.status === 'pending').reduce((s, r) => s + Number(r.amount || 0), 0),
    [rows]
  );

  const handleConfirm = async (row: PendingRow) => {
    const overrideTenant = matchPick[row.id];
    if (!row.tenant_id && !overrideTenant) {
      toast.error('Match this entry to a tenant first');
      setMatchOpen(row.id);
      return;
    }
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.rpc('confirm_field_collection' as any, {
        p_field_collection_id: row.id,
        p_tenant_id: overrideTenant || row.tenant_id,
        p_notes: row.notes,
      });
      if (error) throw error;
      const res = data as any;
      if (!res?.success) throw new Error(res?.error || 'Confirmation failed');
      toast.success(`Confirmed · ${formatUGX(row.amount)}`);
      setMatchOpen(null);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to confirm');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (row: PendingRow) => {
    const reason = window.prompt('Reason for rejecting this entry?');
    if (!reason || !reason.trim()) return;
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.rpc('reject_field_collection' as any, {
        p_field_collection_id: row.id,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      const res = data as any;
      if (!res?.success) throw new Error(res?.error || 'Rejection failed');
      toast.success('Entry rejected');
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to reject');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Pending Field Collections
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Confirm to record as official cash collections.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading} className="gap-1">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Refresh
            </Button>
          </div>
        </SheetHeader>

        <div className="px-5 py-3 border-b space-y-3">
          {/* Pending total */}
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wide">Awaiting confirmation</p>
              <p className="text-2xl font-bold tracking-tight">{formatUGX(pendingTotal)}</p>
            </div>
            <Banknote className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {(['pending', 'confirmed', 'rejected'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                  tab === t ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t} ({counts[t]})
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or phone…"
              className="pl-9"
            />
          </div>
        </div>

        {/* List */}
        <ScrollArea className="flex-1">
          <div className="px-5 py-3 space-y-2">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {tab === 'pending'
                  ? 'No pending entries. Capture cash with the Field Collect button.'
                  : `No ${tab} entries.`}
              </div>
            ) : filtered.map(row => {
              const captured = new Date(row.captured_at);
              const synced = new Date(row.synced_at);
              const needsMatch = !row.tenant_id;
              const showMatch = matchOpen === row.id;
              const pickedTenant = matchPick[row.id];
              return (
                <div key={row.id} className="rounded-xl border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-sm truncate">{row.tenant_name}</p>
                        {needsMatch && row.status === 'pending' && (
                          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400 gap-0.5">
                            <AlertCircle className="h-2.5 w-2.5" /> Needs match
                          </Badge>
                        )}
                        {row.status === 'confirmed' && (
                          <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0 gap-0.5">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Confirmed
                          </Badge>
                        )}
                        {row.status === 'rejected' && (
                          <Badge variant="outline" className="text-[10px] border-red-500/40 text-red-600 dark:text-red-400 gap-0.5">
                            <XCircle className="h-2.5 w-2.5" /> Rejected
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {row.tenant_phone || 'No phone'} · captured {captured.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                      {Math.abs(synced.getTime() - captured.getTime()) > 60_000 && (
                        <p className="text-[10px] text-muted-foreground">
                          synced {synced.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      )}
                      {row.notes && (
                        <p className="text-[11px] mt-1 italic text-muted-foreground line-clamp-2">{row.notes}</p>
                      )}
                      {row.status === 'rejected' && row.rejected_reason && (
                        <p className="text-[11px] mt-1 text-red-600 dark:text-red-400">Reason: {row.rejected_reason}</p>
                      )}
                    </div>
                    <p className="text-base font-bold text-right shrink-0">{formatUGX(row.amount)}</p>
                  </div>

                  {/* Match picker (walk-up entries) */}
                  {showMatch && row.status === 'pending' && (
                    <div className="rounded-lg bg-muted/40 p-2 space-y-1.5">
                      <p className="text-[11px] font-semibold">Match to a tenant</p>
                      {tenants.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground">Open the Field Collect dialog online to load your tenant list.</p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {tenants
                            .filter(t => t.fullName.toLowerCase().includes((row.tenant_name || '').toLowerCase()) || t.fullName.toLowerCase().includes(search.toLowerCase()))
                            .slice(0, 8)
                            .map(t => (
                              <button
                                key={t.tenantId}
                                onClick={() => setMatchPick(prev => ({ ...prev, [row.id]: t.tenantId }))}
                                className={cn(
                                  'w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent flex items-center justify-between',
                                  pickedTenant === t.tenantId && 'bg-primary/15 border border-primary/30'
                                )}
                              >
                                <span className="truncate">{t.fullName}</span>
                                <span className="text-[10px] text-muted-foreground shrink-0">{t.phone || ''}</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  {row.status === 'pending' && (
                    <div className="flex items-center gap-2 pt-1">
                      {needsMatch && !showMatch && (
                        <Button size="sm" variant="outline" onClick={() => setMatchOpen(row.id)} className="flex-1">
                          Match tenant
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => handleConfirm(row)}
                        disabled={busyId === row.id || (needsMatch && !pickedTenant)}
                        className="flex-1 gap-1"
                      >
                        {busyId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(row)}
                        disabled={busyId === row.id}
                        className="gap-1 text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/10"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <Separator />
        <div className="px-5 py-3 text-[10px] text-muted-foreground text-center">
          Confirmed entries become validated cash <span className="font-semibold">agent_collections</span> with the original capture timestamp + audit link.
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default PendingFieldCollectionsSheet;