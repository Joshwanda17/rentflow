import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ShieldCheck, Wallet, User, Filter, X } from 'lucide-react';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { TidVerification } from './TidVerification';
import { FieldDepositVerificationQueue } from './FieldDepositVerificationQueue';
import { RecentlyVerifiedList } from './RecentlyVerifiedList';
import { supabase } from '@/integrations/supabase/client';
import type { DepositChannel } from '@/lib/fieldDepositBatches';
import { cn } from '@/lib/utils';
import { useFinOpsAutoRefresh } from '@/hooks/useFinOpsAutoRefresh';

/**
 * One place to verify every deposit that reaches the platform — whether it
 * came from a tenant/funder topping up their own wallet (TID-based) or from
 * a field agent depositing collected cash to a merchant code.
 *
 * Per CFO mandate: Financial Ops should never have to remember which queue
 * to open. A single button on the dashboard lands here, and the two tabs
 * surface the live pending counts so the team can drain whichever queue is
 * fuller first.
 */
export function VerifyDepositsHub() {
  const [tab, setTab] = useState<'user' | 'field'>('user');
  const [counts, setCounts] = useState<{ user: number; field: number }>({ user: 0, field: 0 });
  // Honor the shared Financial Ops auto-refresh toggle. When the operator
  // pauses on the Wallet card, the badges here freeze too — no surprise
  // count changes mid-review.
  const autoRefresh = useFinOpsAutoRefresh();
  // Hub-level filters — apply across both tabs so the operator can scope the
  // queue to a single channel (e.g. only MTN) and an amount window before
  // verifying. Channels are limited to MTN, Airtel and Bank as requested;
  // cash-merchant batches are still visible until explicitly filtered out.
  const [channelFilters, setChannelFilters] = useState<DepositChannel[]>([]);
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  // Verifier (operator) filter — only narrows resolved/recently-verified rows.
  // Pending rows have no verifier yet so they are excluded when this is set.
  const [verifierId, setVerifierId] = useState<string>('all');
  const [verifiers, setVerifiers] = useState<{ id: string; full_name: string | null }[]>([]);
  // Free-text filter over the verifier dropdown — handy once dozens of
  // operators have processed deposits and scrolling is tedious.
  const [verifierSearch, setVerifierSearch] = useState<string>('');
  // Export-only date window. Applied to Verified at / processed timestamp
  // when the operator clicks Export. Does NOT affect the live tables — the
  // queue tables remain a real-time view of the latest activity.
  const [exportFrom, setExportFrom] = useState<Date | undefined>(undefined);
  const [exportTo, setExportTo] = useState<Date | undefined>(undefined);
  // Current operator (used for the "Me" quick-select). Null until we resolve
  // the auth user; the "Me" option stays disabled until then.
  const [meId, setMeId] = useState<string | null>(null);
  const [meName, setMeName] = useState<string | null>(null);
  // Persisted preference: when true, the verifier filter auto-defaults to the
  // current operator on every visit. Operators can still switch to "Any" or
  // another verifier — that doesn't disable the preference.
  const [defaultToMe, setDefaultToMe] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('finops:verifier-default-to-me') === '1';
  });
  // Tracks whether we've already applied the "default to me" preference this
  // mount, so we don't keep snapping the operator back to themselves after
  // they manually change it.
  const [appliedDefaultMe, setAppliedDefaultMe] = useState(false);

  // Resolve the current user once. Profile name is best-effort — falls back
  // to "Me" so the dropdown item is always usable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      setMeId(user.id);
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) setMeName((prof?.full_name as string | null) ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  // Apply the "default to me" preference once the user id is known and only
  // if the operator hasn't already changed the filter this session.
  useEffect(() => {
    if (appliedDefaultMe) return;
    if (!defaultToMe || !meId) return;
    if (verifierId !== 'all') { setAppliedDefaultMe(true); return; }
    setVerifierId(meId);
    setAppliedDefaultMe(true);
  }, [defaultToMe, meId, verifierId, appliedDefaultMe]);

  const toggleDefaultToMe = () => {
    setDefaultToMe((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          'finops:verifier-default-to-me',
          next ? '1' : '0',
        );
      } catch { /* storage may be unavailable */ }
      // When turning it on, immediately apply to the current session.
      if (next && meId) setVerifierId(meId);
      return next;
    });
  };

  // Build a single distinct list of operators who have ever resolved a deposit
  // — pulled from both deposit_requests (user side) and field_deposit_batches
  // (field side). Loaded once; refreshed when auto-refresh tick fires so newly
  // active operators show up without a manual reload.
  useEffect(() => {
    let cancelled = false;
    const loadVerifiers = async () => {
      const [userRes, fieldRes] = await Promise.all([
        supabase
          .from('deposit_requests')
          .select('processed_by')
          .in('status', ['approved', 'rejected'])
          .not('processed_by', 'is', null)
          .limit(500),
        supabase
          .from('field_deposit_batches')
          .select('finops_verified_by')
          .in('status', ['verified', 'rejected'])
          .not('finops_verified_by', 'is', null)
          .limit(500),
      ]);
      const ids = new Set<string>();
      for (const r of (userRes.data ?? []) as any[]) if (r.processed_by) ids.add(r.processed_by);
      for (const r of (fieldRes.data ?? []) as any[]) if (r.finops_verified_by) ids.add(r.finops_verified_by);
      if (ids.size === 0) {
        if (!cancelled) setVerifiers([]);
        return;
      }
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(ids));
      if (cancelled) return;
      const sorted = ((profs ?? []) as any[])
        .map((p) => ({ id: p.id as string, full_name: (p.full_name as string | null) ?? null }))
        .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''));
      setVerifiers(sorted);
    };
    loadVerifiers();
    if (!autoRefresh) return () => { cancelled = true; };
    const id = setInterval(loadVerifiers, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [autoRefresh]);

  const toggleChannel = (c: DepositChannel) =>
    setChannelFilters((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  const clearFilters = () => {
    setChannelFilters([]);
    setMinAmount('');
    setMaxAmount('');
    setVerifierId('all');
  };

  const minNum = minAmount ? Number(minAmount) : undefined;
  const maxNum = maxAmount ? Number(maxAmount) : undefined;
  const filtersActive =
    channelFilters.length > 0 ||
    (typeof minNum === 'number' && !Number.isNaN(minNum)) ||
    (typeof maxNum === 'number' && !Number.isNaN(maxNum)) ||
    verifierId !== 'all';
  const verifierFilter = verifierId === 'all' ? undefined : verifierId;

  // Convert the date pickers to ISO bounds — inclusive day-windows so a
  // single-day selection covers the full 24h. Children only use these for
  // export queries; the live tables ignore them.
  const exportFromIso = exportFrom
    ? new Date(exportFrom.getFullYear(), exportFrom.getMonth(), exportFrom.getDate(), 0, 0, 0).toISOString()
    : undefined;
  const exportToIso = exportTo
    ? new Date(exportTo.getFullYear(), exportTo.getMonth(), exportTo.getDate(), 23, 59, 59, 999).toISOString()
    : undefined;

  const CHANNEL_CHIPS: { value: DepositChannel; label: string }[] = [
    { value: 'mtn', label: 'MTN MoMo' },
    { value: 'airtel', label: 'Airtel Money' },
    { value: 'bank', label: 'Bank' },
  ];

  // Lightweight pending counts so each tab shows a live badge.
  // Sequential awaits to keep PostgREST type unions cheap.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const userRes = await supabase
        .from('deposit_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      const fieldRes = await supabase
        .from('field_deposit_batches')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_finops_verification');
      if (cancelled) return;
      setCounts({
        user: userRes.count ?? 0,
        field: fieldRes.count ?? 0,
      });
    };
    load();
    if (!autoRefresh) {
      return () => { cancelled = true; };
    }
    const id = setInterval(load, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [autoRefresh]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Verify Deposits
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          One queue for every kind of money coming in — tenant top-ups, funder
          deposits, and agent cash batches. Approved deposits credit the right
          wallet and post to the ledger automatically.
        </p>
      </div>

      {/* Filter bar — channel chips + amount window. Kept inline (no popover)
          so operators can see at a glance what's narrowing the queue. */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            Filter pending deposits
          </div>
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] gap-1"
              onClick={clearFilters}
            >
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Channel
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {CHANNEL_CHIPS.map((c) => {
              const active = channelFilters.includes(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => toggleChannel(c.value)}
                  className={cn(
                    'h-7 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30',
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="finops-min-amount" className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Min amount (UGX)
            </Label>
            <Input
              id="finops-min-amount"
              type="number"
              inputMode="numeric"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="e.g. 50,000"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="finops-max-amount" className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Max amount (UGX)
            </Label>
            <Input
              id="finops-max-amount"
              type="number"
              inputMode="numeric"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="e.g. 1,000,000"
              className="h-8 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Verified by
          </Label>
          <Select value={verifierId} onValueChange={setVerifierId}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Any operator" />
            </SelectTrigger>
            <SelectContent>
              <div className="sticky top-0 z-10 bg-popover p-1.5 border-b border-border/60">
                <Input
                  value={verifierSearch}
                  onChange={(e) => setVerifierSearch(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Search operator…"
                  className="h-7 text-xs"
                  aria-label="Search verifiers by name"
                />
              </div>
              <SelectItem value="all">Any operator</SelectItem>
              {meId && (
                <SelectItem value={meId}>
                  Me{meName ? ` (${meName})` : ''}
                </SelectItem>
              )}
              {meId && (
                <div className="px-1.5 py-1 border-t border-border/60 mt-1">
                  <label className="flex items-center gap-2 px-1.5 py-1 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={defaultToMe}
                      onChange={toggleDefaultToMe}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="h-3 w-3 accent-primary"
                      aria-label="Default verifier filter to me on every visit"
                    />
                    Default to me on every visit
                  </label>
                </div>
              )}
              {(() => {
                if (verifiers.length === 0) {
                  return (
                    <div className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                      No verifiers on record yet
                    </div>
                  );
                }
                const q = verifierSearch.trim().toLowerCase();
                const filtered = q
                  ? verifiers.filter((v) =>
                      (v.full_name ?? `Operator ${v.id.slice(0, 8)}`)
                        .toLowerCase()
                        .includes(q),
                    )
                  : verifiers;
                if (filtered.length === 0) {
                  return (
                    <div className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                      No operators match “{verifierSearch}”
                    </div>
                  );
                }
                return filtered.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.full_name ?? `Operator ${v.id.slice(0, 8)}`}
                  </SelectItem>
                ));
              })()}
            </SelectContent>
          </Select>
          {verifierFilter && (
            <p className="text-[10px] text-muted-foreground italic">
              Hides pending deposits — only resolved items have a verifier.
            </p>
          )}
        </div>
      </div>

      {/* Export-only date window. Operators can scope the CSV download to a
          specific verification period without filtering the live queue. */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
            Export date range
            <span className="text-[10px] font-normal text-muted-foreground italic">
              (applies to CSV download only)
            </span>
          </div>
          {(exportFrom || exportTo) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] gap-1"
              onClick={() => { setExportFrom(undefined); setExportTo(undefined); }}
            >
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              From
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'h-8 w-full justify-start text-left text-sm font-normal',
                    !exportFrom && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {exportFrom ? format(exportFrom, 'PP') : 'Pick a start date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={exportFrom}
                  onSelect={setExportFrom}
                  disabled={(d) => (exportTo ? d > exportTo : false) || d > new Date()}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              To
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'h-8 w-full justify-start text-left text-sm font-normal',
                    !exportTo && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {exportTo ? format(exportTo, 'PP') : 'Pick an end date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={exportTo}
                  onSelect={setExportTo}
                  disabled={(d) => (exportFrom ? d < exportFrom : false) || d > new Date()}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {verifierFilter && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Active filter
          </span>
          <Badge
            variant="primary"
            className="flex items-center gap-1.5 pl-2 pr-1 py-1"
          >
            <span className="text-[11px]">
              Verifier: {verifierFilter === meId
                ? `Me${meName ? ` (${meName})` : ''}`
                : verifiers.find((v) => v.id === verifierFilter)?.full_name
                  ?? `Operator ${verifierFilter.slice(0, 8)}`}
            </span>
            <button
              type="button"
              onClick={() => setVerifierId('all')}
              aria-label="Clear verifier filter"
              className="rounded-full p-0.5 hover:bg-primary/20 transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'user' | 'field')}>
        <TabsList className="grid grid-cols-2 w-full h-auto p-1">
          <TabsTrigger value="user" className="flex flex-col items-center gap-1 py-2.5">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="font-semibold text-sm">User Deposits</span>
              {counts.user > 0 && (
                <Badge className="h-5 min-w-5 px-1.5 text-[10px] bg-primary text-primary-foreground hover:bg-primary">
                  {counts.user}
                </Badge>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground font-normal">
              Tenant &amp; funder top-ups
            </span>
          </TabsTrigger>
          <TabsTrigger value="field" className="flex flex-col items-center gap-1 py-2.5">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              <span className="font-semibold text-sm">Field Deposits</span>
              {counts.field > 0 && (
                <Badge className="h-5 min-w-5 px-1.5 text-[10px] bg-primary text-primary-foreground hover:bg-primary">
                  {counts.field}
                </Badge>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground font-normal">
              Agent cash → float
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="user" className="mt-4 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            CFO credits from <span className="font-semibold text-foreground">Welile Technologies Finance</span> are auto-approved and skip this queue.
          </p>
          {filtersActive && (
            <p className="text-[11px] text-muted-foreground italic">
              User deposits are looked up by Transaction ID — channel and amount
              filters above only narrow the Field Deposits tab.
            </p>
          )}
          <TidVerification />
          {/* User-side verifications happen via TID search, not a list, so
              the Verified by / Verified at columns surface here. The Field
              Deposits tab shows them inline in the queue table itself. */}
          <RecentlyVerifiedList
            source="user"
            verifierId={verifierFilter}
            exportFromIso={exportFromIso}
            exportToIso={exportToIso}
          />
        </TabsContent>

        <TabsContent value="field" className="mt-4 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Approving credits the agent's float, allocates rent to tagged
            tenants, and posts agent commission instantly.
          </p>
          <FieldDepositVerificationQueue
            channels={channelFilters}
            minAmount={minNum !== undefined && !Number.isNaN(minNum) ? minNum : undefined}
            maxAmount={maxNum !== undefined && !Number.isNaN(maxNum) ? maxNum : undefined}
            verifierId={verifierFilter}
            exportFromIso={exportFromIso}
            exportToIso={exportToIso}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}