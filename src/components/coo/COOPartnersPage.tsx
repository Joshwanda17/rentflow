import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Loader2, Search, X, Download, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  ChevronsUpDown, MoreHorizontal, TrendingUp, Pencil, Wallet, Ban, PlayCircle,
  Users, Banknote, PiggyBank, ArrowUpRight, Filter, RefreshCw, Phone, Calendar,
  CalendarDays, Shield, Eye, CheckCircle2, Clock, Hash, Briefcase, Save, Upload
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import PartnerImportDialog from './PartnerImportDialog';

/* ─── Types ─── */
interface PartnerRow {
  id: string;
  name: string;
  phone: string;
  funded: number;
  activeDeals: number;
  avgDeal: number;
  walletBalance: number;
  roiPercentage: number;
  payoutDay: number;
  roiMode: string;
  status: 'active' | 'suspended';
  joinedAt: string;
  lastActivity: string;
}

interface PortfolioRow {
  id: string;
  portfolio_code: string;
  investment_amount: number;
  roi_percentage: number;
  payout_day: number;
  roi_mode: string;
  status: string;
  created_at: string;
  maturity_date: string | null;
  total_roi_earned: number;
  duration_months: number;
  next_roi_date: string | null;
}

interface PartnerDetail {
  profile: {
    id: string;
    full_name: string;
    phone: string;
    created_at: string;
    frozen_at: string | null;
    frozen_reason: string | null;
  };
  walletBalance: number;
  totalFunded: number;
  totalDeals: number;
  totalROIEarned: number;
  portfolios: PortfolioRow[];
}

interface SummaryData {
  totalPartners: number;
  activePartners: number;
  suspendedPartners: number;
  totalFunded: number;
  totalWalletBalance: number;
  avgROI: number;
  totalDeals: number;
  topPartnerName: string;
}

const MIN_INVEST = 50000;
const PAGE_SIZE = 15;

/* ─── Helpers ─── */
function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function exportToCSV(rows: PartnerRow[]) {
  const header = 'Name,Phone,Status,Wallet,Total Funded,Deals,Avg Deal,ROI %,Payout Day,ROI Mode,Joined';
  const csvRows = rows.map(r =>
    `"${r.name}","${r.phone}","${r.status}","${r.walletBalance}","${r.funded}","${r.activeDeals}","${r.avgDeal}","${r.roiPercentage}","${r.payoutDay}","${r.roiMode}","${r.joinedAt}"`
  );
  const csv = [header, ...csvRows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'partners-export.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-UG', { year: 'numeric', month: 'short', day: 'numeric' });
}

