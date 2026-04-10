import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, User, Phone, PhoneCall, Calendar, ChevronDown, ChevronUp, FileDown, MessageCircle, Banknote, Receipt, AlertTriangle, CheckCircle2, Clock, Users, Share2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, startOfDay, formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadRepaymentPdf, shareRepaymentPdfWhatsApp } from '@/lib/repaymentSchedulePdf';
import { NoSmartphoneScheduleManager } from './NoSmartphoneScheduleManager';
import { downloadRentStatement, buildRentStatementWhatsApp } from '@/lib/receiptPdf';
import { shareViaWhatsApp } from '@/lib/shareReceipt';
import { useToast } from '@/hooks/use-toast';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import AgentRentRequestDialog from './AgentRentRequestDialog';
import { RefreshCw } from 'lucide-react';

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
  landlord?: { name: string; property_address: string } | null;
}

interface AgentTenantsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AgentPaymentSummary {
  total: number;
  lastPaidAt: string | null;
}

type FilterTab = 'all' | 'owing' | 'active' | 'cleared' | 'new' | 'no-phone';
type SortMode = 'balance' | 'name' | 'recent';

function buildScheduleDays(startDate: string, durationDays: number) {
  const start = startOfDay(new Date(startDate));
  const days = [];
  for (let i = 0; i < Math.min(durationDays, 10); i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

export function AgentTenantsSheet({ open, onOpenChange }: AgentTenantsSheetProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);
  const [tenantRequests, setTenantRequests] = useState<Record<string, TenantRentRequest[]>>({});
  const [loadingRequests, setLoadingRequests] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('owing');
  const [sortMode, setSortMode] = useState<SortMode>('balance');
  const [tenantBalances, setTenantBalances] = useState<Record<string, number>>({});
  const [tenantTotals, setTenantTotals] = useState<Record<string, { total: number; paid: number }>>({});
  const [agentPayments, setAgentPayments] = useState<Record<string, AgentPaymentSummary>>({});
  const [noSmartphoneMap, setNoSmartphoneMap] = useState<Record<string, boolean>>({});
  const [tenantStatuses, setTenantStatuses] = useState<Record<string, Set<string>>>({});
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [renewPrefill, setRenewPrefill] = useState<{ name: string; phone: string; amount: string } | null>(null);

  useEffect(() => {
    if (open && user) fetchTenants();
    if (!open) setExpandedTenantId(null);
  }, [open, user]);

  const fetchTenants = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch tenants linked via referrer_id
      const { data: referredData, error: refErr } = await supabase
        .from('profiles')
        .select('id, full_name, phone, email, created_at, monthly_rent, verified')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });

      if (refErr) throw refErr;
      const referredTenants = referredData || [];

      // Also fetch tenants linked via rent_requests.agent_id
      const { data: agentRequests } = await supabase
        .from('rent_requests')
        .select('tenant_id')
        .eq('agent_id', user.id);

      const referredIds = new Set(referredTenants.map(t => t.id));
      const extraTenantIds = (agentRequests || [])
        .map(r => r.tenant_id)
        .filter(id => !referredIds.has(id));

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
        const [{ data: rentRequests }, { data: walletDeposits }] = await Promise.all([
          supabase
            .from('rent_requests')
            .select('tenant_id, total_repayment, amount_repaid, status, tenant_no_smartphone')
            .in('tenant_id', tenantIds)
            .in('status', ['pending', 'approved', 'funded', 'disbursed', 'repaying', 'completed']),
          supabase
            .from('wallet_deposits')
            .select('user_id, amount, created_at')
            .eq('agent_id', user.id)
            .in('user_id', tenantIds)
            .order('created_at', { ascending: false }),
        ]);

        const balances: Record<string, number> = {};
        const totals: Record<string, { total: number; paid: number }> = {};
        const paymentMap: Record<string, AgentPaymentSummary> = {};
        const phoneMap: Record<string, boolean> = {};
        const statusMap: Record<string, Set<string>> = {};
        (rentRequests || []).forEach(rr => {
          const owing = (rr.total_repayment || 0) - (rr.amount_repaid || 0);
          balances[rr.tenant_id] = (balances[rr.tenant_id] || 0) + Math.max(0, owing);
          const prev = totals[rr.tenant_id] || { total: 0, paid: 0 };
          totals[rr.tenant_id] = { total: prev.total + (rr.total_repayment || 0), paid: prev.paid + (rr.amount_repaid || 0) };
          if (rr.tenant_no_smartphone) phoneMap[rr.tenant_id] = true;
          if (!statusMap[rr.tenant_id]) statusMap[rr.tenant_id] = new Set();
          if (rr.status) statusMap[rr.tenant_id].add(rr.status);
        });
        (walletDeposits || []).forEach((deposit) => {
          const existing = paymentMap[deposit.user_id] || { total: 0, lastPaidAt: null };
          paymentMap[deposit.user_id] = {
            total: existing.total + Number(deposit.amount || 0),
            lastPaidAt: existing.lastPaidAt || deposit.created_at,
          };
        });
        setTenantBalances(balances);
        setTenantTotals(totals);
        setAgentPayments(paymentMap);
        setNoSmartphoneMap(phoneMap);
        setTenantStatuses(statusMap);
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
        .select('id, rent_amount, total_repayment, duration_days, daily_repayment, amount_repaid, status, created_at, disbursed_at, landlord:landlords(name, property_address)')
        .eq('tenant_id', tenantId)
        .in('status', ['approved', 'disbursed', 'repaying', 'completed'])
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

  // Filtered & sorted tenants
  const processedTenants = useMemo(() => {
    let list = tenants.filter(t =>
      t.full_name.toLowerCase().includes(search.toLowerCase()) ||
      t.phone.includes(search)
    );

    const activeStatuses = new Set(['approved', 'funded', 'disbursed', 'repaying']);

    switch (activeFilter) {
      case 'owing':
        list = list.filter(t => (tenantBalances[t.id] || 0) > 0);
        break;
      case 'all':
        list = list.filter(t => tenantStatuses[t.id] && tenantStatuses[t.id].size > 0);
        break;
      case 'active':
        list = list.filter(t => {
          const statuses = tenantStatuses[t.id];
          if (!statuses) return false;
          return [...statuses].some(s => activeStatuses.has(s));
        });
        break;
      case 'cleared':
        list = list.filter(t => {
          const statuses = tenantStatuses[t.id];
          if (!statuses) return false;
          return statuses.has('completed') || ((tenantBalances[t.id] || 0) === 0 && [...statuses].some(s => activeStatuses.has(s)));
        });
        break;
      case 'new':
        list = list.filter(t => tenantStatuses[t.id]?.has('pending'));
        break;
      case 'no-phone':
        list = list.filter(t => noSmartphoneMap[t.id]);
        break;
    }

    list.sort((a, b) => {
      switch (sortMode) {
        case 'balance': return (tenantBalances[b.id] || 0) - (tenantBalances[a.id] || 0);
        case 'name': return a.full_name.localeCompare(b.full_name);
        case 'recent': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default: return 0;
      }
    });

    return list;
  }, [tenants, search, activeFilter, sortMode, tenantBalances, noSmartphoneMap, tenantStatuses]);

  // Stats
  const stats = useMemo(() => {
    const activeStatuses = new Set(['approved', 'funded', 'disbursed', 'repaying']);
    const totalOwing = Object.values(tenantBalances).reduce((s, v) => s + v, 0);
    const owingCount = Object.values(tenantBalances).filter(v => v > 0).length;
    const allCount = tenants.filter(t => tenantStatuses[t.id] && tenantStatuses[t.id].size > 0).length;
    const activeCount = tenants.filter(t => {
      const s = tenantStatuses[t.id];
      return s && [...s].some(st => activeStatuses.has(st));
    }).length;
    const clearedCount = tenants.filter(t => {
      const s = tenantStatuses[t.id];
      if (!s) return false;
      return s.has('completed') || ((tenantBalances[t.id] || 0) === 0 && [...s].some(st => activeStatuses.has(st)));
    }).length;
    const noPhoneCount = Object.values(noSmartphoneMap).filter(Boolean).length;
    const newCount = tenants.filter(t => tenantStatuses[t.id]?.has('pending')).length;
    return { totalOwing, owingCount, total: tenants.length, noPhoneCount, clearedCount, newCount, allCount, activeCount };
  }, [tenants, tenantBalances, noSmartphoneMap, tenantStatuses]);

  const filterTabs: { key: FilterTab; label: string; emoji: string; count: number; color: string; activeColor: string }[] = [
    { key: 'owing', label: 'Owing', emoji: '🔴', count: stats.owingCount, color: 'text-destructive', activeColor: 'bg-destructive text-destructive-foreground' },
    { key: 'all', label: 'All', emoji: '👥', count: stats.allCount, color: 'text-foreground', activeColor: 'bg-primary text-primary-foreground' },
    { key: 'active', label: 'Active', emoji: '🟢', count: stats.activeCount, color: 'text-success', activeColor: 'bg-success text-white' },
    { key: 'cleared', label: 'Cleared', emoji: '✅', count: stats.clearedCount, color: 'text-success', activeColor: 'bg-success/80 text-white' },
    { key: 'new', label: 'New', emoji: '🆕', count: stats.newCount, color: 'text-primary', activeColor: 'bg-primary text-primary-foreground' },
    { key: 'no-phone', label: 'No Phone', emoji: '📵', count: stats.noPhoneCount, color: 'text-warning', activeColor: 'bg-warning text-warning-foreground' },
  ];

  const sortOptions: { key: SortMode; label: string }[] = [
    { key: 'balance', label: 'Highest debt' },
    { key: 'name', label: 'Name A-Z' },
    { key: 'recent', label: 'Newest' },
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

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'approved': return 'bg-blue-500/20 text-blue-600';
      case 'disbursed': case 'repaying': return 'bg-success/20 text-success';
      case 'completed': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl flex flex-col p-0 gap-0">
        {/* ───── Sticky Header ───── */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b px-4 pt-4 pb-3 space-y-3">
          {/* Title Row */}
          <SheetHeader className="pb-0">
            <SheetTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-lg">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                My Tenants
              </span>
              <Badge variant="outline" className="text-sm font-mono px-3 py-1">
                {stats.total}
              </Badge>
            </SheetTitle>
          </SheetHeader>

          {/* ───── Quick Stats Row ───── */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setActiveFilter('owing')}
              className={`rounded-xl p-2.5 text-center transition-all border ${
                activeFilter === 'owing' 
                  ? 'bg-destructive/10 border-destructive/40 ring-2 ring-destructive/20' 
                  : 'bg-destructive/5 border-destructive/20 hover:bg-destructive/10'
              }`}
            >
              <p className="text-xl font-black text-destructive font-mono leading-none">{stats.owingCount}</p>
              <p className="text-[10px] text-destructive/70 font-medium mt-0.5">Owing</p>
              <p className="text-[9px] text-destructive/50 font-mono">{formatUGX(stats.totalOwing)}</p>
            </button>
            <button
              onClick={() => setActiveFilter('cleared')}
              className={`rounded-xl p-2.5 text-center transition-all border ${
                activeFilter === 'cleared'
                  ? 'bg-success/10 border-success/40 ring-2 ring-success/20'
                  : 'bg-success/5 border-success/20 hover:bg-success/10'
              }`}
            >
              <p className="text-xl font-black text-success font-mono leading-none">{stats.clearedCount}</p>
              <p className="text-[10px] text-success/70 font-medium mt-0.5">Cleared</p>
            </button>
            <button
              onClick={() => setActiveFilter('no-phone')}
              className={`rounded-xl p-2.5 text-center transition-all border ${
                activeFilter === 'no-phone'
                  ? 'bg-warning/10 border-warning/40 ring-2 ring-warning/20'
                  : 'bg-warning/5 border-warning/20 hover:bg-warning/10'
              }`}
            >
              <p className="text-xl font-black text-warning font-mono leading-none">{stats.noPhoneCount}</p>
              <p className="text-[10px] text-warning/70 font-medium mt-0.5">No Phone</p>
            </button>
          </div>

          {/* ───── Search Bar ───── */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/40"
              style={{ fontSize: '16px' }}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs">✕</button>
            )}
          </div>

          {/* ───── Filter Pills (horizontally scrollable) ───── */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-hide">
            {filterTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                  activeFilter === tab.key
                    ? `${tab.activeColor} shadow-sm scale-[1.02]`
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted active:scale-95'
                }`}
              >
                <span className="text-sm leading-none">{tab.emoji}</span>
                <span>{tab.label}</span>
                <span className={`ml-0.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold ${
                  activeFilter === tab.key ? 'bg-white/25' : 'bg-background/80'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* ───── Sort Row ───── */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground shrink-0">Sort:</span>
            {sortOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => setSortMode(opt.key)}
                className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
                  sortMode === opt.key
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {processedTenants.length} result{processedTenants.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ───── Tenant List ───── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : processedTenants.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-muted/50 flex items-center justify-center">
                <Users className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">
                {search ? `No results for "${search}"` : activeFilter !== 'all' ? `No ${activeFilter} tenants` : 'No tenants yet'}
              </p>
              {(activeFilter !== 'all' || search) && (
                <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => { setActiveFilter('all'); setSearch(''); }}>
                  Show all tenants
                </Button>
              )}
            </div>
          ) : (
            processedTenants.map((tenant, index) => {
              const isExpanded = expandedTenantId === tenant.id;
              const requests = tenantRequests[tenant.id] || [];
              const isLoadingThis = loadingRequests === tenant.id;
              const balance = tenantBalances[tenant.id] || 0;
              const totals = tenantTotals[tenant.id] || { total: 0, paid: 0 };
              const paymentSummary = agentPayments[tenant.id] || { total: 0, lastPaidAt: null };
              const progressPct = totals.total > 0 ? Math.min(100, Math.round((totals.paid / totals.total) * 100)) : 0;
              const hasDebt = balance > 0;
              const hasAgentPaid = paymentSummary.total > 0;
              const isNoSmartphone = noSmartphoneMap[tenant.id] || false;

              const formatPhoneForWA = (phone: string) => {
                let clean = phone.replace(/\D/g, '');
                if (clean.startsWith('0')) clean = '256' + clean.slice(1);
                if (!clean.startsWith('256')) clean = '256' + clean;
                return clean;
              };
              const waPhone = formatPhoneForWA(tenant.phone);
              const appLink = `${getPublicOrigin()}/activate?ref=${user?.id}`;

              return (
                <motion.div
                  key={tenant.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.02, 0.2) }}
                  className={`rounded-2xl border overflow-hidden transition-all ${
                    hasDebt
                      ? 'border-destructive/25 bg-gradient-to-r from-destructive/5 to-transparent'
                      : isNoSmartphone
                        ? 'border-warning/25 bg-gradient-to-r from-warning/5 to-transparent'
                        : 'border-border bg-card'
                  }`}
                >
                  {/* Tenant row */}
                  <button
                    onClick={() => toggleExpand(tenant.id)}
                    className="w-full p-3.5 text-left hover:bg-muted/20 active:bg-primary/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${
                        hasDebt ? 'bg-destructive/15 text-destructive' : isNoSmartphone ? 'bg-warning/15 text-warning' : 'bg-primary/10 text-primary'
                      }`}>
                        {tenant.full_name.charAt(0).toUpperCase()}
                      </div>

                      {/* Info + Progress */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-sm truncate">{tenant.full_name}</p>
                          {isNoSmartphone && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-warning/40 text-warning bg-warning/10 shrink-0">
                              📵
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="h-2.5 w-2.5" />
                          {tenant.phone}
                        </p>
                        <p className={`text-[10px] mt-1 font-medium ${hasAgentPaid ? 'text-success' : 'text-muted-foreground'}`}>
                          {hasAgentPaid
                            ? `You paid ${formatUGX(paymentSummary.total)}${paymentSummary.lastPaidAt ? ` · last ${formatDistanceToNow(new Date(paymentSummary.lastPaidAt), { addSuffix: true })}` : ''}`
                            : 'No payment recorded from you yet'}
                        </p>
                        {/* Payment Progress Bar */}
                        {totals.total > 0 && (
                          <div className="mt-1.5">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[10px] text-muted-foreground">{progressPct}% repaid</span>
                              <span className="text-[10px] font-mono text-muted-foreground">{formatUGX(totals.paid)}/{formatUGX(totals.total)}</span>
                            </div>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  progressPct >= 100 ? 'bg-success' : progressPct >= 50 ? 'bg-primary' : 'bg-destructive'
                                }`}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right side: balance + call button */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex flex-col items-end gap-0.5">
                          {hasDebt ? (
                            <span className="text-sm font-bold text-destructive font-mono">
                              {formatUGX(balance)}
                            </span>
                          ) : hasAgentPaid ? (
                            <Badge variant="secondary" className="text-[10px] bg-success/15 text-success border-0 gap-0.5">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              You paid
                            </Badge>
                          ) : tenant.verified ? (
                            <Badge variant="secondary" className="text-[10px] bg-success/15 text-success border-0 gap-0.5">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              Clear
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              <Clock className="h-2.5 w-2.5 mr-0.5" />
                              Pending
                            </Badge>
                          )}
                          <div className="mt-0.5">
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                          </div>
                        </div>

                        {/* Phone Call Button */}
                        <a
                          href={`tel:${tenant.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="w-10 h-10 rounded-xl bg-success/15 hover:bg-success/25 active:scale-90 flex items-center justify-center transition-all shrink-0"
                          title={`Call ${tenant.full_name}`}
                        >
                          <PhoneCall className="h-4.5 w-4.5 text-success" />
                        </a>
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
                        className="overflow-hidden border-t border-border/50"
                      >
                        <div className="p-3.5 space-y-3 bg-muted/10">
                          <div className={`rounded-xl border p-3 ${hasAgentPaid ? 'border-success/30 bg-success/5' : 'border-border/60 bg-background/80'}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Your payments</p>
                                <p className={`text-sm font-semibold ${hasAgentPaid ? 'text-success' : 'text-foreground'}`}>
                                  {hasAgentPaid ? formatUGX(paymentSummary.total) : 'No payment yet'}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] text-muted-foreground">Status</p>
                                <p className={`text-xs font-medium ${hasDebt ? 'text-destructive' : 'text-success'}`}>
                                  {hasDebt ? 'Still owing' : 'Balance reduced / cleared'}
                                </p>
                              </div>
                            </div>
                            {paymentSummary.lastPaidAt && (
                              <p className="text-[10px] text-muted-foreground mt-2">
                                Last paid {formatDistanceToNow(new Date(paymentSummary.lastPaidAt), { addSuffix: true })}
                              </p>
                            )}
                          </div>

                          {/* No-smartphone tools */}
                          {isNoSmartphone && (
                            <div className="space-y-2">
                              <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 space-y-2">
                                <p className="text-xs font-semibold text-warning">📵 No smartphone — you manage their payments</p>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm" variant="outline"
                                    className="text-xs h-8 flex-1 border-success/30 text-success hover:bg-success/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(`Hi ${tenant.full_name}, this is your agent from Welile. Tap this link to check your rent schedule: ${appLink}`)}`, '_blank');
                                      toast({ title: 'WhatsApp opened — if it works, they have a smartphone!' });
                                    }}
                                  >
                                    <MessageCircle className="h-3 w-3 mr-1" />
                                    Check WhatsApp
                                  </Button>
                                  <Button
                                    size="sm" variant="outline"
                                    className="text-xs h-8 flex-1 border-primary/30 text-primary hover:bg-primary/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(appLink);
                                      toast({ title: 'Link copied!' });
                                    }}
                                  >
                                    <Share2 className="h-3 w-3 mr-1" />
                                    Copy Link
                                  </Button>
                                </div>
                              </div>

                              {/* Schedule manager for active requests */}
                              {requests.filter(r => ['approved', 'disbursed', 'repaying'].includes(r.status || '')).map(req => (
                                <NoSmartphoneScheduleManager
                                  key={req.id}
                                  tenantId={tenant.id}
                                  tenantName={tenant.full_name}
                                  tenantPhone={tenant.phone}
                                  rentRequestId={req.id}
                                  dailyRepayment={req.daily_repayment}
                                  totalRepayment={req.total_repayment}
                                  amountRepaid={req.amount_repaid}
                                  durationDays={req.duration_days}
                                  startDate={req.disbursed_at || req.created_at}
                                />
                              ))}
                            </div>
                          )}

                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                            <Banknote className="h-3 w-3" /> Rent History
                          </p>

                          {isLoadingThis ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          ) : requests.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4 bg-muted/30 rounded-xl">No rent records yet</p>
                          ) : (
                            requests.map((req) => {
                              const progress = req.total_repayment > 0 ? Math.min((req.amount_repaid / req.total_repayment) * 100, 100) : 0;
                              const owing = Math.max(0, (req.total_repayment || 0) - (req.amount_repaid || 0));
                              const previewDays = buildScheduleDays(req.disbursed_at || req.created_at, req.duration_days);

                              return (
                                <div key={req.id} className="bg-card rounded-xl border p-3 space-y-2.5">
                                  {/* Request header */}
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold truncate">{req.landlord?.name || 'Landlord'}</p>
                                      <p className="text-[10px] text-muted-foreground truncate">{req.landlord?.property_address || ''}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {owing > 0 && <span className="text-[10px] font-bold text-destructive font-mono">-{formatUGX(owing)}</span>}
                                      <Badge className={`text-[10px] ${getStatusColor(req.status)}`}>{req.status}</Badge>
                                    </div>
                                  </div>

                                  {/* Stats grid */}
                                  <div className="grid grid-cols-3 gap-2">
                                    {[
                                      { label: 'Rent', value: formatUGX(req.rent_amount), color: 'text-foreground' },
                                      { label: 'Daily', value: formatUGX(req.daily_repayment), color: 'text-primary' },
                                      { label: 'Repaid', value: formatUGX(req.amount_repaid), color: 'text-success' },
                                    ].map(s => (
                                      <div key={s.label} className="text-center p-1.5 rounded-lg bg-muted/40">
                                        <p className="text-[9px] text-muted-foreground">{s.label}</p>
                                        <p className={`text-xs font-bold ${s.color} font-mono`}>{s.value}</p>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Progress */}
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
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

                                  {/* Schedule preview */}
                                  <div className="flex gap-1 overflow-x-auto pb-0.5">
                                    {previewDays.map((day, i) => (
                                      <div key={i} className="flex flex-col items-center min-w-[30px] px-1 py-1 rounded-lg bg-muted/40 text-[9px]">
                                        <span className="font-medium">{format(day, 'dd')}</span>
                                        <span className="text-muted-foreground">{format(day, 'MMM')}</span>
                                      </div>
                                    ))}
                                    {req.duration_days > 10 && (
                                      <div className="flex items-center text-[9px] text-muted-foreground px-1.5">+{req.duration_days - 10}</div>
                                    )}
                                  </div>

                                  {/* Actions */}
                                  <div className={`grid ${req.status === 'completed' ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5`}>
                                    {req.status === 'completed' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-[10px] h-7 rounded-lg border-primary/30 text-primary col-span-3 font-semibold"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setRenewPrefill({
                                            name: tenant.full_name,
                                            phone: tenant.phone,
                                            amount: String(req.rent_amount),
                                          });
                                          setRenewDialogOpen(true);
                                        }}
                                      >
                                        <RefreshCw className="h-3 w-3 mr-1" />
                                        🔄 Renew Rent
                                      </Button>
                                    )}
                                    <Button size="sm" variant="outline" className="text-[10px] h-7 rounded-lg" onClick={() => handleDownloadPdf(tenant, req)}>
                                      <FileDown className="h-3 w-3 mr-1" />PDF
                                    </Button>
                                    <Button size="sm" variant="outline" className="text-[10px] h-7 rounded-lg" onClick={() => handleShareWhatsApp(tenant, req)}>
                                      <MessageCircle className="h-3 w-3 mr-1" />WhatsApp
                                    </Button>
                                    <Button size="sm" variant="outline" className="text-[10px] h-7 rounded-lg border-primary/30 text-primary" onClick={() => {
                                      downloadRentStatement({
                                        tenantName: tenant.full_name, tenantPhone: tenant.phone,
                                        landlordName: req.landlord?.name || 'N/A', propertyAddress: req.landlord?.property_address,
                                        rentAmount: req.rent_amount, totalRepayment: req.total_repayment,
                                        amountRepaid: req.amount_repaid, dailyRepayment: req.daily_repayment,
                                        durationDays: req.duration_days, status: req.status || 'approved',
                                        createdAt: req.created_at, requestId: req.id,
                                      });
                                    }}>
                                      <Receipt className="h-3 w-3 mr-1" />Receipt
                                    </Button>
                                    <Button size="sm" variant="outline" className="text-[10px] h-7 rounded-lg border-emerald-500/30 text-emerald-600" onClick={() => {
                                      const text = buildRentStatementWhatsApp({
                                        tenantName: tenant.full_name, tenantPhone: tenant.phone,
                                        landlordName: req.landlord?.name || 'N/A', propertyAddress: req.landlord?.property_address,
                                        rentAmount: req.rent_amount, totalRepayment: req.total_repayment,
                                        amountRepaid: req.amount_repaid, dailyRepayment: req.daily_repayment,
                                        durationDays: req.duration_days, status: req.status || 'approved',
                                        createdAt: req.created_at, requestId: req.id,
                                      });
                                      shareViaWhatsApp(text);
                                    }}>
                                      <MessageCircle className="h-3 w-3 mr-1" />Receipt WA
                                    </Button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </div>
      </SheetContent>

      {/* Renew Rent Dialog */}
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
    </Sheet>
  );
}
