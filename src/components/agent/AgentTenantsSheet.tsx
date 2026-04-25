import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Loader2, Search, Phone, PhoneCall, FileDown, MessageCircle, Users, RefreshCw, Banknote, MapPin, Home, User, TrendingUp, ArrowLeft, Shield, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { formatUGX, calculateRentRepayment } from '@/lib/rentCalculations';
import { generateWelileAiId, getRiskTierLabel } from '@/lib/welileAiId';
import { format, startOfDay } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadRepaymentPdf, shareRepaymentPdfWhatsApp } from '@/lib/repaymentSchedulePdf';
import { downloadRentStatement } from '@/lib/receiptPdf';
import { useToast } from '@/hooks/use-toast';
import AgentRentRequestDialog from './AgentRentRequestDialog';
import { AgentTenantCollectDialog } from './AgentTenantCollectDialog';
import { TenantBehaviorCard } from './TenantBehaviorCard';
import { TenantProfileView } from './TenantProfileView';
import { TenantFieldCollectDialog } from './TenantFieldCollectDialog';

interface Tenant {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  created_at: string;
  monthly_rent: number | null;
  verified: boolean;
}

interface TenantRentRequest {
  id: string;
  rent_amount: number;
  total_repayment: number;
  duration_days: number;
  daily_repayment: number;
  amount_repaid: number;
  status: string | null;
  created_at: string;
  disbursed_at: string | null;
  registration_type: string | null;
  landlord_id?: string | null;
  lc1_id?: string | null;
  house_category?: string | null;
  tenant_no_smartphone?: boolean | null;
  request_latitude?: number | null;
  request_longitude?: number | null;
  landlord?: { name: string; property_address: string; house_category?: string; latitude?: number; longitude?: number } | null;
}

interface AgentTenantsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FilterTab = 'owing' | 'paid-up' | 'all';
type RiskFilter = 'all' | 'good' | 'standard' | 'caution' | 'new';
type SortKey = 'risk' | 'aiId' | 'property' | 'balance';
type SortDir = 'asc' | 'desc';

const PREFS_KEY = 'agent-tenants-sheet:prefs:v1';

interface SheetPrefs {
  search?: string;
  activeFilter?: FilterTab;
  riskFilter?: RiskFilter;
}

