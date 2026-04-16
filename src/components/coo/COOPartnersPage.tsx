import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import {
  dateOnlyToLocalDate,
  dateOnlyToUtcMiddayIso,
  extractDateOnly,
  formatDateOnlyForDisplay,
  formatLocalDateOnly,
} from '@/lib/portfolioDates';
import {
  Loader2, Search, X, Download, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  ChevronsUpDown, MoreHorizontal, TrendingUp, Pencil, Wallet, Ban, PlayCircle,
  Users, Banknote, PiggyBank, ArrowUpRight, Filter, RefreshCw, Phone, Calendar as CalendarIcon,
  CalendarDays, Shield, CheckCircle2, Clock, Briefcase, Save, Upload, Trash2,
  Plus, FileText, Share2, ArrowRightLeft, ShieldCheck, Handshake, Scissors, Info
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { downloadPortfolioPdf, sharePortfolioViaWhatsApp, type PortfolioPdfData } from '@/lib/portfolioPdf';
import { fetchAllUserIdsByRole, batchedQuery, fetchPaginatedSupporterIds, fetchSupporterSummary, fetchAllNearingPayoutPortfolios } from '@/lib/supabaseBatchUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
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
import { Slider } from '@/components/ui/slider';
import PartnerImportDialog from './PartnerImportDialog';
import UpdateContributionDatesDialog from './UpdateContributionDatesDialog';


/** Roll a stale next_roi_date forward month-by-month until it's >= today */
function getNextPayoutDate(nextRoiDate: string | null, createdAt: string, payoutDay: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const createdDateOnly = extractDateOnly(createdAt);
  const createdDate = createdDateOnly ? dateOnlyToLocalDate(createdDateOnly) : new Date(createdAt);
  const day = Math.min(payoutDay || createdDate.getDate(), 28);

  let d: Date;
  if (nextRoiDate) {
    d = dateOnlyToLocalDate(nextRoiDate);
  } else {
    const base = createdDate;
    d = new Date(base.getFullYear(), base.getMonth() + 1, day);
  }
  // Do NOT roll forward — preserve the actual stored date so overdue/missed dates remain visible.
  // Date only advances when CFO approves the payout.
  return formatLocalDateOnly(d);
}
import { RenewPortfolioDialog } from '@/components/manager/RenewPortfolioDialog';
import { FundInvestmentAccountDialog } from '@/components/manager/FundInvestmentAccountDialog';
import { CreateInvestmentAccountDialog } from '@/components/manager/CreateInvestmentAccountDialog';

/* ─── Types ─── */
interface PartnerRow {
  id: string;
  name: string;
  phone: string;
  email: string;
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
  nextRoiDate: string | null;
}

interface NearingPayoutPortfolio {
  portfolioId: string;
  investorId: string;
  name: string;
  portfolioName: string;
  phone: string;
  email: string;
  investmentAmount: number;
  roiPercentage: number;
  payoutDay: number;
  roiMode: string;
  createdAt: string;
  daysUntil: number;
  nextPayoutDate: string;
}

interface PortfolioRow {
  id: string;
  portfolio_code: string;
  account_name: string | null;
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
  investor_id: string | null;
  agent_id: string;
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
  const header = 'Name,Phone,Email,Status,Wallet,Total Funded,Deals,Avg Deal,ROI %,Payout Day,ROI Mode,Joined';
  const csvRows = rows.map(r =>
    `"${r.name}","${r.phone}","${r.email}","${r.status}","${r.walletBalance}","${r.funded}","${r.activeDeals}","${r.avgDeal}","${r.roiPercentage}","${r.payoutDay}","${r.roiMode}","${r.joinedAt}"`
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
  return formatDateOnlyForDisplay(d);
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
export default function COOPartnersPage({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Table state
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>('funded');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('desc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'suspended'>('all');
  const [filterRoiMode, setFilterRoiMode] = useState<'all' | 'monthly_payout' | 'monthly_compounding'>('all');
  const [filterContact, setFilterContact] = useState<'all' | 'has_phone' | 'no_phone' | 'has_email' | 'no_email'>('all');
  const [payoutDateFrom, setPayoutDateFrom] = useState<Date | undefined>(undefined);
  const [payoutDateTo, setPayoutDateTo] = useState<Date | undefined>(undefined);

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

  // Delete partner dialog
  const [deletePartnerTarget, setDeletePartnerTarget] = useState<PartnerRow | null>(null);
  const [deletePartnerReason, setDeletePartnerReason] = useState('');
  const [deletingPartner, setDeletingPartner] = useState(false);

  // Partner Detail view
  const [detailPartner, setDetailPartner] = useState<PartnerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null);
  const [editingPayoutDay, setEditingPayoutDay] = useState('');
  const [savingPortfolio, setSavingPortfolio] = useState(false);
  const [editingNextPayoutId, setEditingNextPayoutId] = useState<string | null>(null);
  const [editingNextPayoutDate, setEditingNextPayoutDate] = useState('');

  // Edit portfolio dialog
  const [editPortfolio, setEditPortfolio] = useState<PortfolioRow | null>(null);
  const [editPortfolioAmount, setEditPortfolioAmount] = useState('');
  const [editPortfolioRoi, setEditPortfolioRoi] = useState('');
  const [editPortfolioRoiMode, setEditPortfolioRoiMode] = useState('monthly_payout');

  // Nearing payouts dialog
  const [nearingPayoutsOpen, setNearingPayoutsOpen] = useState(false);
  const [allPortfoliosForPayout, setAllPortfoliosForPayout] = useState<NearingPayoutPortfolio[]>([]);
  const [editPortfolioDuration, setEditPortfolioDuration] = useState('');
  const [editPortfolioStatus, setEditPortfolioStatus] = useState('');
  const [editPortfolioDate, setEditPortfolioDate] = useState('');
  const [savingEditPortfolio, setSavingEditPortfolio] = useState(false);

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [updateDatesOpen, setUpdateDatesOpen] = useState(false);

  // Delete portfolio dialog
  const [deletePortfolio, setDeletePortfolio] = useState<PortfolioRow | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Renew portfolio dialog
  const [renewPortfolio, setRenewPortfolio] = useState<PortfolioRow | null>(null);
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewalCounts, setRenewalCounts] = useState<Record<string, number>>({});

  // Bulk activate
  const [activatingAll, setActivatingAll] = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [showActivateConfirm, setShowActivateConfirm] = useState(false);

  // Wallet top-up dialog (external deposit)
  const [topUpPortfolio, setTopUpPortfolio] = useState<PortfolioRow | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);

  // Wallet → Portfolio transfer dialog
  const [walletToPortfolio, setWalletToPortfolio] = useState<PortfolioRow | null>(null);
  const [walletToPortfolioAmount, setWalletToPortfolioAmount] = useState('');
  const [walletToPortfolioReason, setWalletToPortfolioReason] = useState('');
  const [walletToPortfolioSaving, setWalletToPortfolioSaving] = useState(false);
  const [walletTransferMethod, setWalletTransferMethod] = useState<'wallet' | 'proxy_agent'>('wallet');
  const [proxyAgentInfo, setProxyAgentInfo] = useState<{ agentId: string; agentName: string; walletBalance: number } | null>(null);
  const [loadingProxyAgent, setLoadingProxyAgent] = useState(false);

  // Pending top-ups per portfolio (status: pending)
  const [pendingTopUps, setPendingTopUps] = useState<Record<string, { count: number; total: number }>>({});
  // Top-ups awaiting Financial Ops verification (status: awaiting_verification)
  const [awaitingVerification, setAwaitingVerification] = useState<Record<string, { count: number; total: number }>>({});
  // Top-ups approved and parked until next ROI cycle (status: approved)
  const [approvedTopUps, setApprovedTopUps] = useState<Record<string, { count: number; total: number }>>({});
  const [applyingTopUps, setApplyingTopUps] = useState<string | null>(null);
  // Merge dialog state
  const [mergeDialogPortfolioId, setMergeDialogPortfolioId] = useState<string | null>(null);
  const [mergeReason, setMergeReason] = useState('');
  const [mergingTopUp, setMergingTopUp] = useState(false);

  // Portfolio name editing
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Add portfolio dialog (within partner detail)
  const [addPortfolioOpen, setAddPortfolioOpen] = useState(false);
  // Top-level create portfolio dialog
  const [createPortfolioOpen, setCreatePortfolioOpen] = useState(false);
  
  const [addPortfolioAmount, setAddPortfolioAmount] = useState('');
  const [addPortfolioRoi, setAddPortfolioRoi] = useState('20');
  const [addPortfolioRoiMode, setAddPortfolioRoiMode] = useState('monthly_payout');
  const [addPortfolioDuration, setAddPortfolioDuration] = useState('12');
  const [addPortfolioPayoutDay, setAddPortfolioPayoutDay] = useState('15');
  const [addPortfolioDate, setAddPortfolioDate] = useState('');
  const [addingPortfolio, setAddingPortfolio] = useState(false);

  // Compound from portfolio view
  const [compoundingPortfolioId, setCompoundingPortfolioId] = useState<string | null>(null);
  const [compoundPreview, setCompoundPreview] = useState<{
    portfolio: PortfolioRow;
    roiAmount: number;
    currentPrincipal: number;
    newPrincipal: number;
    roiPercentage: number;
    nextRoiDate: string;
  } | null>(null);

  const openCompoundPreview = (portfolio: PortfolioRow) => {
    const roiAmount = Math.round(portfolio.investment_amount * portfolio.roi_percentage / 100);
    const newPrincipal = portfolio.investment_amount + roiAmount;
    const currentDate = new Date(portfolio.next_roi_date || new Date());
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + 1);
    const nextRoiDate = newDate.toISOString().split('T')[0];
    setCompoundPreview({
      portfolio,
      roiAmount,
      currentPrincipal: portfolio.investment_amount,
      newPrincipal,
      roiPercentage: portfolio.roi_percentage,
      nextRoiDate,
    });
  };

  const handlePortfolioCompound = async (portfolio: PortfolioRow) => {
    if (!detailPartner) return;
    setCompoundingPortfolioId(portfolio.id);
    try {
      const roiAmount = Math.round(portfolio.investment_amount * portfolio.roi_percentage / 100);
      const newAmount = portfolio.investment_amount + roiAmount;
      const refId = `CMP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Advance next_roi_date by +1 month on compound
      const currentDate = new Date(portfolio.next_roi_date || new Date());
      const newDate = new Date(currentDate);
      newDate.setMonth(newDate.getMonth() + 1);
      const newRoiDate = newDate.toISOString().split('T')[0];

      const { error: upErr } = await supabase
        .from('investor_portfolios')
        .update({ investment_amount: newAmount, next_roi_date: newRoiDate })
        .eq('id', portfolio.id);
      if (upErr) throw upErr;

      // Double-entry ledger: roi_expense + roi_reinvestment
      const { error: ledgerErr } = await supabase.rpc('create_ledger_transaction', {
        entries: [
          {
            user_id: detailPartner.profile.id,
            ledger_scope: 'platform',
            direction: 'cash_out',
            amount: roiAmount,
            category: 'roi_expense',
            description: `ROI compounded: ${formatUGX(roiAmount)} reinvested into portfolio. New principal: ${formatUGX(newAmount)}. Ref: ${refId}`,
            reference_id: refId,
            source_table: 'investor_portfolios',
            source_id: portfolio.id,
            linked_party: user.id,
            currency: 'UGX',
          },
          {
            user_id: detailPartner.profile.id,
            ledger_scope: 'platform',
            direction: 'cash_in',
            amount: roiAmount,
            category: 'roi_reinvestment',
            description: `ROI reinvestment: ${formatUGX(roiAmount)} added to principal. New principal: ${formatUGX(newAmount)}. Ref: ${refId}`,
            reference_id: refId,
            source_table: 'investor_portfolios',
            source_id: portfolio.id,
            linked_party: user.id,
            currency: 'UGX',
          },
        ],
      });
      if (ledgerErr) throw ledgerErr;

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'roi_compounded',
        table_name: 'investor_portfolios',
        record_id: portfolio.id,
        metadata: { roi_amount: roiAmount, new_principal: newAmount, reference: refId, partner_id: detailPartner.profile.id, new_roi_date: newRoiDate },
      });

      await supabase.from('notifications').insert({
        user_id: detailPartner.profile.id,
        title: 'Portfolio ROI Compounded',
        message: `Your ROI of ${formatUGX(roiAmount)} has been compounded into your portfolio. New investment total: ${formatUGX(newAmount)}. Next payout: ${newRoiDate}. Ref: ${refId}`,
        type: 'portfolio_update',
        metadata: { portfolio_id: portfolio.id, roi_amount: roiAmount, reference: refId },
      });

      toast.success(`Compounded ${formatUGX(roiAmount)}`, { description: `New principal: ${formatUGX(newAmount)}. Ref: ${refId}` });
      // Refresh detail view
      if (detailPartner?.profile?.id) openPartnerDetail(detailPartner.profile.id);
      refreshInBackground();
    } catch (err: any) {
      toast.error('Compound failed', { description: err.message });
    } finally {
      setCompoundingPortfolioId(null);
    }
  };

  /* ─── Core fetch logic: server-side paginated ─── */
  const fetchDataCore = useCallback(async (fetchPage: number, searchTerm: string) => {
    const { ids: supporterIds, totalCount: count } = await fetchPaginatedSupporterIds(fetchPage, PAGE_SIZE, searchTerm);
    setTotalCount(count);

    if (supporterIds.length === 0) {
      setRows([]);
      if (count === 0) {
        setSummary({ totalPartners: 0, activePartners: 0, suspendedPartners: 0, totalFunded: 0, totalWalletBalance: 0, avgROI: 0, totalDeals: 0, topPartnerName: '—' });
      }
      return;
    }

    const ids = supporterIds;
    const [profiles, wallets, portfolios] = await Promise.all([
      batchedQuery<any>(ids, (batch) => supabase.from('profiles').select('id, full_name, phone, email, created_at, frozen_at').in('id', batch)),
      batchedQuery<any>(ids, (batch) => supabase.from('wallets').select('user_id, balance').in('user_id', batch)),
      batchedQuery<any>(ids, (batch) =>
        supabase.from('investor_portfolios')
          .select('id, investor_id, agent_id, investment_amount, roi_percentage, payout_day, roi_mode, status, created_at, next_roi_date')
          .or(`investor_id.in.(${batch.join(',')}),agent_id.in.(${batch.join(',')})`)
          .in('status', ['active', 'pending_approval', 'pending'])
          .order('created_at', { ascending: false })
      ),
    ]);

    const seenPortfolioIds = new Set<string>();
    const dedupedPortfolios = (portfolios as any[]).filter(p => {
      if (seenPortfolioIds.has(p.id)) return false;
      seenPortfolioIds.add(p.id);
      return true;
    });

    const profileMap = new Map((profiles as any[]).map(p => [p.id, p]));
    const walletMap = new Map((wallets as any[]).map(w => [w.user_id, w.balance || 0]));

    const supporterIdSet = new Set(ids);
    const partnerAgg = new Map<string, { funded: number; deals: number; roiPercentage: number; payoutDay: number; roiMode: string; lastActivity: string; nextRoiDate: string | null }>();

    dedupedPortfolios.forEach(p => {
      const ownerId = p.investor_id && supporterIdSet.has(p.investor_id)
        ? p.investor_id
        : p.agent_id && supporterIdSet.has(p.agent_id)
          ? p.agent_id
          : null;
      if (!ownerId) return;

      const existing = partnerAgg.get(ownerId) || { funded: 0, deals: 0, roiPercentage: 0, payoutDay: 0, roiMode: 'monthly_payout', lastActivity: '', nextRoiDate: null as string | null };
      existing.funded += (p.investment_amount || 0);
      existing.deals += 1;
      if (existing.deals === 1 || !existing.roiPercentage) {
        existing.roiPercentage = p.roi_percentage ?? 15;
        existing.payoutDay = p.payout_day ?? 15;
        existing.roiMode = p.roi_mode ?? 'monthly_payout';
      }
      const effectiveDate = getNextPayoutDate(p.next_roi_date, p.created_at, p.payout_day ?? 15);
      if (!existing.nextRoiDate || effectiveDate < existing.nextRoiDate) {
        existing.nextRoiDate = effectiveDate;
      }
      if (!existing.lastActivity || p.created_at > existing.lastActivity) {
        existing.lastActivity = p.created_at;
      }
      partnerAgg.set(ownerId, existing);
    });

    const tableRows: PartnerRow[] = ids.map(id => {
      const agg = partnerAgg.get(id) || { funded: 0, deals: 0, roiPercentage: 15, payoutDay: 15, roiMode: 'monthly_payout', lastActivity: '', nextRoiDate: null };
      const profile = profileMap.get(id);
      const isSuspended = !!profile?.frozen_at;
      return {
        id,
        name: profile?.full_name || id.slice(0, 8),
        phone: profile?.phone || '',
        email: profile?.email || '',
        funded: agg.funded,
        activeDeals: agg.deals,
        avgDeal: agg.deals > 0 ? Math.round(agg.funded / agg.deals) : 0,
        walletBalance: walletMap.get(id) || 0,
        roiPercentage: agg.roiPercentage,
        payoutDay: agg.payoutDay,
        roiMode: agg.roiMode,
        status: (isSuspended ? 'suspended' : 'active') as 'active' | 'suspended',
        joinedAt: profile?.created_at || '',
        lastActivity: agg.lastActivity || '',
        nextRoiDate: agg.nextRoiDate,
      };
    });

    setRows(tableRows);
  }, []);

  /* ─── Nearing payouts: loaded independently from ALL supporters ─── */
  const [nearingPayoutsLoading, setNearingPayoutsLoading] = useState(false); // eslint-disable-line -- top-level hook, after all other useState
  const fetchNearingPayoutsAsync = useCallback(async () => {
    setNearingPayoutsLoading(true);
    try {
      const { portfolios, profileMap, supporterIds } = await fetchAllNearingPayoutPortfolios();
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const nearingList: NearingPayoutPortfolio[] = [];
      portfolios.forEach(p => {
        if (p.status !== 'active') return;
        if (!p.next_roi_date) return;
        const ownerId = p.investor_id && supporterIds.has(p.investor_id) ? p.investor_id
          : p.agent_id && supporterIds.has(p.agent_id) ? p.agent_id : null;
        if (!ownerId) return;

        const effectiveNextDate = getNextPayoutDate(p.next_roi_date, p.created_at, p.payout_day ?? 15);
        const roiDate = dateOnlyToLocalDate(effectiveNextDate);
        const diffMs = roiDate.getTime() - now.getTime();
        const du = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const prof = profileMap.get(ownerId);
        const effectivePayoutDay = p.payout_day || roiDate.getDate();
        nearingList.push({
          portfolioId: p.id,
          investorId: ownerId,
          name: prof?.full_name || ownerId.slice(0, 8),
          portfolioName: p.account_name || p.portfolio_code || p.id.slice(0, 8),
          phone: prof?.phone || '',
          email: prof?.email || '',
          investmentAmount: p.investment_amount || 0,
          roiPercentage: p.roi_percentage ?? 15,
          payoutDay: effectivePayoutDay,
          roiMode: p.roi_mode ?? 'monthly_payout',
          createdAt: p.created_at,
          daysUntil: du,
          nextPayoutDate: effectiveNextDate,
        });
      });
      nearingList.sort((a, b) => a.daysUntil - b.daysUntil);
      setAllPortfoliosForPayout(nearingList);
    } catch (e) {
      console.error('Nearing payouts fetch error:', e);
    } finally {
      setNearingPayoutsLoading(false);
    }
  }, []);

  /* ─── Summary stats (fetched once, cached) ─── */
  const fetchSummaryStats = useCallback(async () => {
    try {
      const stats = await fetchSupporterSummary();
      setSummary({
        ...stats,
        avgROI: 0,
        topPartnerName: '—',
      });
    } catch (e) {
      console.error('Summary stats error:', e);
    }
  }, []);

  /* ─── Initial fetch (with loading spinner) ─── */
  const isInitialLoad = useRef(true);
  const fetchData = useCallback(async () => {
    // Only show full spinner on first load, not on search/page changes
    if (isInitialLoad.current) {
      setIsLoading(true);
    } else {
      setIsSearching(true);
    }
    try { await fetchDataCore(page, debouncedSearch); }
    catch (e) { console.error(e); }
    finally {
      setIsLoading(false);
      setIsSearching(false);
      isInitialLoad.current = false;
    }
  }, [fetchDataCore, page, debouncedSearch]);

  /* ─── Background refresh (no spinner, no page flash) ─── */
  const refreshInBackground = useCallback(async () => {
    try {
      await Promise.all([
        fetchDataCore(page, debouncedSearch),
        fetchNearingPayoutsAsync(),
      ]);
    }
    catch (e) { console.error('Background refresh error:', e); }
  }, [fetchDataCore, page, debouncedSearch, fetchNearingPayoutsAsync]);

  // Fetch pending_approval count
  const fetchPendingCount = useCallback(async () => {
    const { count } = await supabase
      .from('investor_portfolios')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_approval');
    setPendingApprovalCount(count || 0);
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { fetchData(); fetchPendingCount(); }, [fetchData, fetchPendingCount]);

  // Fetch summary stats + nearing payouts once on mount (independent)
  useEffect(() => { fetchSummaryStats(); }, [fetchSummaryStats]);
  useEffect(() => { fetchNearingPayoutsAsync(); }, [fetchNearingPayoutsAsync]);

  // Single portfolio approve
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const handleApprovePortfolio = async (portfolioId: string) => {
    setApprovingId(portfolioId);
    try {
      const { error } = await supabase
        .from('investor_portfolios')
        .update({ status: 'active' })
        .eq('id', portfolioId)
        .eq('status', 'pending_approval');

      if (error) throw error;

      // Also approve any linked pending_wallet_operations
      await supabase
        .from('pending_wallet_operations')
        .update({ status: 'approved' })
        .eq('source_id', portfolioId)
        .eq('status', 'pending');

      // Audit log
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        user_id: currentUser?.id,
        action_type: 'approve_portfolio',
        table_name: 'investor_portfolios',
        record_id: portfolioId,
        metadata: { approved_individually: true },
      });

      toast.success('Portfolio approved and activated');
      // Refresh detail view
      if (detailPartner?.profile?.id) openPartnerDetail(detailPartner.profile.id);
      fetchPendingCount();
    } catch (e: any) {
      toast.error(e.message || 'Failed to approve portfolio');
    } finally {
      setApprovingId(null);
    }
  };

  // Bulk activate all pending_approval portfolios
  const handleBulkActivate = async () => {
    setActivatingAll(true);
    try {
      const { error } = await supabase
        .from('investor_portfolios')
        .update({ status: 'active' })
        .eq('status', 'pending_approval');

      if (error) throw error;

      toast.success(`${pendingApprovalCount} portfolios activated successfully`);
      setShowActivateConfirm(false);
      setPendingApprovalCount(0);
      refreshInBackground();
    } catch (e: any) {
      console.error('Bulk activate error:', e);
      toast.error(e.message || 'Failed to activate portfolios');
    } finally {
      setActivatingAll(false);
    }
  };

  /* ─── Open Partner Detail ─── */
  async function openPartnerDetail(partnerId: string) {
    setDetailLoading(true);
    setDetailPartner(null);
    try {
      const [profileRes, walletRes, portfolioRes, ledgerRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, phone, created_at, frozen_at, frozen_reason').eq('id', partnerId).single(),
        supabase.from('wallets').select('balance').eq('user_id', partnerId).single(),
        supabase.from('investor_portfolios')
          .select('id, portfolio_code, account_name, investment_amount, roi_percentage, payout_day, roi_mode, status, created_at, maturity_date, total_roi_earned, duration_months, next_roi_date, investor_id, agent_id')
          .or(`investor_id.eq.${partnerId},agent_id.eq.${partnerId}`)
          .order('created_at', { ascending: false }),
        supabase.from('general_ledger')
          .select('amount, direction, category')
          .eq('user_id', partnerId)
          .in('category', ['supporter_rent_fund', 'supporter_facilitation_capital', 'coo_proxy_investment']),
      ]);

      const ledgerData = ledgerRes.data || [];
      const ledgerFunded = ledgerData.filter(e => e.direction === 'cash_out').reduce((s, e) => s + (e.amount || 0), 0);
      const ledgerDeals = ledgerData.filter(e => e.direction === 'cash_out').length;
      const portfolios = (portfolioRes.data || []) as PortfolioRow[];
      const totalROIEarned = portfolios.reduce((s, p) => s + (p.total_roi_earned || 0), 0);

      // Fetch renewal counts and pending top-ups for these portfolios
      const portfolioIds = portfolios.map(p => p.id);
      if (portfolioIds.length > 0) {
        const [renewalsRes, pendingRes] = await Promise.all([
          supabase
            .from('portfolio_renewals')
            .select('portfolio_id')
            .in('portfolio_id', portfolioIds),
          supabase
            .from('pending_wallet_operations')
            .select('source_id, amount, status')
            .in('source_id', portfolioIds)
            .eq('source_table', 'investor_portfolios')
            .eq('operation_type', 'portfolio_topup')
            .in('status', ['pending', 'awaiting_verification', 'approved']),
        ]);
        const counts: Record<string, number> = {};
        (renewalsRes.data || []).forEach(r => { counts[r.portfolio_id] = (counts[r.portfolio_id] || 0) + 1; });
        setRenewalCounts(counts);

        const pending: Record<string, { count: number; total: number }> = {};
        const awaiting: Record<string, { count: number; total: number }> = {};
        const approved: Record<string, { count: number; total: number }> = {};
        (pendingRes.data || []).forEach((op: any) => {
          const key = op.source_id;
          if (op.status === 'approved') {
            if (!approved[key]) approved[key] = { count: 0, total: 0 };
            approved[key].count += 1;
            approved[key].total += Number(op.amount);
          } else if (op.status === 'awaiting_verification') {
            if (!awaiting[key]) awaiting[key] = { count: 0, total: 0 };
            awaiting[key].count += 1;
            awaiting[key].total += Number(op.amount);
          } else {
            if (!pending[key]) pending[key] = { count: 0, total: 0 };
            pending[key].count += 1;
            pending[key].total += Number(op.amount);
          }
        });
        setPendingTopUps(pending);
        setAwaitingVerification(awaiting);
        setApprovedTopUps(approved);
      }

      // For imported partners with no ledger entries, derive totals from portfolio records
      const portfolioFunded = portfolios.reduce((s, p) => s + (p.investment_amount || 0), 0);
      const totalFunded = ledgerFunded > 0 ? ledgerFunded : portfolioFunded;
      const totalDeals = ledgerDeals > 0 ? ledgerDeals : portfolios.length;

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

  /* ─── Submit Pending Top-Ups for Financial Ops Verification ─── */
  async function handleApplyPendingTopUps(portfolioId: string) {
    setApplyingTopUps(portfolioId);
    try {
      const { data, error } = await supabase.functions.invoke('apply-pending-topups', {
        body: { portfolio_id: portfolioId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(`${data.count} deposit(s) submitted for verification`, {
        description: `UGX ${Number(data.total_amount).toLocaleString()} sent to Financial Operations for approval.`,
      });
      if (detailPartner?.profile?.id) openPartnerDetail(detailPartner.profile.id);
    } catch (e: any) {
      toast.error('Failed to submit for verification', { description: e.message });
    } finally {
      setApplyingTopUps(null);
    }
  }

  /* ─── Merge Approved Top-Ups Into Portfolio Principal ─── */
  async function handleMergePendingTopUps() {
    if (!mergeDialogPortfolioId || mergeReason.trim().length < 10) return;
    setMergingTopUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('merge-pending-topups', {
        body: { portfolio_id: mergeDialogPortfolioId, reason: mergeReason.trim() },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(`Merged ${formatUGX(data.merged_amount)} into principal`, {
        description: `New capital: ${formatUGX(data.new_capital)}. ${data.ops_count} top-up(s) applied.`,
      });
      setMergeDialogPortfolioId(null);
      setMergeReason('');
      if (detailPartner?.profile?.id) openPartnerDetail(detailPartner.profile.id);
      refreshInBackground();
    } catch (e: any) {
      toast.error('Failed to merge top-ups', { description: e.message });
    } finally {
      setMergingTopUp(false);
    }
  }

  /* ─── Save portfolio account name ─── */
  async function handleSavePortfolioName(portfolioId: string) {
    const trimmed = editingNameValue.trim();
    setSavingName(true);
    try {
      const { error } = await supabase
        .from('investor_portfolios')
        .update({ account_name: trimmed || null })
        .eq('id', portfolioId);
      if (error) throw error;

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        user_id: currentUser?.id,
        action_type: 'edit_portfolio_name',
        table_name: 'investor_portfolios',
        record_id: portfolioId,
        metadata: { new_name: trimmed },
      });

      toast.success(trimmed ? 'Portfolio name updated' : 'Portfolio name removed');
      setEditingNameId(null);
      if (detailPartner) {
        const updated = detailPartner.portfolios.map(p =>
          p.id === portfolioId ? { ...p, account_name: trimmed || null } : p
        );
        setDetailPartner({ ...detailPartner, portfolios: updated });
      }
    } catch (e: any) { toast.error(e.message || 'Failed to update name'); }
    finally { setSavingName(false); }
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

  /* ─── Save next payout date ─── */
  async function handleSaveNextPayoutDate(portfolioId: string) {
    if (!editingNextPayoutDate) { toast.error('Please select a date'); return; }
    setSavingPortfolio(true);
    try {
      const { error } = await supabase
        .from('investor_portfolios')
        .update({ next_roi_date: editingNextPayoutDate })
        .eq('id', portfolioId);
      if (error) throw error;
      toast.success('Next payout date updated');
      setEditingNextPayoutId(null);
      if (detailPartner) {
        const updated = detailPartner.portfolios.map(p =>
          p.id === portfolioId ? { ...p, next_roi_date: editingNextPayoutDate } : p
        );
        setDetailPartner({ ...detailPartner, portfolios: updated });
      }
    } catch (e: any) { toast.error(e.message || 'Failed to update'); }
    finally { setSavingPortfolio(false); }
  }

  /* ─── Delete Portfolio ─── */
  async function handleDeletePortfolio() {
    if (!deletePortfolio || !deleteReason.trim()) {
      toast.error('Please provide a reason for deletion');
      return;
    }
    if (deleteReason.trim().length < 10) {
      toast.error('Reason must be at least 10 characters');
      return;
    }
    setDeleting(true);
    try {
      // Get current user for audit
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Log to audit_logs before deletion
      const { error: auditErr } = await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'delete_investment_portfolio',
        table_name: 'investor_portfolios',
        record_id: deletePortfolio.id,
        metadata: {
          portfolio_code: deletePortfolio.portfolio_code,
          investment_amount: deletePortfolio.investment_amount,
          roi_percentage: deletePortfolio.roi_percentage,
          status: deletePortfolio.status,
          created_at: deletePortfolio.created_at,
          reason: deleteReason.trim(),
          partner_id: detailPartner?.profile.id,
          partner_name: detailPartner?.profile.full_name,
        },
      });
      if (auditErr) throw auditErr;

      // Delete the portfolio
      const { error: delErr } = await supabase
        .from('investor_portfolios')
        .delete()
        .eq('id', deletePortfolio.id);
      if (delErr) throw delErr;

      toast.success(`Portfolio ${deletePortfolio.portfolio_code} deleted`, { description: 'Action logged for audit.' });

      // Update local state
      if (detailPartner) {
        const updated = detailPartner.portfolios.filter(p => p.id !== deletePortfolio.id);
        setDetailPartner({ ...detailPartner, portfolios: updated });
      }
      setDeletePortfolio(null);
      setDeleteReason('');
      refreshInBackground();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete portfolio');
    } finally {
      setDeleting(false);
    }
  }

  /* ─── Add New Portfolio ─── */
  async function handleAddPortfolio() {
    if (!detailPartner) return;
    const amt = Number(addPortfolioAmount);
    const roi = Number(addPortfolioRoi);
    const duration = Number(addPortfolioDuration);

    if (isNaN(amt) || amt < MIN_INVEST) { toast.error(`Minimum investment: ${formatUGX(MIN_INVEST)}`); return; }
    if (isNaN(roi) || roi <= 0 || roi > 100) { toast.error('ROI must be between 1 and 100'); return; }
    if (isNaN(duration) || duration < 1 || duration > 60) { toast.error('Duration must be 1-60 months'); return; }

    setAddingPortfolio(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const partnerId = detailPartner.profile.id;
      const portfolioCode = `WIP${new Date().toISOString().slice(2, 10).replace(/-/g, '')}${Math.floor(1000 + Math.random() * 9000)}`;
      const createdAt = addPortfolioDate ? dateOnlyToUtcMiddayIso(addPortfolioDate) : new Date().toISOString();
      const contributionDate = addPortfolioDate ? dateOnlyToLocalDate(addPortfolioDate) : new Date();
      const payoutDay = Math.min(contributionDate.getDate(), 28);
      const maturityDate = new Date(contributionDate);
      maturityDate.setMonth(maturityDate.getMonth() + duration);

      // next_roi_date = exactly one month from contribution date
      const nextRoiDate = new Date(contributionDate);
      nextRoiDate.setMonth(nextRoiDate.getMonth() + 1);

      const { data: newPortfolio, error: insertErr } = await supabase
        .from('investor_portfolios')
        .insert({
          investor_id: partnerId,
          agent_id: partnerId,
          investment_amount: amt,
          roi_percentage: roi,
          roi_mode: addPortfolioRoiMode,
          duration_months: duration,
          payout_day: payoutDay,
          portfolio_code: portfolioCode,
          portfolio_pin: String(Math.floor(1000 + Math.random() * 9000)),
          activation_token: crypto.randomUUID(),
          status: 'active',
          created_at: createdAt,
          maturity_date: formatLocalDateOnly(maturityDate),
          next_roi_date: formatLocalDateOnly(nextRoiDate),
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      const refId = Math.floor(1000000000000 + Math.random() * 9000000000000).toString();
      await supabase.from('general_ledger').insert({
        user_id: partnerId,
        amount: amt,
        direction: 'cash_out',
        category: 'coo_manual_portfolio',
        source_table: 'investor_portfolios',
        source_id: newPortfolio.id,
        reference_id: refId,
        description: `Manual portfolio created by Welile Operations for ${detailPartner.profile.full_name}`,
          currency: 'UGX',
        linked_party: 'Rent Management Pool',
        transaction_date: createdAt,
      });

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'create_manual_portfolio',
        table_name: 'investor_portfolios',
        record_id: newPortfolio.id,
        metadata: {
          partner_id: partnerId,
          partner_name: detailPartner.profile.full_name,
          investment_amount: amt,
          roi_percentage: roi,
          roi_mode: addPortfolioRoiMode,
          duration_months: duration,
          portfolio_code: portfolioCode,
          reference_id: refId,
        },
      });

      toast.success(`Portfolio ${portfolioCode} created`, { description: `${formatUGX(amt)} · ${roi}% ROI · ${duration}mo` });

      setAddPortfolioOpen(false);
      setAddPortfolioAmount('');
      setAddPortfolioRoi('20');
      setAddPortfolioRoiMode('monthly_payout');
      setAddPortfolioDuration('12');
      setAddPortfolioPayoutDay('15');
      setAddPortfolioDate('');
      await openPartnerDetail(partnerId);
      refreshInBackground();
    } catch (e: any) {
      console.error('Add portfolio error:', e);
      toast.error(e.message || 'Failed to create portfolio');
    } finally {
      setAddingPortfolio(false);
    }
  }

  /* ─── Open Edit Portfolio ─── */
  function openEditPortfolio(p: PortfolioRow) {
    setEditPortfolio(p);
    setEditPortfolioAmount(String(p.investment_amount));
    setEditPortfolioRoi(String(p.roi_percentage));
    setEditPortfolioRoiMode(p.roi_mode || 'monthly_payout');
    setEditPortfolioDuration(String(p.duration_months));
    setEditPortfolioStatus(p.status);
    setEditPortfolioDate(extractDateOnly(p.created_at) || '');
  }

  /* ─── Save Edit Portfolio ─── */
  async function handleSaveEditPortfolio() {
    if (!editPortfolio || !detailPartner) return;
    const amount = Number(editPortfolioAmount);
    const roi = Number(editPortfolioRoi);
    const duration = Number(editPortfolioDuration);
    if (isNaN(amount) || amount < MIN_INVEST) { toast.error(`Min investment: ${formatUGX(MIN_INVEST)}`); return; }
    if (isNaN(roi) || roi <= 0 || roi > 100) { toast.error('ROI must be 1-100%'); return; }
    if (isNaN(duration) || duration < 1 || duration > 120) { toast.error('Duration must be 1-120 months'); return; }

    setSavingEditPortfolio(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Audit log the edit
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'edit_investment_portfolio',
        table_name: 'investor_portfolios',
        record_id: editPortfolio.id,
        metadata: {
          portfolio_code: editPortfolio.portfolio_code,
          partner_id: detailPartner.profile.id,
          partner_name: detailPartner.profile.full_name,
          changes: {
            investment_amount: { from: editPortfolio.investment_amount, to: amount },
            roi_percentage: { from: editPortfolio.roi_percentage, to: roi },
            roi_mode: { from: editPortfolio.roi_mode, to: editPortfolioRoiMode },
            duration_months: { from: editPortfolio.duration_months, to: duration },
            status: { from: editPortfolio.status, to: editPortfolioStatus },
            created_at: { from: editPortfolio.created_at, to: editPortfolioDate ? dateOnlyToUtcMiddayIso(editPortfolioDate) : editPortfolio.created_at },
          },
        },
      });

      const updatePayload: Record<string, any> = {
        investment_amount: amount,
        roi_percentage: roi,
        roi_mode: editPortfolioRoiMode,
        duration_months: duration,
        status: editPortfolioStatus,
      };
      if (editPortfolioDate) {
        updatePayload.created_at = dateOnlyToUtcMiddayIso(editPortfolioDate);
      }

      const { error } = await supabase
        .from('investor_portfolios')
        .update(updatePayload)
        .eq('id', editPortfolio.id);
      if (error) throw error;

      toast.success(`Portfolio ${editPortfolio.portfolio_code} updated`);

      // Update local state
      const updated = detailPartner.portfolios.map(p =>
        p.id === editPortfolio.id
          ? { ...p, investment_amount: amount, roi_percentage: roi, roi_mode: editPortfolioRoiMode, duration_months: duration, status: editPortfolioStatus, created_at: editPortfolioDate ? dateOnlyToUtcMiddayIso(editPortfolioDate) : p.created_at }
          : p
      );
      setDetailPartner({ ...detailPartner, portfolios: updated });
      setEditPortfolio(null);
      refreshInBackground();
    } catch (e: any) { toast.error(e.message || 'Failed to update portfolio'); }
    finally { setSavingEditPortfolio(false); }
  }

  /* ─── Filtered / Sorted (local filters on current page, search is server-side) ─── */
  const processed = useMemo(() => {
    let result = [...rows];
    if (filterStatus !== 'all') result = result.filter(r => r.status === filterStatus);
    if (filterRoiMode !== 'all') result = result.filter(r => r.roiMode === filterRoiMode);
    if (filterContact === 'has_phone') result = result.filter(r => r.phone && !r.phone.includes('@'));
    else if (filterContact === 'no_phone') result = result.filter(r => !r.phone || r.phone.includes('@'));
    else if (filterContact === 'has_email') result = result.filter(r => r.email && !r.email.includes('placeholder'));
    else if (filterContact === 'no_email') result = result.filter(r => !r.email || r.email.includes('placeholder'));
    if (payoutDateFrom || payoutDateTo) {
      result = result.filter(r => {
        const portfolioData = (r as any).nextRoiDate;
        if (!portfolioData) return false;
        const nextPayout = new Date(portfolioData + 'T00:00:00');
        if (isNaN(nextPayout.getTime())) return false;
        if (payoutDateFrom && nextPayout < payoutDateFrom) return false;
        if (payoutDateTo && nextPayout > payoutDateTo) return false;
        return true;
      });
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
  }, [rows, sortKey, sortDir, filterStatus, filterRoiMode, filterContact, payoutDateFrom, payoutDateTo]);

  // Server-side pagination: use totalCount for page count, display all rows from current page
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = processed;

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
      refreshInBackground();
    } catch (e: any) { toast.error(e.message || 'Investment failed'); }
    finally { setInvesting(false); }
  }

  /* ─── Fetch proxy agent for wallet transfer dialog ─── */
  async function fetchProxyAgentForPartner(partnerId: string) {
    setLoadingProxyAgent(true);
    setProxyAgentInfo(null);
    try {
      const { data: proxyAssignment } = await supabase
        .from('proxy_agent_assignments')
        .select('agent_id')
        .eq('beneficiary_id', partnerId)
        .eq('is_active', true)
        .eq('approval_status', 'approved')
        .limit(1)
        .maybeSingle();

      if (proxyAssignment?.agent_id) {
        const [profileRes, walletRes] = await Promise.all([
          supabase.from('profiles').select('full_name').eq('id', proxyAssignment.agent_id).single(),
          supabase.from('wallets').select('balance').eq('user_id', proxyAssignment.agent_id).maybeSingle(),
        ]);
        setProxyAgentInfo({
          agentId: proxyAssignment.agent_id,
          agentName: profileRes.data?.full_name || 'Agent',
          walletBalance: walletRes.data ? Number(walletRes.data.balance) : 0,
        });
      }
    } catch { /* ignore */ }
    finally { setLoadingProxyAgent(false); }
  }

  /* ─── Wallet → Portfolio Transfer ─── */
  async function handleWalletToPortfolio() {
    if (!walletToPortfolio || !detailPartner) return;
    const amt = Number(walletToPortfolioAmount);

    const sourceBalance = walletTransferMethod === 'wallet'
      ? detailPartner.walletBalance
      : proxyAgentInfo?.walletBalance ?? 0;

    if (isNaN(amt) || amt < 1000) { toast.error('Minimum: UGX 1,000'); return; }
    if (amt > sourceBalance) { toast.error(`Only ${formatUGX(sourceBalance)} available in ${walletTransferMethod === 'wallet' ? 'partner wallet' : 'proxy agent wallet'}`); return; }
    if (walletToPortfolioReason.trim().length < 10) { toast.error('Reason must be at least 10 characters'); return; }
    if (walletTransferMethod === 'proxy_agent' && !proxyAgentInfo) { toast.error('No proxy agent assigned'); return; }

    setWalletToPortfolioSaving(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('coo-wallet-to-portfolio', {
        body: {
          portfolio_id: walletToPortfolio.id,
          amount: amt,
          reason: walletToPortfolioReason.trim(),
          payment_method: walletTransferMethod,
          source_wallet_user_id: walletTransferMethod === 'proxy_agent' ? proxyAgentInfo?.agentId : detailPartner?.profile?.id,
        },
      });
      if (error) throw new Error(typeof result === 'object' && result?.error ? result.error : error.message);
      if (result?.error) throw new Error(result.error);

      const sourceLabel = walletTransferMethod === 'wallet' ? 'partner wallet' : `${proxyAgentInfo?.agentName}'s wallet`;
      toast.success(`${formatUGX(amt)} top-up processed for ${walletToPortfolio.account_name || walletToPortfolio.portfolio_code}`, {
        description: `Deducted from ${sourceLabel}. Applied at maturity.`,
      });
      setWalletToPortfolio(null);
      setWalletToPortfolioAmount('');
      setWalletToPortfolioReason('');
      setProxyAgentInfo(null);
      if (detailPartner?.profile?.id) openPartnerDetail(detailPartner.profile.id);
      refreshInBackground();
    } catch (e: any) { toast.error(e.message || 'Transfer failed'); }
    finally { setWalletToPortfolioSaving(false); }
  }

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
      refreshInBackground();
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
      refreshInBackground();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSuspending(false); }
  }

  /* ─── Delete Partner (Permanent) ─── */
  async function handleDeletePartner() {
    if (!deletePartnerTarget || deletePartnerReason.length < 10) return;
    setDeletingPartner(true);
    try {
      // Remove supporter role
      const { error: roleErr } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', deletePartnerTarget.id)
        .eq('role', 'supporter');
      if (roleErr) throw roleErr;

      // Freeze the profile with deletion reason
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({
          frozen_at: new Date().toISOString(),
          frozen_reason: `Deleted by COO: ${deletePartnerReason}`,
        })
        .eq('id', deletePartnerTarget.id);
      if (profileErr) throw profileErr;

      // Audit log
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        user_id: currentUser?.id,
        action_type: 'partner_deleted',
        table_name: 'user_roles',
        record_id: deletePartnerTarget.id,
        metadata: {
          partner_name: deletePartnerTarget.name,
          reason: deletePartnerReason,
        },
      });

      toast.success(`${deletePartnerTarget.name} has been permanently deleted as a partner`);
      setDeletePartnerTarget(null);
      setDeletePartnerReason('');
      refreshInBackground();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete partner');
    } finally {
      setDeletingPartner(false);
    }
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
    { key: 'roiPercentage', label: 'Returns', align: 'right', render: (r) => (
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
    { key: 'nextRoiDate', label: 'Next Payout', align: 'right', hideOnMobile: true, render: (r) => (
      <span className="text-muted-foreground">
        {r.nextRoiDate
          ? new Date(r.nextRoiDate + 'T00:00:00').toLocaleDateString('en-UG', { month: 'short', day: 'numeric' })
          : '—'}
      </span>
    )},
    { key: 'joinedAt', label: 'Joined', sortable: true, hideOnMobile: true, render: (r) => (
      <span className="text-muted-foreground text-xs">
        {r.joinedAt ? new Date(r.joinedAt).toLocaleDateString() : '—'}
      </span>
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
            {!readOnly && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={e => { e.stopPropagation(); setSuspendPartner(r); }}
                  className={cn('gap-2', r.status === 'active' ? 'text-amber-600 focus:text-amber-600' : 'text-primary focus:text-primary')}
                >
                  {r.status === 'active' ? <Ban className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
                  {r.status === 'active' ? 'Suspend' : 'Reactivate'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={e => { e.stopPropagation(); setDeletePartnerTarget(r); setDeletePartnerReason(''); }}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete Partner
                </DropdownMenuItem>
              </>
            )}
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
        <div className="flex items-center gap-2 self-start">
          <Button size="sm" className="gap-1.5" onClick={() => setCreatePortfolioOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Create Portfolio
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
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
          <NearingPayoutsCard portfolios={allPortfoliosForPayout} onClick={() => setNearingPayoutsOpen(true)} />
          <a href="/reinvestment-history" className="block">
            <SummaryCard icon={<RefreshCw className="h-4 w-4" />} label="Reinvestment History" value="View"
              sub="Compounding growth timeline" accent="primary" />
           </a>
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
        <Select value={filterContact} onValueChange={(v: any) => { setFilterContact(v); setPage(0); }}>
          <SelectTrigger className="w-[140px] h-9 text-xs"><Phone className="h-3 w-3 mr-1 text-muted-foreground" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contacts</SelectItem>
            <SelectItem value="has_phone">Has Phone</SelectItem>
            <SelectItem value="no_phone">No Phone</SelectItem>
            <SelectItem value="has_email">Has Email</SelectItem>
            <SelectItem value="no_email">No Email</SelectItem>
          </SelectContent>
        </Select>
        {/* Payment Date Range Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-9 gap-1.5 text-xs", (payoutDateFrom || payoutDateTo) && "border-primary text-primary")}>
              <CalendarDays className="h-3.5 w-3.5" />
              {payoutDateFrom && payoutDateTo
                ? `${format(payoutDateFrom, 'MMM d')} – ${format(payoutDateTo, 'MMM d')}`
                : payoutDateFrom
                  ? `From ${format(payoutDateFrom, 'MMM d')}`
                  : payoutDateTo
                    ? `Until ${format(payoutDateTo, 'MMM d')}`
                    : 'Payout Range'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <div className="space-y-3">
              <div className="text-xs font-semibold text-muted-foreground">Filter by next payout date</div>
              <div className="flex gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">From</Label>
                  <Calendar mode="single" selected={payoutDateFrom} onSelect={(d) => { setPayoutDateFrom(d); setSortKey('payoutDay'); setSortDir('asc'); setPage(0); }} className="p-2 pointer-events-auto" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">To</Label>
                  <Calendar mode="single" selected={payoutDateTo} onSelect={(d) => { setPayoutDateTo(d); setSortKey('payoutDay'); setSortDir('asc'); setPage(0); }} className="p-2 pointer-events-auto" />
                </div>
              </div>
              {(payoutDateFrom || payoutDateTo) && (
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setPayoutDateFrom(undefined); setPayoutDateTo(undefined); setPage(0); }}>
                  <X className="h-3 w-3 mr-1" /> Clear Date Range
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => setImportOpen(true)}>
          <Upload className="h-3.5 w-3.5" /> Import
        </Button>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => setUpdateDatesOpen(true)}>
          <CalendarDays className="h-3.5 w-3.5" /> Update Dates
        </Button>
        {pendingApprovalCount > 0 && (
          <Button
            size="sm"
            className="h-9 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => setShowActivateConfirm(true)}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Activate All ({pendingApprovalCount})
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs ml-auto" onClick={() => exportToCSV(processed)}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className={cn("rounded-xl border border-border bg-card shadow-sm overflow-hidden relative", isSearching && "opacity-60 pointer-events-none")}>
        {isSearching && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/30">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
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
      <Dialog open={!!detailPartner || detailLoading} onOpenChange={open => { if (!open) { setDetailPartner(null); setEditingPortfolioId(null); setEditingNextPayoutId(null); } }}>
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
                      <span className="inline-flex items-center gap-1"><CalendarIcon className="h-3 w-3" />Joined {formatDate(detailPartner.profile.created_at)}</span>
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
                  <MiniKPI icon={<Banknote className="h-3.5 w-3.5" />} label="Principal" value={formatUGX(detailPartner.totalFunded)} variant="emerald" />
                  <MiniKPI icon={<TrendingUp className="h-3.5 w-3.5" />} label="Returns Earned" value={formatUGX(detailPartner.totalROIEarned)} variant="amber" />
                  <MiniKPI icon={<Briefcase className="h-3.5 w-3.5" />} label="Portfolios" value={detailPartner.portfolios.length} variant="violet" />
                </div>

                <Separator />

                {/* Portfolio Breakdown */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Investment Portfolios</h3>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-7 px-3 text-[10px] gap-1"
                        onClick={() => setAddPortfolioOpen(true)}
                      >
                        <Plus className="h-3 w-3" /> Add Portfolio
                      </Button>
                      <Badge variant="outline" className="text-[10px] tabular-nums">{detailPartner.portfolios.length} total</Badge>
                    </div>
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
                              <div className="flex items-start gap-2 mb-2.5">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-black text-primary shrink-0">
                                  #{idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  {/* Account name above ID */}
                                  {p.account_name && editingNameId !== p.id && (
                                    <p className="text-xs font-semibold text-foreground leading-tight truncate">{p.account_name}</p>
                                  )}
                                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                    <div className="flex items-center gap-1.5">
                                      <p className={cn('text-sm font-bold truncate', p.account_name ? 'text-muted-foreground text-xs' : '')}>{p.portfolio_code}</p>
                                      <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase whitespace-nowrap shrink-0', statusColor)}>
                                        {p.status}
                                      </span>
                                    </div>
                                    {approvedTopUps[p.id]?.total > 0 && (
                                       <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 whitespace-nowrap shrink-0">
                                         ⏳ Pending Principal +{formatUGX(approvedTopUps[p.id].total)}
                                       </span>
                                    )}
                                    {(pendingTopUps[p.id]?.total > 0 || awaitingVerification[p.id]?.total > 0) && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 whitespace-nowrap shrink-0">
                                        ⏳ Awaiting Top-up {formatUGX((pendingTopUps[p.id]?.total || 0) + (awaitingVerification[p.id]?.total || 0))}
                                      </span>
                                    )}
                                  </div>
                                  {/* Inline name edit */}
                                  {editingNameId === p.id ? (
                                    <div className="flex items-center gap-1.5 mt-1.5 w-full">
                                      <Input
                                        value={editingNameValue}
                                        onChange={e => setEditingNameValue(e.target.value)}
                                        placeholder="Enter portfolio name..."
                                        className="h-9 flex-1 min-w-0 text-sm"
                                        autoFocus
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') handleSavePortfolioName(p.id);
                                          if (e.key === 'Escape') setEditingNameId(null);
                                        }}
                                      />
                                      <Button size="sm" className="h-9 px-3 text-xs min-w-[44px]" onClick={() => handleSavePortfolioName(p.id)} disabled={savingName}>
                                        {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-9 px-3 text-xs min-w-[44px]" onClick={() => setEditingNameId(null)}>
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => { setEditingNameId(p.id); setEditingNameValue(p.account_name || ''); }}
                                      className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                                    >
                                      <Pencil className="h-2.5 w-2.5" />
                                      {p.account_name ? 'Edit Name' : 'Add Name'}
                                    </button>
                                  )}
                                  <p className="text-[10px] text-muted-foreground">{timeSince(p.created_at)} · {p.duration_months}mo term</p>
                                </div>
                              </div>
                              {/* Investment amount - full width on mobile */}
                              <p className="text-lg font-black tabular-nums mb-1">{formatUGX(p.investment_amount)}</p>
                              {pendingTopUps[p.id] && (
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-amber-500/40 text-amber-600 bg-amber-500/5">
                                    ⏳ {pendingTopUps[p.id].count} pending top-up{pendingTopUps[p.id].count > 1 ? 's' : ''}: {formatUGX(pendingTopUps[p.id].total)}
                                  </Badge>
                                </div>
                              )}
                              {awaitingVerification[p.id] && (
                                <div className="flex items-center gap-1.5 mb-2.5">
                                  <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-blue-500/40 text-blue-600 bg-blue-500/5">
                                    🔍 {awaitingVerification[p.id].count} awaiting verification: {formatUGX(awaitingVerification[p.id].total)}
                                  </Badge>
                                </div>
                              )}
                              {approvedTopUps[p.id] && (
                                <div className="flex items-center gap-1.5 mb-2.5">
                                   <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-amber-500/40 text-amber-600 bg-amber-500/5">
                                     ⏳ {approvedTopUps[p.id].count} pending principal addition{approvedTopUps[p.id].count > 1 ? 's' : ''}: {formatUGX(approvedTopUps[p.id].total)} — merges at next ROI cycle
                                   </Badge>
                                </div>
                              )}

                              {/* Details grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-xs bg-muted/30 rounded-lg p-2.5">
                                <div>
                                  <span className="text-muted-foreground">Returns Rate</span>
                                  <p className="font-bold text-primary">{p.roi_percentage}%</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Monthly Returns</span>
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
                                  <span className="text-muted-foreground">Contributed On</span>
                                  <p className="font-semibold">{formatDate(p.created_at)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Duration</span>
                                  <p className="font-semibold">{p.duration_months} months</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Next Payout</span>
                                  {editingNextPayoutId === p.id ? (
                                    <div className="flex items-center gap-1 mt-1">
                                      <Input
                                        type="date"
                                        value={editingNextPayoutDate}
                                        onChange={e => setEditingNextPayoutDate(e.target.value)}
                                        className="h-7 w-full text-xs"
                                      />
                                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => handleSaveNextPayoutDate(p.id)} disabled={savingPortfolio}>
                                        {savingPortfolio ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setEditingNextPayoutId(null)}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <p className="font-semibold">
                                        {(() => {
                                          const nd = getNextPayoutDate(p.next_roi_date, p.created_at, p.payout_day ?? 15);
                                          return new Date(nd + 'T00:00:00').toLocaleDateString('en-UG', { month: 'long', day: 'numeric', year: 'numeric' });
                                        })()}
                                      </p>
                                      {!readOnly && (
                                        <button
                                          onClick={() => {
                                            setEditingNextPayoutId(p.id);
                                            const nd = getNextPayoutDate(p.next_roi_date, p.created_at, p.payout_day ?? 15);
                                            setEditingNextPayoutDate(nd);
                                          }}
                                          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                          title="Edit next payout date"
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Payout Status</span>
                                  <p className="font-semibold">
                                    {p.status === 'active'
                                      ? <span className="text-primary">🟢 Active</span>
                                      : p.status === 'pending_approval'
                                        ? <span className="text-amber-600">⏸ Awaiting Approval</span>
                                        : <span className="text-amber-600">⏸ {p.status === 'pending' ? 'Pending' : p.status}</span>}
                                  </p>
                                </div>
                              </div>

                              {/* Payout Day Row */}
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mt-2.5 pt-2.5 border-t border-border/50">
                                <div className="flex items-center gap-2 text-xs flex-wrap">
                                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
                                      <span className="font-bold">
                                        {p.payout_day
                                          ? `${p.payout_day}${getOrdinalSuffix(p.payout_day)} of month`
                                          : p.next_roi_date
                                            ? `${new Date(p.next_roi_date + 'T00:00:00').getDate()}${getOrdinalSuffix(new Date(p.next_roi_date + 'T00:00:00').getDate())} of month`
                                            : 'Not set'}
                                      </span>
                                      {!readOnly && (
                                        <button
                                          onClick={() => { setEditingPortfolioId(p.id); setEditingPayoutDay(String(p.payout_day)); }}
                                          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                          title="Edit payout day"
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {(
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 pl-5 sm:pl-0">
                                    <Clock className="h-3 w-3" /> Next: {(() => {
                                      const nd = getNextPayoutDate(p.next_roi_date, p.created_at, p.payout_day ?? 15);
                                      return new Date(nd + 'T00:00:00').toLocaleDateString('en-UG', { month: 'short', day: 'numeric', year: 'numeric' });
                                    })()}
                                  </span>
                                )}
                              </div>

                              {/* Edit, Approve, Top Up & Delete Portfolio Buttons */}
                              <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end gap-1.5 mt-2.5 pt-2.5 border-t border-border/50">
                                {(p.status === 'pending_approval' || p.status === 'pending') && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-3 text-xs text-success hover:text-success hover:bg-success/10 gap-1.5 font-semibold min-h-[44px]"
                                    onClick={() => handleApprovePortfolio(p.id)}
                                    disabled={approvingId === p.id}
                                  >
                                    {approvingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                    Approve
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-9 px-3 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1.5 min-h-[44px]"
                                  onClick={() => openEditPortfolio(p)}
                                >
                                  <Pencil className="h-3.5 w-3.5" /> Edit
                                </Button>
                                {!readOnly && p.status === 'active' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-3 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 gap-1.5 min-h-[44px]"
                                    onClick={() => {
                                      setTopUpPortfolio(p);
                                      setTopUpOpen(true);
                                    }}
                                  >
                                    <Wallet className="h-3.5 w-3.5" /> Top Up
                                  </Button>
                                )}
                                {!readOnly && p.status === 'active' && detailPartner && detailPartner.walletBalance > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-3 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1.5 min-h-[44px]"
                                    onClick={() => {
                                      setWalletToPortfolio(p);
                                      setWalletToPortfolioAmount('');
                                      setWalletToPortfolioReason('');
                                      setWalletTransferMethod('wallet');
                                      if (detailPartner?.profile?.id) fetchProxyAgentForPartner(detailPartner.profile.id);
                                    }}
                                  >
                                    <ArrowRightLeft className="h-3.5 w-3.5" /> Wallet → Portfolio
                                  </Button>
                                )}
                                {!readOnly && pendingTopUps[p.id] && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-3 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 gap-1.5 font-semibold min-h-[44px]"
                                    onClick={() => handleApplyPendingTopUps(p.id)}
                                    disabled={applyingTopUps === p.id}
                                  >
                                    {applyingTopUps === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                                    Submit {pendingTopUps[p.id].count} for Verification
                                  </Button>
                                )}
                                {awaitingVerification[p.id] && (
                                  <Badge variant="outline" className="text-[10px] px-2 py-1 border-blue-500/40 text-blue-600 bg-blue-500/5 gap-1">
                                    <Clock className="h-3 w-3" />
                                    Awaiting Financial Ops
                                  </Badge>
                                )}
                                {!readOnly && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-3 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 gap-1.5 min-h-[44px]"
                                    onClick={() => { setRenewPortfolio(p); setRenewOpen(true); }}
                                  >
                                    <RefreshCw className="h-3.5 w-3.5" /> Renew
                                    {(renewalCounts[p.id] || 0) > 0 && (
                                      <Badge variant="outline" className="ml-1 text-[9px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-600">
                                        ×{renewalCounts[p.id]}
                                      </Badge>
                                    )}
                                  </Button>
                                )}
                                {!readOnly && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-3 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 min-h-[44px]"
                                    onClick={() => { setDeletePortfolio(p); setDeleteReason(''); }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> Delete
                                  </Button>
                                )}
                                {!readOnly && approvedTopUps[p.id]?.total > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-3 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 gap-1.5 font-semibold min-h-[44px]"
                                    onClick={() => { setMergeDialogPortfolioId(p.id); setMergeReason(''); }}
                                  >
                                    <ArrowRightLeft className="h-3.5 w-3.5" /> Apply Top-up
                                  </Button>
                                )}
                                {!readOnly && p.status === 'active' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-3 text-xs text-primary hover:text-primary hover:bg-primary/5 gap-1.5 min-h-[44px]"
                                    disabled={compoundingPortfolioId === p.id}
                                    onClick={() => openCompoundPreview(p)}
                                  >
                                    {compoundingPortfolioId === p.id
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <TrendingUp className="h-3.5 w-3.5" />}
                                    Compound
                                  </Button>
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

      {/* ─── Add Portfolio Dialog ─── */}
      <Dialog open={addPortfolioOpen} onOpenChange={open => { if (!open) setAddPortfolioOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Add Investment Portfolio
            </DialogTitle>
            <DialogDescription>
              Create a new portfolio for {detailPartner?.profile.full_name}. No wallet balance required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Investment Amount (UGX) *</Label>
              <Input
                type="number"
                min={MIN_INVEST}
                value={addPortfolioAmount}
                onChange={e => setAddPortfolioAmount(e.target.value)}
                placeholder={`Min ${MIN_INVEST.toLocaleString()}`}
              />
              <div className="flex gap-2 flex-wrap">
                {[500000, 1000000, 2000000, 5000000, 10000000].map(a => (
                  <Button key={a} variant="outline" size="sm" className="text-xs h-7"
                    onClick={() => setAddPortfolioAmount(String(a))}>
                    {a >= 1000000 ? `${(a / 1000000).toFixed(0)}M` : `${(a / 1000).toFixed(0)}K`}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Returns Rate (%)</Label>
                <Input type="number" min={1} max={100} value={addPortfolioRoi}
                  onChange={e => setAddPortfolioRoi(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Duration (months)</Label>
                <Input type="number" min={1} max={60} value={addPortfolioDuration}
                  onChange={e => setAddPortfolioDuration(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Returns Mode</Label>
                <Select value={addPortfolioRoiMode} onValueChange={setAddPortfolioRoiMode}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly_payout">💰 Monthly Payout</SelectItem>
                    <SelectItem value="monthly_compounding">📈 Compounding</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Payout Day</Label>
                <p className="text-sm font-medium text-foreground">Auto-derived from contribution date</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Contribution Date (optional, for backdating)</Label>
              <Input type="date" value={addPortfolioDate}
                onChange={e => setAddPortfolioDate(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Leave empty for today's date</p>
            </div>

            {addPortfolioAmount && Number(addPortfolioAmount) >= MIN_INVEST && (
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-bold">{formatUGX(Number(addPortfolioAmount))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monthly Returns:</span>
                  <span className="font-bold text-primary">{formatUGX(Math.round(Number(addPortfolioAmount) * (Number(addPortfolioRoi) / 100)))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Maturity:</span>
                  <span className="font-semibold">{addPortfolioDuration} months</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPortfolioOpen(false)} disabled={addingPortfolio}>Cancel</Button>
            <Button onClick={handleAddPortfolio} disabled={addingPortfolio}>
              {addingPortfolio ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : <><Plus className="h-4 w-4 mr-2" /> Create Portfolio</>}
            </Button>
          </DialogFooter>
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
            <DialogDescription>Update partner profile, returns rate, and mode.</DialogDescription>
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
              <Label className="text-xs">Returns Percentage (%)</Label>
              <Input type="number" min={1} max={100} value={editRoi} onChange={e => setEditRoi(e.target.value)} />
              <div className="flex gap-1.5">
                {[10, 15, 20, 25].map(v => (
                  <Button key={v} variant={editRoi === String(v) ? 'default' : 'outline'} size="sm" className="text-[10px] h-6 px-2 flex-1"
                    onClick={() => setEditRoi(String(v))}>{v}%</Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Returns Payment Mode</Label>
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

      {/* ─── Delete Partner Confirm ─── */}
      <Dialog open={!!deletePartnerTarget} onOpenChange={open => { if (!open) { setDeletePartnerTarget(null); setDeletePartnerReason(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Delete Partner
            </DialogTitle>
            <DialogDescription>
              This will <strong>permanently remove</strong> <strong>{deletePartnerTarget?.name}</strong> as a partner. Their supporter role will be revoked and account frozen. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-semibold">Deletion Reason <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="Provide a detailed reason (min 10 characters)..."
                value={deletePartnerReason}
                onChange={e => setDeletePartnerReason(e.target.value)}
                className="mt-1 text-sm"
                rows={3}
              />
              {deletePartnerReason.length > 0 && deletePartnerReason.length < 10 && (
                <p className="text-[10px] text-destructive mt-1">Reason must be at least 10 characters</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setDeletePartnerTarget(null); setDeletePartnerReason(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDeletePartner}
              disabled={deletingPartner || deletePartnerReason.length < 10}
            >
              {deletingPartner && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <PartnerImportDialog open={importOpen} onOpenChange={setImportOpen} onSuccess={() => { refreshInBackground(); fetchPendingCount(); }} />

      {/* Compound Preview Dialog */}
      <AlertDialog open={!!compoundPreview} onOpenChange={(open) => { if (!open) setCompoundPreview(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Confirm Compounding
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  You are about to compound the ROI into this portfolio. Review the changes below:
                </p>
                {compoundPreview && (
                  <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Current Principal</span>
                      <span className="font-semibold">{formatUGX(compoundPreview.currentPrincipal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">ROI ({compoundPreview.roiPercentage}%)</span>
                      <span className="font-semibold text-green-600">+ {formatUGX(compoundPreview.roiAmount)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">New Principal</span>
                      <span className="font-bold text-primary text-base">{formatUGX(compoundPreview.newPrincipal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Next Payout Date</span>
                      <span className="font-semibold text-blue-600">
                        {compoundPreview.nextRoiDate ? new Date(compoundPreview.nextRoiDate + 'T00:00:00').toLocaleDateString('en-UG', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!compoundingPortfolioId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!compoundingPortfolioId}
              onClick={() => {
                if (compoundPreview) {
                  handlePortfolioCompound(compoundPreview.portfolio);
                  setCompoundPreview(null);
                }
              }}
            >
              {compoundingPortfolioId ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Compound
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UpdateContributionDatesDialog open={updateDatesOpen} onOpenChange={setUpdateDatesOpen} onSuccess={() => {
        refreshInBackground();
        if (detailPartner?.profile?.id) openPartnerDetail(detailPartner.profile.id);
      }} />

      {/* Top-level Create Portfolio Dialog */}
      <CreateInvestmentAccountDialog open={createPortfolioOpen} onOpenChange={setCreatePortfolioOpen} onSuccess={() => { refreshInBackground(); fetchPendingCount(); }} />

      {/* ─── Bulk Activate Confirmation ─── */}
      <AlertDialog open={showActivateConfirm} onOpenChange={setShowActivateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Activate All Pending Portfolios
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will set <strong>{pendingApprovalCount}</strong> portfolios from <strong>Awaiting Approval</strong> to <strong>Active</strong>.
              These are imported records that don't require wallet operations. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={activatingAll}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkActivate}
              disabled={activatingAll}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {activatingAll && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Activate {pendingApprovalCount} Portfolios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Portfolio Confirmation ─── */}
      <Dialog open={!!deletePortfolio} onOpenChange={open => { if (!open) { setDeletePortfolio(null); setDeleteReason(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Delete Investment Portfolio
            </DialogTitle>
            <DialogDescription>
              This will permanently delete portfolio <strong>{deletePortfolio?.portfolio_code}</strong> ({formatUGX(deletePortfolio?.investment_amount || 0)}).
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs space-y-1">
              <p><strong>Portfolio:</strong> {deletePortfolio?.portfolio_code}</p>
              <p><strong>Amount:</strong> {formatUGX(deletePortfolio?.investment_amount || 0)}</p>
              <p><strong>ROI:</strong> {deletePortfolio?.roi_percentage}% · {deletePortfolio?.roi_mode === 'monthly_compounding' ? 'Compounding' : 'Payout'}</p>
              <p><strong>Status:</strong> {deletePortfolio?.status}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Reason for Deletion <span className="text-destructive">*</span></Label>
              <Textarea
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                placeholder="Provide a detailed reason for deleting this investment (min 10 characters)..."
                className="min-h-[80px] text-sm"
                maxLength={500}
              />
              <p className="text-[10px] text-muted-foreground">{deleteReason.length}/500 characters</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeletePortfolio(null); setDeleteReason(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDeletePortfolio}
              disabled={deleting || deleteReason.trim().length < 10}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete Portfolio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ─── Edit Portfolio Dialog ─── */}
      <Dialog open={!!editPortfolio} onOpenChange={open => { if (!open) setEditPortfolio(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-primary" /> Edit Portfolio</DialogTitle>
            <DialogDescription>
              Update portfolio <strong>{editPortfolio?.portfolio_code}</strong> details. Changes are audit-logged.
            </DialogDescription>
          </DialogHeader>
          {editPortfolio && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Investment Amount (UGX)</Label>
                <Input type="number" min={MIN_INVEST} value={editPortfolioAmount}
                  onChange={e => setEditPortfolioAmount(e.target.value)} placeholder={`Min ${MIN_INVEST.toLocaleString()}`} />
                <div className="flex gap-1.5 flex-wrap">
                  {[500000, 1000000, 2000000, 5000000, 10000000].map(a => (
                    <Button key={a} variant={editPortfolioAmount === String(a) ? 'default' : 'outline'} size="sm" className="text-[10px] h-6 px-2"
                      onClick={() => setEditPortfolioAmount(String(a))}>{(a / 1000000).toFixed(a >= 1000000 ? 0 : 1)}M</Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Returns Percentage (%)</Label>
                <Input type="number" min={1} max={100} value={editPortfolioRoi} onChange={e => setEditPortfolioRoi(e.target.value)} />
                <div className="flex gap-1.5">
                  {[10, 15, 20, 25].map(v => (
                    <Button key={v} variant={editPortfolioRoi === String(v) ? 'default' : 'outline'} size="sm" className="text-[10px] h-6 px-2 flex-1"
                      onClick={() => setEditPortfolioRoi(String(v))}>{v}%</Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Returns Mode</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={editPortfolioRoiMode === 'monthly_payout' ? 'default' : 'outline'} size="sm" className="text-xs h-9"
                    onClick={() => setEditPortfolioRoiMode('monthly_payout')}>
                    <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" /> Payout
                  </Button>
                  <Button variant={editPortfolioRoiMode === 'monthly_compounding' ? 'default' : 'outline'} size="sm" className="text-xs h-9"
                    onClick={() => setEditPortfolioRoiMode('monthly_compounding')}>
                    <TrendingUp className="h-3.5 w-3.5 mr-1.5" /> Compounding
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Duration (months)</Label>
                  <Input type="number" min={1} max={120} value={editPortfolioDuration} onChange={e => setEditPortfolioDuration(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={editPortfolioStatus} onValueChange={setEditPortfolioStatus}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="pending_approval">Pending Approval</SelectItem>
                      <SelectItem value="matured">Matured</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" /> Contribution Date</Label>
                <Input type="date" value={editPortfolioDate} onChange={e => setEditPortfolioDate(e.target.value)} className="h-10 text-sm" />
                {editPortfolio.created_at && (
                  <p className="text-[10px] text-muted-foreground">Current: {formatDate(editPortfolio.created_at)}</p>
                )}
              </div>
              {editPortfolioAmount && Number(editPortfolioAmount) >= MIN_INVEST && editPortfolioRoi && (
                <div className="text-xs bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1">
                  <p>Monthly Returns ({editPortfolioRoi}%): <strong className="text-primary">{formatUGX(Math.round(Number(editPortfolioAmount) * (Number(editPortfolioRoi) / 100)))}</strong></p>
                  <p>Duration: <strong>{editPortfolioDuration} months</strong></p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPortfolio(null)}>Cancel</Button>
            <Button onClick={handleSaveEditPortfolio} disabled={savingEditPortfolio}>
              {savingEditPortfolio && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renew Portfolio Dialog */}
      <RenewPortfolioDialog
        open={renewOpen}
        onOpenChange={setRenewOpen}
        portfolio={renewPortfolio}
        onSuccess={() => {
          if (detailPartner?.profile?.id) openPartnerDetail(detailPartner.profile.id);
          // Refresh renewal counts
          if (renewPortfolio) {
            setRenewalCounts(prev => ({ ...prev, [renewPortfolio.id]: (prev[renewPortfolio.id] || 0) + 1 }));
          }
        }}
      />

      {/* Wallet → Portfolio Top-Up Dialog */}
      <FundInvestmentAccountDialog
        open={topUpOpen}
        onOpenChange={setTopUpOpen}
        account={topUpPortfolio ? {
          id: topUpPortfolio.id,
          portfolio_code: topUpPortfolio.portfolio_code,
          account_name: topUpPortfolio.account_name,
          investment_amount: topUpPortfolio.investment_amount,
          investor_id: topUpPortfolio.investor_id,
          agent_id: topUpPortfolio.agent_id,
          investor_name: detailPartner?.profile?.full_name,
        } : null}
        onSuccess={() => {
          if (detailPartner?.profile?.id) openPartnerDetail(detailPartner.profile.id);
        }}
      />

      {/* Wallet → Portfolio Transfer Dialog */}
      <Dialog open={!!walletToPortfolio} onOpenChange={(open) => { if (!open) { setWalletToPortfolio(null); setWalletToPortfolioAmount(''); setWalletToPortfolioReason(''); setProxyAgentInfo(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-primary" />
              Wallet → Portfolio Transfer
            </DialogTitle>
            <DialogDescription>
              Move funds into this portfolio from partner wallet or proxy agent wallet.
            </DialogDescription>
          </DialogHeader>

          {walletToPortfolio && detailPartner && (
            <div className="space-y-4 py-2">
              {/* Portfolio info */}
              <div className="rounded-lg border border-primary/20 p-3 bg-primary/5">
                <p className="text-sm font-semibold text-foreground">{walletToPortfolio.account_name || walletToPortfolio.portfolio_code}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Current Capital: {formatUGX(walletToPortfolio.investment_amount)}
                </p>
              </div>

              {/* Funding source selector */}
              <div className="space-y-1.5">
                <Label className="text-xs">Funding Source</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWalletTransferMethod('wallet')}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-all text-center",
                      walletTransferMethod === 'wallet'
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border bg-background hover:border-muted-foreground/30 cursor-pointer"
                    )}
                  >
                    <Wallet className={cn("h-4 w-4", walletTransferMethod === 'wallet' ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("text-xs font-medium", walletTransferMethod === 'wallet' ? "text-primary" : "text-muted-foreground")}>Wallet</span>
                    <span className="text-[10px] text-muted-foreground">Partner wallet</span>
                  </button>
                  <button
                    type="button"
                    disabled={!proxyAgentInfo && !loadingProxyAgent}
                    onClick={() => proxyAgentInfo && setWalletTransferMethod('proxy_agent')}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-all text-center",
                      !proxyAgentInfo && !loadingProxyAgent
                        ? "border-border bg-muted/30 opacity-50 cursor-not-allowed"
                        : walletTransferMethod === 'proxy_agent'
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border bg-background hover:border-muted-foreground/30 cursor-pointer"
                    )}
                  >
                    <Users className={cn("h-4 w-4", walletTransferMethod === 'proxy_agent' ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("text-xs font-medium", walletTransferMethod === 'proxy_agent' ? "text-primary" : "text-muted-foreground")}>Proxy Agent</span>
                    <span className="text-[10px] text-muted-foreground">
                      {loadingProxyAgent ? '...' : proxyAgentInfo ? proxyAgentInfo.agentName : 'No agent assigned'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Balance display */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border/60">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {walletTransferMethod === 'wallet' ? 'Partner Wallet:' : `${proxyAgentInfo?.agentName || 'Agent'} Wallet:`}
                </span>
                <span className="text-sm font-bold">
                  {walletTransferMethod === 'wallet'
                    ? formatUGX(detailPartner.walletBalance)
                    : proxyAgentInfo ? formatUGX(proxyAgentInfo.walletBalance) : '—'}
                </span>
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <Label className="text-xs">Amount (UGX)</Label>
                <Input
                  type="number"
                  min={1000}
                  value={walletToPortfolioAmount}
                  onChange={e => setWalletToPortfolioAmount(e.target.value)}
                  placeholder="e.g. 5,000,000"
                  className="h-9"
                  autoFocus
                />
                {(() => {
                  const maxBal = walletTransferMethod === 'wallet' ? detailPartner.walletBalance : (proxyAgentInfo?.walletBalance ?? 0);
                  return (
                    <div className="flex gap-2 flex-wrap">
                      {[50000, 100000, 500000, 1000000].filter(a => a <= maxBal).map(a => (
                        <Button key={a} variant="outline" size="sm" className="text-xs h-7"
                          onClick={() => setWalletToPortfolioAmount(String(a))}>
                          {formatUGX(a)}
                        </Button>
                      ))}
                      {maxBal >= 1000 && (
                        <Button variant="outline" size="sm" className="text-xs h-7"
                          onClick={() => setWalletToPortfolioAmount(String(maxBal))}>
                          Max
                        </Button>
                      )}
                    </div>
                  );
                })()}
                {(() => {
                  const maxBal = walletTransferMethod === 'wallet' ? detailPartner.walletBalance : (proxyAgentInfo?.walletBalance ?? 0);
                  const amt = Number(walletToPortfolioAmount) || 0;
                  if (amt > maxBal && maxBal >= 0) {
                    return <p className="text-[10px] text-destructive font-medium">Insufficient balance ({formatUGX(maxBal)} available)</p>;
                  }
                  return null;
                })()}
              </div>

              {/* Reason */}
              <div className="space-y-1.5">
                <Label className="text-xs">Reason (required, min 10 chars)</Label>
                <Input
                  value={walletToPortfolioReason}
                  onChange={e => setWalletToPortfolioReason(e.target.value)}
                  placeholder="e.g. Partner requested wallet-to-portfolio transfer"
                  className="h-9"
                />
              </div>

              {/* Preview */}
              {Number(walletToPortfolioAmount) >= 1000 && walletToPortfolioReason.trim().length >= 10 && (
                <div className="rounded-lg bg-accent/50 border border-accent p-3 space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Transfer amount</span>
                    <span className="font-bold text-foreground">{formatUGX(Number(walletToPortfolioAmount))}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Source</span>
                    <span className="font-medium text-foreground">
                      {walletTransferMethod === 'wallet' ? 'Partner Wallet' : `${proxyAgentInfo?.agentName} (Proxy Agent)`}
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5 pt-1 border-t border-border/50">
                    <CheckCircle2 className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                    <p className="text-[10px] text-muted-foreground">
                      Instant deduction — funds will be applied to portfolio capital at maturity.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setWalletToPortfolio(null)}>Cancel</Button>
            <Button
              onClick={handleWalletToPortfolio}
              disabled={walletToPortfolioSaving || Number(walletToPortfolioAmount) < 1000 || walletToPortfolioReason.trim().length < 10 || (walletTransferMethod === 'proxy_agent' && !proxyAgentInfo)}
            >
              {walletToPortfolioSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Submit Top-Up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Nearing Payouts Dialog */}
      <NearingPayoutsDialog open={nearingPayoutsOpen} onOpenChange={setNearingPayoutsOpen} portfolios={allPortfoliosForPayout} onActionComplete={refreshInBackground} />

      {/* Merge Pending Top-Ups Dialog */}
      <Dialog open={!!mergeDialogPortfolioId} onOpenChange={(open) => { if (!open) { setMergeDialogPortfolioId(null); setMergeReason(''); } }}>
        <DialogContent stable className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Apply Pending Principal</DialogTitle>
            <DialogDescription className="text-xs">
              Merge approved top-ups into the portfolio's active principal immediately instead of waiting for the next ROI cycle.
            </DialogDescription>
          </DialogHeader>
          {mergeDialogPortfolioId && approvedTopUps[mergeDialogPortfolioId] && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs">
              <p className="font-semibold text-amber-700 dark:text-amber-400">
                {approvedTopUps[mergeDialogPortfolioId].count} pending top-up{approvedTopUps[mergeDialogPortfolioId].count > 1 ? 's' : ''} totaling {formatUGX(approvedTopUps[mergeDialogPortfolioId].total)}
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Reason for manual merge (min 10 chars)</Label>
            <Textarea
              value={mergeReason}
              onChange={e => setMergeReason(e.target.value)}
              placeholder="e.g. Partner requested early activation of top-up funds..."
              className="text-xs min-h-[70px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setMergeDialogPortfolioId(null); setMergeReason(''); }}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={mergingTopUp || mergeReason.trim().length < 10}
              onClick={handleMergePendingTopUps}
            >
              {mergingTopUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
              Apply Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

/* ─── Nearing Payouts Card ─── */
function NearingPayoutsCard({ portfolios, onClick }: { portfolios: NearingPayoutPortfolio[]; onClick: () => void }) {
  const overdueCount = portfolios.filter(p => p.daysUntil < 0).length;
  const upcomingCount = portfolios.filter(p => p.daysUntil >= 0 && p.daysUntil <= 7).length;
  const totalAmount = portfolios.filter(p => p.daysUntil <= 7).reduce((s, p) => s + Math.round(p.investmentAmount * p.roiPercentage / 100), 0);
  const hasPayouts = portfolios.length > 0;
  return (
    <button onClick={onClick} className={cn(
      'rounded-2xl border p-4 space-y-2.5 text-left w-full transition-all hover:shadow-lg active:scale-[0.98]',
      overdueCount > 0
        ? 'border-destructive/40 bg-destructive/5 ring-2 ring-destructive/25 shadow-sm'
        : hasPayouts
        ? 'border-amber-500/40 bg-amber-500/5 ring-2 ring-amber-500/20 shadow-sm'
        : 'border-violet-500/20 bg-violet-500/5'
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'p-2 rounded-xl',
            overdueCount > 0 ? 'bg-destructive/10 text-destructive animate-pulse' : hasPayouts ? 'bg-amber-500/10 text-amber-600' : 'bg-violet-500/10 text-violet-600'
          )}>
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <span className={cn(
              'text-xs font-bold uppercase tracking-wider',
              overdueCount > 0 ? 'text-destructive' : hasPayouts ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
            )}>
              Nearing Payouts
            </span>
            <p className={cn(
              'text-[11px] leading-snug mt-0.5',
              overdueCount > 0 ? 'text-destructive/80 font-medium' : hasPayouts ? 'text-amber-600/80 font-medium' : 'text-muted-foreground'
            )}>
              {overdueCount > 0
                ? `${overdueCount} overdue · ${upcomingCount} upcoming`
                : hasPayouts
                ? `~${formatUGX(totalAmount)} due within 7 days`
                : 'No payouts due soon'}
            </p>
          </div>
        </div>
        <div className={cn(
          'text-2xl font-black tabular-nums px-3 py-1 rounded-xl',
          overdueCount > 0 ? 'bg-destructive/10 text-destructive' : hasPayouts ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'text-foreground'
        )}>
          {portfolios.length}
        </div>
      </div>
      {hasPayouts && (
        <div className="flex items-center justify-center gap-1.5 pt-1 border-t border-border/40">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Tap to review & take action →
          </span>
        </div>
      )}
    </button>
  );
}

function NearingPayoutsDialog({ open, onOpenChange, portfolios, onActionComplete }: {
  open: boolean; onOpenChange: (v: boolean) => void; portfolios: NearingPayoutPortfolio[];
  onActionComplete?: () => void;
}) {
  const [search, setSearch] = useState('');
  const [rangeFilter, setRangeFilter] = useState<string>('7');
  const [processing, setProcessing] = useState<Record<string, 'compound' | 'pay' | 'split' | null>>({});
  const [completed, setCompleted] = useState<Record<string, 'compounded' | 'pending' | 'completed' | 'split'>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [managedInfo, setManagedInfo] = useState<Record<string, { isManaged: boolean; agentName: string; agentId: string; hasProxy: boolean } | null>>({});
  
  // Step 2 state
  const [selectedPayout, setSelectedPayout] = useState<NearingPayoutPortfolio | null>(null);
  const [paymentStep, setPaymentStep] = useState<'list' | 'payment-options' | 'split-config'>('list');
  const [checkingManagedStep2, setCheckingManagedStep2] = useState(false);

  // Split payout state
  const [splitCashAmount, setSplitCashAmount] = useState(0);
  const [splitPayMode, setSplitPayMode] = useState<'wallet' | 'agent_wallet' | 'already_paid'>('wallet');
  const [splitReinvestMode, setSplitReinvestMode] = useState<'reinvest' | 'keep_returns'>('reinvest');

  // Keep a local snapshot so items don't vanish when parent refetches
  const [localPortfolios, setLocalPortfolios] = useState<NearingPayoutPortfolio[]>(portfolios);
  useEffect(() => {
    if (open && Object.keys(completed).length === 0) {
      setLocalPortfolios(portfolios);
    }
  }, [open, portfolios, completed]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setCompleted({});
      setPaymentStep('list');
      setSelectedPayout(null);
    }
  }, [open]);

  const filtered = useMemo(() => {
    let list = localPortfolios;
    // Apply range filter
    if (rangeFilter === 'overdue') {
      list = list.filter(p => p.daysUntil < 0);
    } else if (rangeFilter === 'today') {
      list = list.filter(p => p.daysUntil === 0);
    } else if (rangeFilter === '7') {
      list = list.filter(p => p.daysUntil >= -30 && p.daysUntil <= 7);
    } else if (rangeFilter === '14') {
      list = list.filter(p => p.daysUntil >= -30 && p.daysUntil <= 14);
    } else if (rangeFilter === '30') {
      list = list.filter(p => p.daysUntil >= -30 && p.daysUntil <= 30);
    }
    // Apply search filter
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.portfolioName.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q)
      );
    }
    return list;
  }, [localPortfolios, search, rangeFilter]);

  const generateRef = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const handleCompound = async (p: NearingPayoutPortfolio, reason: string) => {
    setProcessing(prev => ({ ...prev, [p.portfolioId]: 'compound' }));
    try {
      const roiAmount = Math.round(p.investmentAmount * p.roiPercentage / 100);
      const newAmount = p.investmentAmount + roiAmount;
      const refId = generateRef('CMP');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Advance next_roi_date by +1 month on compound
      const currentDate = new Date(p.nextPayoutDate || new Date());
      const newDate = new Date(currentDate);
      newDate.setMonth(newDate.getMonth() + 1);
      const newRoiDate = newDate.toISOString().split('T')[0];

      const { error: upErr } = await supabase
        .from('investor_portfolios')
        .update({ investment_amount: newAmount, next_roi_date: newRoiDate })
        .eq('id', p.portfolioId);
      if (upErr) throw upErr;

      // Reinvest ledger via RPC (double-entry: roi_expense + roi_reinvestment)
      const { error: ledgerErr } = await supabase.rpc('create_ledger_transaction', {
        entries: [
          {
            user_id: p.investorId,
            ledger_scope: 'platform',
            direction: 'cash_out',
            amount: roiAmount,
            category: 'roi_expense',
            description: `ROI compounded: ${formatUGX(roiAmount)} reinvested into portfolio. New principal: ${formatUGX(newAmount)}. Reason: ${reason}`,
            reference_id: refId,
            source_table: 'investor_portfolios',
            source_id: p.portfolioId,
            linked_party: user.id,
            currency: 'UGX',
          },
          {
            user_id: p.investorId,
            ledger_scope: 'platform',
            direction: 'cash_in',
            amount: roiAmount,
            category: 'roi_reinvestment',
            description: `ROI reinvestment: ${formatUGX(roiAmount)} added to principal. New principal: ${formatUGX(newAmount)}. Ref: ${refId}`,
            reference_id: refId,
            source_table: 'investor_portfolios',
            source_id: p.portfolioId,
            linked_party: user.id,
            currency: 'UGX',
          },
        ],
      });
      if (ledgerErr) throw ledgerErr;

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'roi_compounded',
        table_name: 'investor_portfolios',
        record_id: p.portfolioId,
        metadata: { roi_amount: roiAmount, new_principal: newAmount, reference: refId, partner_id: p.investorId, reason, new_roi_date: newRoiDate },
      });

      await supabase.from('notifications').insert({
        user_id: p.investorId,
        title: 'Portfolio ROI Compounded',
        message: `Your ROI of ${formatUGX(roiAmount)} has been compounded into your portfolio. New investment total: ${formatUGX(newAmount)}. Next payout: ${newRoiDate}. Ref: ${refId}`,
        type: 'portfolio_update',
        metadata: { portfolio_id: p.portfolioId, roi_amount: roiAmount, reference: refId },
      });

      toast.success(`Compounded ${formatUGX(roiAmount)} for ${p.name}`, { description: `Ref: ${refId}` });
      setCompleted(prev => ({ ...prev, [p.portfolioId]: 'compounded' }));
      onActionComplete?.();
    } catch (err: any) {
      toast.error('Compound failed', { description: err.message });
    } finally {
      setProcessing(prev => ({ ...prev, [p.portfolioId]: null }));
    }
  };

  const handlePay = async (p: NearingPayoutPortfolio, reason: string, mode: 'wallet' | 'already_paid' | 'agent_wallet') => {
    setProcessing(prev => ({ ...prev, [p.portfolioId]: 'pay' }));
    try {
      const roiAmount = Math.round(p.investmentAmount * p.roiPercentage / 100);
      const refId = generateRef('PAY');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Date stays unchanged — only advances when CFO approves the payout

      const operationType = mode === 'agent_wallet' ? 'roi_agent_wallet_credit' : mode === 'wallet' ? 'roi_wallet_credit' : 'roi_already_paid';
      const modeLabel = mode === 'agent_wallet' ? 'Agent Wallet' : mode === 'wallet' ? 'Pay to Wallet' : 'Cash';
      const managed = managedInfo[p.portfolioId];
      const txnGroupId = crypto.randomUUID();

      // All modes go through pending pipeline — CFO must approve before wallet is credited
      const isProxyAgent = mode === 'agent_wallet' && managed;
      const { error: pendErr } = await supabase.from('pending_wallet_operations').insert({
        user_id: p.investorId,
        amount: roiAmount,
        direction: 'cash_in',
        category: 'roi_payout',
        source_table: 'investor_portfolios',
        source_id: p.portfolioId,
        reference_id: refId,
        operation_type: operationType,
        transaction_group_id: txnGroupId,
        target_wallet_user_id: isProxyAgent ? managed.agentId : null,
        description: isProxyAgent
          ? `[Agent Wallet] ROI payout of ${formatUGX(roiAmount)} to ${managed.agentName}'s agent wallet on behalf of ${p.name}. Portfolio: ${p.portfolioId.slice(0, 8)}. Reason: ${reason}`
          : `[${modeLabel}] ROI payout of ${formatUGX(roiAmount)} to ${p.name}'s wallet. Portfolio: ${p.portfolioId.slice(0, 8)}. Reason: ${reason}`,
        linked_party: user.id,
        status: 'pending_coo_approval',
        metadata: {
          partner_name: p.name,
          roi_percentage: p.roiPercentage,
          investment_amount: p.investmentAmount,
          initiated_by: user.id,
          reason,
          pay_mode: mode,
          ...(isProxyAgent ? { target_agent_name: managed.agentName, target_agent_id: managed.agentId } : {}),
        },
      });
      if (pendErr) throw pendErr;

      const auditAction = mode === 'agent_wallet' ? 'roi_agent_wallet_requested' : mode === 'wallet' ? 'roi_payout_requested' : 'roi_already_paid_logged';
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: auditAction,
        table_name: 'pending_wallet_operations',
        record_id: p.portfolioId,
        metadata: {
          roi_amount: roiAmount, reference: refId, partner_id: p.investorId, partner_name: p.name, reason, pay_mode: mode,
          ...(isProxyAgent ? { target_agent_id: managed.agentId, target_agent_name: managed.agentName } : {}),
        },
      });

      await supabase.from('notifications').insert({
        user_id: p.investorId,
        title: isProxyAgent ? 'ROI Payout Initiated (Agent Wallet)' : mode === 'wallet' ? 'ROI Payout Initiated' : 'ROI Payment Recorded',
        message: isProxyAgent
          ? `An ROI payout of ${formatUGX(roiAmount)} has been initiated for ${managed.agentName}'s agent wallet. Pending COO approval. Ref: ${refId}`
          : `An ROI payout of ${formatUGX(roiAmount)} has been ${mode === 'wallet' ? 'initiated for your wallet' : 'recorded as already paid'}. Pending approval. Ref: ${refId}`,
        type: 'payout_initiated',
        metadata: { portfolio_id: p.portfolioId, roi_amount: roiAmount, reference: refId, pay_mode: mode },
      });

      // Notify COO users (not CFO — COO must approve first)
      const { data: cooUsers } = await supabase.from('user_roles').select('user_id').eq('role', 'manager');
      if (cooUsers && cooUsers.length > 0) {
        await supabase.from('notifications').insert(
          cooUsers.map(c => ({
            user_id: c.user_id,
            title: 'ROI Payout Awaiting COO Approval',
            message: isProxyAgent
              ? `[Agent Wallet] ${p.name} → ${managed.agentName}: ${formatUGX(roiAmount)} pending COO approval. Ref: ${refId}`
              : `[${modeLabel}] ${p.name} has an ROI payout of ${formatUGX(roiAmount)} pending COO approval. Ref: ${refId}`,
            type: 'approval_required',
            metadata: { portfolio_id: p.portfolioId, partner_id: p.investorId, roi_amount: roiAmount, reference: refId, pay_mode: mode },
          }))
        );
      }

      toast.success(`${modeLabel}: ${formatUGX(roiAmount)} submitted for COO approval`, { description: `Ref: ${refId}` });
      setCompleted(prev => ({ ...prev, [p.portfolioId]: 'pending' }));
      setPaymentStep('list');
      setSelectedPayout(null);
      onActionComplete?.();
    } catch (err: any) {
      toast.error('Pay request failed', { description: err.message });
    } finally {
      setProcessing(prev => ({ ...prev, [p.portfolioId]: null }));
    }
  };

  // Handle Pay click — transition to step 2
  const handlePayClick = async (p: NearingPayoutPortfolio) => {
    setSelectedPayout(p);
    setPaymentStep('payment-options');
    
    // Check managed status if not already known
    if (managedInfo[p.portfolioId] === undefined) {
      setCheckingManagedStep2(true);
      try {
        const { data: proxyData } = await supabase
          .from('proxy_agent_assignments')
          .select('agent_id, is_managed_account, agent:agent_id(full_name)')
          .eq('beneficiary_id', p.investorId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        if (proxyData) {
          const agentName = (proxyData.agent as any)?.full_name || 'Agent';
          setManagedInfo(prev => ({ ...prev, [p.portfolioId]: { isManaged: !!proxyData.is_managed_account, agentName, agentId: proxyData.agent_id, hasProxy: true } }));
        } else {
          setManagedInfo(prev => ({ ...prev, [p.portfolioId]: null }));
        }
      } catch {
        setManagedInfo(prev => ({ ...prev, [p.portfolioId]: null }));
      } finally {
        setCheckingManagedStep2(false);
      }
    }
  };

  // Handle Split click — transition to split-config step
  const handleSplitClick = async (p: NearingPayoutPortfolio) => {
    const roiAmount = Math.round(p.investmentAmount * p.roiPercentage / 100);
    setSelectedPayout(p);
    setSplitCashAmount(Math.round(roiAmount / 2)); // Default 50/50
    setSplitPayMode('wallet');
    setSplitReinvestMode('reinvest');
    setPaymentStep('split-config');

    // Check managed status
    if (managedInfo[p.portfolioId] === undefined) {
      setCheckingManagedStep2(true);
      try {
        const { data: proxyData } = await supabase
          .from('proxy_agent_assignments')
          .select('agent_id, is_managed_account, agent:agent_id(full_name)')
          .eq('beneficiary_id', p.investorId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        if (proxyData) {
          const agentName = (proxyData.agent as any)?.full_name || 'Agent';
          setManagedInfo(prev => ({ ...prev, [p.portfolioId]: { isManaged: !!proxyData.is_managed_account, agentName, agentId: proxyData.agent_id, hasProxy: true } }));
          if (proxyData.is_managed_account) setSplitPayMode('agent_wallet');
        } else {
          setManagedInfo(prev => ({ ...prev, [p.portfolioId]: null }));
        }
      } catch {
        setManagedInfo(prev => ({ ...prev, [p.portfolioId]: null }));
      } finally {
        setCheckingManagedStep2(false);
      }
    } else if (managedInfo[p.portfolioId]?.isManaged) {
      setSplitPayMode('agent_wallet');
    }
  };

  // Handle Split Payout — cash portion to pending_wallet_operations, reinvest portion to portfolio
  const handleSplitPayout = async (p: NearingPayoutPortfolio, cashAmount: number, reason: string, payMode: 'wallet' | 'agent_wallet' | 'already_paid', reinvestMode: 'reinvest' | 'keep_returns' = 'reinvest') => {
    setProcessing(prev => ({ ...prev, [p.portfolioId]: 'split' }));
    try {
      const roiAmount = Math.round(p.investmentAmount * p.roiPercentage / 100);
      const reinvestAmount = roiAmount - cashAmount;
      if (cashAmount < 1 || reinvestAmount < 1) throw new Error('Both cash and reinvest amounts must be at least 1');

      const refId = generateRef('SPL');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const managed = managedInfo[p.portfolioId];
      const isProxyAgent = payMode === 'agent_wallet' && managed;
      const modeLabel = payMode === 'agent_wallet' ? 'Agent Wallet' : payMode === 'wallet' ? 'Wallet' : 'Cash';
      const txnGroupId = crypto.randomUUID();

      // Date stays unchanged — only advances when CFO approves the payout

      const isKeepReturns = reinvestMode === 'keep_returns';
      const reinvestLabel = isKeepReturns ? 'kept as returns' : 'reinvested into principal';

      // ── Reinvest portion: add to principal OR keep as earned returns ──
      let newPrincipal = p.investmentAmount;
      if (isKeepReturns) {
        // Keep as returns — increment total_roi_earned, principal stays flat
        const { data: currentP } = await supabase.from('investor_portfolios').select('total_roi_earned').eq('id', p.portfolioId).single();
        const currentRoiEarned = Number(currentP?.total_roi_earned || 0);
        const { error: upErr } = await supabase
          .from('investor_portfolios')
          .update({ total_roi_earned: currentRoiEarned + reinvestAmount })
          .eq('id', p.portfolioId);
        if (upErr) throw upErr;
        newPrincipal = p.investmentAmount; // stays the same
      } else {
        // Reinvest — add to principal (current behavior)
        newPrincipal = p.investmentAmount + reinvestAmount;
        const { error: upErr } = await supabase
          .from('investor_portfolios')
          .update({ investment_amount: newPrincipal })
          .eq('id', p.portfolioId);
        if (upErr) throw upErr;
      }

      // Reinvest ledger via RPC (double-entry: roi_expense + roi_reinvestment)
      const { error: ledgerErr } = await supabase.rpc('create_ledger_transaction', {
        entries: [
          {
            user_id: p.investorId,
            ledger_scope: 'platform',
            direction: 'cash_out',
            amount: reinvestAmount,
            category: 'roi_expense',
            description: `[Split ROI] ${formatUGX(reinvestAmount)} ${reinvestLabel}. ${isKeepReturns ? `Principal unchanged: ${formatUGX(p.investmentAmount)}` : `New principal: ${formatUGX(newPrincipal)}`}. Cash portion: ${formatUGX(cashAmount)} via ${modeLabel}. Reason: ${reason}`,
            reference_id: refId,
            source_table: 'investor_portfolios',
            source_id: p.portfolioId,
            linked_party: user.id,
            currency: 'UGX',
          },
          {
            user_id: p.investorId,
            ledger_scope: 'platform',
            direction: 'cash_in',
            amount: reinvestAmount,
            category: isKeepReturns ? 'roi_wallet_credit' : 'roi_reinvestment',
            description: `[Split ROI] ${formatUGX(reinvestAmount)} ${reinvestLabel}. Ref: ${refId}`,
            reference_id: refId,
            source_table: 'investor_portfolios',
            source_id: p.portfolioId,
            linked_party: user.id,
            currency: 'UGX',
          },
        ],
      });
      if (ledgerErr) throw ledgerErr;

      // ── Cash portion: submit to pending_wallet_operations for CFO approval ──
      const operationType = payMode === 'agent_wallet' ? 'roi_split_agent_wallet' : payMode === 'wallet' ? 'roi_split_cash' : 'roi_split_already_paid';
      const { error: pendErr } = await supabase.from('pending_wallet_operations').insert({
        user_id: p.investorId,
        amount: cashAmount,
        direction: 'cash_in',
        category: 'roi_payout',
        source_table: 'investor_portfolios',
        source_id: p.portfolioId,
        reference_id: refId,
        operation_type: operationType,
        transaction_group_id: txnGroupId,
        target_wallet_user_id: isProxyAgent ? managed.agentId : null,
        description: isProxyAgent
          ? `[Split ROI → Agent Wallet] Cash portion ${formatUGX(cashAmount)} to ${managed.agentName}'s agent wallet. Reinvested: ${formatUGX(reinvestAmount)}. Total ROI: ${formatUGX(roiAmount)}. Reason: ${reason}`
          : `[Split ROI → ${modeLabel}] Cash portion ${formatUGX(cashAmount)} to ${p.name}'s wallet. Reinvested: ${formatUGX(reinvestAmount)}. Total ROI: ${formatUGX(roiAmount)}. Reason: ${reason}`,
        linked_party: user.id,
        status: 'pending',
        metadata: {
          partner_name: p.name,
          roi_percentage: p.roiPercentage,
          investment_amount: p.investmentAmount,
          initiated_by: user.id,
          reason,
          pay_mode: payMode,
          split_payout: true,
          cash_amount: cashAmount,
          reinvest_amount: reinvestAmount,
          total_roi: roiAmount,
          new_principal: newPrincipal,
          ...(isProxyAgent ? { target_agent_name: managed.agentName, target_agent_id: managed.agentId } : {}),
        },
      });
      if (pendErr) throw pendErr;

      // ── Audit log ──
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'roi_split_payout',
        table_name: 'investor_portfolios',
        record_id: p.portfolioId,
        metadata: {
          roi_amount: roiAmount, cash_amount: cashAmount, reinvest_amount: reinvestAmount,
          new_principal: newPrincipal, reference: refId, partner_id: p.investorId, partner_name: p.name,
          reason, pay_mode: payMode, reinvest_mode: reinvestMode,
          ...(isProxyAgent ? { target_agent_id: managed.agentId, target_agent_name: managed.agentName } : {}),
        },
      });

      // ── Notifications ──
      const reinvestMsg = isKeepReturns
        ? `${formatUGX(reinvestAmount)} kept as earned returns (principal unchanged: ${formatUGX(p.investmentAmount)})`
        : `${formatUGX(reinvestAmount)} reinvested into your portfolio. New principal: ${formatUGX(newPrincipal)}`;
      await supabase.from('notifications').insert({
        user_id: p.investorId,
        title: '✂️ Split ROI Processed',
        message: `Your ROI of ${formatUGX(roiAmount)} has been split: ${formatUGX(cashAmount)} ${payMode === 'already_paid' ? 'paid via cash' : 'sent to your wallet (pending approval)'}, and ${reinvestMsg}. Ref: ${refId}`,
        type: 'payout_initiated',
        metadata: { portfolio_id: p.portfolioId, roi_amount: roiAmount, cash_amount: cashAmount, reinvest_amount: reinvestAmount, reinvest_mode: reinvestMode, reference: refId },
      });

      // Notify CFO
      const { data: cfoUsers } = await supabase.from('user_roles').select('user_id').eq('role', 'cfo');
      if (cfoUsers?.length) {
        await supabase.from('notifications').insert(
          cfoUsers.map((c: any) => ({
            user_id: c.user_id,
            title: '✂️ Split ROI Payout Pending',
            message: `${p.name}: ${formatUGX(cashAmount)} cash (${modeLabel}) + ${formatUGX(reinvestAmount)} ${isKeepReturns ? 'kept as returns' : 'reinvested'}. Awaiting approval. Ref: ${refId}`,
            type: 'approval_needed',
            metadata: { portfolio_id: p.portfolioId, reference: refId, cash_amount: cashAmount, reinvest_amount: reinvestAmount, reinvest_mode: reinvestMode },
          }))
        );
      }

      toast.success(`Split payout for ${p.name}`, {
        description: `${formatUGX(cashAmount)} to ${modeLabel} · ${formatUGX(reinvestAmount)} ${isKeepReturns ? 'kept as returns' : 'reinvested'} · Ref: ${refId}`,
      });
      setCompleted(prev => ({ ...prev, [p.portfolioId]: 'split' }));
      setPaymentStep('list');
      setSelectedPayout(null);
      onActionComplete?.();
    } catch (err: any) {
      toast.error('Split payout failed', { description: err.message });
    } finally {
      setProcessing(prev => ({ ...prev, [p.portfolioId]: null }));
    }
  };

  const selectedRoiAmount = selectedPayout ? Math.round(selectedPayout.investmentAmount * selectedPayout.roiPercentage / 100) : 0;
  const selectedManaged = selectedPayout ? managedInfo[selectedPayout.portfolioId] : null;
  const selectedReason = selectedPayout ? (reasons[selectedPayout.portfolioId] || '') : '';
  const selectedProcessing = selectedPayout ? processing[selectedPayout.portfolioId] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 sm:max-w-xl">
        {paymentStep === 'list' ? (
          <>
            <DialogHeader className="p-4 pb-2 sm:p-5 sm:pb-3">
              <DialogTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4.5 w-4.5 text-violet-600" />
                Portfolios Nearing Payout
              </DialogTitle>
              <DialogDescription className="text-xs">
                {filtered.length} of {localPortfolios.length} portfolio{localPortfolios.length !== 1 ? 's' : ''} · {localPortfolios.filter(p => p.daysUntil < 0).length} overdue
              </DialogDescription>
            </DialogHeader>
            <div className="px-4 sm:px-5 space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name, portfolio, phone…"
                    className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted">
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <Select value={rangeFilter} onValueChange={setRangeFilter}>
                  <SelectTrigger className="w-[120px] h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[calc(90vh-160px)] px-4 pb-4 sm:px-5 sm:pb-5 space-y-2">
              {filtered.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  {search ? 'No matching portfolios found.' : 'No portfolios nearing payout.'}
                </div>
              ) : (
                filtered.map((p, idx) => {
                  const roiAmount = Math.round(p.investmentAmount * p.roiPercentage / 100);
                  const isProcessing = processing[p.portfolioId];
                  const isDone = completed[p.portfolioId];
                  const refPreview = `${p.portfolioId.slice(0, 8)}`;
                  return (
                    <div key={p.portfolioId + idx} className={cn("rounded-xl border border-border/60 bg-card p-3 sm:p-4 space-y-2", isDone === 'compounded' && "opacity-60 border-green-500/40 bg-green-500/5", isDone === 'pending' && "opacity-80 border-amber-500/40 bg-amber-500/5", isDone === 'split' && "opacity-70 border-violet-500/40 bg-violet-500/5")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{p.name}</p>
                          <p className="text-xs text-primary/80 font-medium truncate">{p.portfolioName}</p>
                          <p className="text-xs text-muted-foreground">{p.phone || p.email || 'No contact'}</p>
                        </div>
                        {isDone === 'pending' ? (
                          <Badge className="shrink-0 text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
                            ⏳ Pending Approval
                          </Badge>
                        ) : isDone === 'compounded' ? (
                          <Badge className="shrink-0 text-[10px] bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30">
                            ✓ Compounded
                          </Badge>
                        ) : isDone === 'split' ? (
                          <Badge className="shrink-0 text-[10px] bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30">
                            ✂️ Split Processed
                          </Badge>
                        ) : p.daysUntil < 0 ? (
                          <Badge variant="destructive" className="shrink-0 text-[10px]">
                            {Math.abs(p.daysUntil)}d overdue
                          </Badge>
                        ) : p.daysUntil === 0 ? (
                          <Badge className="shrink-0 text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
                            Due Today
                          </Badge>
                        ) : (
                          <Badge variant={p.daysUntil <= 2 ? 'warning' : 'secondary'} className="shrink-0 text-[10px]">
                            {p.daysUntil === 1 ? 'Tomorrow' : `${p.daysUntil}d away`}
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="rounded-lg bg-muted/50 p-2">
                          <p className="text-[10px] text-muted-foreground">Principal</p>
                          <p className="text-xs font-bold tabular-nums">{formatUGX(p.investmentAmount)}</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-2">
                          <p className="text-[10px] text-muted-foreground">Returns Due</p>
                          <p className="text-xs font-bold tabular-nums text-primary">{formatUGX(roiAmount)}</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-2">
                          <p className="text-[10px] text-muted-foreground">Contribution Date</p>
                          <p className="text-xs font-bold">
                            {formatDateOnlyForDisplay(p.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-2">
                          <p className="text-[10px] text-muted-foreground">Payout Date</p>
                          <p className="text-xs font-bold">
                            {new Date(p.nextPayoutDate + 'T00:00:00').toLocaleDateString('en-UG', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{p.roiPercentage}% · {p.roiMode === 'monthly_compounding' ? 'Compounding' : 'Payout'}</span>
                        <span className="font-mono">{refPreview}</span>
                      </div>
                      {/* Audit Reason + Action Buttons */}
                      {!isDone && (
                        <div className="space-y-2 pt-1">
                          <Textarea
                            placeholder="Include reason and phone number or A/C"
                            className="min-h-[60px] text-xs"
                            value={reasons[p.portfolioId] || ''}
                            onChange={e => setReasons(prev => ({ ...prev, [p.portfolioId]: e.target.value }))}
                          />
                          {(reasons[p.portfolioId]?.length || 0) > 0 && (reasons[p.portfolioId]?.length || 0) < 10 && (
                            <p className="text-[10px] text-destructive">Reason must be at least 10 characters</p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 text-xs gap-1.5"
                              disabled={!!isProcessing || (reasons[p.portfolioId]?.length || 0) < 10}
                              onClick={() => handleCompound(p, reasons[p.portfolioId])}
                            >
                              {isProcessing === 'compound' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUpRight className="h-3 w-3" />}
                              Compound
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="flex-1 text-xs gap-1.5"
                              disabled={!!isProcessing || (reasons[p.portfolioId]?.length || 0) < 10}
                              onClick={() => handleSplitClick(p)}
                            >
                              {isProcessing === 'split' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Scissors className="h-3 w-3" />}
                              Split
                            </Button>
                            <Button
                              size="sm"
                              variant="default"
                              className="flex-1 text-xs gap-1.5"
                              disabled={!!isProcessing || (reasons[p.portfolioId]?.length || 0) < 10}
                              onClick={() => handlePayClick(p)}
                            >
                              <Wallet className="h-3 w-3" />
                              Pay
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : paymentStep === 'payment-options' && selectedPayout ? (
          /* ═══ Step 2: Payment Options ═══ */
          <>
            <DialogHeader className="p-4 pb-2 sm:p-5 sm:pb-3">
              <DialogTitle className="flex items-center gap-2 text-base">
                <button
                  onClick={() => { setPaymentStep('list'); setSelectedPayout(null); }}
                  className="p-1 -ml-1 rounded-lg hover:bg-muted transition-colors"
                >
                  <ArrowUpRight className="h-4 w-4 rotate-[225deg]" />
                </button>
                Payment Options
              </DialogTitle>
              <DialogDescription className="text-xs">
                Choose how to pay {selectedPayout.name}
              </DialogDescription>
            </DialogHeader>
            <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-4">
              {/* Payout Summary Card */}
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{selectedPayout.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedPayout.phone || selectedPayout.email || 'No contact'}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {selectedPayout.daysUntil === 0 ? 'Today' : selectedPayout.daysUntil === 1 ? 'Tomorrow' : `${selectedPayout.daysUntil}d away`}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-background p-2">
                    <p className="text-[10px] text-muted-foreground">Principal</p>
                    <p className="text-xs font-bold tabular-nums">{formatUGX(selectedPayout.investmentAmount)}</p>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-2">
                    <p className="text-[10px] text-muted-foreground">Returns Due</p>
                    <p className="text-xs font-bold tabular-nums text-primary">{formatUGX(selectedRoiAmount)}</p>
                  </div>
                </div>
                <div className="rounded-lg bg-background border border-border/40 p-2.5">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Audit Reason</p>
                  <p className="text-xs leading-relaxed">{selectedReason}</p>
                </div>
              </div>

              {/* Managed Account Status */}
              {checkingManagedStep2 ? (
                <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Checking account status...</span>
                </div>
              ) : selectedManaged?.isManaged ? (
                /* ─── Managed Account ─── */
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-3 py-2.5">
                    <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-primary">Managed Account</p>
                      <p className="text-[10px] text-primary/70">Funds will be sent to <strong>{selectedManaged.agentName}</strong>'s agent wallet</p>
                    </div>
                  </div>
                  <Button
                    className="w-full gap-2"
                    disabled={!!selectedProcessing}
                    onClick={() => handlePay(selectedPayout, selectedReason, 'agent_wallet')}
                  >
                    {selectedProcessing === 'pay' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Send to Agent Wallet
                  </Button>
                </div>
              ) : (
                /* ─── Standard or Non-Managed Proxy Account ─── */
                <div className="space-y-3">
                  {/* Show proxy agent notice for non-managed assignments */}
                  {selectedManaged?.hasProxy && !selectedManaged?.isManaged && (
                    <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
                      <Handshake className="h-4 w-4 text-amber-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Linked Proxy Agent</p>
                        <p className="text-[10px] text-amber-600/80 dark:text-amber-400/70">
                          <strong>{selectedManaged.agentName}</strong> is assigned as proxy agent for this partner
                        </p>
                      </div>
                    </div>
                  )}
                  <p className="text-xs font-medium text-muted-foreground">Select payment method</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
                        "hover:border-primary/50 hover:bg-primary/5",
                        "focus:outline-none focus:ring-2 focus:ring-primary/30"
                      )}
                      disabled={!!selectedProcessing}
                      onClick={() => handlePay(selectedPayout, selectedReason, selectedManaged?.hasProxy ? 'agent_wallet' : 'wallet')}
                    >
                      {selectedProcessing === 'pay' ? (
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      ) : selectedManaged?.hasProxy ? (
                        <ShieldCheck className="h-6 w-6 text-primary" />
                      ) : (
                        <Wallet className="h-6 w-6 text-primary" />
                      )}
                      <span className="text-xs font-semibold">{selectedManaged?.hasProxy ? 'Credit Agent Wallet' : 'Pay to Wallet'}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight text-center">
                        {selectedManaged?.hasProxy ? `Send to ${selectedManaged.agentName}'s wallet` : "Credit partner's digital wallet"}
                      </span>
                    </button>
                    <button
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
                        "hover:border-primary/50 hover:bg-primary/5",
                        "focus:outline-none focus:ring-2 focus:ring-primary/30"
                      )}
                      disabled={!!selectedProcessing}
                      onClick={() => handlePay(selectedPayout, selectedReason, 'already_paid')}
                    >
                      <CheckCircle2 className="h-6 w-6 text-primary" />
                      <span className="text-xs font-semibold">Cash</span>
                      <span className="text-[10px] text-muted-foreground leading-tight text-center">Already/to be paid externally</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : paymentStep === 'split-config' && selectedPayout ? (
          /* ═══ Step 3: Split Configuration ═══ */
          <>
            <DialogHeader className="p-4 pb-2 sm:p-5 sm:pb-3">
              <DialogTitle className="flex items-center gap-2 text-base">
                <button
                  onClick={() => { setPaymentStep('list'); setSelectedPayout(null); }}
                  className="p-1 -ml-1 rounded-lg hover:bg-muted transition-colors"
                >
                  <ArrowUpRight className="h-4 w-4 rotate-[225deg]" />
                </button>
                <Scissors className="h-4 w-4" />
                Split Payout
              </DialogTitle>
              <DialogDescription className="text-xs">
                Split {selectedPayout.name}'s returns between cash and reinvestment
              </DialogDescription>
            </DialogHeader>
            <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-4">
              {/* Summary */}
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{selectedPayout.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedPayout.phone || selectedPayout.email || 'No contact'}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {selectedPayout.roiPercentage}% ROI
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-background p-2">
                    <p className="text-[10px] text-muted-foreground">Principal</p>
                    <p className="text-xs font-bold tabular-nums">{formatUGX(selectedPayout.investmentAmount)}</p>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-2">
                    <p className="text-[10px] text-muted-foreground">Total Returns</p>
                    <p className="text-xs font-bold tabular-nums text-primary">{formatUGX(selectedRoiAmount)}</p>
                  </div>
                  <div className="rounded-lg bg-background p-2">
                    <p className="text-[10px] text-muted-foreground">
                      {splitReinvestMode === 'keep_returns' ? 'Principal (unchanged)' : 'New Principal'}
                    </p>
                    <p className="text-xs font-bold tabular-nums">
                      {formatUGX(splitReinvestMode === 'keep_returns' ? selectedPayout.investmentAmount : selectedPayout.investmentAmount + (selectedRoiAmount - splitCashAmount))}
                    </p>
                  </div>
                </div>
              </div>

              {/* Split Controls */}
              <div className="space-y-3">
                <Label className="text-xs font-medium">Cash Amount</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={1}
                    max={selectedRoiAmount - 1}
                    value={splitCashAmount}
                    onChange={e => {
                      const val = Math.max(1, Math.min(selectedRoiAmount - 1, Number(e.target.value) || 0));
                      setSplitCashAmount(val);
                    }}
                    className="text-sm tabular-nums"
                  />
                </div>
                <Slider
                  min={1}
                  max={selectedRoiAmount - 1}
                  step={1000}
                  value={[splitCashAmount]}
                  onValueChange={([v]) => setSplitCashAmount(v)}
                  className="py-1"
                />

                {/* Visual breakdown */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 text-center">
                    <Wallet className="h-4 w-4 mx-auto mb-1 text-primary" />
                    <p className="text-[10px] text-muted-foreground">Cash Payout</p>
                    <p className="text-sm font-bold tabular-nums text-primary">{formatUGX(splitCashAmount)}</p>
                  </div>
                  <div className={cn("rounded-xl border-2 p-3 text-center cursor-pointer transition-all", splitReinvestMode === 'reinvest' ? "border-green-500/50 bg-green-500/10" : "border-border/40 bg-muted/30 hover:border-green-500/30")} onClick={() => setSplitReinvestMode('reinvest')}>
                    <TrendingUp className="h-4 w-4 mx-auto mb-1 text-green-600" />
                    <p className="text-[10px] text-muted-foreground">Reinvest</p>
                    <p className="text-sm font-bold tabular-nums text-green-600">{formatUGX(selectedRoiAmount - splitCashAmount)}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">Adds to principal</p>
                  </div>
                  <div className={cn("rounded-xl border-2 p-3 text-center cursor-pointer transition-all", splitReinvestMode === 'keep_returns' ? "border-amber-500/50 bg-amber-500/10" : "border-border/40 bg-muted/30 hover:border-amber-500/30")} onClick={() => setSplitReinvestMode('keep_returns')}>
                    <PiggyBank className="h-4 w-4 mx-auto mb-1 text-amber-600" />
                    <p className="text-[10px] text-muted-foreground">Keep as Returns</p>
                    <p className="text-sm font-bold tabular-nums text-amber-600">{formatUGX(selectedRoiAmount - splitCashAmount)}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">Principal stays flat</p>
                  </div>
                </div>
              </div>

              {/* Payment method for cash portion */}
              {checkingManagedStep2 ? (
                <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Checking account status...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Cash portion payment method</Label>
                  <Select value={splitPayMode} onValueChange={(v: any) => setSplitPayMode(v)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedManaged?.isManaged || selectedManaged?.hasProxy ? (
                        <SelectItem value="agent_wallet">Agent Wallet ({selectedManaged?.agentName})</SelectItem>
                      ) : (
                        <SelectItem value="wallet">Pay to Wallet</SelectItem>
                      )}
                      <SelectItem value="already_paid">Cash (already/to be paid externally)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Audit reason */}
              <div className="rounded-lg bg-background border border-border/40 p-2.5">
                <p className="text-[10px] text-muted-foreground mb-0.5">Audit Reason</p>
                <p className="text-xs leading-relaxed">{selectedReason}</p>
              </div>

              {/* Confirm */}
              <Button
                className="w-full gap-2"
                disabled={!!selectedProcessing || splitCashAmount < 1 || splitCashAmount >= selectedRoiAmount}
                onClick={() => handleSplitPayout(selectedPayout, splitCashAmount, selectedReason, splitPayMode, splitReinvestMode)}
              >
                {selectedProcessing === 'split' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                Confirm Split Payout
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
