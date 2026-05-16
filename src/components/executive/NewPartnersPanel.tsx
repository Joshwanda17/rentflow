import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStaffPermissions } from '@/hooks/useStaffPermissions';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { UserSearchPicker } from '@/components/cfo/UserSearchPicker';
import { CreateInvestmentAccountDialog } from '@/components/manager/CreateInvestmentAccountDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Sparkles, UserPlus, Pencil, Loader2, Phone, Clock, ShieldCheck, PlusCircle, Save, X, ChevronDown, ShieldOff, History, Zap, MessageCircle, Search, Filter } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { UGANDA_BANKS } from '@/lib/ugandaBanks';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';
import { clientLog } from '@/lib/clientLogger';

// ════════════════════════════════════════════════════════════════
// Shared validators — keep portfolio payout fields clean & DB-safe
// ════════════════════════════════════════════════════════════════
/**
 * Normalize a Ugandan mobile number to canonical local form: 0XXXXXXXXX (10 digits, starts 07).
 * Accepts: 0770…, 256770…, +256770…, 770… (with optional spaces / dashes).
 * Returns null if invalid.
 */
function normalizeUgPhone(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  let local = digits;
  if (local.startsWith('256')) local = '0' + local.slice(3);
  else if (local.length === 9 && local.startsWith('7')) local = '0' + local;
  if (!/^0[7]\d{8}$/.test(local)) return null;
  return local;
}

function networkMatchesPrefix(network: string, phone: string): boolean {
  // MTN: 077, 078, 076, 039  · Airtel: 070, 074, 075, 020
  const p3 = phone.slice(0, 3);
  const n = network.toLowerCase();
  if (n === 'mtn') return ['077', '078', '076', '039'].includes(p3);
  if (n === 'airtel') return ['070', '074', '075', '020'].includes(p3);
  return true; // unknown network → don't block
}

interface PortfolioFieldsInput {
  payment_method: string;
  payout_day?: string | number | null;
  mobile_money_number?: string | null;
  mobile_network?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  account_number?: string | null;
}

interface PortfolioFieldsResult {
  payout_day: number | null;
  mobile_money_number: string | null;
  mobile_network: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  account_number: string | null;
}

/**
 * Validates + normalizes the fields commonly touched by the inline forms.
 * Throws Error with a user-friendly message on the first failure.
 */
