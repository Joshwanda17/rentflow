import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Loader2, Search, Phone, PhoneCall, FileDown, MessageCircle, Users, RefreshCw, Banknote, MapPin, Home, User, TrendingUp, ArrowLeft, Shield, ArrowUp, ArrowDown, ArrowUpDown, Wallet, DollarSign, AlertCircle, CheckCircle2, CreditCard, Eye, Building2, SlidersHorizontal, Plus, Check, ChevronsUpDown, Map as MapIcon, Navigation, List } from 'lucide-react';
import { PropertyMapView } from './PropertyMapView';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { formatUGX, calculateRentRepayment } from '@/lib/rentCalculations';
import { generateWelileAiId, getRiskTierLabel } from '@/lib/welileAiId';
import { format, startOfDay, formatDistanceToNowStrict } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadRepaymentPdf, shareRepaymentPdfWhatsApp } from '@/lib/repaymentSchedulePdf';
import { downloadRentStatement, buildRentStatementWhatsApp } from '@/lib/receiptPdf';
import { useToast } from '@/hooks/use-toast';
import AgentRentRequestDialog from './AgentRentRequestDialog';
import { AgentTenantCollectDialog } from './AgentTenantCollectDialog';
import { TenantBehaviorCard } from './TenantBehaviorCard';
import { TenantProfileView } from './TenantProfileView';
import { TenantFieldCollectDialog } from './TenantFieldCollectDialog';
import { AgentRequestPipelineView } from './AgentRequestPipelineView';

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
type SortKey = 'risk' | 'aiId' | 'property' | 'balance' | 'daily' | 'property-daily' | 'property-balance' | 'lastCollected';
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
  const [view, setView] = useState<'tenants' | 'pipeline'>('tenants');
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
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [tenantBalances, setTenantBalances] = useState<Record<string, number>>({});
  const [tenantDaily, setTenantDaily] = useState<Record<string, number>>({});
  const [tenantTotals, setTenantTotals] = useState<Record<string, { total: number; paid: number }>>({});
  const [tenantStatuses, setTenantStatuses] = useState<Record<string, Set<string>>>({});
  const [tenantLastPaid, setTenantLastPaid] = useState<Record<string, { date: string; amount: number }>>({});
  // Per-tenant context for richer search/filter (latest landlord & address)
  const [tenantContext, setTenantContext] = useState<Record<string, { landlordName: string; propertyAddress: string; completedCount: number; totalRequests: number }>>({});
  const [propertyLocations, setPropertyLocations] = useState<Record<string, { lat: number; lng: number; address: string }>>({});
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [renewPrefill, setRenewPrefill] = useState<{ name: string; phone: string; amount: string } | null>(null);
  const [renewingReqId, setRenewingReqId] = useState<string | null>(null);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const [collectTarget, setCollectTarget] = useState<{ tenant: Tenant; reqId: string; owing: number } | null>(null);
  const [fieldCollectTarget, setFieldCollectTarget] = useState<Tenant | null>(null);
  const [behaviorCardOpen, setBehaviorCardOpen] = useState(false);
  const [behaviorData, setBehaviorData] = useState<any>(null);
  const [profileTenantId, setProfileTenantId] = useState<string | null>(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [propertyPickerOpen, setPropertyPickerOpen] = useState(false);
  const [groupByProperty, setGroupByProperty] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [mapMode, setMapMode] = useState(false);
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);
  // "Recent collection" filter — limit to tenants with last cash-in within N days.
  // 'all' = no filter, 'never' = no collections at all, otherwise a window in days.
  const [recentCollectionFilter, setRecentCollectionFilter] = useState<'all' | '1' | '3' | '7' | '14' | '30' | 'never'>('all');
  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Fetch the latest rent_request for a tenant — used to build the most recent
  // repayment receipt for the "Last collected" pill quick actions.
  const fetchLatestRentStatement = useCallback(async (tenant: Tenant) => {
    const { data, error } = await supabase
      .from('rent_requests')
      .select('id, rent_amount, total_repayment, amount_repaid, daily_repayment, duration_days, status, created_at, landlord:landlords(name, property_address)')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const req: any = data;
    return {
      tenantName: tenant.full_name,
      tenantPhone: tenant.phone,
      landlordName: req.landlord?.name || 'N/A',
      propertyAddress: req.landlord?.property_address,
      rentAmount: Number(req.rent_amount || 0),
      totalRepayment: Number(req.total_repayment || 0),
      amountRepaid: Number(req.amount_repaid || 0),
      dailyRepayment: Number(req.daily_repayment || 0),
      durationDays: Number(req.duration_days || 0),
      status: req.status || 'approved',
      createdAt: req.created_at,
      requestId: req.id,
    };
  }, []);

  const handleDownloadLastReceipt = async (tenant: Tenant) => {
    setReceiptLoadingId(tenant.id);
    try {
      const data = await fetchLatestRentStatement(tenant);
      if (!data) {
        toast({ title: 'No receipt available', description: 'No rent plan found for this tenant.', variant: 'destructive' });
        return;
      }
      await downloadRentStatement(data);
    } catch (e: any) {
      toast({ title: 'Failed to open receipt', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setReceiptLoadingId(null);
    }
  };

  const handleShareLastReceiptWhatsApp = async (tenant: Tenant) => {
    setReceiptLoadingId(tenant.id);
    try {
      const data = await fetchLatestRentStatement(tenant);
      if (!data) {
        toast({ title: 'No receipt available', description: 'No rent plan found for this tenant.', variant: 'destructive' });
        return;
      }
      const text = buildRentStatementWhatsApp(data);
      const phone = (tenant.phone || '').replace(/\D/g, '');
      const url = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
        : `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast({ title: 'Failed to share', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setReceiptLoadingId(null);
    }
  };

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

      // Strict allowlist: only tenants explicitly tied to this agent via
      // referrer_id, referrals table, or rent_requests.agent_id. Admin RLS
      // policies (manager/cfo/super_admin) would otherwise bleed every
      // platform profile into this view for staff who also hold those roles.
      const allowedIds = new Set<string>([
        ...referredTenants.map(t => t.id),
        ...extraTenantIds,
      ]);
      const mergedById = new Map<string, Tenant>();
      for (const t of [...referredTenants, ...extraTenants]) {
        if (allowedIds.has(t.id)) mergedById.set(t.id, t);
      }
      const tenantList = Array.from(mergedById.values());
      if (tenantList.length > allowedIds.size) {
        console.warn('[AgentTenantsSheet] tenant list exceeded allowlist size', {
          listSize: tenantList.length,
          allowedSize: allowedIds.size,
        });
      }
      setTenants(tenantList);

      if (tenantList.length > 0) {
        const tenantIds = tenantList.map(t => t.id);
        const { data: rentRequests } = await supabase
          .from('rent_requests')
          .select('tenant_id, total_repayment, amount_repaid, daily_repayment, status, created_at, landlord:landlords(name, property_address, latitude, longitude)')
          .in('tenant_id', tenantIds)
          .in('status', ['pending', 'approved', 'funded', 'disbursed', 'repaying', 'completed'])
          .order('created_at', { ascending: false });

        const balances: Record<string, number> = {};
        const daily: Record<string, number> = {};
        const totals: Record<string, { total: number; paid: number }> = {};
        const statusMap: Record<string, Set<string>> = {};
        const ctx: Record<string, { landlordName: string; propertyAddress: string; completedCount: number; totalRequests: number }> = {};
        const locs: Record<string, { lat: number; lng: number; address: string }> = {};
        (rentRequests || []).forEach((rr: any) => {
          const owing = (rr.total_repayment || 0) - (rr.amount_repaid || 0);
          balances[rr.tenant_id] = (balances[rr.tenant_id] || 0) + Math.max(0, owing);
          // Sum daily expected only from active (still-owing) cycles
          if (owing > 0 && ['approved', 'funded', 'disbursed', 'repaying'].includes(rr.status)) {
            daily[rr.tenant_id] = (daily[rr.tenant_id] || 0) + Number(rr.daily_repayment || 0);
          }
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
          // Capture lat/lng once per property address (latest-first wins)
          const addr = rr.landlord?.property_address?.trim();
          const lat = Number(rr.landlord?.latitude);
          const lng = Number(rr.landlord?.longitude);
          if (addr && Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 && !locs[addr]) {
            locs[addr] = { lat, lng, address: addr };
          }
          ctx[rr.tenant_id].totalRequests += 1;
          // Only count a rent plan as truly completed when the tenant has fully
          // repaid — guards against rows mis-marked 'completed' upstream.
          const totalRep = Number(rr.total_repayment || 0);
          const repaid = Number(rr.amount_repaid || 0);
          if (rr.status === 'completed' && totalRep > 0 && repaid >= totalRep) {
            ctx[rr.tenant_id].completedCount += 1;
          }
        });
        setTenantBalances(balances);
        setTenantDaily(daily);
        setTenantTotals(totals);
        setTenantStatuses(statusMap);
        setTenantContext(ctx);
        setPropertyLocations(locs);

        // Most recent cash-in per tenant (for "Last collected" indicator)
        const { data: recentRepayments } = await supabase
          .from('repayments')
          .select('tenant_id, amount, created_at')
          .in('tenant_id', tenantIds)
          .order('created_at', { ascending: false })
          .limit(1000);
        const lastPaid: Record<string, { date: string; amount: number }> = {};
        (recentRepayments || []).forEach((r: any) => {
          if (!lastPaid[r.tenant_id]) {
            lastPaid[r.tenant_id] = { date: r.created_at, amount: Number(r.amount || 0) };
          }
        });
        setTenantLastPaid(lastPaid);
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
    if (propertyFilter !== 'all') {
      list = list.filter(t => (tenantContext[t.id]?.propertyAddress || '') === propertyFilter);
    }
    if (recentCollectionFilter !== 'all') {
      if (recentCollectionFilter === 'never') {
        list = list.filter(t => !tenantLastPaid[t.id]?.date);
      } else {
        const days = parseInt(recentCollectionFilter, 10);
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        list = list.filter(t => {
          const d = tenantLastPaid[t.id]?.date;
          return d ? new Date(d).getTime() >= cutoff : false;
        });
      }
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
        case 'property-daily':
        case 'property-balance': {
          const pa = (tenantContext[a.id]?.propertyAddress ?? '').toLowerCase();
          const pb = (tenantContext[b.id]?.propertyAddress ?? '').toLowerCase();
          if (!pa && pb) return 1;
          if (pa && !pb) return -1;
          const pcmp = pa.localeCompare(pb);
          if (pcmp !== 0) return pcmp; // property always ascending
          const va = sortKey === 'property-daily' ? (tenantDaily[a.id] || 0) : (tenantBalances[a.id] || 0);
          const vb = sortKey === 'property-daily' ? (tenantDaily[b.id] || 0) : (tenantBalances[b.id] || 0);
          cmp = va - vb;
          break;
        }
        case 'balance':
        default: {
          cmp = (tenantBalances[a.id] || 0) - (tenantBalances[b.id] || 0);
          break;
        }
        case 'daily': {
          cmp = (tenantDaily[a.id] || 0) - (tenantDaily[b.id] || 0);
          break;
        }
        case 'lastCollected': {
          const ta = tenantLastPaid[a.id]?.date ? new Date(tenantLastPaid[a.id].date).getTime() : 0;
          const tb = tenantLastPaid[b.id]?.date ? new Date(tenantLastPaid[b.id].date).getTime() : 0;
          // Push tenants with no collection to the bottom regardless of direction
          if (!ta && tb) return 1;
          if (ta && !tb) return -1;
          cmp = ta - tb;
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
  }, [tenants, search, activeFilter, riskFilter, sortKey, sortDir, tenantBalances, tenantDaily, tenantStatuses, tenantContext, tenantMeta, tenantLastPaid, recentCollectionFilter, propertyFilter]);

  const propertyOptions = useMemo(() => {
    const set = new Set<string>();
    Object.values(tenantContext).forEach(c => {
      if (c?.propertyAddress) set.add(c.propertyAddress);
    });
    return Array.from(set).sort();
  }, [tenantContext]);

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

          {/* Top-level view toggle: live tenants vs request pipeline */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/50">
            <button
              onClick={() => setView('tenants')}
              className={`py-2 rounded-lg text-sm font-semibold transition-all ${
                view === 'tenants' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              }`}
              style={{ touchAction: 'manipulation', minHeight: '40px' }}
            >
              Tenants
            </button>
            <button
              onClick={() => setView('pipeline')}
              className={`py-2 rounded-lg text-sm font-semibold transition-all ${
                view === 'pipeline' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              }`}
              style={{ touchAction: 'manipulation', minHeight: '40px' }}
            >
              Submissions
            </button>
          </div>

          {view === 'tenants' && (
          <>
          {/* Stat cards row — exec-dashboard style */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              { icon: Users, label: 'Total Tenants', value: String(stats.total), sub: 'All tenants', bg: 'bg-violet-100', fg: 'text-violet-600' },
              { icon: Wallet, label: 'Owing', value: String(stats.owingCount), sub: 'Tenants owing', bg: 'bg-amber-100', fg: 'text-amber-600', subClass: 'text-rose-600 font-medium' },
              { icon: DollarSign, label: 'Collected', value: formatUGX(Object.values(tenantTotals).reduce((s, v) => s + (v?.paid || 0), 0)), sub: 'Lifetime', bg: 'bg-emerald-100', fg: 'text-emerald-600' },
              { icon: AlertCircle, label: 'Overdue Amount', value: formatUGX(stats.totalOwing), sub: `From ${stats.owingCount} tenants`, bg: 'bg-rose-100', fg: 'text-rose-600', subClass: 'text-rose-600 font-medium' },
              { icon: TrendingUp, label: 'Occupancy', value: stats.total > 0 ? `${Math.round((stats.paidUpCount + stats.owingCount) / stats.total * 100)}%` : '0%', sub: 'Active cycles', bg: 'bg-sky-100', fg: 'text-sky-600', subClass: 'text-emerald-600 font-medium' },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className={`h-10 w-10 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-4 w-4 ${s.fg}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
                      <p className="text-base font-bold leading-tight truncate">{s.value}</p>
                      <p className={`text-[10px] leading-tight ${s.subClass || 'text-muted-foreground'}`}>{s.sub}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Search — always visible, big and obvious */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-12 rounded-xl bg-muted/40 border-transparent focus-visible:ring-1 focus-visible:ring-primary/30 text-base"
                style={{ fontSize: '16px' }}
                aria-label="Search tenants"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-base p-1"
                  aria-label="Clear search"
                >✕</button>
              )}
            </div>

            {/* Big tap-friendly status chips — the main filter most agents need */}
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-muted/50">
              {filterTabs.map((tab) => {
                const active = activeFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveFilter(tab.key)}
                    className={`py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
                      active ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                    }`}
                    style={{ touchAction: 'manipulation', minHeight: '44px' }}
                  >
                    <span>{tab.label}</span>
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded-md ${
                      active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>{tab.count}</span>
                  </button>
                );
              })}
            </div>

            {/* "More filters" toggle — keeps the page calm on small screens */}
            <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMoreFilters(v => !v)}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              style={{ touchAction: 'manipulation', minHeight: '36px' }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {showMoreFilters ? 'Hide filters' : 'More filters & sorting'}
              {(riskFilter !== 'all' || propertyFilter !== 'all') && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {[riskFilter !== 'all', propertyFilter !== 'all'].filter(Boolean).length}
                </Badge>
              )}
            </button>
            <button
              onClick={() => { setGroupByProperty(v => !v); setCollapsedGroups(new Set()); if (mapMode) setMapMode(false); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                groupByProperty
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
              style={{ touchAction: 'manipulation', minHeight: '36px' }}
              aria-pressed={groupByProperty}
            >
              <Building2 className="h-3.5 w-3.5" />
              {groupByProperty ? 'Grouped by property' : 'Group by property'}
            </button>
            <button
              onClick={() => setMapMode(v => !v)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                mapMode
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
              style={{ touchAction: 'manipulation', minHeight: '36px' }}
              aria-pressed={mapMode}
            >
              {mapMode ? <List className="h-3.5 w-3.5" /> : <MapIcon className="h-3.5 w-3.5" />}
              {mapMode ? 'List view' : 'Map view'}
            </button>
            </div>

            {showMoreFilters && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as RiskFilter)}>
              <SelectTrigger className="w-[140px] h-10 rounded-xl">
                <div className="text-left">
                  <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Risk Level</p>
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="caution">Caution</SelectItem>
                <SelectItem value="new">New</SelectItem>
              </SelectContent>
            </Select>
            <Popover open={propertyPickerOpen} onOpenChange={setPropertyPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="h-10 rounded-xl justify-between font-normal px-3"
                >
                  <div className="text-left min-w-0">
                    <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Property</p>
                    <p className="text-sm truncate">
                      {propertyFilter === 'all' ? 'All Properties' : propertyFilter}
                    </p>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[min(92vw,320px)]" align="start">
                <Command>
                  <CommandInput placeholder="Search property name or address…" className="h-10" />
                  <CommandList>
                    <CommandEmpty>No matching property.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="All Properties"
                        onSelect={() => { setPropertyFilter('all'); setPropertyPickerOpen(false); }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${propertyFilter === 'all' ? 'opacity-100' : 'opacity-0'}`} />
                        All Properties
                      </CommandItem>
                      {propertyOptions.map(p => (
                        <CommandItem
                          key={p}
                          value={p}
                          onSelect={() => { setPropertyFilter(p); setPropertyPickerOpen(false); }}
                        >
                          <Check className={`mr-2 h-4 w-4 shrink-0 ${propertyFilter === p ? 'opacity-100' : 'opacity-0'}`} />
                          <span className="truncate">{p}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Select value={`${sortKey}-${sortDir}`} onValueChange={(v) => {
              const idx = v.lastIndexOf('-');
              const k = v.slice(0, idx) as SortKey;
              const d = v.slice(idx + 1) as SortDir;
              setSortKey(k); setSortDir(d);
            }}>
              <SelectTrigger className="col-span-2 h-10 rounded-xl">
                <div className="text-left">
                  <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Sort By</p>
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="balance-desc">Balance (High → Low)</SelectItem>
                <SelectItem value="balance-asc">Balance (Low → High)</SelectItem>
                <SelectItem value="daily-desc">Daily Expected (High → Low)</SelectItem>
                <SelectItem value="daily-asc">Daily Expected (Low → High)</SelectItem>
                <SelectItem value="risk-desc">Risk (Worst first)</SelectItem>
                <SelectItem value="aiId-asc">AI ID (A → Z)</SelectItem>
                <SelectItem value="property-asc">Property (A → Z)</SelectItem>
                <SelectItem value="property-daily-desc">Property, then Daily (High → Low)</SelectItem>
                <SelectItem value="property-daily-asc">Property, then Daily (Low → High)</SelectItem>
                <SelectItem value="property-balance-desc">Property, then Balance (High → Low)</SelectItem>
                <SelectItem value="property-balance-asc">Property, then Balance (Low → High)</SelectItem>
                <SelectItem value="lastCollected-desc">Last collected (Recent → Oldest)</SelectItem>
                <SelectItem value="lastCollected-asc">Last collected (Oldest → Recent)</SelectItem>
              </SelectContent>
            </Select>
              </div>
            )}
          </div>

          {/* Top properties — quick-switch chips (horizontal scroll on mobile) */}
          {(() => {
            const counts = new Map<string, number>();
            tenants.forEach(t => {
              const a = tenantContext[t.id]?.propertyAddress?.trim();
              if (a) counts.set(a, (counts.get(a) || 0) + 1);
            });
            const top = Array.from(counts.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6);
            if (top.length < 2) return null;
            return (
              <div className="-mx-4 px-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex items-center gap-1.5 w-max pb-1">
                  <button
                    onClick={() => setPropertyFilter('all')}
                    className={`shrink-0 h-8 px-3 rounded-full text-xs font-semibold border transition-colors ${
                      propertyFilter === 'all'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-border hover:bg-muted'
                    }`}
                    style={{ touchAction: 'manipulation' }}
                  >
                    All
                  </button>
                  {top.map(([addr, count]) => {
                    const active = propertyFilter === addr;
                    return (
                      <button
                        key={addr}
                        onClick={() => setPropertyFilter(active ? 'all' : addr)}
                        title={addr}
                        className={`shrink-0 h-8 pl-3 pr-2 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors max-w-[180px] ${
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-foreground border-border hover:bg-muted'
                        }`}
                        style={{ touchAction: 'manipulation' }}
                      >
                        <Building2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{addr}</span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                          active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground'
                        }`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {stats.totalOwing > 0 && (
            <p className="text-xs text-muted-foreground">
              Total owed: <span className="font-bold text-destructive font-mono">{formatUGX(stats.totalOwing)}</span>
            </p>
          )}
          </>
          )}
        </div>

        {/* ───── Body ───── */}
        {view === 'pipeline' ? (
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <AgentRequestPipelineView />
          </div>
        ) : mapMode ? (
          <div className="flex-1 overflow-hidden px-4 py-3">
            <PropertyMapView
              tenants={processedTenants}
              tenantContext={tenantContext}
              tenantBalances={tenantBalances}
              tenantDaily={tenantDaily}
              propertyLocations={propertyLocations}
              onSelectTenant={(id) => setProfileTenantId(id)}
            />
          </div>
        ) : (
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
          ) : (() => {
            const tenantCards = processedTenants.map((tenant) => {
              const isExpanded = expandedTenantId === tenant.id;
              const requests = tenantRequests[tenant.id] || [];
              const isLoadingThis = loadingRequests === tenant.id;
              const balance = tenantBalances[tenant.id] || 0;
              const totals = tenantTotals[tenant.id] || { total: 0, paid: 0 };
              const progressPct = totals.total > 0 ? Math.min(100, Math.round((totals.paid / totals.total) * 100)) : 0;
              const hasDebt = balance > 0;
              const meta = tenantMeta[tenant.id];
              const ctx = tenantContext[tenant.id];
              const propertyAddress = ctx?.propertyAddress || '';
              const landlordName = ctx?.landlordName || '';
              const payStatus: 'paid_up' | 'owing' = hasDebt ? 'owing' : 'paid_up';
              const statusMeta = payStatus === 'paid_up'
                ? { label: 'Paid up', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', Icon: CheckCircle2 }
                : { label: 'Owing',   cls: 'bg-rose-100 text-rose-700 border-rose-200',          dot: 'bg-rose-500',   Icon: AlertCircle };
              const riskUiMeta: Record<string, { label: string; cls: string }> = {
                good:     { label: 'Low Risk',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                standard: { label: 'Medium Risk', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                caution:  { label: 'High Risk',   cls: 'bg-rose-50 text-rose-700 border-rose-200' },
                new:      { label: 'New Member',  cls: 'bg-muted text-muted-foreground border-border' },
              };
              const riskUi = riskUiMeta[meta?.riskLevel ?? 'new'];
              const reliabilityMeta = meta?.completionRate >= 80
                ? { label: 'Pays on time', cls: 'bg-emerald-50 text-emerald-700' }
                : meta?.completionRate >= 50
                  ? { label: 'Usually late', cls: 'bg-amber-50 text-amber-700' }
                  : meta?.totalRequests > 0
                    ? { label: 'Frequently late', cls: 'bg-rose-50 text-rose-700' }
                    : { label: 'New', cls: 'bg-muted text-muted-foreground' };
              const progressColor = progressPct >= 100 ? 'bg-emerald-500' : hasDebt ? 'bg-rose-500' : 'bg-primary';
              const StatusIcon = statusMeta.Icon;

              return { tenant, el: (
                <div
                  key={tenant.id}
                  className="rounded-2xl border border-border/60 bg-card overflow-hidden transition-shadow hover:shadow-md"
                >
                  {/* Tenant row — mobile-first; tap row to expand, tap name for full profile */}
                  <button
                    onClick={() => toggleExpand(tenant.id)}
                    className="w-full p-3.5 text-left active:bg-muted/30 transition-colors"
                    style={{ touchAction: 'manipulation', minHeight: '64px' }}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                        <div className="relative">
                          <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-base font-bold ${
                            hasDebt ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {(tenant.full_name?.trim()?.charAt(0) || tenant.phone?.charAt(0) || '?').toUpperCase()}
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${statusMeta.dot}`} />
                        </div>

                      {/* Name + phone (name → opens full profile) */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-semibold truncate text-primary underline underline-offset-2 cursor-pointer text-[15px] leading-tight"
                          onClick={(e) => { e.stopPropagation(); setProfileTenantId(tenant.id); }}
                        >
                            {tenant.full_name && tenant.full_name.trim() ? (
                              <Highlight text={tenant.full_name.trim()} query={search} />
                            ) : (
                              <span className="text-muted-foreground italic">Unnamed tenant</span>
                            )}
                          </p>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate mt-0.5">
                            <Phone className="h-3 w-3" />
                            <Highlight text={tenant.phone} query={search} />
                          {propertyAddress && (
                            <span className="truncate">· {propertyAddress}</span>
                          )}
                          </p>
                      </div>

                      {/* Amount due + daily expected */}
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none">Due</p>
                        <p className={`font-bold font-mono text-[15px] leading-tight ${hasDebt ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {hasDebt ? formatUGX(balance) : 'UGX 0'}
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                          {formatUGX(tenantDaily[tenant.id] || 0)}/day
                        </p>
                      </div>
                    </div>

                    {/* Quick actions row — mobile-friendly tap targets */}
                    {tenantLastPaid[tenant.id] ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-2 w-full flex items-center justify-between gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 active:scale-[0.99] transition-transform hover:bg-emerald-100"
                            style={{ touchAction: 'manipulation' }}
                            aria-label="Open latest receipt"
                          >
                            <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                              {receiptLoadingId === tenant.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3" />
                              )}
                              Last collected
                            </span>
                            <span className="text-[11px] font-mono font-bold text-emerald-700">
                              +{formatUGX(tenantLastPaid[tenant.id].amount)}
                              <span className="font-sans font-normal text-emerald-600/80 ml-1.5">
                                · {formatDistanceToNowStrict(new Date(tenantLastPaid[tenant.id].date), { addSuffix: true })}
                              </span>
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-56 p-2"
                          align="end"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <p className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Latest receipt
                          </p>
                          <button
                            type="button"
                            onClick={() => handleDownloadLastReceipt(tenant)}
                            disabled={receiptLoadingId === tenant.id}
                            className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted active:bg-muted disabled:opacity-60"
                          >
                            <FileDown className="h-4 w-4" />
                            Download PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => handleShareLastReceiptWhatsApp(tenant)}
                            disabled={receiptLoadingId === tenant.id}
                            className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted active:bg-muted disabled:opacity-60"
                          >
                            <MessageCircle className="h-4 w-4 text-emerald-600" />
                            Share via WhatsApp
                          </button>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-muted/40 border border-border/40 px-2.5 py-1.5">
                        <AlertCircle className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          No collections yet
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setFieldCollectTarget(tenant); }}
                        className="h-9 gap-1.5 rounded-lg text-xs"
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        Collect
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tenant.phone) window.open(`https://wa.me/${tenant.phone.replace(/\D/g, '')}`, '_blank');
                        }}
                        className="h-9 gap-1.5 rounded-lg text-xs"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Message
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setProfileTenantId(tenant.id); }}
                        className="h-9 gap-1.5 rounded-lg text-xs"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Profile
                      </Button>
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
                          {/* Next 7-day collection plan — quick mobile planner */}
                          {(tenantDaily[tenant.id] || 0) > 0 && (() => {
                            const daily = tenantDaily[tenant.id] || 0;
                            const weekTotal = daily * 7;
                            const cap = Math.min(weekTotal, balance);
                            const today = new Date();
                            const days = Array.from({ length: 7 }, (_, i) => {
                              const d = new Date(today);
                              d.setDate(today.getDate() + i);
                              return d;
                            });
                            let running = 0;
                            return (
                              <div className="rounded-xl border border-border/60 bg-background p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    Next 7 days
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    Plan: <span className="font-bold font-mono text-foreground">{formatUGX(cap)}</span>
                                  </p>
                                </div>
                                <div className="grid grid-cols-7 gap-1.5">
                                  {days.map((d, i) => {
                                    const isToday = i === 0;
                                    running += daily;
                                    const beyondDebt = running > balance && balance > 0;
                                    return (
                                      <div
                                        key={i}
                                        className={`rounded-lg p-1.5 text-center border ${
                                          isToday
                                            ? 'bg-primary/10 border-primary/30'
                                            : beyondDebt
                                              ? 'bg-muted/30 border-border/40 opacity-60'
                                              : 'bg-muted/40 border-border/40'
                                        }`}
                                      >
                                        <p className="text-[9px] font-semibold text-muted-foreground uppercase">
                                          {format(d, 'EEE')}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground leading-tight">
                                          {format(d, 'd MMM')}
                                        </p>
                                        <p className={`text-[10px] font-bold font-mono mt-0.5 leading-tight ${
                                          isToday ? 'text-primary' : 'text-foreground'
                                        }`}>
                                          {formatUGX(daily)}
                                        </p>
                                      </div>
                                    );
                                  })}
                                </div>
                                {balance > 0 && weekTotal > balance && (
                                  <p className="text-[10px] text-muted-foreground mt-2">
                                    Remaining debt clears in ~{Math.ceil(balance / daily)} day{Math.ceil(balance / daily) !== 1 ? 's' : ''}.
                                  </p>
                                )}
                              </div>
                            );
                          })()}
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
              ) };
            });

            if (!groupByProperty) {
              return tenantCards.map(c => c.el);
            }

            // Group cards by property address. Tenants without a property
            // fall into a single "No property assigned" bucket so nothing is hidden.
            const groups = new Map<string, typeof tenantCards>();
            for (const c of tenantCards) {
              const key = tenantContext[c.tenant.id]?.propertyAddress?.trim() || 'No property assigned';
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(c);
            }

            return Array.from(groups.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([property, items]) => {
                const isCollapsed = collapsedGroups.has(property);
                const groupOwing = items.reduce((s, c) => s + (tenantBalances[c.tenant.id] || 0), 0);
                const groupDaily = items.reduce((s, c) => s + (tenantDaily[c.tenant.id] || 0), 0);
                return (
                  <div key={property} className="rounded-2xl border border-border/60 bg-muted/20 overflow-hidden">
                    <button
                      onClick={() => toggleGroup(property)}
                      className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:bg-muted/40 transition-colors"
                      style={{ touchAction: 'manipulation', minHeight: '56px' }}
                      aria-expanded={!isCollapsed}
                    >
                      <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate leading-tight">{property}</p>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {items.length} tenant{items.length !== 1 ? 's' : ''}
                          {groupDaily > 0 && <> · {formatUGX(groupDaily)}/day expected</>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none">Owing</p>
                        <p className={`text-sm font-bold font-mono leading-tight ${groupOwing > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {groupOwing > 0 ? formatUGX(groupOwing) : 'UGX 0'}
                        </p>
                      </div>
                      {isCollapsed
                        ? <ArrowDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ArrowUp className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </button>
                    {!isCollapsed && (
                      <div className="p-2 pt-0 space-y-2 bg-background/40">
                        {items.map(c => c.el)}
                      </div>
                    )}
                  </div>
                );
              });
          })()}
        </div>
        )}
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
