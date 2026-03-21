import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, User, Phone, Calendar, ChevronDown, ChevronUp, FileDown, MessageCircle, Banknote, Receipt, AlertTriangle, Filter, ArrowUpDown, CheckCircle2, Clock, Users, Smartphone, SmartphoneNfc, ExternalLink, Share2, Link2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, startOfDay } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadRepaymentPdf, shareRepaymentPdfWhatsApp } from '@/lib/repaymentSchedulePdf';
import { downloadRentStatement, buildRentStatementWhatsApp } from '@/lib/receiptPdf';
import { shareViaWhatsApp } from '@/lib/shareReceipt';
import { useToast } from '@/hooks/use-toast';
import { getPublicOrigin } from '@/lib/getPublicOrigin';

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

type FilterTab = 'all' | 'owing' | 'active' | 'cleared' | 'new';
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
  // Store rent balances keyed by tenant_id
  const [tenantBalances, setTenantBalances] = useState<Record<string, number>>({});
  const [noSmartphoneMap, setNoSmartphoneMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open && user) {
      fetchTenants();
    }
    if (!open) {
      setExpandedTenantId(null);
    }
  }, [open, user]);

  const fetchTenants = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone, email, created_at, monthly_rent    , verified')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const tenantList = data || [];
      setTenants(tenantList);

      // Fetch rent balances and smartphone status for all tenants in parallel
      if (tenantList.length > 0) {
        const tenantIds = tenantList.map(t => t.id);
        const { data: rentRequests } = await supabase
          .from('rent_requests')
          .select('tenant_id, total_repayment, amount_repaid, status, tenant_no_smartphone')
          .in('tenant_id', tenantIds)
          .in('status', ['approved', 'disbursed', 'repaying']);

        const balances: Record<string, number> = {};
        const noSmartphoneMap: Record<string, boolean> = {};
        (rentRequests || []).forEach(rr => {
          const owing = (rr.total_repayment || 0) - (rr.amount_repaid || 0);
          balances[rr.tenant_id] = (balances[rr.tenant_id] || 0) + Math.max(0, owing);
          if (rr.tenant_no_smartphone) {
            noSmartphoneMap[rr.tenant_id] = true;
          }
        });
        setTenantBalances(balances);
        setNoSmartphoneMap(noSmartphoneMap);
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

    // Apply filter
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    switch (activeFilter) {
      case 'owing':
        list = list.filter(t => (tenantBalances[t.id] || 0) > 0);
        break;
      case 'active':
        list = list.filter(t => (tenantBalances[t.id] || 0) > 0 || t.monthly_rent);
        break;
      case 'cleared':
        list = list.filter(t => (tenantBalances[t.id] || 0) === 0 && t.verified);
        break;
      case 'new':
        list = list.filter(t => new Date(t.created_at) > thirtyDaysAgo);
        break;
    }

    // Apply sort
    list.sort((a, b) => {
      switch (sortMode) {
        case 'balance':
          return (tenantBalances[b.id] || 0) - (tenantBalances[a.id] || 0);
        case 'name':
          return a.full_name.localeCompare(b.full_name);
        case 'recent':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return 0;
      }
    });

    return list;
  }, [tenants, search, activeFilter, sortMode, tenantBalances]);

  // Stats
  const stats = useMemo(() => {
    const totalOwing = Object.values(tenantBalances).reduce((s, v) => s + v, 0);
    const owingCount = Object.values(tenantBalances).filter(v => v > 0).length;
    return { totalOwing, owingCount, total: tenants.length };
  }, [tenants, tenantBalances]);

  const filterTabs: { key: FilterTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'owing', label: 'Rent Receivable', icon: <AlertTriangle className="h-3 w-3" />, count: stats.owingCount },
    { key: 'all', label: 'All', icon: <Users className="h-3 w-3" />, count: stats.total },
    { key: 'active', label: 'Active', icon: <Clock className="h-3 w-3" /> },
    { key: 'cleared', label: 'Cleared', icon: <CheckCircle2 className="h-3 w-3" /> },
    { key: 'new', label: 'New', icon: <User className="h-3 w-3" /> },
  ];

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
      toast({ title: 'PDF Downloaded', description: 'Repayment schedule saved.' });
    } catch {
      toast({ title: 'Error', description: 'Could not generate PDF.', variant: 'destructive' });
    }
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
    } catch {
      toast({ title: 'Error', description: 'Could not share schedule.', variant: 'destructive' });
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'approved': return 'bg-blue-500/20 text-blue-600';
      case 'disbursed': case 'repaying': return 'bg-success/20 text-success';
      case 'completed': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const cycleSortMode = () => {
    const modes: SortMode[] = ['balance', 'name', 'recent'];
    const next = modes[(modes.indexOf(sortMode) + 1) % modes.length];
    setSortMode(next);
    toast({ title: `Now showing by ${next === 'balance' ? 'who owes the most' : next === 'name' ? 'name' : 'newest first'}` });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-2xl flex flex-col p-0">
        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <SheetHeader className="pb-0">
            <SheetTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                My Tenants
              </span>
              <Badge variant="secondary" className="text-xs font-mono">
                {stats.total}
              </Badge>
            </SheetTitle>
          </SheetHeader>

          {/* Summary banner - prioritize rent balances */}
          {stats.totalOwing > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 rounded-xl bg-destructive/10 border border-destructive/20 p-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-destructive/20">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-destructive">{stats.owingCount} tenant{stats.owingCount !== 1 ? 's' : ''} still owe you money</p>
                  <p className="text-[10px] text-destructive/70">They owe: {formatUGX(stats.totalOwing)} total</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 text-destructive hover:bg-destructive/10"
                onClick={() => setActiveFilter('owing')}
              >
                View
              </Button>
            </motion.div>
          )}

          {/* Search + Sort */}
          <div className="flex items-center gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Type a name or phone number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
                style={{ fontSize: '16px' }}
              />
            </div>
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              onClick={cycleSortMode}
              title={`Sort: ${sortMode}`}
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 -mx-1 px-1">
            {filterTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  activeFilter === tab.key
                    ? tab.key === 'owing'
                      ? 'bg-destructive text-destructive-foreground shadow-sm'
                      : 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    activeFilter === tab.key
                      ? 'bg-background/20'
                      : 'bg-background/60'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Sort indicator */}
          <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
            <Filter className="h-2.5 w-2.5 shrink-0" />
            Showing by {sortMode === 'balance' ? 'who owes the most' : sortMode === 'name' ? 'name A to Z' : 'newest first'}
            {' · '}{processedTenants.length} tenant{processedTenants.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Tenant List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : processedTenants.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-muted/50 flex items-center justify-center">
                <Users className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">
                {search ? 'Nobody matches what you typed' : activeFilter !== 'all' ? `No ${activeFilter} tenants right now` : 'You haven\'t added any tenants yet'}
              </p>
              {activeFilter !== 'all' && (
                <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setActiveFilter('all')}>
                  See everyone
                </Button>
              )}
            </div>
          ) : (
            processedTenants.map((tenant, index) => {
              const isExpanded = expandedTenantId === tenant.id;
              const requests = tenantRequests[tenant.id] || [];
              const isLoadingThis = loadingRequests === tenant.id;
              const balance = tenantBalances[tenant.id] || 0;
              const hasDebt = balance > 0;
              const isNoSmartphone = noSmartphoneMap[tenant.id] || false;

              // Format phone for WhatsApp check (wa.me link)
              const formatPhoneForWA = (phone: string) => {
                let clean = phone.replace(/\D/g, '');
                if (clean.startsWith('0')) clean = '256' + clean.slice(1);
                if (!clean.startsWith('256')) clean = '256' + clean;
                return clean;
              };
              const waPhone = formatPhoneForWA(tenant.phone);
              const waCheckUrl = `https://wa.me/${waPhone}`;
              const appLink = `${getPublicOrigin()}/activate?ref=${user?.id}`;

              return (
                <motion.div
                  key={tenant.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.3) }}
                  className={`rounded-xl border overflow-hidden transition-colors ${
                    hasDebt
                      ? 'border-destructive/30 bg-destructive/5'
                      : 'border-border bg-card'
                  }`}
                >
                  {/* Tenant header */}
                  <button
                    onClick={() => toggleExpand(tenant.id)}
                    className="w-full p-3 text-left hover:bg-muted/30 active:bg-primary/5 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          hasDebt ? 'bg-destructive/15' : 'bg-primary/10'
                        }`}>
                          {hasDebt ? (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          ) : (
                            <User className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-sm truncate">{tenant.full_name}</p>
                            {isNoSmartphone && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-warning/40 text-warning bg-warning/10 shrink-0">
                                📵 No Phone
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{tenant.phone}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {hasDebt ? (
                          <span className="text-xs font-bold text-destructive">
                            {formatUGX(balance)}
                          </span>
                        ) : tenant.verified ? (
                          <Badge variant="secondary" className="text-[10px] bg-success/15 text-success border-0">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                            Clear
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Pending</Badge>
                        )}
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 ml-[52px] text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(tenant.created_at), 'dd MMM yyyy')}
                      </span>
                      {tenant.monthly_rent && (
                        <span className="font-medium text-foreground/70">
                          Rent: {formatUGX(tenant.monthly_rent)}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Expanded section */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-border"
                      >
                        <div className="p-3 space-y-3 bg-muted/20">
                          {/* WhatsApp Check & Share Link for no-smartphone tenants */}
                          {isNoSmartphone && (
                            <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 space-y-2">
                              <p className="text-xs font-semibold text-warning flex items-center gap-1.5">
                                📵 This tenant has no smartphone
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                You manage their repayments. Check if they've joined WhatsApp — it means they now have a smartphone!
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-8 flex-1 border-success/30 text-success hover:bg-success/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(`Hi ${tenant.full_name}, this is your agent from Welile. Tap this link to check your rent schedule: ${appLink}`)}`, '_blank');
                                    toast({ title: 'WhatsApp Check', description: 'If WhatsApp opens, they have a smartphone! Share the app link.' });
                                  }}
                                >
                                  <MessageCircle className="h-3 w-3 mr-1" />
                                  Check WhatsApp
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-8 flex-1 border-primary/30 text-primary hover:bg-primary/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(appLink);
                                    toast({ title: 'Link Copied!', description: 'Share this link with the tenant to access their dashboard.' });
                                  }}
                                >
                                  <Share2 className="h-3 w-3 mr-1" />
                                  Copy App Link
                                </Button>
                              </div>
                            </div>
                          )}

                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
                            <Banknote className="h-3 w-3" />
                            Rent Payments
                          </p>

                          {isLoadingThis ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          ) : requests.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-3">No rent payments here yet</p>
                          ) : (
                            requests.map((req) => {
                              const progress = req.total_repayment > 0 ? Math.min((req.amount_repaid / req.total_repayment) * 100, 100) : 0;
                              const previewDays = buildScheduleDays(req.disbursed_at || req.created_at, req.duration_days);
                              const owing = Math.max(0, (req.total_repayment || 0) - (req.amount_repaid || 0));

                              return (
                                <div key={req.id} className="bg-card rounded-lg border border-border p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-xs font-medium">{req.landlord?.name || 'Landlord'}</p>
                                      <p className="text-[10px] text-muted-foreground">{req.landlord?.property_address || ''}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {owing > 0 && (
                                        <span className="text-[10px] font-bold text-destructive">
                                          -{formatUGX(owing)}
                                        </span>
                                      )}
                                      <Badge className={`text-[10px] ${getStatusColor(req.status)}`}>
                                        {req.status}
                                      </Badge>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-3 gap-2 text-center">
                                    <div>
                                      <p className="text-[10px] text-muted-foreground">Rent</p>
                                      <p className="text-xs font-bold">{formatUGX(req.rent_amount)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-muted-foreground">Daily</p>
                                      <p className="text-xs font-bold text-primary">{formatUGX(req.daily_repayment)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-muted-foreground">Repaid</p>
                                      <p className="text-xs font-bold text-success">{formatUGX(req.amount_repaid)}</p>
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                      <span>{req.duration_days} days</span>
                                      <span>{progress.toFixed(0)}%</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${progress >= 100 ? 'bg-success' : progress < 30 ? 'bg-destructive' : 'bg-primary'}`}
                                        style={{ width: `${progress}%` }}
                                      />
                                    </div>
                                  </div>

                                  <div className="flex gap-1 overflow-x-auto pb-1">
                                    {previewDays.map((day, i) => (
                                      <div key={i} className="flex flex-col items-center min-w-[32px] px-1 py-1 rounded bg-muted/50 text-[9px]">
                                        <span className="text-muted-foreground">{format(day, 'dd')}</span>
                                        <span className="text-muted-foreground">{format(day, 'MMM')}</span>
                                      </div>
                                    ))}
                                    {req.duration_days > 10 && (
                                      <div className="flex items-center text-[9px] text-muted-foreground px-1">+{req.duration_days - 10}</div>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => handleDownloadPdf(tenant, req)}>
                                      <FileDown className="h-3 w-3 mr-1" />Schedule PDF
                                    </Button>
                                    <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => handleShareWhatsApp(tenant, req)}>
                                      <MessageCircle className="h-3 w-3 mr-1" />WhatsApp
                                    </Button>
                                    <Button size="sm" variant="outline" className="text-xs h-8 border-primary/30 text-primary" onClick={() => {
                                      downloadRentStatement({
                                        tenantName: tenant.full_name, tenantPhone: tenant.phone,
                                        landlordName: req.landlord?.name || 'N/A', propertyAddress: req.landlord?.property_address,
                                        rentAmount: req.rent_amount, totalRepayment: req.total_repayment,
                                        amountRepaid: req.amount_repaid, dailyRepayment: req.daily_repayment,
                                        durationDays: req.duration_days, status: req.status || 'approved',
                                        createdAt: req.created_at, requestId: req.id,
                                      });
                                      toast({ title: 'Downloaded', description: 'Rent statement saved.' });
                                    }}>
                                      <Receipt className="h-3 w-3 mr-1" />Rent Receipt
                                    </Button>
                                    <Button size="sm" variant="outline" className="text-xs h-8 border-emerald-500/30 text-emerald-600" onClick={() => {
                                      const text = buildRentStatementWhatsApp({
                                        tenantName: tenant.full_name, tenantPhone: tenant.phone,
                                        landlordName: req.landlord?.name || 'N/A', propertyAddress: req.landlord?.property_address,
                                        rentAmount: req.rent_amount, totalRepayment: req.total_repayment,
                                        amountRepaid: req.amount_repaid, dailyRepayment: req.daily_repayment,
                                        durationDays: req.duration_days, status: req.status || 'approved',
                                        createdAt: req.created_at, requestId: req.id,
                                      });
                                      shareViaWhatsApp(text);
                                      toast({ title: 'Sharing', description: 'Opening WhatsApp...' });
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
    </Sheet>
  );
}
