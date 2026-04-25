import { useEffect, useMemo, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  Loader2, WifiOff, Wifi, Search, Trash2,
  CheckCircle2, AlertCircle, RefreshCcw, ChevronLeft, ChevronRight,
  User, Banknote, ClipboardCheck, Home, KeyRound, Sparkles,
  HelpCircle, ChevronDown, Clock, X,
} from 'lucide-react';
import {
  cacheTenants, getCachedTenants, addEntry, deleteEntry, getEntries,
  getQueuedEntries, updateEntry, newClientUuid,
  type CachedTenant, type FieldEntry,
} from '@/lib/fieldCollectStore';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';
import { FieldCollectDailyTotals } from '@/components/agent/FieldCollectDailyTotals';

interface FieldCollectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 1 | 2 | 3;

type Purpose = 'rent' | 'deposit' | 'other';

const PURPOSES: { id: Purpose; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'rent', label: 'Rent', icon: Home },
  { id: 'deposit', label: 'Deposit', icon: KeyRound },
  { id: 'other', label: 'Other', icon: Sparkles },
];

/** Wrap matching substring in <mark> for visual hint inside suggestions. */
function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/15 text-foreground rounded px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function FieldCollectDialog({ open, onOpenChange }: FieldCollectDialogProps) {
  const { user } = useAuth();
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [tenants, setTenants] = useState<CachedTenant[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [entries, setEntries] = useState<FieldEntry[]>([]);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<CachedTenant | null>(null);
  const [walkupName, setWalkupName] = useState('');
  const [walkupPhone, setWalkupPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [purpose, setPurpose] = useState<Purpose>('rent');
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [, setSyncing] = useState(false);

  /* Online/offline tracking */
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  /* Load + refresh tenant cache when opened */
  const refreshTenantCache = useCallback(async () => {
    if (!user?.id) return;
    setTenantsLoading(true);
    try {
      // Pull from server when online
      if (navigator.onLine) {
        const { data: referredData } = await supabase
          .from('profiles')
          .select('id, full_name, phone, monthly_rent')
          .eq('referrer_id', user.id);

        const referredIds = new Set((referredData || []).map(t => t.id));

        const [{ data: referralRows }, { data: agentRequests }] = await Promise.all([
          supabase.from('referrals').select('referred_id').eq('referrer_id', user.id),
          supabase.from('rent_requests').select('tenant_id').eq('agent_id', user.id),
        ]);

        const extraIds = [
          ...(referralRows || []).map(r => r.referred_id),
          ...(agentRequests || []).map(r => r.tenant_id),
        ].filter(id => id && !referredIds.has(id));

        let extras: any[] = [];
        if (extraIds.length) {
          const { data } = await supabase
            .from('profiles')
            .select('id, full_name, phone, monthly_rent')
            .in('id', [...new Set(extraIds)]);
          extras = data || [];
        }

        const all = [...(referredData || []), ...extras].map((t: any) => ({
          tenantId: t.id as string,
          fullName: (t.full_name as string) || 'Unnamed Tenant',
          phone: (t.phone as string) || null,
          monthlyRent: t.monthly_rent ?? null,
        }));

        await cacheTenants(user.id, all);
      }
      // Always read back from cache (works offline too)
      const cached = await getCachedTenants(user.id);
      setTenants(cached);
    } catch (e) {
      console.warn('Tenant cache refresh failed, using cache only', e);
      const cached = await getCachedTenants(user.id);
      setTenants(cached);
    } finally {
      setTenantsLoading(false);
    }
  }, [user?.id]);

  const refreshEntries = useCallback(async () => {
    if (!user?.id) return;
    setEntries(await getEntries(user.id));
  }, [user?.id]);

  useEffect(() => {
    if (open) {
      refreshTenantCache();
      refreshEntries();
    }
  }, [open, refreshTenantCache, refreshEntries]);

  /* Filter tenants */
  /**
   * Quick search suggestions:
   *  - Empty query → first 8 tenants alphabetically as a passive list
   *  - With query  → score by phone-match > name-prefix > word-prefix > substring
   *    so the most likely tap candidate sits at the top.
   */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants.slice(0, 8);
    const phoneQ = q.replace(/\D+/g, '');
    const scored = tenants
      .map(t => {
        const name = t.fullName.toLowerCase();
        const phone = (t.phone || '').replace(/\D+/g, '');
        let score = 0;
        if (phoneQ && phone && phone.includes(phoneQ)) {
          score = phone.startsWith(phoneQ) ? 100 : 70;
        } else if (name.startsWith(q)) {
          score = 90;
        } else if (name.split(/\s+/).some(w => w.startsWith(q))) {
          score = 80;
        } else if (name.includes(q)) {
          score = 50;
        }
        return { t, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(s => s.t);
    return scored;
  }, [tenants, search]);

  /**
   * Recent tenants — derived from this agent's prior captured entries
   * (queued or synced). Distinct tenants by id, most-recent first, max 5.
   * Only shown when the search box is empty and no tenant is picked.
   */
  const recentTenants = useMemo(() => {
    if (!entries.length || !tenants.length) return [];
    const tenantById = new Map(tenants.map(t => [t.tenantId, t]));
    const seen = new Set<string>();
    const out: CachedTenant[] = [];
    const sorted = [...entries].sort((a, b) => b.capturedAt - a.capturedAt);
    for (const e of sorted) {
      if (!e.tenantId || seen.has(e.tenantId)) continue;
      const t = tenantById.get(e.tenantId);
      if (!t) continue;
      seen.add(e.tenantId);
      out.push(t);
      if (out.length >= 5) break;
    }
    return out;
  }, [entries, tenants]);

  const queuedCount = entries.filter(e => e.syncState !== 'synced').length;
  void queuedCount;

  const resetForm = () => {
    setPicked(null);
    setWalkupName('');
    setWalkupPhone('');
    setAmount('');
    setNotes('');
    setSearch('');
    setPurpose('rent');
    setStep(1);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a valid amount');
      setStep(2);
      return;
    }
    const tName = picked?.fullName || walkupName.trim();
    const tPhone = picked?.phone || (walkupPhone.trim() || null);
    if (!tName) {
      toast.error('Pick a tenant or enter a name');
      setStep(1);
      return;
    }

    setSaving(true);
    try {
      const purposeLabel = PURPOSES.find(p => p.id === purpose)?.label ?? 'Rent';
      const composedNote = notes.trim()
        ? `${purposeLabel} · ${notes.trim()}`
        : purposeLabel;
      const entry: FieldEntry = {
        id: newClientUuid(),
        agentId: user.id,
        tenantId: picked?.tenantId ?? null,
        tenantName: tName,
        tenantPhone: tPhone,
        amount: amt,
        notes: composedNote,
        capturedAt: Date.now(),
        syncState: 'queued',
      };
      await addEntry(entry);
      await refreshEntries();
      resetForm();
      toast.success(`Saved offline · ${formatUGX(amt)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteEntry(id);
    await refreshEntries();
  };

  const handleSync = async () => {
    if (!user?.id) return;
    if (!navigator.onLine) {
      toast.error('No internet. Will sync when back online.');
      return;
    }
    setSyncing(true);
    let ok = 0, fail = 0, dup = 0;
    try {
      const queue = await getQueuedEntries(user.id);
      for (const e of queue) {
        try {
          const { data, error } = await (supabase.from('field_collections') as any)
            .insert({
              client_uuid: e.id,
              agent_id: user.id,
              tenant_id: e.tenantId,
              tenant_name: e.tenantName,
              tenant_phone: e.tenantPhone,
              amount: e.amount,
              notes: e.notes,
              location_name: e.locationName,
              latitude: e.latitude,
              longitude: e.longitude,
              captured_at: new Date(e.capturedAt).toISOString(),
              status: 'pending',
            })
            .select('id')
            .single();
          if (error) {
            // Idempotency-key collision: receipt already on server.
            // Fetch the server record so the agent can reconcile any drift (amount edits etc.)
            if ((error as any).code === '23505') {
              const { data: existing } = await (supabase.from('field_collections') as any)
                .select('id, amount, captured_at, tenant_name, status, created_at')
                .eq('agent_id', user.id)
                .eq('client_uuid', e.id)
                .maybeSingle();
              const sameAmount = existing && Number(existing.amount) === Number(e.amount);
              if (existing && sameAmount) {
                // Identical receipt already uploaded — silently mark as synced.
                await updateEntry(e.id, {
                  syncState: 'synced',
                  serverId: existing.id,
                  syncError: null,
                  lastSyncAt: Date.now(),
                });
                ok++;
              } else {
                // Local entry was edited after a previous successful sync, OR
                // a different device already pushed this client_uuid with different values.
                await updateEntry(e.id, {
                  syncState: 'duplicate',
                  syncError: 'Already on server — needs reconciliation',
                  duplicateOfServerId: existing?.id ?? null,
                  duplicateServerSnapshot: existing ? {
                    amount: Number(existing.amount),
                    capturedAt: existing.captured_at,
                    tenantName: existing.tenant_name,
                    status: existing.status,
                    createdAt: existing.created_at,
                  } : null,
                  lastSyncAt: Date.now(),
                });
                dup++;
              }
            } else {
              await updateEntry(e.id, { syncState: 'error', syncError: error.message, lastSyncAt: Date.now() });
              fail++;
            }
          } else {
            await updateEntry(e.id, {
              syncState: 'synced',
              serverId: (data as any)?.id,
              syncError: null,
              lastSyncAt: Date.now(),
            });
            ok++;
          }
        } catch (err: any) {
          await updateEntry(e.id, { syncState: 'error', syncError: err?.message || 'Unknown', lastSyncAt: Date.now() });
          fail++;
        }
      }
      await refreshEntries();
      const parts: string[] = [];
      if (ok) parts.push(`${ok} synced`);
      if (dup) parts.push(`${dup} duplicate`);
      if (fail) parts.push(`${fail} failed`);
      if (!parts.length) toast.info('Nothing to sync');
      else if (dup || fail) toast.warning(parts.join(' · '));
      else toast.success(parts.join(' · '));
    } finally {
      setSyncing(false);
    }
  };

  /* Auto-sync when coming online */
  useEffect(() => {
    if (online && open && user?.id) {
      getQueuedEntries(user.id).then(q => {
        if (q.length) handleSync();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, open, user?.id]);

  /* Reset wizard when dialog closes */
  useEffect(() => {
    if (!open) resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const tenantPicked = !!picked || !!walkupName.trim();
  const amountValid = Number(amount) > 0;
  const tenantLabel = picked?.fullName || walkupName.trim() || 'No tenant';
  const tenantPhoneLabel = picked?.phone || walkupPhone.trim() || null;
  const purposeLabel = PURPOSES.find(p => p.id === purpose)?.label ?? 'Rent';

  const goNext = () => {
    if (step === 1) {
      if (!tenantPicked) {
        toast.error('Pick a tenant or enter a name');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!amountValid) {
        toast.error('Enter a valid amount');
        return;
      }
      setStep(3);
    }
  };
  const goBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden bg-background',
          // Mobile: full-screen sheet for maximum tap area
          'w-screen h-[100dvh] max-w-none rounded-none translate-x-0 translate-y-0 left-0 top-0 sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%]',
          // Tablet/desktop: roomy modal
          'sm:w-full sm:max-w-lg sm:h-auto sm:max-h-[92vh] sm:rounded-3xl',
          'flex flex-col',
        )}
      >
        {/* Sticky header */}
        <DialogHeader className="px-5 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-4 sticky top-0 bg-background z-10 border-b">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight">Collect cash</DialogTitle>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium',
                online
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
              )}
            >
              {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {online ? 'Online' : 'Saving offline'}
            </span>
          </div>
          <DialogDescription className="sr-only">
            Record a cash payment from a tenant in three guided steps. Works without internet.
          </DialogDescription>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-3" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
            {[1, 2, 3].map((i) => {
              const done = i < step;
              const active = i === step;
              return (
                <div key={i} className="flex-1 flex items-center gap-2 min-w-0">
                  <div
                    className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border',
                      done && 'bg-primary text-primary-foreground border-primary',
                      active && 'bg-primary/10 text-primary border-primary',
                      !done && !active && 'bg-muted text-muted-foreground border-transparent',
                    )}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : i}
                  </div>
                  {i < 3 && (
                    <div className={cn('h-0.5 flex-1 rounded-full', done ? 'bg-primary' : 'bg-muted')} />
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-left">
            Step {step} of 3 ·{' '}
            {step === 1 && 'Choose tenant'}
            {step === 2 && 'Enter amount'}
            {step === 3 && 'Confirm & save'}
          </p>
        </DialogHeader>

        {/* Scrollable body — leaves room for sticky save bar at bottom */}
        <div className="px-5 sm:px-6 py-5 space-y-5 overflow-y-auto flex-1 pb-32 sm:pb-5">
          {/* ───── Offline help card (collapsible) ───── */}
          <details className="group rounded-2xl border bg-muted/30 open:bg-muted/40 transition-colors">
            <summary className="cursor-pointer select-none list-none px-4 py-3 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                    online
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
                  )}
                  aria-hidden
                >
                  <HelpCircle className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">
                    {online ? 'How to save offline' : 'You are offline — your work is safe'}
                  </span>
                  <span className="block text-[11px] text-muted-foreground truncate">
                    Tap to see how slow or no internet is handled
                  </span>
                </span>
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 shrink-0" />
            </summary>
            <div className="px-4 pb-4 pt-1 space-y-3">
              <ol className="space-y-2.5">
                <li className="flex items-start gap-3">
                  <span className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    1
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">Save works without internet</p>
                    <p className="text-xs text-muted-foreground leading-snug">
                      Tap <span className="font-semibold text-foreground">Save</span> normally — the entry is stored on this phone right away, even with no signal.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    2
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">Look for the queued dot</p>
                    <p className="text-xs text-muted-foreground leading-snug">
                      A small <span className="inline-flex items-center gap-1 font-semibold text-foreground"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> amber dot</span> means it's waiting to be sent. A green check means it's already with the office.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    3
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">Sends itself when signal returns</p>
                    <p className="text-xs text-muted-foreground leading-snug">
                      The moment your phone is back online, queued entries upload automatically. You don't need to redo them.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    4
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">Keep the app installed</p>
                    <p className="text-xs text-muted-foreground leading-snug">
                      Don't clear app data while entries still show the amber dot — that's the only way they could be lost.
                    </p>
                  </div>
                </li>
              </ol>
              <div className="rounded-xl border border-dashed bg-background/60 px-3 py-2 text-[11px] text-muted-foreground leading-snug">
                <span className="font-semibold text-foreground">Tip:</span> Slow internet is fine too — saves never wait for the network. Sync happens quietly in the background.
              </div>
            </div>
          </details>

          {/* ───── STEP 1 — Tenant ───── */}
          {step === 1 && (
            <section className="space-y-3" aria-labelledby="step1-title">
              <div className="flex items-center justify-between">
                <Label id="step1-title" className="text-lg font-bold tracking-tight">
                  Who paid?
                </Label>
                {tenants.length > 0 && (
                  <button
                    type="button"
                    onClick={refreshTenantCache}
                    disabled={!online || tenantsLoading}
                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCcw className={cn('h-3 w-3', tenantsLoading && 'animate-spin')} />
                    Refresh
                  </button>
                )}
              </div>

              {picked ? (
                <div className="flex items-center justify-between rounded-2xl bg-primary/5 border border-primary/20 px-4 py-4 min-h-[64px]">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base sm:text-lg font-semibold truncate">{picked.fullName}</p>
                      <p className="text-xs text-muted-foreground truncate">{picked.phone || 'No phone'}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-10 px-4 rounded-full"
                    onClick={() => { setPicked(null); setSearch(''); }}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  {/* Recent tenants — shown only when no query and at least one chip */}
                  {!search && recentTenants.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Recent
                      </div>
                      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {recentTenants.map(t => {
                          const initials = t.fullName
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map(s => s[0]?.toUpperCase())
                            .join('') || '?';
                          return (
                            <button
                              key={`recent-${t.tenantId}`}
                              type="button"
                              onClick={() => { setPicked(t); setSearch(t.fullName); }}
                              className="shrink-0 flex items-center gap-2 rounded-full border bg-card hover:bg-accent active:bg-accent/80 pl-1.5 pr-3.5 py-1.5 min-h-[40px] transition-colors touch-manipulation"
                              style={{ WebkitTapHighlightColor: 'transparent' }}
                              aria-label={`Quick pick ${t.fullName}`}
                            >
                              <span className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold">
                                {initials}
                              </span>
                              <span className="text-sm font-medium max-w-[140px] truncate">
                                {t.fullName.split(' ')[0]}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={e => { setSearch(e.target.value); setPicked(null); }}
                      placeholder={tenants.length ? 'Search name or phone' : 'Connect to load tenants'}
                      className="pl-11 pr-11 h-14 text-base rounded-2xl"
                      autoComplete="off"
                      autoFocus
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {(search || tenants.length > 0) && (
                    <div className="rounded-2xl border max-h-72 overflow-y-auto">
                      {filtered.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground text-center">
                          No match. Use walk-up below.
                        </p>
                      ) : filtered.map((t, idx) => (
                        <button
                          key={t.tenantId}
                          onClick={() => { setPicked(t); setSearch(t.fullName); }}
                          className="w-full text-left px-4 py-4 min-h-[60px] hover:bg-accent border-b last:border-b-0 flex items-center justify-between gap-2 active:bg-accent/80 touch-manipulation"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-base font-semibold truncate">
                                {highlightMatch(t.fullName, search)}
                              </p>
                              {idx === 0 && search && (
                                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                  Best match
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {t.phone ? highlightMatch(t.phone, search) : 'No phone'}
                            </p>
                          </div>
                          {t.monthlyRent ? (
                            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                              {formatUGX(t.monthlyRent)}/mo
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Walk-up fallback */}
                  <details className="text-sm rounded-2xl border bg-muted/20 px-4 py-3 group">
                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground select-none">
                      Tenant not in the list?
                    </summary>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Input
                        value={walkupName}
                        onChange={e => { setWalkupName(e.target.value); setPicked(null); }}
                        placeholder="Name"
                        maxLength={100}
                        className="h-12 rounded-xl text-base"
                      />
                      <Input
                        value={walkupPhone}
                        onChange={e => setWalkupPhone(e.target.value.replace(/[^\d+\s-]/g, '').slice(0, 20))}
                        placeholder="Phone"
                        inputMode="tel"
                        className="h-12 rounded-xl text-base"
                      />
                    </div>
                  </details>
                </>
              )}
            </section>
          )}

          {/* ───── STEP 2 — Amount ───── */}
          {step === 2 && (
            <section className="space-y-3" aria-labelledby="step2-title">
              <Label id="step2-title" className="text-lg font-bold tracking-tight">
                How much did {picked?.fullName?.split(' ')[0] || walkupName.trim().split(' ')[0] || 'they'} pay?
              </Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-muted-foreground pointer-events-none">
                  UGX
                </span>
                <Input
                  value={amount ? Number(amount).toLocaleString() : ''}
                  onChange={e => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 12))}
                  inputMode="numeric"
                  placeholder="0"
                  className="pl-16 h-[72px] sm:h-16 text-4xl sm:text-3xl font-bold tabular-nums rounded-2xl text-right pr-5"
                  autoFocus
                />
              </div>
              {/* Quick-amount chips */}
              <div className="grid grid-cols-4 gap-2">
                {[10000, 50000, 100000, 200000].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(String((Number(amount) || 0) + v))}
                    className="h-12 rounded-full border bg-card text-sm font-semibold hover:bg-accent active:bg-accent/80 transition-colors tabular-nums touch-manipulation"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    +{(v / 1000)}k
                  </button>
                ))}
              </div>
              {amount && (
                <button
                  type="button"
                  onClick={() => setAmount('')}
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  Clear amount
                </button>
              )}
            </section>
          )}

          {/* ───── STEP 3 — Confirm ───── */}
          {step === 3 && (
            <section className="space-y-4" aria-labelledby="step3-title">
              <Label id="step3-title" className="text-lg font-bold tracking-tight">
                What's this payment for?
              </Label>

              <div className="grid grid-cols-3 gap-2">
                {PURPOSES.map(p => {
                  const Icon = p.icon;
                  const active = purpose === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPurpose(p.id)}
                      aria-pressed={active}
                      className={cn(
                        'rounded-2xl border px-3 py-4 flex flex-col items-center gap-2 touch-manipulation transition-all min-h-[88px]',
                        active
                          ? 'bg-primary/10 border-primary text-primary shadow-sm'
                          : 'bg-card hover:bg-accent active:bg-accent/80 border-border',
                      )}
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-sm font-semibold">{p.label}</span>
                    </button>
                  );
                })}
              </div>

              <Input
                value={notes}
                onChange={e => setNotes(e.target.value.slice(0, 140))}
                placeholder="Add a note (optional)"
                maxLength={140}
                className="h-12 rounded-2xl text-sm"
              />

              {/* Summary card */}
              <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Review
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-xs text-primary font-semibold hover:underline"
                  >
                    Edit
                  </button>
                </div>
                <div className="space-y-2.5">
                  <SummaryRow icon={User} label="Tenant" value={tenantLabel} sub={tenantPhoneLabel} />
                  <SummaryRow
                    icon={Banknote}
                    label="Amount"
                    value={formatUGX(Number(amount) || 0)}
                    valueClassName="text-2xl font-bold tabular-nums tracking-tight"
                  />
                  <SummaryRow icon={Sparkles} label="Purpose" value={purposeLabel} sub={notes.trim() || null} />
                </div>
              </div>
            </section>
          )}

          {/* Daily totals — collapsible to keep main flow simple */}
          <details className="rounded-2xl border bg-muted/20 group">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground select-none flex items-center justify-between">
              <span>Today's breakdown & sync status</span>
              <span className="text-xs text-muted-foreground group-open:hidden">Show</span>
              <span className="text-xs text-muted-foreground hidden group-open:inline">Hide</span>
            </summary>
            <div className="px-3 pb-3">
              <FieldCollectDailyTotals
                key={entries.length + ':' + queuedCount}
                variant="inline"
              />
            </div>
          </details>

          <Separator />

          {/* Captured list — collapsed by default to keep main flow simple */}
          {entries.length > 0 && (
            <details className="rounded-2xl border bg-muted/20 group">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground select-none flex items-center justify-between">
                <span>Recent payments ({entries.length})</span>
                <span className="text-xs text-muted-foreground group-open:hidden">Show</span>
                <span className="text-xs text-muted-foreground hidden group-open:inline">Hide</span>
              </summary>
              <div className="px-3 pb-3">
                <ScrollArea className="max-h-72">
                  <ul className="space-y-2 pr-2">
                    {entries.map(e => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-2 rounded-2xl border bg-card px-4 py-3 min-h-[60px]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold truncate">{e.tenantName}</p>
                            {e.syncState === 'synced' && (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                            )}
                            {e.syncState === 'error' && (
                              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                            )}
                            {e.syncState === 'queued' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium shrink-0">
                                Waiting
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(e.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {e.tenantPhone ? ` · ${e.tenantPhone}` : ''}
                          </p>
                        </div>
                        <p className="text-base font-bold tabular-nums shrink-0">
                          {formatUGX(e.amount)}
                        </p>
                        {e.syncState !== 'synced' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-11 w-11 rounded-full shrink-0"
                            onClick={() => handleDelete(e.id)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            </details>
          )}
        </div>

        {/* Sticky wizard footer — Back / Next or Save */}
        <div
          className="sticky bottom-0 left-0 right-0 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur border-t z-10 flex items-center gap-2"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
        >
          {step > 1 && (
            <Button
              type="button"
              onClick={goBack}
              variant="outline"
              size="lg"
              className="h-14 px-5 rounded-2xl gap-1.5 font-semibold"
              disabled={saving}
            >
              <ChevronLeft className="h-5 w-5" />
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button
              type="button"
              onClick={goNext}
              size="lg"
              className="flex-1 h-14 text-base font-semibold rounded-2xl gap-1.5"
              disabled={
                (step === 1 && !tenantPicked) ||
                (step === 2 && !amountValid)
              }
            >
              Next
              <ChevronRight className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSave}
              size="lg"
              disabled={saving || !amountValid || !tenantPicked}
              className="flex-1 h-14 text-base font-semibold rounded-2xl gap-2 shadow-lg shadow-primary/20"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
              Save {formatUGX(Number(amount) || 0)}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Compact label/value row used in the Review summary card. */
function SummaryRow({
  icon: Icon,
  label,
  value,
  sub,
  valueClassName,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string | null;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-full bg-background border flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
        <p className={cn('text-base font-semibold leading-tight mt-0.5 truncate', valueClassName)}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

export default FieldCollectDialog;