function loadPrefs(): SheetPrefs {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SheetPrefs;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const RISK_ORDER: Record<'good' | 'standard' | 'caution' | 'new', number> = {
  caution: 0,
  standard: 1,
  good: 2,
  new: 3,
};

// Escape regex special characters before building a search-highlight pattern.
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Render `text` with all case-insensitive occurrences of `query` wrapped in a
 * highlight span. Falls back to plain text when there's no query / no match.
 */
function Highlight({ text, query }: { text?: string | null; query: string }) {
  const value = text ?? '';
  const q = query.trim();
  if (!q || !value) return <>{value}</>;
  const re = new RegExp(`(${escapeRegex(q)})`, 'ig');
  const parts = value.split(re);
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={i}
            className="bg-warning/30 text-foreground rounded px-0.5 py-0 font-semibold"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function AgentTenantsSheet({ open, onOpenChange }: AgentTenantsSheetProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(() => loadPrefs().search ?? '');
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);
  const [tenantRequests, setTenantRequests] = useState<Record<string, TenantRentRequest[]>>({});
  const [loadingRequests, setLoadingRequests] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>(() => loadPrefs().activeFilter ?? 'owing');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>(() => loadPrefs().riskFilter ?? 'all');
  const [sortKey, setSortKey] = useState<SortKey>('balance');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [tenantBalances, setTenantBalances] = useState<Record<string, number>>({});
  const [tenantTotals, setTenantTotals] = useState<Record<string, { total: number; paid: number }>>({});
  const [tenantStatuses, setTenantStatuses] = useState<Record<string, Set<string>>>({});
  // Per-tenant context for richer search/filter (latest landlord & address)
  const [tenantContext, setTenantContext] = useState<Record<string, { landlordName: string; propertyAddress: string; completedCount: number; totalRequests: number }>>({});
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [renewPrefill, setRenewPrefill] = useState<{ name: string; phone: string; amount: string } | null>(null);
  const [renewingReqId, setRenewingReqId] = useState<string | null>(null);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const [collectTarget, setCollectTarget] = useState<{ tenant: Tenant; reqId: string; owing: number } | null>(null);
  const [fieldCollectTarget, setFieldCollectTarget] = useState<Tenant | null>(null);
  const [behaviorCardOpen, setBehaviorCardOpen] = useState(false);
  const [behaviorData, setBehaviorData] = useState<any>(null);
  const [profileTenantId, setProfileTenantId] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) fetchTenants();
    if (!open) { setExpandedTenantId(null); setProfileTenantId(null); }
  }, [open, user]);

  // Persist search / status tab / risk chip across sheet open-close and reloads
  useEffect(() => {
    try {
      window.localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ search, activeFilter, riskFilter } satisfies SheetPrefs),
      );
    } catch {
      /* storage unavailable — ignore */
    }
  }, [search, activeFilter, riskFilter]);

  const fetchTenants = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: referredData, error: refErr } = await supabase
        .from('profiles')
        .select('id, full_name, phone, email, created_at, monthly_rent, verified')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });

      if (refErr) throw refErr;
      const referredTenants = referredData || [];
      const referredIds = new Set(referredTenants.map(t => t.id));

      // Also include tenants linked through the referrals table (historical
      // registrations where profiles.referrer_id was not stamped).
      const { data: referralRows } = await supabase
        .from('referrals')
        .select('referred_id')
        .eq('referrer_id', user.id);

      const { data: agentRequests } = await supabase
        .from('rent_requests')
        .select('tenant_id')
        .eq('agent_id', user.id);

      const extraTenantIds = [
        ...(referralRows || []).map(r => r.referred_id),
        ...(agentRequests || []).map(r => r.tenant_id),
      ].filter(id => id && !referredIds.has(id));

      let extraTenants: Tenant[] = [];
      if (extraTenantIds.length > 0) {
        const uniqueIds = [...new Set(extraTenantIds)];
        const { data: extraData } = await supabase
          .from('profiles')
          .select('id, full_name, phone, email, created_at, monthly_rent, verified')
          .in('id', uniqueIds);
        extraTenants = extraData || [];
      }

      const tenantList = [...referredTenants, ...extraTenants];
      setTenants(tenantList);

      if (tenantList.length > 0) {
        const tenantIds = tenantList.map(t => t.id);
        const { data: rentRequests } = await supabase
          .from('rent_requests')
          .select('tenant_id, total_repayment, amount_repaid, status, created_at, landlord:landlords(name, property_address)')
          .in('tenant_id', tenantIds)
          .in('status', ['pending', 'approved', 'funded', 'disbursed', 'repaying', 'completed'])
          .order('created_at', { ascending: false });

        const balances: Record<string, number> = {};
        const totals: Record<string, { total: number; paid: number }> = {};
        const statusMap: Record<string, Set<string>> = {};
        const ctx: Record<string, { landlordName: string; propertyAddress: string; completedCount: number; totalRequests: number }> = {};
        (rentRequests || []).forEach((rr: any) => {
          const owing = (rr.total_repayment || 0) - (rr.amount_repaid || 0);
          balances[rr.tenant_id] = (balances[rr.tenant_id] || 0) + Math.max(0, owing);
          const prev = totals[rr.tenant_id] || { total: 0, paid: 0 };
          totals[rr.tenant_id] = { total: prev.total + (rr.total_repayment || 0), paid: prev.paid + (rr.amount_repaid || 0) };
          if (!statusMap[rr.tenant_id]) statusMap[rr.tenant_id] = new Set();
          if (rr.status) statusMap[rr.tenant_id].add(rr.status);
          // Latest-first context (first hit wins thanks to descending order)
          if (!ctx[rr.tenant_id]) {
            ctx[rr.tenant_id] = {
              landlordName: rr.landlord?.name || '',
              propertyAddress: rr.landlord?.property_address || '',
              completedCount: 0,
              totalRequests: 0,
            };
          }
          ctx[rr.tenant_id].totalRequests += 1;
          if (rr.status === 'completed') ctx[rr.tenant_id].completedCount += 1;
        });
        setTenantBalances(balances);
        setTenantTotals(totals);
        setTenantStatuses(statusMap);
        setTenantContext(ctx);
      }
    } catch (err) {
      console.error('Failed to fetch tenants:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTenantRequests = useCallback(async (tenantId: string) => {
    if (tenantRequests[tenantId]) return;
    setLoadingRequests(tenantId);
    try {
      const { data, error } = await supabase
        .from('rent_requests')
        .select('id, rent_amount, total_repayment, duration_days, daily_repayment, amount_repaid, status, created_at, disbursed_at, registration_type, landlord_id, lc1_id, house_category, tenant_no_smartphone, request_latitude, request_longitude, landlord:landlords(name, property_address, house_category, latitude, longitude)')
        .eq('tenant_id', tenantId)
        .in('status', ['pending', 'approved', 'disbursed', 'repaying', 'completed'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setTenantRequests(prev => ({ ...prev, [tenantId]: (data as unknown as TenantRentRequest[]) || [] }));
    } catch (err) {
      console.error('Failed to fetch tenant requests:', err);
    } finally {
      setLoadingRequests(null);
    }
  }, [tenantRequests]);

  const toggleExpand = (tenantId: string) => {
    if (expandedTenantId === tenantId) {
      setExpandedTenantId(null);
    } else {
      setExpandedTenantId(tenantId);
      fetchTenantRequests(tenantId);
    }
  };

  // Per-tenant derived risk + AI ID (used by search, filter, and row chip)
  const tenantMeta = useMemo(() => {
    const map: Record<string, {
      aiId: string;
      riskLevel: 'good' | 'standard' | 'caution' | 'new';
      riskLabel: string;
      riskColor: string;
      completionRate: number;
      completedCount: number;
      totalRequests: number;
    }> = {};
    tenants.forEach(t => {
      const ctx = tenantContext[t.id];
      const completionRate = ctx && ctx.totalRequests > 0
        ? Math.round((ctx.completedCount / ctx.totalRequests) * 100)
        : 0;
      const totalRequests = ctx?.totalRequests || 0;
      const riskLevel: 'good' | 'standard' | 'caution' | 'new' =
        totalRequests === 0 ? 'new'
        : completionRate >= 80 ? 'good'
        : completionRate >= 50 ? 'standard'
        : 'caution';
      const tier = getRiskTierLabel(riskLevel);
      map[t.id] = {
        aiId: generateWelileAiId(t.id),
        riskLevel,
        riskLabel: tier.label,
        riskColor: tier.color,
        completionRate,
        completedCount: ctx?.completedCount || 0,
        totalRequests,
      };
    });
    return map;
  }, [tenants, tenantContext]);

  // Filtered & sorted tenants — always sorted by highest debt
  const processedTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = tenants.filter(t => {
      if (!q) return true;
      const ctx = tenantContext[t.id];
      const meta = tenantMeta[t.id];
      return (
        t.full_name.toLowerCase().includes(q) ||
        t.phone.includes(search) ||
        (ctx?.landlordName || '').toLowerCase().includes(q) ||
        (ctx?.propertyAddress || '').toLowerCase().includes(q) ||
        (meta?.aiId || '').toLowerCase().includes(q)
      );
    });

    switch (activeFilter) {
      case 'owing':
        list = list.filter(t => (tenantBalances[t.id] || 0) > 0);
        break;
      case 'paid-up':
        list = list.filter(t => {
          const s = tenantStatuses[t.id];
          if (!s || s.size === 0) return false;
          return (tenantBalances[t.id] || 0) === 0;
        });
        break;
      case 'all':
        break;
    }

    if (riskFilter !== 'all') {
      list = list.filter(t => tenantMeta[t.id]?.riskLevel === riskFilter);
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'risk': {
          const ra = RISK_ORDER[tenantMeta[a.id]?.riskLevel ?? 'new'];
          const rb = RISK_ORDER[tenantMeta[b.id]?.riskLevel ?? 'new'];
          cmp = ra - rb;
          break;
        }
        case 'aiId': {
          cmp = (tenantMeta[a.id]?.aiId ?? '').localeCompare(tenantMeta[b.id]?.aiId ?? '');
          break;
        }
        case 'property': {
          const pa = (tenantContext[a.id]?.propertyAddress ?? '').toLowerCase();
          const pb = (tenantContext[b.id]?.propertyAddress ?? '').toLowerCase();
          // Push empty addresses to the bottom regardless of direction
          if (!pa && pb) return 1;
          if (pa && !pb) return -1;
          cmp = pa.localeCompare(pb);
          break;
        }
        case 'balance':
        default: {
          cmp = (tenantBalances[a.id] || 0) - (tenantBalances[b.id] || 0);
          break;
        }
      }
      if (cmp === 0) {
        // Stable tiebreaker: name asc
        cmp = a.full_name.localeCompare(b.full_name);
        return cmp;
      }
      return cmp * dir;
    });
    return list;
  }, [tenants, search, activeFilter, riskFilter, sortKey, sortDir, tenantBalances, tenantStatuses, tenantContext, tenantMeta]);

  // Stats
  const stats = useMemo(() => {
    const totalOwing = Object.values(tenantBalances).reduce((s, v) => s + v, 0);
    const owingCount = Object.values(tenantBalances).filter(v => v > 0).length;
    const paidUpCount = tenants.filter(t => {
      const s = tenantStatuses[t.id];
      return s && s.size > 0 && (tenantBalances[t.id] || 0) === 0;
    }).length;
    return { totalOwing, owingCount, paidUpCount, total: tenants.length };
  }, [tenants, tenantBalances, tenantStatuses]);

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'owing', label: 'Owing', count: stats.owingCount },
    { key: 'paid-up', label: 'Paid up', count: stats.paidUpCount },
    { key: 'all', label: 'All', count: stats.total },
  ];

  // ───── Handlers ─────
  const handleDownloadPdf = async (tenant: Tenant, req: TenantRentRequest) => {
    try {
      const scheduleDays = [];
      const start = startOfDay(new Date(req.disbursed_at || req.created_at));
      for (let i = 0; i < req.duration_days; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        scheduleDays.push({ date: format(d, 'yyyy-MM-dd'), amount: req.daily_repayment, status: 'pending' as const });
      }
      await downloadRepaymentPdf({
        tenantName: tenant.full_name, phone: tenant.phone,
        landlordName: req.landlord?.name || 'N/A', propertyAddress: req.landlord?.property_address || 'N/A',
        rentAmount: req.rent_amount, totalRepayment: req.total_repayment,
        dailyRepayment: req.daily_repayment, durationDays: req.duration_days,
        status: req.status || 'approved', paidAmount: req.amount_repaid,
        startDate: format(new Date(req.disbursed_at || req.created_at), 'dd MMM yyyy'), schedule: scheduleDays,
      });
    } catch { toast({ title: 'Error generating PDF', variant: 'destructive' }); }
  };

  const handleShareWhatsApp = async (tenant: Tenant, req: TenantRentRequest) => {
    try {
      const scheduleDays = [];
      const start = startOfDay(new Date(req.disbursed_at || req.created_at));
      for (let i = 0; i < req.duration_days; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        scheduleDays.push({ date: format(d, 'yyyy-MM-dd'), amount: req.daily_repayment, status: 'pending' as const });
      }
      await shareRepaymentPdfWhatsApp({
        tenantName: tenant.full_name, phone: tenant.phone,
        landlordName: req.landlord?.name || 'N/A', propertyAddress: req.landlord?.property_address || 'N/A',
        rentAmount: req.rent_amount, totalRepayment: req.total_repayment,
        dailyRepayment: req.daily_repayment, durationDays: req.duration_days,
        status: req.status || 'approved', paidAmount: req.amount_repaid,
        startDate: format(new Date(req.disbursed_at || req.created_at), 'dd MMM yyyy'), schedule: scheduleDays,
      }, tenant.phone);
    } catch { toast({ title: 'Error sharing', variant: 'destructive' }); }
  };

  // One-tap renew: re-post a rent request using the data from a completed cycle.
  // No new info is requested — landlord, tenant, house category etc. are reused.
  const handleRenew = async (tenant: Tenant, req: TenantRentRequest) => {
    if (!user) return;
    if (!req.landlord_id) {
      toast({ title: 'Cannot renew', description: 'Landlord info missing on prior request.', variant: 'destructive' });
      return;
    }
    setRenewingReqId(req.id);
    try {
      const fees = calculateRentRepayment(req.rent_amount, req.duration_days);
      const { error } = await supabase.from('rent_requests').insert({
        tenant_id: tenant.id,
        agent_id: user.id,
        landlord_id: req.landlord_id,
        lc1_id: req.lc1_id ?? null,
        rent_amount: fees.rentAmount,
        duration_days: fees.durationDays,
        access_fee: fees.accessFee,
        request_fee: fees.requestFee,
        total_repayment: fees.totalRepayment,
        daily_repayment: fees.dailyRepayment,
        status: 'pending',
        house_category: req.house_category ?? req.landlord?.house_category ?? null,
        tenant_no_smartphone: req.tenant_no_smartphone ?? false,
        request_latitude: req.request_latitude ?? req.landlord?.latitude ?? null,
        request_longitude: req.request_longitude ?? req.landlord?.longitude ?? null,
      } as any);
      if (error) throw error;
      toast({ title: 'Rent request renewed ✅', description: `Posted for ${tenant.full_name}` });
      // Force-refresh this tenant's requests
      setTenantRequests(prev => {
        const updated = { ...prev };
        delete updated[tenant.id];
        return updated;
      });
      fetchTenantRequests(tenant.id);
      fetchTenants();
    } catch (err: any) {
      console.error('Renew failed:', err);
      toast({ title: 'Renew failed', description: err?.message || 'Try again', variant: 'destructive' });
    } finally {
      setRenewingReqId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl flex flex-col p-0 gap-0">
        {profileTenantId ? (
          <TenantProfileView tenantId={profileTenantId} onBack={() => setProfileTenantId(null)} />
        ) : (
        <>
        {/* ───── Sticky Header ───── */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border/50 px-4 pt-4 pb-3 space-y-3">
          <SheetHeader className="pb-0">
            <SheetTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="h-11 px-3 rounded-xl text-base font-semibold gap-1"
                >
                  <ArrowLeft className="h-5 w-5" />
                  Back
                </Button>
                <Users className="h-5 w-5 text-primary" />
                <span className="text-lg font-bold">My Tenants</span>
              </div>
              <Badge variant="outline" className="text-sm font-mono px-2.5 py-0.5">
                {stats.total}
              </Badge>
            </SheetTitle>
          </SheetHeader>

          {/* Search — name, phone, property, landlord, or AI ID */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, property, or AI ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 rounded-xl bg-muted/40 border-0 focus-visible:ring-1 focus-visible:ring-primary/30"
              style={{ fontSize: '16px' }}
              aria-label="Search tenants by name, phone, property, or AI ID"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm p-1"
                aria-label="Clear search"
              >✕</button>
            )}
          </div>

          {/* 3 Filter Tabs */}
          <div className="flex gap-2">
            {filterTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeFilter === tab.key
                    ? tab.key === 'owing'
                      ? 'bg-destructive text-destructive-foreground shadow-sm'
                      : tab.key === 'paid-up'
                        ? 'bg-success text-success-foreground shadow-sm'
                        : 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground'
                }`}
                style={{ touchAction: 'manipulation', minHeight: '44px' }}
              >
                {tab.label}
                <span className={`min-w-[20px] h-[20px] rounded-full flex items-center justify-center text-[11px] font-bold ${
                  activeFilter === tab.key ? 'bg-background/25' : 'bg-background/60'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Total owed summary */}
          {stats.totalOwing > 0 && (
            <p className="text-xs text-muted-foreground">
              Total owed: <span className="font-bold text-destructive font-mono">{formatUGX(stats.totalOwing)}</span>
            </p>
          )}

          {/* Risk tier filter — horizontal chip row */}
          <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-0.5 scrollbar-hide">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 pr-1">
              <Shield className="h-3.5 w-3.5" />
              Risk
            </div>
            {([
              { key: 'all', label: 'All', tone: 'bg-muted text-foreground' },
              { key: 'good', label: 'Good', tone: 'bg-success/15 text-success' },
              { key: 'standard', label: 'Standard', tone: 'bg-primary/15 text-primary' },
              { key: 'caution', label: 'Caution', tone: 'bg-destructive/15 text-destructive' },
              { key: 'new', label: 'New', tone: 'bg-muted/70 text-muted-foreground' },
            ] as const).map(opt => {
              const isActive = riskFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setRiskFilter(opt.key as RiskFilter)}
                  className={`shrink-0 h-9 px-3 rounded-full text-xs font-semibold transition-all border ${
                    isActive
                      ? 'border-foreground/20 ring-1 ring-foreground/10 ' + opt.tone
                      : 'border-transparent ' + opt.tone + ' opacity-70 hover:opacity-100'
                  }`}
                  style={{ touchAction: 'manipulation', minHeight: '36px' }}
                  aria-pressed={isActive}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Sort bar — tap to set, tap active to flip direction */}
          <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-0.5 scrollbar-hide">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 pr-1">
              <ArrowUpDown className="h-3.5 w-3.5" />
              Sort
            </div>
            {([
              { key: 'risk', label: 'Risk' },
              { key: 'aiId', label: 'AI ID' },
              { key: 'property', label: 'Property' },
              { key: 'balance', label: 'Owing' },
            ] as const).map(opt => {
              const isActive = sortKey === opt.key;
              const Arrow = sortDir === 'asc' ? ArrowUp : ArrowDown;
              return (
                <button
                  key={opt.key}
                  onClick={() => {
                    if (sortKey === opt.key) {
                      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
                    } else {
                      setSortKey(opt.key);
                      // Sensible defaults per column
                      setSortDir(opt.key === 'aiId' || opt.key === 'property' ? 'asc' : 'desc');
                    }
                  }}
                  className={`shrink-0 h-9 px-3 rounded-full text-xs font-semibold transition-all border inline-flex items-center gap-1 ${
                    isActive
                      ? 'border-foreground/20 ring-1 ring-foreground/10 bg-primary/15 text-primary'
                      : 'border-transparent bg-muted text-muted-foreground opacity-80 hover:opacity-100'
                  }`}
                  style={{ touchAction: 'manipulation', minHeight: '36px' }}
                  aria-pressed={isActive}
                  aria-label={`Sort by ${opt.label}${isActive ? ` (${sortDir === 'asc' ? 'ascending' : 'descending'})` : ''}`}
                >
                  {opt.label}
                  {isActive && <Arrow className="h-3 w-3" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ───── Tenant List ───── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : processedTenants.length === 0 ? (
            <div className="text-center py-20">
              <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {search ? `No results for "${search}"` : activeFilter === 'owing' ? 'No tenants owing' : activeFilter === 'paid-up' ? 'No paid up tenants' : 'No tenants yet'}
              </p>
              {(activeFilter !== 'all' || riskFilter !== 'all' || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={() => { setActiveFilter('all'); setRiskFilter('all'); setSearch(''); }}
                >
                  Reset filters
                </Button>
              )}
            </div>
          ) : (
            processedTenants.map((tenant) => {
              const isExpanded = expandedTenantId === tenant.id;
              const requests = tenantRequests[tenant.id] || [];
              const isLoadingThis = loadingRequests === tenant.id;
              const balance = tenantBalances[tenant.id] || 0;
              const totals = tenantTotals[tenant.id] || { total: 0, paid: 0 };
              const progressPct = totals.total > 0 ? Math.min(100, Math.round((totals.paid / totals.total) * 100)) : 0;
              const hasDebt = balance > 0;

              return (
                <div
                  key={tenant.id}
                  className={`rounded-2xl border overflow-hidden transition-colors ${
                    hasDebt ? 'border-destructive/20 bg-destructive/[0.03]' : 'border-border/60 bg-card'
                  }`}
                >
                  {/* Tenant row — tap to expand */}
                  <button
                    onClick={() => toggleExpand(tenant.id)}
                    className="w-full p-3.5 text-left active:bg-muted/30 transition-colors"
                    style={{ touchAction: 'manipulation', minHeight: '44px' }}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                        hasDebt ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
                      }`}>
                        {tenant.full_name.charAt(0).toUpperCase()}
                      </div>

                      {/* Name + phone + progress */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-semibold text-base truncate text-primary underline underline-offset-2 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); setProfileTenantId(tenant.id); }}
                        ><Highlight text={tenant.full_name} query={search} /></p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" />
                          <Highlight text={tenant.phone} query={search} />
                        </p>
                        {/* AI ID + risk tier chips (also reflect active risk filter) */}
                        {tenantMeta[tenant.id] && (
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="text-[10px] font-mono font-semibold text-muted-foreground bg-muted/60 rounded-md px-1.5 py-0.5">
                              <Highlight text={tenantMeta[tenant.id].aiId} query={search} />
                            </span>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => e.stopPropagation()}
                                  className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-md px-1.5 py-0.5 bg-muted/60 hover:bg-muted transition-colors cursor-help ${tenantMeta[tenant.id].riskColor}`}
                                  aria-label={`Risk tier: ${tenantMeta[tenant.id].riskLabel}. Tap to see how it's calculated.`}
                                >
                                  <Shield className="h-2.5 w-2.5" />
                                  {tenantMeta[tenant.id].riskLabel}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                side="top"
                                align="start"
                                className="w-72 p-3 text-xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="space-y-2">
                                  <div className="flex items-center gap-1.5 font-bold text-sm">
                                    <Shield className={`h-3.5 w-3.5 ${tenantMeta[tenant.id].riskColor}`} />
                                    How risk is calculated
                                  </div>
                                  <p className="text-muted-foreground leading-relaxed">
                                    Based on this tenant's <span className="font-semibold text-foreground">repayment completion rate</span> across all rent plans.
                                  </p>
                                  <div className="rounded-lg bg-muted/60 p-2 space-y-1">
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Completed plans</span>
                                      <span className="font-mono font-semibold">
                                        {tenantMeta[tenant.id].completedCount} / {tenantMeta[tenant.id].totalRequests}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Completion rate</span>
                                      <span className="font-mono font-semibold">
                                        {tenantMeta[tenant.id].totalRequests > 0
                                          ? `${tenantMeta[tenant.id].completionRate}%`
                                          : 'N/A'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between pt-1 border-t border-border/50">
                                      <span className="text-muted-foreground">Current tier</span>
                                      <span className={`font-semibold ${tenantMeta[tenant.id].riskColor}`}>
                                        {tenantMeta[tenant.id].riskLabel}
                                      </span>
                                    </div>
                                  </div>
                                  <ul className="space-y-1 text-[11px]">
                                    <li className="flex items-center gap-1.5">
                                      <span className="h-2 w-2 rounded-full bg-success shrink-0" />
                                      <span><span className="font-semibold text-success">Good</span> — 80%+ completion</span>
                                    </li>
                                    <li className="flex items-center gap-1.5">
                                      <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                                      <span><span className="font-semibold text-primary">Standard</span> — 50–79% completion</span>
                                    </li>
                                    <li className="flex items-center gap-1.5">
                                      <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
                                      <span><span className="font-semibold text-destructive">Caution</span> — under 50%</span>
                                    </li>
                                    <li className="flex items-center gap-1.5">
                                      <span className="h-2 w-2 rounded-full bg-muted-foreground shrink-0" />
                                      <span><span className="font-semibold text-muted-foreground">New</span> — no rent plans yet</span>
                                    </li>
                                  </ul>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        )}
                        {totals.total > 0 && (
                          <div className="mt-1.5">
                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  progressPct >= 100 ? 'bg-success' : progressPct >= 50 ? 'bg-primary' : 'bg-destructive'
                                }`}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{progressPct}% repaid</p>
                          </div>
                        )}
                      </div>

                      {/* Amount / status */}
                      <div className="shrink-0 text-right">
                         {hasDebt ? (
                          <span className="text-lg font-bold text-destructive font-mono">
                            {formatUGX(balance)}
                          </span>
                        ) : (
                          <Badge className="text-[10px] bg-success/15 text-success border-0">
                            Paid up ✓
                          </Badge>
                        )}
                        {/* Per-tenant offline Field Collect */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); setFieldCollectTarget(tenant); }}
                          className="mt-1.5 h-7 px-2 gap-1 text-[11px] font-semibold border-primary/40 text-primary hover:bg-primary/10"
                          title="Record offline collection"
                        >
                          <Banknote className="h-3 w-3" />
                          Field Collect
                        </Button>
                      </div>
                    </div>
                  </button>

                  {/* ───── Expanded Details ───── */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-border/40"
                      >
                        <div className="p-3.5 space-y-3">
                          {isLoadingThis ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          ) : requests.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">No rent plans yet</p>
                          ) : (
                            requests.map((req) => {
                              const progress = req.total_repayment > 0 ? Math.min((req.amount_repaid / req.total_repayment) * 100, 100) : 0;
                              const owing = Math.max(0, (req.total_repayment || 0) - (req.amount_repaid || 0));

                              return (
                                <div key={req.id} className="bg-muted/30 rounded-xl p-3 space-y-3">
                                  {/* Landlord & Location Info */}
                                  {req.landlord && (
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="bg-background rounded-lg p-2 flex items-start gap-1.5">
                                        <User className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                          <p className="text-[9px] text-muted-foreground">Landlord</p>
                                          <p className="text-xs font-semibold truncate">
                                            <Highlight text={req.landlord.name} query={search} />
                                          </p>
                                        </div>
                                      </div>
                                      <div className="bg-background rounded-lg p-2 flex items-start gap-1.5">
                                        <Home className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                          <p className="text-[9px] text-muted-foreground">House Type</p>
                                          <p className="text-xs font-semibold truncate">{req.landlord.house_category || 'N/A'}</p>
                                        </div>
                                      </div>
                                      <div className="bg-background rounded-lg p-2 flex items-start gap-1.5 col-span-2">
                                        <MapPin className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                          <p className="text-[9px] text-muted-foreground">Location</p>
                                          <p className="text-xs font-semibold truncate">
                                            <Highlight text={req.landlord.property_address || 'N/A'} query={search} />
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* 2×2 Financial summary */}
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-background rounded-lg p-2.5 text-center">
                                      <p className="text-[10px] text-muted-foreground">Rent</p>
                                      <p className="text-sm font-bold font-mono">{formatUGX(req.rent_amount)}</p>
                                    </div>
                                    <div className="bg-background rounded-lg p-2.5 text-center">
                                      <p className="text-[10px] text-muted-foreground">Daily</p>
                                      <p className="text-sm font-bold text-primary font-mono">{formatUGX(req.daily_repayment)}</p>
                                    </div>
                                    <div className="bg-background rounded-lg p-2.5 text-center">
                                      <p className="text-[10px] text-muted-foreground">Paid so far</p>
                                      <p className="text-sm font-bold text-success font-mono">{formatUGX(req.amount_repaid)}</p>
                                    </div>
                                    <div className="bg-background rounded-lg p-2.5 text-center">
                                      <p className="text-[10px] text-muted-foreground">Still owes</p>
                                      <p className={`text-sm font-bold font-mono ${owing > 0 ? 'text-destructive' : 'text-success'}`}>
                                        {owing > 0 ? formatUGX(owing) : 'Paid up ✓'}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Progress bar */}
                                  <div>
                                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                                      <span>{req.duration_days} days</span>
                                      <span className="font-bold">{progress.toFixed(0)}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        transition={{ duration: 0.5, ease: 'easeOut' }}
                                        className={`h-full rounded-full ${progress >= 100 ? 'bg-success' : progress < 30 ? 'bg-destructive' : 'bg-primary'}`}
                                      />
                                    </div>
                                  </div>

                                  {/* Collect button — prominent if owing */}
                                  {owing > 0 && (
                                    <button
                                      onClick={() => {
                                        setCollectTarget({ tenant, reqId: req.id, owing });
                                        setCollectDialogOpen(true);
                                      }}
                                      className="flex items-center justify-center gap-2 h-12 rounded-xl bg-success text-success-foreground font-bold text-sm active:scale-95 transition-transform w-full shadow-sm"
                                      style={{ touchAction: 'manipulation' }}
                                    >
                                      <Banknote className="h-5 w-5" />
                                      Collect Payment — {formatUGX(owing)}
                                    </button>
                                  )}

                                  {/* 2×2 Action Buttons */}
                                  <div className="grid grid-cols-2 gap-2">
                                    <a
                                      href={`tel:${tenant.phone}`}
                                      className="flex items-center justify-center gap-2 h-11 rounded-xl bg-success/10 text-success font-semibold text-sm active:scale-95 transition-transform"
                                      style={{ touchAction: 'manipulation' }}
                                    >
                                      <PhoneCall className="h-4 w-4" />
                                      Call
                                    </a>
                                    <button
                                      onClick={() => handleShareWhatsApp(tenant, req)}
                                      className="flex items-center justify-center gap-2 h-11 rounded-xl bg-primary/10 text-primary font-semibold text-sm active:scale-95 transition-transform"
                                      style={{ touchAction: 'manipulation' }}
                                    >
                                      <MessageCircle className="h-4 w-4" />
                                      WhatsApp
                                    </button>
                                    <button
                                      onClick={() => handleDownloadPdf(tenant, req)}
                                      className="flex items-center justify-center gap-2 h-11 rounded-xl bg-muted text-foreground font-semibold text-sm active:scale-95 transition-transform"
                                      style={{ touchAction: 'manipulation' }}
                                    >
                                      <FileDown className="h-4 w-4" />
                                      PDF
                                    </button>
                                    {req.status === 'completed' ? (
                                      <button
                                        onClick={() => handleRenew(tenant, req)}
                                        disabled={renewingReqId === req.id}
                                        className="flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-95 transition-transform disabled:opacity-60"
                                        style={{ touchAction: 'manipulation' }}
                                      >
                                        {renewingReqId === req.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <RefreshCw className="h-4 w-4" />
                                        )}
                                        {renewingReqId === req.id ? 'Renewing…' : 'Renew'}
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          downloadRentStatement({
                                            tenantName: tenant.full_name, tenantPhone: tenant.phone,
                                            landlordName: req.landlord?.name || 'N/A', propertyAddress: req.landlord?.property_address,
                                            rentAmount: req.rent_amount, totalRepayment: req.total_repayment,
                                            amountRepaid: req.amount_repaid, dailyRepayment: req.daily_repayment,
                                            durationDays: req.duration_days, status: req.status || 'approved',
                                            createdAt: req.created_at, requestId: req.id,
                                          });
                                        }}
                                        className="flex items-center justify-center gap-2 h-11 rounded-xl bg-muted text-foreground font-semibold text-sm active:scale-95 transition-transform"
                                        style={{ touchAction: 'manipulation' }}
                                      >
                                        <FileDown className="h-4 w-4" />
                                        Receipt
                                      </button>
                                    )}
                                  {/* Behavior Card button */}
                                  <button
                                    onClick={() => {
                                      const totalPayments = req.duration_days;
                                      const paidDays = req.daily_repayment > 0 ? Math.floor(req.amount_repaid / req.daily_repayment) : 0;
                                      setBehaviorData({
                                        tenantName: tenant.full_name,
                                        tenantPhone: tenant.phone,
                                        landlordName: req.landlord?.name || 'N/A',
                                        propertyAddress: req.landlord?.property_address || 'N/A',
                                        houseCategory: req.landlord?.house_category || '',
                                        rentAmount: req.rent_amount,
                                        totalRepayment: req.total_repayment,
                                        amountRepaid: req.amount_repaid,
                                        durationDays: req.duration_days,
                                        status: req.status || 'approved',
                                        createdAt: req.created_at,
                                        onTimePayments: paidDays,
                                        latePayments: 0,
                                        missedPayments: Math.max(0, totalPayments - paidDays),
                                      });
                                      setBehaviorCardOpen(true);
                                    }}
                                    className="flex items-center justify-center gap-2 h-10 rounded-xl bg-primary/10 text-primary font-semibold text-xs active:scale-95 transition-transform w-full"
                                    style={{ touchAction: 'manipulation' }}
                                  >
                                    <TrendingUp className="h-4 w-4" />
                                    Share Behavior Card
                                  </button>
                                </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>
        </>
        )}
      </SheetContent>

      <AgentRentRequestDialog
        open={renewDialogOpen}
        onOpenChange={(open) => {
          setRenewDialogOpen(open);
          if (!open) setRenewPrefill(null);
        }}
        onSuccess={() => {
          setRenewDialogOpen(false);
          setRenewPrefill(null);
          fetchTenants();
        }}
        prefillTenantName={renewPrefill?.name}
        prefillTenantPhone={renewPrefill?.phone}
        prefillRentAmount={renewPrefill?.amount}
      />

      <AgentTenantCollectDialog
        open={collectDialogOpen}
        onOpenChange={(open) => {
          setCollectDialogOpen(open);
          if (!open) setCollectTarget(null);
        }}
        tenant={collectTarget ? { id: collectTarget.tenant.id, full_name: collectTarget.tenant.full_name, phone: collectTarget.tenant.phone } : null}
        rentRequestId={collectTarget?.reqId || ''}
        outstandingBalance={collectTarget?.owing || 0}
        onSuccess={() => {
          setCollectDialogOpen(false);
          setCollectTarget(null);
          // Refresh tenant data to show updated balances
          setTenantRequests(prev => {
            const updated = { ...prev };
            if (collectTarget) delete updated[collectTarget.tenant.id];
            return updated;
          });
          fetchTenants();
        }}
      />
      <TenantBehaviorCard
        open={behaviorCardOpen}
        onOpenChange={setBehaviorCardOpen}
        data={behaviorData}
      />
      <TenantFieldCollectDialog
        open={!!fieldCollectTarget}
        onOpenChange={(open) => { if (!open) setFieldCollectTarget(null); }}
        tenantId={fieldCollectTarget?.id || ''}
        tenantName={fieldCollectTarget?.full_name || ''}
        tenantPhone={fieldCollectTarget?.phone || null}
      />
    </Sheet>
  );
}