function timeSince(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/* ─── Main Component ─── */
export default function COOPartnersPage() {
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Table state
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>('funded');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('desc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'suspended'>('all');
  const [filterRoiMode, setFilterRoiMode] = useState<'all' | 'monthly_payout' | 'monthly_compounding'>('all');

  // Invest dialog
  const [investPartner, setInvestPartner] = useState<PartnerRow | null>(null);
  const [investAmount, setInvestAmount] = useState('');
  const [investing, setInvesting] = useState(false);

  // Edit dialog
  const [editPartner, setEditPartner] = useState<PartnerRow | null>(null);
  const [editRoi, setEditRoi] = useState('');
  const [editRoiMode, setEditRoiMode] = useState('monthly_payout');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Suspend dialog
  const [suspendPartner, setSuspendPartner] = useState<PartnerRow | null>(null);
  const [suspending, setSuspending] = useState(false);

  // Partner Detail view
  const [detailPartner, setDetailPartner] = useState<PartnerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null);
  const [editingPayoutDay, setEditingPayoutDay] = useState('');
  const [savingPortfolio, setSavingPortfolio] = useState(false);

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);

  /* ─── Fetch ─── */
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: supporterRoles } = await supabase
        .from('user_roles').select('user_id').eq('role', 'supporter');
      const supporterIds = (supporterRoles || []).map(r => r.user_id);
      if (supporterIds.length === 0) {
        setRows([]);
        setSummary({ totalPartners: 0, activePartners: 0, suspendedPartners: 0, totalFunded: 0, totalWalletBalance: 0, avgROI: 0, totalDeals: 0, topPartnerName: '—' });
        return;
      }

      const ids = supporterIds.slice(0, 200);
      const [ledgerRes, profilesRes, walletsRes, portfoliosRes] = await Promise.all([
        supabase.from('general_ledger')
          .select('user_id, amount, direction, category, created_at')
          .in('user_id', ids)
          .in('category', ['supporter_rent_fund', 'supporter_facilitation_capital', 'coo_proxy_investment']),
        supabase.from('profiles').select('id, full_name, phone, created_at, frozen_at').in('id', ids),
        supabase.from('wallets').select('user_id, balance').in('user_id', ids),
        supabase.from('investor_portfolios')
          .select('investor_id, agent_id, roi_percentage, payout_day, roi_mode, created_at')
          .or(`investor_id.in.(${ids.join(',')}),agent_id.in.(${ids.join(',')})`)
          .order('created_at', { ascending: false }),
      ]);

      const ledgerData = ledgerRes.data || [];
      const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p]));
      const walletMap = new Map((walletsRes.data || []).map(w => [w.user_id, w.balance || 0]));

      const roiMap = new Map<string, number>();
      const payoutDayMap = new Map<string, number>();
      const roiModeMap = new Map<string, string>();
      (portfoliosRes.data || []).forEach(p => {
        const userId = p.investor_id || p.agent_id;
        if (userId && !roiMap.has(userId)) {
          roiMap.set(userId, p.roi_percentage ?? 15);
          payoutDayMap.set(userId, p.payout_day ?? 15);
          roiModeMap.set(userId, p.roi_mode ?? 'monthly_payout');
        }
      });

      const partnerAgg = new Map<string, { funded: number; deals: number; lastActivity: string }>();
      ledgerData.forEach(entry => {
        if (!entry.user_id) return;
        const existing = partnerAgg.get(entry.user_id) || { funded: 0, deals: 0, lastActivity: '' };
        if (entry.direction === 'cash_out') {
          existing.funded += (entry.amount || 0);
          existing.deals += 1;
        }
        if (!existing.lastActivity || entry.created_at > existing.lastActivity) {
          existing.lastActivity = entry.created_at;
        }
        partnerAgg.set(entry.user_id, existing);
      });

      const tableRows: PartnerRow[] = ids.map(id => {
        const agg = partnerAgg.get(id) || { funded: 0, deals: 0, lastActivity: '' };
        const profile = profileMap.get(id);
        const isSuspended = !!profile?.frozen_at;
        return {
          id,
          name: profile?.full_name || id.slice(0, 8),
          phone: profile?.phone || '',
          funded: agg.funded,
          activeDeals: agg.deals,
          avgDeal: agg.deals > 0 ? Math.round(agg.funded / agg.deals) : 0,
          walletBalance: walletMap.get(id) || 0,
          roiPercentage: roiMap.get(id) ?? 15,
          payoutDay: payoutDayMap.get(id) ?? 15,
          roiMode: roiModeMap.get(id) ?? 'monthly_payout',
          status: (isSuspended ? 'suspended' : 'active') as 'active' | 'suspended',
          joinedAt: profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—',
          lastActivity: agg.lastActivity ? new Date(agg.lastActivity).toLocaleDateString() : '—',
        };
      }).sort((a, b) => b.funded - a.funded);

      const totalFunded = tableRows.reduce((s, r) => s + r.funded, 0);
      const totalWalletBalance = tableRows.reduce((s, r) => s + r.walletBalance, 0);
      const activeCount = tableRows.filter(r => r.status === 'active').length;
      const suspendedCount = tableRows.filter(r => r.status === 'suspended').length;
      const totalDeals = tableRows.reduce((s, r) => s + r.activeDeals, 0);
      const roiValues = tableRows.filter(r => r.roiPercentage > 0);
      const avgROI = roiValues.length > 0 ? Math.round(roiValues.reduce((s, r) => s + r.roiPercentage, 0) / roiValues.length) : 0;
      const topPartner = tableRows[0];

      setSummary({
        totalPartners: supporterIds.length,
        activePartners: activeCount,
        suspendedPartners: suspendedCount,
        totalFunded,
        totalWalletBalance,
        avgROI,
        totalDeals,
        topPartnerName: topPartner?.name || '—',
      });
      setRows(tableRows);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── Open Partner Detail ─── */
  async function openPartnerDetail(partnerId: string) {
    setDetailLoading(true);
    setDetailPartner(null);
    try {
      const [profileRes, walletRes, portfolioRes, ledgerRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, phone, created_at, frozen_at, frozen_reason').eq('id', partnerId).single(),
        supabase.from('wallets').select('balance').eq('user_id', partnerId).single(),
        supabase.from('investor_portfolios')
          .select('id, portfolio_code, investment_amount, roi_percentage, payout_day, roi_mode, status, created_at, maturity_date, total_roi_earned, duration_months, next_roi_date')
          .or(`investor_id.eq.${partnerId},agent_id.eq.${partnerId}`)
          .order('created_at', { ascending: false }),
        supabase.from('general_ledger')
          .select('amount, direction, category')
          .eq('user_id', partnerId)
          .in('category', ['supporter_rent_fund', 'supporter_facilitation_capital', 'coo_proxy_investment']),
      ]);

      const ledgerData = ledgerRes.data || [];
      const totalFunded = ledgerData.filter(e => e.direction === 'cash_out').reduce((s, e) => s + (e.amount || 0), 0);
      const totalDeals = ledgerData.filter(e => e.direction === 'cash_out').length;
      const portfolios = (portfolioRes.data || []) as PortfolioRow[];
      const totalROIEarned = portfolios.reduce((s, p) => s + (p.total_roi_earned || 0), 0);

      setDetailPartner({
        profile: profileRes.data as any,
        walletBalance: walletRes.data?.balance || 0,
        totalFunded,
        totalDeals,
        totalROIEarned,
        portfolios,
      });
    } catch (e) { console.error(e); toast.error('Failed to load partner details'); }
    finally { setDetailLoading(false); }
  }

  /* ─── Save portfolio payout day ─── */
  async function handleSavePortfolioPayoutDay(portfolioId: string) {
    const day = Number(editingPayoutDay);
    if (isNaN(day) || day < 1 || day > 28) { toast.error('Day must be 1-28'); return; }
    setSavingPortfolio(true);
    try {
      const { error } = await supabase
        .from('investor_portfolios')
        .update({ payout_day: day })
        .eq('id', portfolioId);
      if (error) throw error;
      toast.success(`Payout day updated to ${day}${getOrdinalSuffix(day)}`);
      setEditingPortfolioId(null);
      // Refresh detail
      if (detailPartner) {
        const updated = detailPartner.portfolios.map(p =>
          p.id === portfolioId ? { ...p, payout_day: day } : p
        );
        setDetailPartner({ ...detailPartner, portfolios: updated });
      }
    } catch (e: any) { toast.error(e.message || 'Failed to update'); }
    finally { setSavingPortfolio(false); }
  }

  /* ─── Filtered / Sorted ─── */
  const processed = useMemo(() => {
    let result = [...rows];
    if (filterStatus !== 'all') result = result.filter(r => r.status === filterStatus);
    if (filterRoiMode !== 'all') result = result.filter(r => r.roiMode === filterRoiMode);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r => r.name.toLowerCase().includes(q) || r.phone.includes(q));
    }
    if (sortKey && sortDir) {
      result.sort((a, b) => {
        const av = (a as any)[sortKey];
        const bv = (b as any)[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
        return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }
    return result;
  }, [rows, search, sortKey, sortDir, filterStatus, filterRoiMode]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = processed.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function handleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(null); setSortDir(null); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  }

  /* ─── Invest ─── */
  async function handleInvest() {
    if (!investPartner) return;
    const amt = Number(investAmount);
    if (isNaN(amt) || amt < MIN_INVEST) { toast.error(`Minimum: ${formatUGX(MIN_INVEST)}`); return; }
    if (amt > investPartner.walletBalance) { toast.error(`Only ${formatUGX(investPartner.walletBalance)} available`); return; }
    setInvesting(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('coo-invest-for-partner', {
        body: { partner_id: investPartner.id, amount: amt },
      });
      if (error) throw new Error(typeof result === 'object' && result?.error ? result.error : error.message);
      if (result?.error) throw new Error(result.error);
      toast.success(`Invested ${formatUGX(amt)} for ${investPartner.name}`, { description: `Ref: ${result.reference_id}` });
      setInvestPartner(null);
      setInvestAmount('');
      fetchData();
    } catch (e: any) { toast.error(e.message || 'Investment failed'); }
    finally { setInvesting(false); }
  }

  /* ─── Edit ─── */
  function openEdit(r: PartnerRow) {
    setEditPartner(r);
    setEditName(r.name);
    setEditPhone(r.phone);
    setEditRoi(String(r.roiPercentage));
    setEditRoiMode(r.roiMode || 'monthly_payout');
  }

  async function handleSaveEdit() {
    if (!editPartner) return;
    setSaving(true);
    try {
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ full_name: editName.trim(), phone: editPhone.trim() })
        .eq('id', editPartner.id);
      if (profileErr) throw profileErr;

      const newRoi = Number(editRoi);
      const updateFields: Record<string, any> = {};
      if (!isNaN(newRoi) && newRoi > 0 && newRoi <= 100) updateFields.roi_percentage = newRoi;
      if (editRoiMode === 'monthly_payout' || editRoiMode === 'monthly_compounding') updateFields.roi_mode = editRoiMode;

      if (Object.keys(updateFields).length > 0) {
        await supabase.from('investor_portfolios').update(updateFields).eq('investor_id', editPartner.id).in('status', ['active', 'pending']);
        await supabase.from('investor_portfolios').update(updateFields).eq('agent_id', editPartner.id).is('investor_id', null).in('status', ['active', 'pending']);
      }
      toast.success(`Updated ${editName.trim()}`);
      setEditPartner(null);
      fetchData();
    } catch (e: any) { toast.error(e.message || 'Update failed'); }
    finally { setSaving(false); }
  }

  /* ─── Suspend / Reactivate ─── */
  async function handleToggleSuspend() {
    if (!suspendPartner) return;
    setSuspending(true);
    const shouldFreeze = suspendPartner.status === 'active';
    try {
      const { error } = await supabase
        .from('profiles')
        .update(shouldFreeze
          ? { frozen_at: new Date().toISOString(), frozen_reason: 'Suspended by COO' }
          : { frozen_at: null, frozen_reason: null }
        )
        .eq('id', suspendPartner.id);
      if (error) throw error;
      toast.success(`${suspendPartner.name} is now ${shouldFreeze ? 'suspended' : 'active'}`);
      setSuspendPartner(null);
      fetchData();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSuspending(false); }
  }

  /* ─── Sort Icon ─── */
  function SortIcon({ colKey }: { colKey: string }) {
    if (sortKey !== colKey) return <ChevronsUpDown className="h-2.5 w-2.5 opacity-30" />;
    if (sortDir === 'asc') return <ChevronUp className="h-2.5 w-2.5 text-primary" />;
    return <ChevronDown className="h-2.5 w-2.5 text-primary" />;
  }

  /* ─── Column config ─── */
  const columns: { key: string; label: string; align?: 'left' | 'right' | 'center'; sortable?: boolean; hideOnMobile?: boolean; render?: (r: PartnerRow) => React.ReactNode }[] = [
    { key: 'name', label: 'Partner', render: (r) => (
      <button
        onClick={() => openPartnerDetail(r.id)}
        className="min-w-0 text-left group"
      >
        <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors underline-offset-2 group-hover:underline">{r.name}</p>
        <p className="text-[10px] text-muted-foreground">{r.phone || '—'}</p>
      </button>
    )},
    { key: 'status', label: 'Status', render: (r) => (
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
        r.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-destructive/15 text-destructive'
      )}>
        <span className={cn('w-1.5 h-1.5 rounded-full', r.status === 'active' ? 'bg-primary' : 'bg-destructive')} />
        {r.status}
      </span>
    )},
    { key: 'walletBalance', label: 'Wallet', align: 'right', render: (r) => (
      <span className={cn('font-semibold tabular-nums', r.walletBalance >= MIN_INVEST ? 'text-primary' : 'text-muted-foreground')}>
        {formatUGX(r.walletBalance)}
      </span>
    )},
    { key: 'funded', label: 'Total Funded', align: 'right', render: (r) => (
      <span className="font-semibold tabular-nums">{formatUGX(r.funded)}</span>
    )},
    { key: 'activeDeals', label: 'Deals', align: 'right', hideOnMobile: true },
    { key: 'roiPercentage', label: 'ROI', align: 'right', render: (r) => (
      <span className="font-bold text-primary">{r.roiPercentage}%</span>
    )},
    { key: 'roiMode', label: 'Mode', hideOnMobile: true, render: (r) => (
      <span className={cn(
        'px-2 py-0.5 rounded-full text-[10px] font-semibold',
        r.roiMode === 'monthly_compounding' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
      )}>
        {r.roiMode === 'monthly_compounding' ? 'Compound' : 'Payout'}
      </span>
    )},
    { key: 'payoutDay', label: 'Payout', align: 'right', hideOnMobile: true, render: (r) => (
      <span className="text-muted-foreground">{r.payoutDay}{getOrdinalSuffix(r.payoutDay)}</span>
    )},
    {
      key: 'actions', label: '', sortable: false, render: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => e.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={e => { e.stopPropagation(); openEdit(r); }} className="gap-2">
              <Pencil className="h-3.5 w-3.5" /> Edit Partner
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={r.walletBalance < MIN_INVEST || r.status === 'suspended'}
              onClick={e => { e.stopPropagation(); setInvestPartner(r); }}
              className="gap-2"
            >
              <TrendingUp className="h-3.5 w-3.5" /> Invest {r.walletBalance >= MIN_INVEST ? '' : '(Low bal)'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={e => { e.stopPropagation(); setSuspendPartner(r); }}
              className={cn('gap-2', r.status === 'active' ? 'text-destructive focus:text-destructive' : 'text-primary focus:text-primary')}
            >
              {r.status === 'active' ? <Ban className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
              {r.status === 'active' ? 'Suspend' : 'Reactivate'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  ];

  /* ─── Render ─── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">Partner Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Monitor, manage, and invest for all supporters & partners</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5 self-start">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard icon={<Users className="h-4 w-4" />} label="Total Partners" value={summary.totalPartners}
            sub={`${summary.activePartners} active · ${summary.suspendedPartners} suspended`} accent="primary" />
          <SummaryCard icon={<Banknote className="h-4 w-4" />} label="Total Funded" value={formatUGX(summary.totalFunded)}
            sub={`${summary.totalDeals} deals completed`} accent="emerald" />
          <SummaryCard icon={<Wallet className="h-4 w-4" />} label="Wallet Balances" value={formatUGX(summary.totalWalletBalance)}
            sub="Across all partner wallets" accent="amber" />
          <SummaryCard icon={<PiggyBank className="h-4 w-4" />} label="Avg ROI Rate" value={`${summary.avgROI}%`}
            sub={`Top: ${summary.topPartnerName}`} accent="violet" />
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by name or phone…"
            className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors" />
          {search && (
            <button onClick={() => { setSearch(''); setPage(0); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted">
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
        <Select value={filterStatus} onValueChange={(v: any) => { setFilterStatus(v); setPage(0); }}>
          <SelectTrigger className="w-[120px] h-9 text-xs"><Filter className="h-3 w-3 mr-1 text-muted-foreground" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterRoiMode} onValueChange={(v: any) => { setFilterRoiMode(v); setPage(0); }}>
          <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="monthly_payout">Payout</SelectItem>
            <SelectItem value="monthly_compounding">Compounding</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => setImportOpen(true)}>
          <Upload className="h-3.5 w-3.5" /> Import
        </Button>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs ml-auto" onClick={() => exportToCSV(processed)}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm min-w-[640px]">
            <thead>
              <tr className="border-b-2 border-border bg-muted/60">
                <th className="px-2 sm:px-3 py-2.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center w-10">#</th>
                {columns.map(col => {
                  const isSortable = col.sortable !== false;
                  return (
                    <th key={col.key} onClick={() => isSortable && handleSort(col.key)}
                      className={cn(
                        'px-2 sm:px-3 py-2.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap select-none',
                        col.align === 'right' ? 'text-right' : 'text-left',
                        col.hideOnMobile && 'hidden lg:table-cell',
                        isSortable && 'cursor-pointer hover:text-foreground transition-colors'
                      )}>
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {isSortable && col.label && <SortIcon colKey={col.key} />}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-sm text-muted-foreground italic">
                    {search ? 'No matching partners found' : 'No partners registered'}
                  </td>
                </tr>
              ) : (
                paged.map((row, i) => (
                  <tr key={row.id} className={cn('transition-colors', i % 2 === 0 ? 'bg-card' : 'bg-muted/15', 'hover:bg-primary/[0.04]', row.status === 'suspended' && 'opacity-60')}>
                    <td className="px-2 sm:px-3 py-2 text-[10px] font-bold text-muted-foreground/50 text-center tabular-nums">
                      {safePage * PAGE_SIZE + i + 1}
                    </td>
                    {columns.map(col => (
                      <td key={col.key} className={cn('px-2 sm:px-3 py-2 tabular-nums', col.align === 'right' ? 'text-right' : 'text-left', col.hideOnMobile && 'hidden lg:table-cell')}>
                        {col.render ? col.render(row) : String((row as any)[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/30">
          <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground tabular-nums">
            {processed.length === rows.length ? `${rows.length} partner${rows.length !== 1 ? 's' : ''}` : `${processed.length} of ${rows.length} (filtered)`}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}
                className="p-1 rounded hover:bg-muted disabled:opacity-20 transition-colors"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-xs font-bold tabular-nums text-muted-foreground px-2">{safePage + 1}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}
                className="p-1 rounded hover:bg-muted disabled:opacity-20 transition-colors"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Partner Detail Dialog ─── */}
      <Dialog open={!!detailPartner || detailLoading} onOpenChange={open => { if (!open) { setDetailPartner(null); setEditingPortfolioId(null); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          {detailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : detailPartner ? (
            <>
              {/* Hero Header */}
              <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 pb-4">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center text-xl font-black text-primary shrink-0">
                    {detailPartner.profile.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-black tracking-tight">{detailPartner.profile.full_name}</h2>
                      <Badge variant={detailPartner.profile.frozen_at ? 'destructive' : 'default'} className="text-[10px]">
                        {detailPartner.profile.frozen_at ? 'Suspended' : 'Active'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                      <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{detailPartner.profile.phone || '—'}</span>
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />Joined {formatDate(detailPartner.profile.created_at)}</span>
                    </div>
                    {detailPartner.profile.frozen_at && (
                      <p className="text-[11px] text-destructive mt-1.5 bg-destructive/10 px-2 py-1 rounded-md inline-block">
                        <Shield className="h-3 w-3 inline mr-1" />Suspended: {detailPartner.profile.frozen_reason || 'No reason given'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-5 pb-5 space-y-5">
                {/* Financial Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <MiniKPI icon={<Wallet className="h-3.5 w-3.5" />} label="Wallet Balance" value={formatUGX(detailPartner.walletBalance)} variant="primary" />
                  <MiniKPI icon={<Banknote className="h-3.5 w-3.5" />} label="Total Invested" value={formatUGX(detailPartner.totalFunded)} variant="emerald" />
                  <MiniKPI icon={<TrendingUp className="h-3.5 w-3.5" />} label="ROI Earned" value={formatUGX(detailPartner.totalROIEarned)} variant="amber" />
                  <MiniKPI icon={<Briefcase className="h-3.5 w-3.5" />} label="Portfolios" value={detailPartner.portfolios.length} variant="violet" />
                </div>

                <Separator />

                {/* Portfolio Breakdown */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Investment Portfolios</h3>
                    <Badge variant="outline" className="text-[10px] tabular-nums">{detailPartner.portfolios.length} total</Badge>
                  </div>

                  {detailPartner.portfolios.length === 0 ? (
                    <div className="rounded-xl border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                      No portfolios found for this partner.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {detailPartner.portfolios.map((p, idx) => {
                        const isEditing = editingPortfolioId === p.id;
                        const monthlyROI = Math.round(p.investment_amount * (p.roi_percentage / 100));
                        const statusColor = p.status === 'active' ? 'bg-primary/10 text-primary' : p.status === 'matured' ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground';

                        return (
                          <Card key={p.id} className={cn('overflow-hidden transition-all', isEditing && 'ring-2 ring-primary/30')}>
                            <div className="p-3.5">
                              {/* Portfolio header row */}
                              <div className="flex items-start justify-between gap-2 mb-2.5">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-black text-primary">
                                    #{idx + 1}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm font-bold">{p.portfolio_code}</p>
                                      <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase', statusColor)}>
                                        {p.status}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">{timeSince(p.created_at)} · {p.duration_months}mo term</p>
                                  </div>
                                </div>
                                <p className="text-base font-black tabular-nums text-right">{formatUGX(p.investment_amount)}</p>
                              </div>

                              {/* Details grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-xs bg-muted/30 rounded-lg p-2.5">
                                <div>
                                  <span className="text-muted-foreground">ROI Rate</span>
                                  <p className="font-bold text-primary">{p.roi_percentage}%</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Monthly ROI</span>
                                  <p className="font-bold">{formatUGX(monthlyROI)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Mode</span>
                                  <p className="font-semibold">{p.roi_mode === 'monthly_compounding' ? '📈 Compound' : '💰 Payout'}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Total Earned</span>
                                  <p className="font-bold text-primary">{formatUGX(p.total_roi_earned)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Invested On</span>
                                  <p className="font-semibold">{formatDate(p.created_at)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Duration</span>
                                  <p className="font-semibold">{p.duration_months} months</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Payout Date</span>
                                  <p className="font-semibold">
                                    {(() => {
                                      const now = new Date();
                                      const day = p.payout_day || 15;
                                      let target = new Date(now.getFullYear(), now.getMonth(), day);
                                      if (target <= now) target = new Date(now.getFullYear(), now.getMonth() + 1, day);
                                      return target.toLocaleDateString('en-UG', { month: 'long', day: 'numeric', year: 'numeric' });
                                    })()}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Payout Status</span>
                                  <p className="font-semibold">
                                    {p.status === 'active'
                                      ? <span className="text-primary">🟢 Active</span>
                                      : <span className="text-amber-600">⏸ {p.status}</span>}
                                  </p>
                                </div>
                              </div>

                              {/* Payout Day Row */}
                              <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-border/50">
                                <div className="flex items-center gap-2 text-xs">
                                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-muted-foreground">Payout Day:</span>
                                  {isEditing ? (
                                    <div className="flex items-center gap-1.5">
                                      <Input
                                        type="number" min={1} max={28}
                                        value={editingPayoutDay}
                                        onChange={e => setEditingPayoutDay(e.target.value)}
                                        className="h-7 w-16 text-xs text-center"
                                      />
                                      <Button size="sm" className="h-7 px-2 text-[10px]" onClick={() => handleSavePortfolioPayoutDay(p.id)} disabled={savingPortfolio}>
                                        {savingPortfolio ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setEditingPortfolioId(null)}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold">{p.payout_day}{getOrdinalSuffix(p.payout_day)} of month</span>
                                      <button
                                        onClick={() => { setEditingPortfolioId(p.id); setEditingPayoutDay(String(p.payout_day)); }}
                                        className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                        title="Edit payout day"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                                {p.next_roi_date && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> Next: {formatDate(p.next_roi_date)}
                                  </span>
                                )}
                              </div>

                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ─── Invest Dialog ─── */}
      <Dialog open={!!investPartner} onOpenChange={open => { if (!open) { setInvestPartner(null); setInvestAmount(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Invest for {investPartner?.name}</DialogTitle>
            <DialogDescription>Deploy capital from partner wallet into the Rent Pool. Min: {formatUGX(MIN_INVEST)}.</DialogDescription>
          </DialogHeader>
          {investPartner && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border/60">
                <Wallet className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">Available:</span>
                <span className="text-sm font-bold">{formatUGX(investPartner.walletBalance)}</span>
              </div>
              <div className="space-y-2">
                <Label>Investment Amount (UGX)</Label>
                <Input type="number" min={MIN_INVEST} max={investPartner.walletBalance} value={investAmount}
                  onChange={e => setInvestAmount(e.target.value)} placeholder={`Min ${MIN_INVEST.toLocaleString()}`} />
                <div className="flex gap-2 flex-wrap">
                  {[50000, 100000, 200000, 500000].filter(a => a <= investPartner.walletBalance).map(a => (
                    <Button key={a} variant="outline" size="sm" className="text-xs h-7" onClick={() => setInvestAmount(String(a))}>{(a / 1000).toFixed(0)}K</Button>
                  ))}
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setInvestAmount(String(investPartner.walletBalance))}>Max</Button>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-xs text-muted-foreground">
                📅 Payout Cycle: <strong className="text-foreground">Every 30 days</strong> from investment date
              </div>
              {investAmount && Number(investAmount) >= MIN_INVEST && (
                <div className="text-xs bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1">
                  <p>Monthly reward ({investPartner.roiPercentage}%): <strong className="text-primary">{formatUGX(Math.round(Number(investAmount) * (investPartner.roiPercentage / 100)))}</strong></p>
                  <p>Remaining wallet: <strong>{formatUGX(investPartner.walletBalance - Number(investAmount))}</strong></p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvestPartner(null)}>Cancel</Button>
            <Button onClick={handleInvest} disabled={investing || !investAmount || Number(investAmount) < MIN_INVEST}>
              {investing && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Confirm Investment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ─── */}
      <Dialog open={!!editPartner} onOpenChange={open => { if (!open) setEditPartner(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-primary" /> Edit Partner</DialogTitle>
            <DialogDescription>Update partner profile, ROI rate, and mode.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Full Name</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ROI Percentage (%)</Label>
              <Input type="number" min={1} max={100} value={editRoi} onChange={e => setEditRoi(e.target.value)} />
              <div className="flex gap-1.5">
                {[10, 15, 20, 25].map(v => (
                  <Button key={v} variant={editRoi === String(v) ? 'default' : 'outline'} size="sm" className="text-[10px] h-6 px-2 flex-1"
                    onClick={() => setEditRoi(String(v))}>{v}%</Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ROI Payment Mode</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={editRoiMode === 'monthly_payout' ? 'default' : 'outline'} size="sm" className="text-xs h-9"
                  onClick={() => setEditRoiMode('monthly_payout')}>
                  <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" /> Monthly Payout
                </Button>
                <Button variant={editRoiMode === 'monthly_compounding' ? 'default' : 'outline'} size="sm" className="text-xs h-9"
                  onClick={() => setEditRoiMode('monthly_compounding')}>
                  <TrendingUp className="h-3.5 w-3.5 mr-1.5" /> Compounding
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {editRoiMode === 'monthly_compounding' ? 'Returns are reinvested monthly, growing the principal.' : 'Returns are paid out to wallet each month.'}
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2.5">
              💡 To edit the <strong>Payout Day</strong> for individual investments, click the partner name to view their portfolio breakdown.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPartner(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editName.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Suspend / Reactivate Confirm ─── */}
      <AlertDialog open={!!suspendPartner} onOpenChange={open => { if (!open) setSuspendPartner(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{suspendPartner?.status === 'active' ? 'Suspend Partner' : 'Reactivate Partner'}</AlertDialogTitle>
            <AlertDialogDescription>
              {suspendPartner?.status === 'active'
                ? <>This will suspend <strong>{suspendPartner?.name}</strong>. They will lose access to partner features until reactivated.</>
                : <>This will reactivate <strong>{suspendPartner?.name}</strong> and restore their partner access.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleSuspend} disabled={suspending}
              className={suspendPartner?.status === 'active' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}>
              {suspending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {suspendPartner?.status === 'active' ? 'Suspend' : 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <PartnerImportDialog open={importOpen} onOpenChange={setImportOpen} onSuccess={fetchData} />
    </div>
  );
}

/* ─── Summary Card ─── */
function SummaryCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string | number; sub: string;
  accent: 'primary' | 'emerald' | 'amber' | 'violet';
}) {
  const styles = {
    primary: { card: 'border-primary/30 bg-primary/5', icon: 'text-primary bg-primary/10' },
    emerald: { card: 'border-primary/20 bg-primary/[0.03]', icon: 'text-primary bg-primary/10' },
    amber: { card: 'border-amber-500/20 bg-amber-500/5', icon: 'text-amber-600 bg-amber-500/10' },
    violet: { card: 'border-violet-500/20 bg-violet-500/5', icon: 'text-violet-600 bg-violet-500/10' },
  };
  const s = styles[accent];
  return (
    <div className={cn('rounded-2xl border p-3.5 space-y-2', s.card)}>
      <div className="flex items-center gap-2">
        <div className={cn('p-1.5 rounded-lg', s.icon)}>{icon}</div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-black tracking-tight tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground leading-snug">{sub}</p>
    </div>
  );
}

/* ─── Mini KPI ─── */
function MiniKPI({ icon, label, value, variant }: {
  icon: React.ReactNode; label: string; value: string | number;
  variant: 'primary' | 'emerald' | 'amber' | 'violet';
}) {
  const colors = {
    primary: 'border-primary/30 bg-primary/5',
    emerald: 'border-primary/20 bg-primary/[0.03]',
    amber: 'border-amber-500/20 bg-amber-500/5',
    violet: 'border-violet-500/20 bg-violet-500/5',
  };
  return (
    <div className={cn('rounded-xl border p-2.5 text-center', colors[variant])}>
      <div className="flex justify-center mb-1 text-muted-foreground">{icon}</div>
      <p className="text-xs font-black tabular-nums">{value}</p>
      <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold mt-0.5">{label}</p>
    </div>
  );
}