function validatePortfolioPayoutFields(f: PortfolioFieldsInput): PortfolioFieldsResult {
  // ── Payout day (required when a payment method is chosen) ──
  let payout_day: number | null = null;
  if (f.payout_day !== null && f.payout_day !== undefined && f.payout_day !== '') {
    const n = typeof f.payout_day === 'number' ? f.payout_day : parseInt(String(f.payout_day), 10);
    if (!Number.isInteger(n) || n < 1 || n > 28) {
      throw new Error('Payout day must be a whole number between 1 and 28.');
    }
    payout_day = n;
  }
  if (f.payment_method && f.payment_method !== 'wallet' && payout_day === null) {
    throw new Error('Payout day is required for mobile money and bank payouts.');
  }

  // ── Mobile Money ──
  let mobile_money_number: string | null = null;
  let mobile_network: string | null = null;
  if (f.payment_method === 'mobile_money') {
    const normalized = normalizeUgPhone(f.mobile_money_number || '');
    if (!normalized) {
      throw new Error('Mobile number must be a valid Ugandan number (e.g. 0770000000).');
    }
    const network = (f.mobile_network || '').trim();
    if (!network) throw new Error('Mobile network is required for mobile money payouts.');
    if (!['MTN', 'Airtel', 'mtn', 'airtel'].includes(network)) {
      throw new Error('Mobile network must be MTN or Airtel.');
    }
    if (!networkMatchesPrefix(network, normalized)) {
      throw new Error(`${normalized} does not match the selected ${network} network. Check the number prefix.`);
    }
    mobile_money_number = normalized;
    mobile_network = network;
  }

  // ── Bank ──
  let bank_name: string | null = null;
  let bank_account_name: string | null = null;
  let account_number: string | null = null;
  if (f.payment_method === 'bank') {
    const bn = (f.bank_name || '').trim();
    if (bn.length < 2 || bn.length > 80) {
      throw new Error('Bank name must be 2–80 characters.');
    }
    const an = (f.bank_account_name || '').trim();
    if (an.length < 2 || an.length > 100 || !/^[A-Za-z][A-Za-z .'\-]*$/.test(an)) {
      throw new Error('Bank account name must be 2–100 letters (spaces, hyphens, apostrophes allowed).');
    }
    const accDigits = (f.account_number || '').replace(/[\s-]/g, '');
    if (!/^\d{6,20}$/.test(accDigits)) {
      throw new Error('Bank account number must be 6–20 digits.');
    }
    bank_name = bn;
    bank_account_name = an;
    account_number = accDigits;
  }

  return { payout_day, mobile_money_number, mobile_network, bank_name, bank_account_name, account_number };
}
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface JoinedPartner {
  user_id: string;
  created_at: string;
  full_name: string;
  phone: string;
  portfolio_count: number;
}

interface PickedUser { id: string; full_name: string; phone: string }

export function NewPartnersPanel() {
  const { user } = useAuth();
  const { hasPermission } = useStaffPermissions();
  // Only Partner Ops Managers (and bypass roles via useStaffPermissions)
  // can contact partners via WhatsApp. All other viewers see the list
  // read-only without the WhatsApp action.
  const canWhatsAppPartners = hasPermission('partners-ops');
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<PickedUser | null>(null);
  const [selectedIsPartner, setSelectedIsPartner] = useState<boolean | null>(null);
  const [grantBusy, setGrantBusy] = useState(false);
  const [selectedPortfolios, setSelectedPortfolios] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForUser, setCreateForUser] = useState<PickedUser | null>(null);
  // Confirmation gate before opening the create-portfolio dialog from the
  // "Just Joined Partners" Activate button. Prevents accidental taps.
  const [activateConfirm, setActivateConfirm] = useState<{
    user: PickedUser;
    isFirst: boolean;
    portfolioCount: number;
    joinedAt?: string;
  } | null>(null);
  // User id currently being activated — keeps that row's Activate/Add button
  // disabled with a spinner from the moment the confirmation is accepted
  // until the create-portfolio dialog closes (server confirmed or cancelled).
  const [activatingUserId, setActivatingUserId] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeBusy, setRevokeBusy] = useState(false);
  // Typed confirmation phrase the operator must enter before Revoke unlocks.
  const [revokeConfirmText, setRevokeConfirmText] = useState('');
  // Short-lived memo of recent confirmations keyed by `${action}:${userId}`.
  // Lets a second tap on the SAME partner within the window skip the dialog —
  // useful when the operator is processing several partners back-to-back.
  const recentConfirmsRef = useRef<Map<string, number>>(new Map());
  const RECENT_CONFIRM_MS = 2 * 60 * 1000; // 2 minutes
  const wasRecentlyConfirmed = (key: string) => {
    const ts = recentConfirmsRef.current.get(key);
    if (!ts) return false;
    if (Date.now() - ts > RECENT_CONFIRM_MS) {
      recentConfirmsRef.current.delete(key);
      return false;
    }
    return true;
  };
  const markConfirmed = (key: string) => {
    recentConfirmsRef.current.set(key, Date.now());
  };

  // Page-visibility / navigation guard for open confirmation dialogs.
  // While either the Activate or Revoke confirmation is open, we:
  //  - Prevent the dialog from closing (and the action from firing) while the
  //    tab is hidden / backgrounded — so a stray background-tab tap can't
  //    silently dismiss or proceed.
  //  - Warn on tab/route close via `beforeunload` so navigation away requires
  //    the operator's explicit confirmation.
  const anyConfirmOpen = !!activateConfirm || revokeOpen;
  const isPageVisible = () =>
    typeof document === 'undefined' || document.visibilityState === 'visible';
  useEffect(() => {
    if (!anyConfirmOpen) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Most browsers ignore the custom string but require returnValue set.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [anyConfirmOpen]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [inlineCreateOpen, setInlineCreateOpen] = useState(false);
  // Track per-row unsaved change summaries (by portfolio id). The value is a list
  // of human-readable diff lines (e.g. "Payout day: 5 → 12") so we can show the
  // user exactly what's about to be discarded. Lives in a ref so child updates
  // do not re-render the parent.
  const dirtyRowsRef = useRef<Record<string, string[]>>({});
  // Track which inline-editor rows are currently mid-save. Blocks collapse/switch
  // so the user can't accidentally trigger an unsaved-change prompt or navigate
  // away while the network request is in flight.
  const savingRowsRef = useRef<Record<string, boolean>>({});
  // Reactive count of rows currently mid-save — drives the global blocking
  // overlay. We keep the ref above for synchronous reads inside requestExpand.
  const [savingCount, setSavingCount] = useState(0);

  // In-app modal state for the discard-changes confirmation (replaces window.confirm).
  const [discardPrompt, setDiscardPrompt] = useState<{
    portfolioId: string;
    portfolioLabel: string;
    changes: string[];
    action: 'collapse' | 'switch';
    onConfirm: () => void;
  } | null>(null);

  // Warn the user before they navigate away / reload / close the tab while any
  // expanded inline portfolio row still has unsaved edits.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const hasDirty = Object.values(dirtyRowsRef.current).some(v => v && v.length > 0);
      if (!hasDirty) return;
      e.preventDefault();
      // Required for Chrome to actually show the prompt.
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  /**
   * Wraps setExpandedId to prompt before discarding unsaved inline edits when
   * collapsing the currently-open row or switching to a different one.
   */
  function requestExpand(nextId: string | null) {
    const currentId = expandedId;
    if (currentId && savingRowsRef.current[currentId]) {
      // A save is in flight on the current row — ignore collapse/switch.
      return;
    }
    const changes = currentId ? dirtyRowsRef.current[currentId] : undefined;
    if (currentId && currentId !== nextId && changes && changes.length > 0) {
      const current = selectedPortfolios.find(x => x.id === currentId);
      setDiscardPrompt({
        portfolioId: currentId,
        portfolioLabel: current?.account_name || current?.portfolio_code || 'this portfolio',
        changes,
        action: nextId === null ? 'collapse' : 'switch',
        onConfirm: () => {
          delete dirtyRowsRef.current[currentId];
          setExpandedId(nextId);
          setDiscardPrompt(null);
        },
      });
      return;
    }
    setExpandedId(nextId);
  }

  // Filters for the all-partners list
  const [partnerSearch, setPartnerSearch] = useState('');
  const [partnerFilter, setPartnerFilter] = useState<'all' | 'with' | 'without' | 'recent'>('all');
  // Incremental render window for the partners grid — keeps DOM small
  // even when up to 500 partners are loaded.
  const PARTNER_PAGE_SIZE = 30;
  const [visiblePartnerCount, setVisiblePartnerCount] = useState(PARTNER_PAGE_SIZE);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  // Reset the window whenever the user changes search/filter so they
  // never miss matches hidden below the previous slice.
  useEffect(() => {
    setVisiblePartnerCount(PARTNER_PAGE_SIZE);
  }, [partnerSearch, partnerFilter]);
  // Auto-load the next page when the sentinel scrolls into view.
  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        setVisiblePartnerCount(c => c + PARTNER_PAGE_SIZE);
      }
    }, { root: null, rootMargin: '200px', threshold: 0 });
    io.observe(node);
    return () => io.disconnect();
  }, [visiblePartnerCount, partnerSearch, partnerFilter]);

  // ── All partners (Partner Ops can browse, filter, and contact every joined partner) ──
  const { data: joined, isLoading } = useQuery({
    queryKey: ['new-partners-panel'],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, created_at')
        .eq('role', 'supporter')
        .eq('enabled', true)
        .order('created_at', { ascending: false })
        .limit(500);
      const rows = roles || [];
      if (rows.length === 0) return [] as JoinedPartner[];

      const ids = rows.map(r => r.user_id);
      const [{ data: profiles }, { data: portfolios }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, phone').in('id', ids),
        supabase.from('investor_portfolios').select('investor_id').in('investor_id', ids),
      ]);
      const pMap = new Map((profiles || []).map(p => [p.id, p]));
      const countMap = new Map<string, number>();
      (portfolios || []).forEach(p => {
        if (!p.investor_id) return;
        countMap.set(p.investor_id, (countMap.get(p.investor_id) || 0) + 1);
      });

      return rows.map(r => ({
        user_id: r.user_id,
        created_at: r.created_at,
        full_name: pMap.get(r.user_id)?.full_name || 'Unknown',
        phone: pMap.get(r.user_id)?.phone || '—',
        portfolio_count: countMap.get(r.user_id) || 0,
      })) as JoinedPartner[];
    },
    staleTime: 60_000,
  });

  // ── Realtime: any new supporter role grant pops in instantly ──
  useEffect(() => {
    const channel = supabase
      .channel('new-partners-panel-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_roles', filter: 'role=eq.supporter' },
        () => { qc.invalidateQueries({ queryKey: ['new-partners-panel'] }); }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'investor_portfolios' },
        () => { qc.invalidateQueries({ queryKey: ['new-partners-panel'] }); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // When a user is selected via search, look up role + portfolios
  async function handleSelect(u: PickedUser | null) {
    setSelected(u);
    setSelectedIsPartner(null);
    setSelectedPortfolios([]);
    if (!u) return;
    const [{ data: roleRow }, { data: ports }] = await Promise.all([
      supabase.from('user_roles').select('id').eq('user_id', u.id).eq('role', 'supporter').eq('enabled', true).maybeSingle(),
      supabase.from('investor_portfolios')
        .select('id, portfolio_code, account_name, investment_amount, roi_percentage, status, investor_id, agent_id, display_currency, payment_method, mobile_money_number, mobile_network, bank_name, bank_account_name, account_number, payout_day')
        .eq('investor_id', u.id)
        .order('created_at', { ascending: false }),
    ]);
    setSelectedIsPartner(!!roleRow);
    setSelectedPortfolios(ports || []);
  }

  async function makePartner() {
    if (!selected) return;
    setGrantBusy(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .upsert({ user_id: selected.id, role: 'supporter' as any, enabled: true }, { onConflict: 'user_id,role' });
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'grant_supporter_role',
        table_name: 'user_roles',
        record_id: selected.id,
        metadata: { granted_to: selected.full_name, phone: selected.phone, source: 'PartnerOps NewPartnersPanel' },
      });
      toast({ title: '✅ Partner role granted', description: `${selected.full_name} is now a Partner.` });
      setSelectedIsPartner(true);
      qc.invalidateQueries({ queryKey: ['new-partners-panel'] });
      // Force the dialog's approval-status query to refetch so the
      // "Partner Not Approved" lock / button label clears immediately.
      qc.invalidateQueries({ queryKey: ['funder-approval-status', selected.id] });
    } catch (e: any) {
      toast({ title: 'Could not grant role', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setGrantBusy(false);
    }
  }

  function openCreateFor(u: PickedUser) {
    setCreateForUser(u);
    setCreateOpen(true);
  }

  async function revokePartner() {
    if (!selected) return;
    setRevokeBusy(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ enabled: false })
        .eq('user_id', selected.id)
        .eq('role', 'supporter');
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'revoke_supporter_role',
        table_name: 'user_roles',
        record_id: selected.id,
        metadata: { revoked_from: selected.full_name, phone: selected.phone, source: 'PartnerOps NewPartnersPanel' },
      });
      toast({ title: 'Partner role revoked', description: `${selected.full_name} is no longer a Partner.` });
      setSelectedIsPartner(false);
      setRevokeOpen(false);
      markConfirmed(`revoke:${selected.id}`);
      qc.invalidateQueries({ queryKey: ['new-partners-panel'] });
      if (historyOpen) loadHistory();
    } catch (e: any) {
      toast({ title: 'Could not revoke role', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setRevokeBusy(false);
    }
  }

  async function loadHistory() {
    if (!selected) return;
    setHistoryLoading(true);
    try {
      const portfolioIds = selectedPortfolios.map(p => p.id);
      const recordIds = [selected.id, ...portfolioIds];
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, created_at, action_type, table_name, record_id, user_id, metadata')
        .in('record_id', recordIds)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setHistoryRows(data || []);
    } catch (e: any) {
      toast({ title: 'Could not load history', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next) loadHistory();
  }

  return (
    <>
      <Card className="relative border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
        {savingCount > 0 && (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-background/70 backdrop-blur-sm cursor-wait"
            aria-busy="true"
            aria-live="polite"
            // Swallow clicks so no other edits can be triggered mid-save.
            onClickCapture={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onKeyDownCapture={(e) => { e.stopPropagation(); e.preventDefault(); }}
          >
            <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg border border-primary/40 bg-background shadow-lg">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
              <p className="text-xs font-semibold">Saving portfolio…</p>
              <p className="text-[10px] text-muted-foreground">
                {savingCount} row{savingCount === 1 ? '' : 's'} in flight — other edits are blocked
              </p>
            </div>
          </div>
        )}
        <CardContent className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/15">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold">Joined Partners</h3>
              <p className="text-[10px] text-muted-foreground">Browse all partners, filter, activate portfolios & WhatsApp</p>
            </div>
            {joined && joined.length > 0 && (() => {
              const withCount = joined.filter(p => p.portfolio_count > 0).length;
              const withoutCount = joined.length - withCount;
              return (
                <div className="flex items-center gap-1">
                  <Badge className="bg-primary/15 text-primary border-0 text-[10px] font-bold" title="Total partners">{joined.length}</Badge>
                  <Badge className="bg-emerald-500/15 text-emerald-600 border-0 text-[10px] font-bold" title="With portfolios">{withCount} active</Badge>
                  <Badge className="bg-amber-500/15 text-amber-600 border-0 text-[10px] font-bold" title="No portfolio yet">{withoutCount} pending</Badge>
                </div>
              );
            })()}
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 shrink-0"
              onClick={() => {
                setCreateForUser(null);
                setCreateOpen(true);
              }}
            >
              <PlusCircle className="h-3.5 w-3.5" /> Create Portfolio
            </Button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={partnerSearch}
                onChange={(e) => setPartnerSearch(e.target.value)}
                placeholder="Search by name or phone…"
                className="h-8 pl-7 text-xs"
              />
            </div>
            <Select value={partnerFilter} onValueChange={(v) => setPartnerFilter(v as typeof partnerFilter)}>
              <SelectTrigger className="h-8 text-xs w-full sm:w-[200px]">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All partners</SelectItem>
                <SelectItem value="recent">Joined in last 14 days</SelectItem>
                <SelectItem value="with">With portfolios</SelectItem>
                <SelectItem value="without">No portfolios yet</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Newly joined list */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : !joined || joined.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No partners yet.</p>
          ) : (
            (() => {
              const q = partnerSearch.trim().toLowerCase();
              const cutoff = Date.now() - 14 * 86400000;
              const filtered = joined.filter(p => {
                if (partnerFilter === 'with' && p.portfolio_count === 0) return false;
                if (partnerFilter === 'without' && p.portfolio_count > 0) return false;
                if (partnerFilter === 'recent' && new Date(p.created_at).getTime() < cutoff) return false;
                if (q) {
                  const hay = `${p.full_name} ${p.phone}`.toLowerCase();
                  if (!hay.includes(q)) return false;
                }
                return true;
              });
              if (filtered.length === 0) {
                return <p className="text-xs text-muted-foreground italic">No partners match these filters.</p>;
              }
              const visible = filtered.slice(0, visiblePartnerCount);
              const hasMore = filtered.length > visible.length;
              return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[520px] overflow-y-auto pr-1">
              <div className="col-span-full text-[10px] text-muted-foreground">
                Showing {visible.length} of {filtered.length} matched · {joined.length} total
              </div>
              {visible.map(p => (
                <div key={p.user_id} className="rounded-xl border border-border/60 bg-card p-2.5 flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {(p.full_name || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{p.full_name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{p.phone}</span>
                      <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</span>
                    </div>
                    {p.portfolio_count > 0 && (
                      <Badge variant="outline" className="mt-1 text-[9px] py-0 px-1.5">{p.portfolio_count} portfolio{p.portfolio_count > 1 ? 's' : ''}</Badge>
                    )}
                  </div>
                  {canWhatsAppPartners && (
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7 shrink-0 border-success/40 text-success hover:bg-success/10 hover:text-success"
                    title={`WhatsApp ${p.full_name}`}
                    disabled={!p.phone || p.phone === '—'}
                    onClick={() => {
                      const digits = (p.phone || '').replace(/\D/g, '');
                      if (!digits) return;
                      const intl = digits.startsWith('0') ? '256' + digits.slice(1) : digits;
                      const msg = encodeURIComponent(
                        `Hello ${p.full_name?.split(' ')[0] || ''}, this is Welile Partner Operations. `
                        + `Thank you for joining as a Partner. How can we help you today?`
                      );
                      window.open(`https://wa.me/${intl}?text=${msg}`, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] gap-1 shrink-0"
                    disabled={activatingUserId === p.user_id}
                    aria-busy={activatingUserId === p.user_id}
                    onClick={() => {
                      const u = { id: p.user_id, full_name: p.full_name, phone: p.phone };
                      if (wasRecentlyConfirmed(`activate:${u.id}`)) {
                        setActivatingUserId(u.id);
                        openCreateFor(u);
                        return;
                      }
                      setActivateConfirm({
                        user: u,
                        isFirst: p.portfolio_count === 0,
                        portfolioCount: p.portfolio_count,
                        joinedAt: p.created_at,
                      });
                    }}
                  >
                    {activatingUserId === p.user_id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <PlusCircle className="h-3 w-3" />
                    )}
                    {activatingUserId === p.user_id
                      ? 'Activating…'
                      : p.portfolio_count > 0 ? 'Add' : 'Activate'}
                  </Button>
                </div>
              ))}
              {hasMore && (
                <div
                  ref={loadMoreSentinelRef}
                  className="col-span-full flex justify-center py-2"
                >
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] gap-1.5"
                    onClick={() => setVisiblePartnerCount(c => c + PARTNER_PAGE_SIZE)}
                  >
                    <ChevronDown className="h-3 w-3" />
                    Load more ({filtered.length - visible.length} remaining)
                  </Button>
                </div>
              )}
            </div>
              );
            })()
          )}

          {/* Divider */}
          <div className="border-t border-border/50" />

          {/* Search any user */}
          <div className="space-y-2">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5 text-primary" />
              Search any user — grant Partner role or edit their portfolios
            </p>
            <UserSearchPicker
              label=""
              placeholder="Search by name or phone…"
              selectedUser={selected}
              onSelect={handleSelect}
            />

            {selected && (
              <div className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
                <div className="flex items-center gap-2 text-xs">
                  {selectedIsPartner === null ? (
                    <span className="text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Checking…</span>
                  ) : selectedIsPartner ? (
                    <Badge className="bg-success/15 text-success border-0 gap-1"><ShieldCheck className="h-3 w-3" /> Already a Partner</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">Not a Partner yet</Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedIsPartner === false && (
                    <Button size="sm" className="h-8 text-xs gap-1.5" onClick={makePartner} disabled={grantBusy}>
                      {grantBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                      Make Partner
                    </Button>
                  )}
                  {selectedIsPartner === true && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        if (selected && wasRecentlyConfirmed(`revoke:${selected.id}`)) {
                          revokePartner();
                          return;
                        }
                        setRevokeOpen(true);
                      }}
                    >
                      <ShieldOff className="h-3 w-3" /> Revoke Partner
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => openCreateFor(selected)}
                  >
                    <PlusCircle className="h-3 w-3" /> New Portfolio
                  </Button>
                  <Button
                    size="sm"
                    variant={inlineCreateOpen ? 'default' : 'outline'}
                    className="h-8 text-xs gap-1.5"
                    onClick={() => setInlineCreateOpen(o => !o)}
                  >
                    <PlusCircle className="h-3 w-3" /> {inlineCreateOpen ? 'Close inline' : 'Add Portfolio (inline)'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5"
                    onClick={toggleHistory}
                  >
                    <History className="h-3 w-3" /> {historyOpen ? 'Hide' : 'View'} History
                  </Button>
                </div>

                {inlineCreateOpen && (
                  <InlineCreatePortfolioForm
                    partner={selected}
                    actingUserId={user?.id}
                    onCreated={() => {
                      setInlineCreateOpen(false);
                      handleSelect(selected);
                      qc.invalidateQueries({ queryKey: ['exec-partner-portfolios'] });
                      qc.invalidateQueries({ queryKey: ['new-partners-panel'] });
                    }}
                    onCancel={() => setInlineCreateOpen(false)}
                  />
                )}

                {historyOpen && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-2 space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <History className="h-3 w-3" /> Audit history (last 50)
                    </p>
                    {historyLoading ? (
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground p-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                      </div>
                    ) : historyRows.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground italic p-2">No audit entries for this partner yet.</p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto space-y-1">
                        {historyRows.map(row => (
                          <div key={row.id} className="rounded-md bg-background border border-border/40 px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold truncate">{row.action_type}</span>
                              <span className="text-[9px] text-muted-foreground shrink-0">
                                {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                              </span>
                            </div>
                            <p className="text-[9px] text-muted-foreground truncate">
                              {row.table_name} · {row.record_id?.slice(0, 8)}
                            </p>
                            {row.metadata && Object.keys(row.metadata).length > 0 && (
                              <pre className="mt-1 text-[9px] text-muted-foreground whitespace-pre-wrap break-all line-clamp-3">
                                {JSON.stringify(row.metadata).slice(0, 200)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Portfolio list to edit */}
                {selectedPortfolios.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Portfolios ({selectedPortfolios.length}) — tap to edit inline
                    </p>
                    {selectedPortfolios.map(p => (
                      <InlinePortfolioRow
                        key={p.id}
                        portfolio={p}
                        expanded={expandedId === p.id}
                        onToggle={() => requestExpand(expandedId === p.id ? null : p.id)}
                        onDirtyChange={(changes) => {
                          if (changes && changes.length > 0) dirtyRowsRef.current[p.id] = changes;
                          else delete dirtyRowsRef.current[p.id];
                        }}
                        onSavingChange={(isSaving) => {
                          const was = !!savingRowsRef.current[p.id];
                          if (isSaving) savingRowsRef.current[p.id] = true;
                          else delete savingRowsRef.current[p.id];
                          if (was !== isSaving) {
                            setSavingCount(Object.keys(savingRowsRef.current).length);
                          }
                        }}
                        onSaved={(updated) => {
                          setSelectedPortfolios(list => list.map(x => x.id === updated.id ? { ...x, ...updated } : x));
                          qc.invalidateQueries({ queryKey: ['exec-partner-portfolios'] });
                        }}
                        actingUserId={user?.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <CreateInvestmentAccountDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          // The dialog itself only auto-closes on success (see
          // CreateInvestmentAccountDialog: onOpenChange(false) is called
          // immediately after onSuccess and is NOT called in the catch
          // block). So a close here means either: (a) success path, or
          // (b) the user explicitly dismissed (cancel / X / escape).
          // In both cases we fully reset local state so the next
          // activation starts from a clean slate and the correct row
          // button re-enables.
          if (!open) {
            setActivatingUserId(null);
            setCreateForUser(null);
          }
        }}
        onSuccess={() => {
          handleSelect(selected);
          qc.invalidateQueries({ queryKey: ['exec-partner-portfolios'] });
          qc.invalidateQueries({ queryKey: ['new-partners-panel'] });
          // Refresh the dialog's approval-status cache for both the dialog's
          // own selection and the panel-selected user so the button label
          // ("Create Portfolio" vs. "Partner Not Approved") reflects the
          // freshly activated state without waiting for staleTime.
          if (createForUser?.id) {
            qc.invalidateQueries({ queryKey: ['funder-approval-status', createForUser.id] });
          }
          if (selected?.id && selected.id !== createForUser?.id) {
            qc.invalidateQueries({ queryKey: ['funder-approval-status', selected.id] });
          }
          // Full local-state reset on error: re-enable the row button
          // AND drop the pending partner pointer. The create dialog
          // itself stays open (it only closes on success) so the
          // operator can correct input and resubmit, or use the Retry
          // action on the toast which re-arms both fields.
          setActivatingUserId(null);
        }}
        onError={(message, details) => {
          // Structured client-side log so support can correlate this UI
          // failure with the exact backend invocation in the edge logs.
          clientLog.error('partner.activation.failed', {
            partner_id: createForUser?.id,
            partner_name: createForUser?.full_name,
            partner_phone: createForUser?.phone,
            message,
            status: details?.status,
            request_id: details?.requestId,
            error_code: details?.errorCode,
            source: 'NewPartnersPanel.CreateInvestmentAccountDialog',
          });
          // Inline error toast with partner context so the executive knows
          // exactly which activation failed and why.
          const failedUser = createForUser;
          const name = failedUser?.full_name || 'partner';
          toast({
            title: `Activation failed for ${name}`,
            description: message,
            variant: 'destructive',
            action: failedUser ? (
              <ToastAction
                altText={`Retry activation for ${name}`}
                onClick={() => {
                  // Re-arm the per-row spinner and reopen the create dialog
                  // for the SAME partner so the operator can immediately retry.
                  setActivatingUserId(failedUser.id);
                  openCreateFor(failedUser);
                }}
              >
                Retry
              </ToastAction>
            ) : undefined,
          });
          setActivatingUserId(null);
        }}
        prefillInvestorId={createForUser?.id}
        prefillInvestorName={createForUser?.full_name}
      />

      {/* Confirmation gate for the Activate/Add button on Just-Joined rows. */}
      <AlertDialog
        open={!!activateConfirm}
        onOpenChange={(open) => {
          if (open) return;
          // Refuse to close while the tab is backgrounded so a phantom
          // visibility-driven dismiss can't slip through.
          if (!isPageVisible()) return;
          setActivateConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {activateConfirm?.isFirst ? 'Activate this partner?' : 'Add another portfolio?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {activateConfirm?.isFirst ? (
                <>
                  You're about to open the portfolio setup for{' '}
                  <span className="font-semibold text-foreground">{activateConfirm?.user.full_name}</span>{' '}
                  ({activateConfirm?.user.phone}). This activates them as a funding partner.
                  Make sure this is the right person before continuing.
                </>
              ) : (
                <>
                  You're about to create an additional portfolio for{' '}
                  <span className="font-semibold text-foreground">{activateConfirm?.user.full_name}</span>{' '}
                  ({activateConfirm?.user.phone}). Continue?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {activateConfirm && (
            <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Existing portfolios</span>
                <span className="font-semibold text-foreground">
                  {activateConfirm.portfolioCount}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Current status</span>
                <Badge
                  variant="outline"
                  className={
                    activateConfirm.portfolioCount === 0
                      ? 'text-[10px] text-muted-foreground'
                      : 'text-[10px] bg-success/15 text-success border-0'
                  }
                >
                  {activateConfirm.portfolioCount === 0 ? 'Not yet activated' : 'Active partner'}
                </Badge>
              </div>
              {activateConfirm.joinedAt && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Joined</span>
                  <span className="text-foreground">
                    {formatDistanceToNow(new Date(activateConfirm.joinedAt), { addSuffix: true })}
                  </span>
                </div>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!isPageVisible()) return;
                if (activateConfirm) {
                  const u = activateConfirm.user;
                  markConfirmed(`activate:${u.id}`);
                  setActivateConfirm(null);
                  setActivatingUserId(u.id);
                  openCreateFor(u);
                }
              }}
            >
              {activateConfirm?.isFirst ? 'Yes, activate' : 'Yes, continue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={revokeOpen}
        onOpenChange={(open) => {
          if (!open && !isPageVisible()) return;
          setRevokeOpen(open);
          if (!open) setRevokeConfirmText('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Partner role?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disable the Partner (supporter) role for{' '}
              <span className="font-semibold">{selected?.full_name}</span>. Their portfolios remain intact, but they will lose Partner access. This action is logged in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <label htmlFor="revoke-confirm-input" className="text-sm font-medium">
              Type <span className="font-mono font-semibold">REVOKE</span> to confirm
            </label>
            <Input
              id="revoke-confirm-input"
              autoComplete="off"
              autoCapitalize="characters"
              value={revokeConfirmText}
              onChange={(e) => setRevokeConfirmText(e.target.value)}
              placeholder="REVOKE"
              disabled={revokeBusy}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!isPageVisible()) return;
                revokePartner();
              }}
              disabled={revokeBusy || revokeConfirmText.trim().toUpperCase() !== 'REVOKE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ShieldOff className="h-3 w-3 mr-1" />}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* In-app discard-changes confirmation (replaces window.confirm). */}
      <AlertDialog
        open={!!discardPrompt}
        onOpenChange={(open) => { if (!open) setDiscardPrompt(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Discard unsaved changes
              {discardPrompt?.action === 'switch' ? ' and switch portfolio?' : '?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  You have <span className="font-semibold">{discardPrompt?.changes.length ?? 0}</span> unsaved
                  {' '}edit{(discardPrompt?.changes.length ?? 0) === 1 ? '' : 's'} on{' '}
                  <span className="font-semibold">{discardPrompt?.portfolioLabel}</span>:
                </p>
                <ul className="text-xs bg-muted/50 border border-border/60 rounded-md p-2 space-y-1 max-h-48 overflow-auto">
                  {discardPrompt?.changes.map((c, i) => (
                    <li key={i} className="font-mono text-[11px] leading-snug">• {c}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  These changes will be lost. This cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); discardPrompt?.onConfirm(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ════════════════════════════════════════════════════════════════
// InlinePortfolioRow — collapsible inline editor (no dialogs)
// ════════════════════════════════════════════════════════════════
interface InlinePortfolioRowProps {
  portfolio: any;
  expanded: boolean;
  onToggle: () => void;
  onSaved: (updated: any) => void;
  onDirtyChange?: (changes: string[]) => void;
  onSavingChange?: (saving: boolean) => void;
  actingUserId?: string;
}

function InlinePortfolioRow({ portfolio: p, expanded, onToggle, onSaved, onDirtyChange, onSavingChange, actingUserId }: InlinePortfolioRowProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  // Hard guard against double-submits. State updates are async, so a fast
  // second click (or an auto-save tick that fires before `saving` flips true)
  // could re-enter handleSave. This ref is set/cleared synchronously.
  const savingRef = useRef(false);
  // Auto-save: when ON, dirty edits are persisted automatically after a short
  // debounce so the user can switch portfolios without explicitly clicking Save.
  // Preference is shared across rows via localStorage.
  const [autoSave, setAutoSave] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('newpartners.inlineAutoSave') === '1';
  });
  useEffect(() => {
    try { localStorage.setItem('newpartners.inlineAutoSave', autoSave ? '1' : '0'); } catch {}
  }, [autoSave]);
  // Mirror local saving state up to parent so it can block collapse/switch.
  useEffect(() => {
    onSavingChange?.(saving);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving]);
  const initialForm = () => ({
    account_name: p.account_name || '',
    payout_day: p.payout_day ? String(p.payout_day) : '',
    payment_method: p.payment_method || 'mobile_money',
    mobile_money_number: p.mobile_money_number || '',
    mobile_network: p.mobile_network || '',
    bank_name: p.bank_name || '',
    bank_account_name: p.bank_account_name || '',
    account_number: p.account_number || '',
  });
  const [form, setForm] = useState(initialForm);
  // Snapshot of the form when the row was opened — used to detect unsaved edits.
  const baselineRef = useRef(form);

  // Re-sync when underlying portfolio prop changes (e.g. realtime update)
  useEffect(() => {
    if (!expanded) {
      const fresh = initialForm();
      setForm(fresh);
      baselineRef.current = fresh;
      onDirtyChange?.([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id, expanded]);

  // Re-baseline whenever the row first expands (handles cases where the
  // collapsed-state effect was skipped, e.g. mounted already-expanded).
  useEffect(() => {
    if (expanded) {
      baselineRef.current = form;
      onDirtyChange?.([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // Compute & report a human-readable diff on every form change.
  const fieldLabels: Record<keyof ReturnType<typeof initialForm>, string> = {
    account_name: 'Portfolio name',
    payout_day: 'Payout day',
    payment_method: 'Payment method',
    mobile_money_number: 'Mobile number',
    mobile_network: 'Network',
    bank_name: 'Bank name',
    bank_account_name: 'Account name',
    account_number: 'Account number',
  };
  const changeList: string[] = expanded
    ? (Object.keys(fieldLabels) as Array<keyof typeof fieldLabels>)
        .filter(k => (form as any)[k] !== (baselineRef.current as any)[k])
        .map(k => {
          const before = (baselineRef.current as any)[k] || '—';
          const after = (form as any)[k] || '—';
          return `${fieldLabels[k]}: ${before} → ${after}`;
        })
    : [];
  // Field keys that currently diverge from baseline — drives per-input highlighting.
  const changedFields: Set<string> = expanded
    ? new Set(
        (Object.keys(fieldLabels) as Array<keyof typeof fieldLabels>)
          .filter(k => (form as any)[k] !== (baselineRef.current as any)[k]),
      )
    : new Set();
  // Tailwind classes applied to inputs whose value diverges from baseline.
  const dirtyCls = (key: string) =>
    changedFields.has(key)
      ? 'border-warning ring-1 ring-warning/40 bg-warning/5'
      : '';
  const dirty = changeList.length > 0;
  const changeListKey = changeList.join('|');
  useEffect(() => {
    onDirtyChange?.(changeList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeListKey]);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  // Wraps onToggle. We DON'T prompt here anymore — the parent's requestExpand
  // centralizes the in-app discard-changes confirmation. We only guard against
  // toggling mid-save.
  function requestToggle() {
    if (saving) return; // block while a save is in flight
    onToggle();
  }

  async function handleSave(opts: { collapseAfter?: boolean; silent?: boolean } = {}) {
    const { collapseAfter = true, silent = false } = opts;
    if (savingRef.current) return; // ignore re-entrant calls
    if (form.account_name.length > 100) {
      if (!silent) toast({ title: 'Portfolio name too long', variant: 'destructive' });
      return;
    }

    let validated;
    try {
      validated = validatePortfolioPayoutFields({
        payment_method: form.payment_method,
        payout_day: form.payout_day,
        mobile_money_number: form.mobile_money_number,
        mobile_network: form.mobile_network,
        bank_name: form.bank_name,
        bank_account_name: form.bank_account_name,
        account_number: form.account_number,
      });
    } catch (e: any) {
      if (!silent) toast({ title: 'Check the form', description: e?.message || 'Invalid value', variant: 'destructive' });
      return;
    }

    savingRef.current = true;
    setSaving(true);
    onSavingChange?.(true);
    try {
      const patch: Record<string, any> = {
        account_name: form.account_name.trim() || null,
        payout_day: validated.payout_day,
        payment_method: form.payment_method,
        mobile_money_number: validated.mobile_money_number,
        mobile_network: validated.mobile_network,
        bank_name: validated.bank_name,
        bank_account_name: validated.bank_account_name,
        account_number: validated.account_number,
      };
      const { error } = await supabase.from('investor_portfolios').update(patch).eq('id', p.id);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: actingUserId,
        action_type: 'edit_portfolio_inline',
        table_name: 'investor_portfolios',
        record_id: p.id,
        metadata: { source: 'PartnerOps NewPartnersPanel inline', changes: patch },
      });

      toast({ title: silent ? '⚡ Auto-saved' : '✅ Portfolio updated' });
      // Reset baseline so the post-save auto-collapse does not trigger the
      // "unsaved changes" prompt.
      baselineRef.current = { ...form };
      onDirtyChange?.([]);
      onSaved({ id: p.id, ...patch });
      if (collapseAfter) onToggle(); // collapse
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setSaving(false);
      savingRef.current = false;
      onSavingChange?.(false);
    }
  }

  // Debounced auto-save: when enabled, persist dirty edits after the user has
  // stopped typing for ~1.2s. We skip if already saving or if there are no
  // changes. The dependency uses the changeListKey so we only re-arm when the
  // diff actually changes (not on every keystroke that keeps the same diff).
  useEffect(() => {
    if (!autoSave || !expanded || !dirty || saving) return;
    const t = setTimeout(() => { handleSave({ collapseAfter: false, silent: true }); }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSave, expanded, dirty, saving, changeListKey]);

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 overflow-hidden">
      <button
        onClick={requestToggle}
        disabled={saving}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate flex items-center gap-1">
            {p.account_name || p.portfolio_code}
            {dirty && (
              <span className="text-[9px] font-medium text-warning bg-warning/15 px-1 rounded">
                {changedFields.size} unsaved
              </span>
            )}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {p.display_currency || 'UGX'} {Number(p.investment_amount || 0).toLocaleString()} · {p.roi_percentage}% · {p.status}
          </p>
          {saving && (
            <p className="text-[10px] font-medium text-primary flex items-center gap-1 mt-0.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving… waiting for server confirmation
            </p>
          )}
        </div>
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 text-primary shrink-0 animate-spin" />
        ) : expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-primary shrink-0 rotate-180 transition-transform" />
        ) : (
          <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/60 bg-background p-3 space-y-2.5">
          {saving && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-[11px] font-medium text-primary"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving changes… this row is locked until the server confirms.
            </div>
          )}
          <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <Zap className={cn("h-3.5 w-3.5 shrink-0", autoSave ? "text-primary" : "text-muted-foreground")} />
              <span className="text-[11px] font-medium">Auto-save</span>
              <span className="text-[9px] text-muted-foreground truncate">
                {autoSave ? 'persists ~1.2s after you stop typing' : 'off — click Save before switching'}
              </span>
            </div>
            <Switch
              checked={autoSave}
              onCheckedChange={setAutoSave}
              disabled={saving}
              aria-label="Toggle auto-save for inline portfolio edits"
            />
          </div>
          {dirty && (
            <div className="rounded-md border border-warning/40 bg-warning/5 p-2 space-y-1">
              <p className="text-[10px] font-semibold text-warning uppercase tracking-wide">
                {changedFields.size} unsaved change{changedFields.size === 1 ? '' : 's'}
              </p>
              <ul className="space-y-0.5">
                {Array.from(changedFields).map((k) => {
                  const before = (baselineRef.current as any)[k] || '—';
                  const after = (form as any)[k] || '—';
                  return (
                    <li key={k} className="text-[10px] leading-snug flex items-center gap-1 flex-wrap">
                      <span className="font-medium">{(fieldLabels as any)[k]}:</span>
                      <span className="line-through text-muted-foreground font-mono">{String(before)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-mono text-warning">{String(after)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <fieldset disabled={saving} aria-busy={saving} className={cn("space-y-2.5 m-0 p-0 border-0", saving && "opacity-60 pointer-events-none")}>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Portfolio name</Label>
              <Input value={form.account_name} onChange={e => set('account_name', e.target.value)} className={cn("h-8 text-xs", dirtyCls('account_name'))} maxLength={100} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Payout day (1-28)</Label>
              <Input type="number" min={1} max={28} value={form.payout_day} onChange={e => set('payout_day', e.target.value)} className={cn("h-8 text-xs", dirtyCls('payout_day'))} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px]">Payment method</Label>
            <Select value={form.payment_method} onValueChange={v => set('payment_method', v)}>
              <SelectTrigger className={cn("h-8 text-xs", dirtyCls('payment_method'))}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mobile_money">📱 Mobile Money</SelectItem>
                <SelectItem value="bank">🏦 Bank</SelectItem>
                <SelectItem value="wallet">👛 Wallet (Welile)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.payment_method === 'mobile_money' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Mobile number</Label>
                <Input value={form.mobile_money_number} onChange={e => set('mobile_money_number', e.target.value)} placeholder="0770…" className={cn("h-8 text-xs", dirtyCls('mobile_money_number'))} maxLength={20} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Network</Label>
                <Select value={form.mobile_network || ''} onValueChange={v => set('mobile_network', v)}>
                  <SelectTrigger className={cn("h-8 text-xs", dirtyCls('mobile_network'))}><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MTN">MTN</SelectItem>
                    <SelectItem value="Airtel">Airtel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {form.payment_method === 'bank' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Bank name</Label>
                  <Input value={form.bank_name} onChange={e => set('bank_name', e.target.value)} className={cn("h-8 text-xs", dirtyCls('bank_name'))} maxLength={80} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Account number</Label>
                  <Input value={form.account_number} onChange={e => set('account_number', e.target.value)} className={cn("h-8 text-xs", dirtyCls('account_number'))} maxLength={30} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Account name</Label>
                <Input value={form.bank_account_name} onChange={e => set('bank_account_name', e.target.value)} className={cn("h-8 text-xs", dirtyCls('bank_account_name'))} maxLength={100} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="h-8 text-xs gap-1.5 flex-1" onClick={() => handleSave()} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5" onClick={requestToggle} disabled={saving}>
              <X className="h-3 w-3" /> Cancel
            </Button>
          </div>
          </fieldset>
          <p className={cn("text-[9px] text-muted-foreground italic")}>
            Investment amount, status and currency are managed from the full edit screen for safety.
          </p>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// InlineCreatePortfolioForm — create a new portfolio without a dialog
// ════════════════════════════════════════════════════════════════
interface InlineCreatePortfolioFormProps {
  partner: PickedUser;
  actingUserId?: string;
  onCreated: () => void;
  onCancel: () => void;
}

function InlineCreatePortfolioForm({ partner, actingUserId, onCreated, onCancel }: InlineCreatePortfolioFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [form, setForm] = useState({
    account_name: '',
    investment_amount: '',
    roi_percentage: '20',
    duration_months: '12',
    roi_mode: 'monthly_payout',
    portfolio_pin: String(Math.floor(1000 + Math.random() * 9000)),
    payout_day: '15',
    contribution_date: new Date().toISOString().slice(0, 10),
    payment_method: '',
    mobile_network: '',
    mobile_money_number: '',
    bank_name: '',
    bank_account_name: '',
    account_number: '',
  });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // Load partner total wallet balance (deposits land in float, matches edge fn gate)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBalanceLoading(true);
      const { data } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', partner.id)
        .maybeSingle();
      if (cancelled) return;
      const bal = data ? Number(data.balance) || 0 : 0;
      setBalance(bal);
      setForm(p => ({ ...p, investment_amount: bal > 0 ? String(Math.floor(bal)) : '' }));
      setBalanceLoading(false);
    })();
    return () => { cancelled = true; };
  }, [partner.id]);

  function regenPin() {
    set('portfolio_pin', String(Math.floor(1000 + Math.random() * 9000)));
  }

  async function handleCreate() {
    const amt = parseFloat(form.investment_amount);
    if (!form.investment_amount || isNaN(amt) || amt < 50000) {
      toast({ title: 'Investment must be at least UGX 50,000', variant: 'destructive' });
      return;
    }
    if (balance === null) {
      toast({ title: 'Partner wallet balance not loaded yet', variant: 'destructive' });
      return;
    }
    if (amt > balance) {
      toast({
        title: 'Insufficient partner wallet balance',
        description: `${partner.full_name} has UGX ${balance.toLocaleString()} available. Top up first.`,
        variant: 'destructive',
      });
      return;
    }
    if (!/^\d{4}$/.test(form.portfolio_pin)) {
      toast({ title: 'Portfolio PIN must be exactly 4 digits', variant: 'destructive' });
      return;
    }
    if (form.account_name.length > 100) {
      toast({ title: 'Portfolio name too long', variant: 'destructive' });
      return;
    }

    // Validate + normalize payout/mobile/bank fields before sending to the
    // edge function (which writes to investor_portfolios).
    let validated;
    try {
      validated = validatePortfolioPayoutFields({
        payment_method: form.payment_method,
        payout_day: form.payout_day,
        mobile_money_number: form.mobile_money_number,
        mobile_network: form.mobile_network,
        bank_name: form.bank_name,
        bank_account_name: form.bank_account_name,
        account_number: form.account_number,
      });
    } catch (e: any) {
      toast({ title: 'Check the form', description: e?.message || 'Invalid value', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const response = await supabase.functions.invoke('create-investor-portfolio', {
        body: {
          investor_id: partner.id,
          investment_amount: amt,
          duration_months: parseInt(form.duration_months),
          roi_percentage: parseFloat(form.roi_percentage),
          roi_mode: form.roi_mode,
          portfolio_pin: form.portfolio_pin,
          payout_day: validated.payout_day ?? parseInt(form.payout_day),
          contribution_date: form.contribution_date || null,
          payment_method: form.payment_method || null,
          mobile_network: validated.mobile_network,
          mobile_money_number: validated.mobile_money_number,
          bank_name: validated.bank_name,
          account_name: validated.bank_account_name || form.account_name || null,
          account_number: validated.account_number,
        },
      });
      if (response.error || response.data?.error) {
        const msg = await extractEdgeFunctionError(response, 'Failed to create portfolio');
        throw new Error(msg);
      }
      const code = response.data?.portfolio?.portfolio_code || '';
      await supabase.from('audit_logs').insert({
        user_id: actingUserId,
        action_type: 'create_portfolio_inline',
        table_name: 'investor_portfolios',
        record_id: response.data?.portfolio?.id || partner.id,
        metadata: { source: 'PartnerOps NewPartnersPanel inline', partner: partner.full_name, amount: amt, code },
      });
      toast({ title: `✅ Portfolio ${code} created — pending approval` });
      onCreated();
    } catch (e: any) {
      toast({ title: 'Creation failed', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold flex items-center gap-1">
          <PlusCircle className="h-3.5 w-3.5 text-primary" /> New portfolio for {partner.full_name}
        </p>
        <span className="text-[10px] text-muted-foreground">
          {balanceLoading ? 'Loading wallet…' : `Wallet: UGX ${(balance ?? 0).toLocaleString()}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1 col-span-2">
          <Label className="text-[10px]">Portfolio name (optional)</Label>
          <Input value={form.account_name} onChange={e => set('account_name', e.target.value)} placeholder="e.g. Premium Fund" className="h-8 text-xs" maxLength={100} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">From Wallet (UGX) *</Label>
          <Input
            type="number"
            min={50000}
            max={balance ?? undefined}
            value={form.investment_amount}
            onChange={e => set('investment_amount', e.target.value)}
            disabled={balanceLoading}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">ROI %</Label>
          <Input type="number" min={0} max={100} value={form.roi_percentage} onChange={e => set('roi_percentage', e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Duration</Label>
          <Select value={form.duration_months} onValueChange={v => set('duration_months', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 Months</SelectItem>
              <SelectItem value="6">6 Months</SelectItem>
              <SelectItem value="12">12 Months</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">ROI Mode</Label>
          <Select value={form.roi_mode} onValueChange={v => set('roi_mode', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly_payout">Monthly Payout</SelectItem>
              <SelectItem value="monthly_compounding">Compounding</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Contribution Date</Label>
          <Input
            type="date"
            value={form.contribution_date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => {
              const v = e.target.value;
              const day = v ? Math.min(28, Number(v.slice(8, 10)) || 15) : 15;
              setForm(p => ({ ...p, contribution_date: v, payout_day: String(day) }));
            }}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[10px]">PIN (4 digits) *</Label>
            <button type="button" onClick={regenPin} className="text-[9px] text-primary hover:underline flex items-center gap-0.5">
              <Sparkles className="h-2.5 w-2.5" /> Gen
            </button>
          </div>
          <Input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={form.portfolio_pin}
            onChange={e => set('portfolio_pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="h-8 text-xs font-mono tracking-widest"
          />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-[10px]">Payout Method (optional)</Label>
          <Select value={form.payment_method} onValueChange={v => set('payment_method', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mobile_money">📱 Mobile Money</SelectItem>
              <SelectItem value="bank">🏦 Bank Transfer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.payment_method === 'mobile_money' && (
          <>
            <div className="space-y-1">
              <Label className="text-[10px]">Network</Label>
              <Select value={form.mobile_network} onValueChange={v => set('mobile_network', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mtn">MTN</SelectItem>
                  <SelectItem value="airtel">Airtel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">MoMo Number</Label>
              <Input value={form.mobile_money_number} onChange={e => set('mobile_money_number', e.target.value)} placeholder="0770000000" className="h-8 text-xs" inputMode="tel" />
            </div>
          </>
        )}
        {form.payment_method === 'bank' && (
          <>
            <div className="space-y-1 col-span-2">
              <Label className="text-[10px]">Bank</Label>
              <Select value={form.bank_name} onValueChange={v => set('bank_name', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select bank" /></SelectTrigger>
                <SelectContent>
                  {UGANDA_BANKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Account Name</Label>
              <Input value={form.bank_account_name} onChange={e => set('bank_account_name', e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Account Number</Label>
              <Input value={form.account_number} onChange={e => set('account_number', e.target.value)} className="h-8 text-xs" />
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={onCancel} disabled={saving}>
          <X className="h-3 w-3" /> Cancel
        </Button>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={handleCreate} disabled={saving || balanceLoading}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Create Portfolio
        </Button>
      </div>
    </div>
  );
}
