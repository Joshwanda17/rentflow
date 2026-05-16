import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
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
import { Sparkles, UserPlus, Pencil, Loader2, Phone, Clock, ShieldCheck, PlusCircle, Save, X, ChevronDown, ShieldOff, History, Zap, MessageCircle, Search, Filter, CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { UGANDA_BANKS } from '@/lib/ugandaBanks';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';
import { useSearchParams } from 'react-router-dom';
import { clientLog } from '@/lib/clientLogger';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
  // Auto-advance chain — when the operator clicks "Activate now" on the
  // quick-activate banner we queue opening the next no-portfolio candidate
  // right after the current activation succeeds so they can blitz through
  // onboarding without re-aiming the dialog.
  const autoAdvanceRef = useRef(false);
  const activationSucceededRef = useRef(false);
  const lastActivatedIdRef = useRef<string | null>(null);
  const [pendingAutoAdvance, setPendingAutoAdvance] = useState(false);
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(true);
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
  // Persisted in the URL (?jp_q, ?jp_f, ?jp_from, ?jp_to) so the panel
  // looks identical after a refresh or when the URL is shared.
  const [searchParams, setSearchParams] = useSearchParams();
  const ALLOWED_FILTERS = [
    'all',
    'just_joined',
    'with',
    'without',
    'today',
    'week',
    'month',
    'recent',
    'custom',
    // "Recent joins" — no portfolio yet AND joined within window
    'recent_today',
    'recent_week',
    'recent_month',
  ] as const;
  type PartnerFilter = typeof ALLOWED_FILTERS[number];
  // "Just joined" = activation backlog: partners with no portfolio yet who
  // signed up within this rolling window. Keeps the default view truly fresh
  // instead of showing every dormant no-portfolio account ever onboarded.
  const JUST_JOINED_DAYS = 7;
  const parseDateParam = (v: string | null): Date | undefined => {
    if (!v) return undefined;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  };
  const [partnerSearch, setPartnerSearch] = useState<string>(
    () => searchParams.get('jp_q') ?? ''
  );
  const [partnerFilter, setPartnerFilter] = useState<PartnerFilter>(() => {
    // Priority: URL param > localStorage > default. URL wins so shared links
    // still override, but a plain refresh restores the operator's last view.
    const raw = searchParams.get('jp_f');
    if ((ALLOWED_FILTERS as readonly string[]).includes(raw ?? '')) {
      return raw as PartnerFilter;
    }
    try {
      const stored = localStorage.getItem('welile.partnerOps.partnerFilter');
      if (stored && (ALLOWED_FILTERS as readonly string[]).includes(stored)) {
        return stored as PartnerFilter;
      }
    } catch { /* ignore (private mode / quota) */ }
    // Default view = partners who joined in the last JUST_JOINED_DAYS days
    // AND don't have a portfolio yet, so Partner Ops sees a truly fresh
    // activation backlog instead of every dormant no-portfolio account.
    return 'just_joined';
  });
  const [customRange, setCustomRange] = useState<DateRange | undefined>(() => {
    const from = parseDateParam(searchParams.get('jp_from'));
    const to = parseDateParam(searchParams.get('jp_to'));
    return from || to ? { from, to } : undefined;
  });
  // Sort order for the partners grid.
  // - status_active / status_none: group by portfolio status (active vs none),
  //   then by newest within each group.
  // - count_desc / count_asc: explicit count ordering regardless of status.
  // Legacy values (portfolio_desc / portfolio_asc) are aliased to the count
  // variants so existing share links keep working.
  const ALLOWED_SORTS = [
    'recent',
    'status_active',
    'status_none',
    'count_desc',
    'count_asc',
    'name',
  ] as const;
  type PartnerSort = typeof ALLOWED_SORTS[number];
  const [partnerSort, setPartnerSort] = useState<PartnerSort>(() => {
    const raw = searchParams.get('jp_s');
    if (raw === 'portfolio_desc') return 'count_desc';
    if (raw === 'portfolio_asc') return 'count_asc';
    if ((ALLOWED_SORTS as readonly string[]).includes(raw ?? '')) {
      return raw as PartnerSort;
    }
    try {
      const stored = localStorage.getItem('welile.partnerOps.partnerSort');
      if (stored === 'portfolio_desc') return 'count_desc';
      if (stored === 'portfolio_asc') return 'count_asc';
      if (stored && (ALLOWED_SORTS as readonly string[]).includes(stored)) {
        return stored as PartnerSort;
      }
    } catch { /* ignore */ }
    return 'recent';
  });
  // Persist filter & sort selections so they survive a page refresh even
  // when the URL has been cleaned (e.g. after navigating from a share link).
  useEffect(() => {
    try {
      localStorage.setItem('welile.partnerOps.partnerFilter', partnerFilter);
    } catch { /* ignore */ }
  }, [partnerFilter]);
  useEffect(() => {
    try {
      localStorage.setItem('welile.partnerOps.partnerSort', partnerSort);
    } catch { /* ignore */ }
  }, [partnerSort]);
  // Push state back into the URL whenever the user changes a filter.
  // `replace: true` avoids polluting the browser back-stack.
  useEffect(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      const q = partnerSearch.trim();
      if (q) next.set('jp_q', q); else next.delete('jp_q');
      if (partnerFilter !== 'all') next.set('jp_f', partnerFilter); else next.delete('jp_f');
      if (partnerFilter === 'custom' && customRange?.from) {
        next.set('jp_from', format(customRange.from, 'yyyy-MM-dd'));
      } else {
        next.delete('jp_from');
      }
      if (partnerFilter === 'custom' && customRange?.to) {
        next.set('jp_to', format(customRange.to, 'yyyy-MM-dd'));
      } else {
        next.delete('jp_to');
      }
      if (partnerSort !== 'recent') next.set('jp_s', partnerSort); else next.delete('jp_s');
      return next;
    }, { replace: true });
    // setSearchParams identity changes on every render; intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerSearch, partnerFilter, customRange, partnerSort]);
  // Infinite scroll for the Joined Partners list. Each scroll-triggered page
  // is fetched from `user_roles` with `.range()` + `{ count: 'exact' }` and
  // appended to the previously loaded rows, so the user can browse every
  // supporter without a manual "next page" click.
  const PARTNERS_PAGE_SIZE = 200;
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  // ── All partners (infinite scroll) ──
  // Each scroll-triggered page fetches one slice of `user_roles`
  // (role=supporter) ordered by newest first, plus the exact total count.
  // Pages are appended into a single `joined` array so filters and badges
  // operate over every row the user has loaded so far.
  const {
    data: partnersInfinite,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ['new-partners-panel-infinite', PARTNERS_PAGE_SIZE],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const pageIndex = pageParam as number;
      const from = pageIndex * PARTNERS_PAGE_SIZE;
      const to = from + PARTNERS_PAGE_SIZE - 1;
      const { data: roles, count } = await supabase
        .from('user_roles')
        .select('user_id, created_at', { count: 'exact' })
        .eq('role', 'supporter')
        .eq('enabled', true)
        .order('created_at', { ascending: false })
        .range(from, to);
      const rows = roles || [];
      const total = count ?? rows.length;
      if (rows.length === 0) {
        return { rows: [] as JoinedPartner[], total, pageIndex };
      }

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

      const built: JoinedPartner[] = rows.map(r => ({
        user_id: r.user_id,
        created_at: r.created_at,
        full_name: pMap.get(r.user_id)?.full_name || 'Unknown',
        phone: pMap.get(r.user_id)?.phone || '—',
        portfolio_count: countMap.get(r.user_id) || 0,
      }));
      return { rows: built, total, pageIndex };
    },
    getNextPageParam: (lastPage) => {
      const loaded = (lastPage.pageIndex + 1) * PARTNERS_PAGE_SIZE;
      return loaded < lastPage.total ? lastPage.pageIndex + 1 : undefined;
    },
    staleTime: 60_000,
  });
  // Flatten every loaded page into a single `joined` array. Dedupe by
  // user_id in case a row appears across pages during a refetch.
  const joined = useMemo(() => {
    if (!partnersInfinite) return undefined;
    const seen = new Set<string>();
    const out: JoinedPartner[] = [];
    for (const page of partnersInfinite.pages) {
      for (const r of page.rows) {
        if (seen.has(r.user_id)) continue;
        seen.add(r.user_id);
        out.push(r);
      }
    }
    return out;
  }, [partnersInfinite]);
  const joinedTotal = partnersInfinite?.pages[0]?.total ?? 0;
  // Sentinel-driven auto-load: when the bottom sentinel scrolls into view
  // (within 200px) and we're not already fetching, request the next page.
  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting) && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }, { root: gridScrollRef.current ?? null, rootMargin: '200px', threshold: 0 });
    io.observe(node);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, joined?.length]);

  // ── Filtered partners (drives both the badge counts above the grid
  // and the grid itself, so badges react instantly to the active filter). ──
  const filteredPartners = useMemo(() => {
    if (!joined) return [] as JoinedPartner[];
    const q = partnerSearch.trim().toLowerCase();
    const cutoff = Date.now() - 14 * 86400000;
    const justJoinedCutoff = Date.now() - JUST_JOINED_DAYS * 86400000;
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfToday);
    const dow = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - ((dow + 6) % 7));
    const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
    const filtered = joined.filter(p => {
      if (partnerFilter === 'with' && p.portfolio_count === 0) return false;
      if (partnerFilter === 'without' && p.portfolio_count > 0) return false;
      if (partnerFilter === 'just_joined') {
        if (p.portfolio_count > 0) return false;
        if (new Date(p.created_at).getTime() < justJoinedCutoff) return false;
      }
      if (partnerFilter === 'recent' && new Date(p.created_at).getTime() < cutoff) return false;
      if (partnerFilter === 'today' && new Date(p.created_at).getTime() < startOfToday.getTime()) return false;
      if (partnerFilter === 'week' && new Date(p.created_at).getTime() < startOfWeek.getTime()) return false;
      if (partnerFilter === 'month' && new Date(p.created_at).getTime() < startOfMonth.getTime()) return false;
      // Recent joins (no portfolio yet) — combines window + no-portfolio gate.
      if (partnerFilter === 'recent_today') {
        if (p.portfolio_count > 0) return false;
        if (new Date(p.created_at).getTime() < startOfToday.getTime()) return false;
      }
      if (partnerFilter === 'recent_week') {
        if (p.portfolio_count > 0) return false;
        if (new Date(p.created_at).getTime() < startOfWeek.getTime()) return false;
      }
      if (partnerFilter === 'recent_month') {
        if (p.portfolio_count > 0) return false;
        if (new Date(p.created_at).getTime() < startOfMonth.getTime()) return false;
      }
      if (partnerFilter === 'custom') {
        const t = new Date(p.created_at).getTime();
        if (customRange?.from) {
          const from = new Date(customRange.from); from.setHours(0, 0, 0, 0);
          if (t < from.getTime()) return false;
        }
        if (customRange?.to) {
          const to = new Date(customRange.to); to.setHours(23, 59, 59, 999);
          if (t > to.getTime()) return false;
        }
      }
      if (q) {
        const hay = `${p.full_name} ${p.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Apply sort as a final stable pass.
    const sorted = [...filtered];
    if (partnerSort === 'count_desc') {
      sorted.sort((a, b) =>
        b.portfolio_count - a.portfolio_count
        || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (partnerSort === 'count_asc') {
      sorted.sort((a, b) =>
        a.portfolio_count - b.portfolio_count
        || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (partnerSort === 'status_active') {
      // Active (>=1) first, then None (0); newest within each group.
      sorted.sort((a, b) => {
        const ag = a.portfolio_count > 0 ? 0 : 1;
        const bg = b.portfolio_count > 0 ? 0 : 1;
        return ag - bg
          || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else if (partnerSort === 'status_none') {
      // None (0) first, then Active (>=1); newest within each group.
      sorted.sort((a, b) => {
        const ag = a.portfolio_count === 0 ? 0 : 1;
        const bg = b.portfolio_count === 0 ? 0 : 1;
        return ag - bg
          || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else if (partnerSort === 'name') {
      sorted.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    } else {
      // 'recent' — newest first
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return sorted;
  }, [joined, partnerSearch, partnerFilter, customRange, partnerSort]);

  // ── Memoized badge counts ──
  // Calculated once per change of `filteredPartners` (instead of recomputed on
  // every render inside the JSX IIFE) so the click-to-filter badge strip
  // updates smoothly without re-running 6 array passes on unrelated renders.
  const badgeCounts = useMemo(() => {
    const filtered = filteredPartners;
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfToday);
    const dow = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - ((dow + 6) % 7));
    const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
    let withCount = 0, todayCount = 0, weekCount = 0, monthCount = 0;
    const todayMs = startOfToday.getTime();
    const weekMs = startOfWeek.getTime();
    const monthMs = startOfMonth.getTime();
    for (const p of filtered) {
      if (p.portfolio_count > 0) withCount++;
      const t = new Date(p.created_at).getTime();
      if (t >= todayMs) todayCount++;
      if (t >= weekMs) weekCount++;
      if (t >= monthMs) monthCount++;
    }
    return {
      withCount,
      withoutCount: filtered.length - withCount,
      todayCount,
      weekCount,
      monthCount,
    };
  }, [filteredPartners]);

  // ── Auto-advance: after a successful banner-driven activation, open the
  // create-portfolio dialog for the next no-portfolio candidate as soon as
  // the refreshed list is back and the previous dialog has closed. ──
  useEffect(() => {
    if (!pendingAutoAdvance) return;
    if (createOpen) return; // wait until previous dialog fully closed
    if (isLoading || isFetchingNextPage) return; // wait for fresh list
    const lastId = lastActivatedIdRef.current;
    const next = filteredPartners.find(p => p.portfolio_count === 0 && p.user_id !== lastId);
    setPendingAutoAdvance(false);
    if (!next) {
      toast({
        title: 'Onboarding queue cleared',
        description: 'No more partners waiting for a portfolio in this filter.',
      });
      return;
    }
    autoAdvanceRef.current = true; // keep the chain alive
    openCreateFor({ id: next.user_id, full_name: next.full_name, phone: next.phone });
    toast({
      title: 'Next up',
      description: `Activating ${next.full_name}…`,
    });
  }, [pendingAutoAdvance, createOpen, isLoading, isFetchingNextPage, filteredPartners]);

  // Segment counts for the All / With / Without toggle. Based on `joined`
  // (the full partner list) so the numbers reflect totals available in each
  // segment regardless of the currently active portfolio filter.
  const segmentCounts = useMemo(() => {
    const all = joined?.length ?? 0;
    let withP = 0;
    let justJoined = 0;
    let recentToday = 0;
    let recentWeek = 0;
    let recentMonth = 0;
    const justJoinedCutoff = Date.now() - JUST_JOINED_DAYS * 86400000;
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfToday);
    const dow = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - ((dow + 6) % 7));
    const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
    for (const p of joined || []) {
      if (p.portfolio_count > 0) {
        withP++;
      } else {
        const t = new Date(p.created_at).getTime();
        if (t >= justJoinedCutoff) justJoined++;
        if (t >= startOfToday.getTime()) recentToday++;
        if (t >= startOfWeek.getTime()) recentWeek++;
        if (t >= startOfMonth.getTime()) recentMonth++;
      }
    }
    return {
      all,
      with: withP,
      without: all - withP,
      justJoined,
      recentToday,
      recentWeek,
      recentMonth,
    };
  }, [joined]);

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

  // Swipe-to-switch handlers for mobile segmented filter rows. Touch only —
  // ignored when the row was horizontally scrolled (so scroll still works
  // when segments overflow). Threshold: 50px, horizontal-dominant gesture.
  function makeSegmentSwipeHandlers<K extends PartnerFilter>(
    keys: readonly K[],
    activeKey: PartnerFilter,
  ) {
    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    return {
      onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => {
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        startScroll = e.currentTarget.scrollLeft;
      },
      onTouchEnd: (e: React.TouchEvent<HTMLDivElement>) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        // Ignore if user actually scrolled the row horizontally.
        if (Math.abs(e.currentTarget.scrollLeft - startScroll) > 4) return;
        if (Math.abs(dx) < 50) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
        const idx = keys.indexOf(activeKey as K);
        // If current filter isn't in this row, swipe lands on first/last.
        let nextIdx: number;
        if (idx === -1) {
          nextIdx = dx < 0 ? 0 : keys.length - 1;
        } else {
          nextIdx = dx < 0
            ? Math.min(keys.length - 1, idx + 1)  // swipe left → next
            : Math.max(0, idx - 1);               // swipe right → prev
        }
        if (nextIdx !== idx) setPartnerFilter(keys[nextIdx]);
      },
    };
  }

  return (
    <>
      <Card className="relative border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-0">
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
        <CardContent className="p-3 sm:p-4 space-y-3 sm:space-y-4 pb-20 sm:pb-4">
          {/* Header */}
          <div className="flex items-start gap-2">
            <div className="p-1.5 rounded-lg bg-primary/15 shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-sm font-bold">Joined Partners</h3>
                {/* Total partner count badge — shows how many supporters exist
                    in the database (not just what's been scrolled into view). */}
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                  title="Total partners in the database"
                >
                  {isLoading ? '…' : joinedTotal.toLocaleString()} total
                </span>
                {!isLoading && joined && joined.length < joinedTotal && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                    title={`Loaded so far · ${PARTNERS_PAGE_SIZE} per scroll`}
                  >
                    {joined.length.toLocaleString()} loaded
                  </span>
                )}
                {/* Active-filter summary chip — always visible so Partner Ops
                    can confirm exactly what the panel is showing right now. */}
                {(() => {
                  const label = (() => {
                    switch (partnerFilter) {
                      case 'all':           return 'All partners';
                      case 'just_joined':   return `No portfolio yet · Just joined (${JUST_JOINED_DAYS}d)`;
                      case 'with':          return 'With portfolios';
                      case 'without':       return 'No portfolio yet';
                      case 'today':         return 'Joined today';
                      case 'week':          return 'Joined this week';
                      case 'month':         return 'Joined this month';
                      case 'recent':        return 'Joined in last 14 days';
                      case 'recent_today':  return 'No portfolio yet · Recent joins (today)';
                      case 'recent_week':   return 'No portfolio yet · Recent joins (this week)';
                      case 'recent_month':  return 'No portfolio yet · Recent joins (this month)';
                      case 'custom':        return 'Custom date range';
                      default:              return 'Filtered';
                    }
                  })();
                  const isDefault = partnerFilter === 'just_joined';
                  return (
                  <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] sm:px-1.5 sm:py-0.5 sm:text-[10px] font-semibold max-w-full",
                        isDefault
                          ? "bg-emerald-500/15 text-emerald-600"
                          : "bg-amber-500/15 text-amber-700"
                      )}
                      title={`Active filter${isDefault ? ' (default)' : ''}`}
                    >
                      <Filter className="h-3 w-3 sm:h-2.5 sm:w-2.5 shrink-0" />
                      <span className="truncate">{label}</span>
                      {isDefault && (
                        <span className="rounded bg-emerald-500/20 px-1 text-[10px] sm:text-[9px] uppercase tracking-wide shrink-0">
                          default
                        </span>
                      )}
                    </span>
                  );
                })()}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Browse all partners, filter, activate portfolios & WhatsApp
                {' '}· {PARTNERS_PAGE_SIZE} loaded per scroll
              </p>
            </div>
            <Button
              size="sm"
              className="h-10 sm:h-8 text-xs gap-1.5 shrink-0 px-3 sm:px-3"
              onClick={() => {
                setCreateForUser(null);
                setCreateOpen(true);
              }}
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Create Portfolio</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>

          {/* Quick-activate banner — surfaces the first partner in the active
              "no portfolio yet" filtered list and lets Partner Ops open the
              Create Portfolio dialog with one click, skipping the search step. */}
          {(() => {
            const noPortfolioFilters: PartnerFilter[] = [
              'just_joined', 'without', 'recent_today', 'recent_week', 'recent_month',
            ];
            if (!noPortfolioFilters.includes(partnerFilter)) return null;
            const next = filteredPartners.find(p => p.portfolio_count === 0);
            if (!next) return null;
            return (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 sm:px-3 py-3 sm:py-2">
                <div className="p-1 rounded-md bg-emerald-500/20 shrink-0">
                  <Zap className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-emerald-700 leading-tight">
                    Next up to activate{autoAdvanceEnabled ? ' · auto-advance on' : ''}
                  </p>
                  <p className="text-xs font-medium truncate">
                    {next.full_name}
                    <span className="text-muted-foreground font-normal"> · {next.phone}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Joined {formatDistanceToNow(new Date(next.created_at), { addSuffix: true })}
                  </p>
                </div>
                <label
                  className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-700 cursor-pointer select-none shrink-0"
                  title="Automatically open the next no-portfolio candidate after each successful activation"
                >
                  <input
                    type="checkbox"
                    className="h-3 w-3 accent-emerald-600"
                    checked={autoAdvanceEnabled}
                    onChange={(e) => setAutoAdvanceEnabled(e.target.checked)}
                  />
                  Auto-advance
                </label>
                <Button
                  size="sm"
                  className="h-10 sm:h-7 text-xs sm:text-[11px] gap-1 shrink-0 px-3 sm:px-2"
                  onClick={() => {
                    autoAdvanceRef.current = autoAdvanceEnabled;
                    activationSucceededRef.current = false;
                    openCreateFor({
                      id: next.user_id,
                      full_name: next.full_name,
                      phone: next.phone,
                    });
                  }}
                >
                  <PlusCircle className="h-3 w-3" />
                  <span className="hidden sm:inline">Activate now</span>
                  <span className="sm:hidden">Activate</span>
                </Button>
              </div>
            );
          })()}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={partnerSearch}
                onChange={(e) => setPartnerSearch(e.target.value)}
                placeholder="Search by name or phone…"
                className="h-10 sm:h-8 pl-7 text-sm sm:text-xs"
              />
            </div>
            <Select value={partnerFilter} onValueChange={(v) => setPartnerFilter(v as typeof partnerFilter)}>
              <SelectTrigger className="h-10 sm:h-8 text-sm sm:text-xs w-full sm:w-[200px]">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All partners</SelectItem>
                <SelectItem value="just_joined">Just joined · no portfolio (last {JUST_JOINED_DAYS}d)</SelectItem>
                <SelectItem value="recent_today">Recent joins · no portfolio · today</SelectItem>
                <SelectItem value="recent_week">Recent joins · no portfolio · this week</SelectItem>
                <SelectItem value="recent_month">Recent joins · no portfolio · this month</SelectItem>
                {canWhatsAppPartners && (
                  <>
                    <SelectItem value="today">Joined today</SelectItem>
                    <SelectItem value="week">Joined this week (since Mon)</SelectItem>
                    <SelectItem value="month">Joined this month (since 1st)</SelectItem>
                    <SelectItem value="recent">Joined in last 14 days</SelectItem>
                  </>
                )}
                <SelectItem value="with">With portfolios</SelectItem>
                <SelectItem value="without">No portfolios yet</SelectItem>
                {canWhatsAppPartners && (
                  <SelectItem value="custom">Custom date range…</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Segmented control — quick portfolio-status switch */}
          <div
            className="flex rounded-lg border border-border/60 bg-muted/40 p-1 sm:p-0.5 text-xs sm:text-[11px] self-start overflow-x-auto max-w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden touch-pan-y select-none"
            role="tablist"
            aria-label="Portfolio status filter — swipe to switch"
            {...makeSegmentSwipeHandlers(
              ['all', 'just_joined', 'with', 'without'] as const,
              partnerFilter,
            )}
          >
            {([
              { key: 'all', label: 'All', count: segmentCounts.all },
              { key: 'just_joined', label: `Just joined (${JUST_JOINED_DAYS}d)`, count: segmentCounts.justJoined },
              { key: 'with', label: 'With portfolios', count: segmentCounts.with },
              { key: 'without', label: 'No portfolio yet', count: segmentCounts.without },
            ] as const).map(seg => (
              <button
                key={seg.key}
                type="button"
                onClick={() => setPartnerFilter(seg.key)}
                aria-pressed={partnerFilter === seg.key}
                className={cn(
                  "px-3 py-2 sm:px-2.5 sm:py-1 min-h-[40px] sm:min-h-0 rounded-md font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0",
                  partnerFilter === seg.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-label={`${seg.label} (${seg.count})`}
              >
                <span>{seg.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] sm:text-[10px] font-semibold tabular-nums leading-none",
                    partnerFilter === seg.key
                      ? "bg-muted text-foreground"
                      : "bg-background/60 text-muted-foreground"
                  )}
                >
                  {segmentCounts.all === 0 && isLoading ? '…' : seg.count}
                </span>
              </button>
            ))}
          </div>
          {/* Recent joins (no-portfolio activation backlog, scoped by window) */}
          <div
            className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 p-1 sm:p-0.5 text-xs sm:text-[11px] self-start overflow-x-auto max-w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden touch-pan-y select-none"
            role="tablist"
            aria-label="Recent joins filter — swipe to switch"
            {...makeSegmentSwipeHandlers(
              ['recent_today', 'recent_week', 'recent_month'] as const,
              partnerFilter,
            )}
          >
            <span className="pl-2 pr-1 text-[11px] sm:text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
              Recent joins
            </span>
            {([
              { key: 'recent_today', label: 'Today', count: segmentCounts.recentToday },
              { key: 'recent_week',  label: 'Week',  count: segmentCounts.recentWeek  },
              { key: 'recent_month', label: 'Month', count: segmentCounts.recentMonth },
            ] as const).map(seg => (
              <button
                key={seg.key}
                type="button"
                onClick={() => setPartnerFilter(seg.key)}
                aria-pressed={partnerFilter === seg.key}
                className={cn(
                  "px-3 py-2 sm:px-2.5 sm:py-1 min-h-[40px] sm:min-h-0 rounded-md font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0",
                  partnerFilter === seg.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-label={`Recent joins · no portfolio · ${seg.label} (${seg.count})`}
              >
                <span>{seg.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] sm:text-[10px] font-semibold tabular-nums leading-none",
                    partnerFilter === seg.key
                      ? "bg-muted text-foreground"
                      : "bg-background/60 text-muted-foreground"
                  )}
                >
                  {segmentCounts.all === 0 && isLoading ? '…' : seg.count}
                </span>
              </button>
            ))}
          </div>
          {/* Sort dropdown — applies to the visible grid */}
          <Select value={partnerSort} onValueChange={(v) => setPartnerSort(v as PartnerSort)}>
            <SelectTrigger className="h-10 sm:h-8 w-full sm:w-[200px] text-sm sm:text-[11px] self-start" aria-label="Sort partners">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Newest first</SelectItem>
              <SelectItem value="status_active">Status: Active first</SelectItem>
              <SelectItem value="status_none">Status: None first</SelectItem>
              <SelectItem value="count_desc">Portfolio count: high → low</SelectItem>
              <SelectItem value="count_asc">Portfolio count: low → high</SelectItem>
              <SelectItem value="name">Name (A–Z)</SelectItem>
            </SelectContent>
          </Select>
          {(partnerFilter !== 'all' || partnerSearch.trim() !== '' || customRange?.from || customRange?.to || partnerSort !== 'recent') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPartnerFilter('all');
                setPartnerSearch('');
                setCustomRange(undefined);
                setPartnerSort('recent');
              }}
              className="self-start h-10 sm:h-8 px-3 sm:px-2 text-xs sm:text-[11px] text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Reset filters
            </Button>
          )}
          {canWhatsAppPartners && partnerFilter === 'custom' && (
            <div className="self-start">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 text-xs justify-start font-normal w-full sm:w-[260px]",
                      !customRange?.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                    {customRange?.from ? (
                      customRange.to ? (
                        <>{format(customRange.from, 'LLL d, yyyy')} – {format(customRange.to, 'LLL d, yyyy')}</>
                      ) : (
                        format(customRange.from, 'LLL d, yyyy')
                      )
                    ) : (
                      <span>Pick start & end date</span>
                    )}
                    {customRange?.from && (
                      <X
                        className="h-3 w-3 ml-auto opacity-60 hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); setCustomRange(undefined); }}
                      />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={customRange}
                    onSelect={setCustomRange}
                    numberOfMonths={2}
                    disabled={(d) => d > new Date()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Newly joined list */}
          {isLoading ? (
            <div className="space-y-2">
              {/* Badge-strip skeleton — mirrors the real strip's pill count and
                  spacing so the layout doesn't jump once data arrives. */}
              <div className="flex flex-wrap items-center gap-1" aria-hidden="true">
                {(canWhatsAppPartners
                  ? [56, 60, 68, 56, 72, 80]
                  : [56, 60, 68]
                ).map((w, i) => (
                  <Skeleton key={i} className="h-5 rounded-full" style={{ width: w }} />
                ))}
              </div>
              {/* Showing N of M placeholder line */}
              <Skeleton className="h-3 w-40 rounded" />
              {/* Grid skeleton — same 2-column layout as the real grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div
                    key={i}
                    className="rounded-xl border border-border/60 bg-card p-2.5 flex items-center gap-2.5"
                  >
                    <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-32 rounded" />
                      <Skeleton className="h-2.5 w-44 rounded" />
                    </div>
                    <Skeleton className="h-8 w-16 rounded shrink-0" />
                    <Skeleton className="h-7 w-14 rounded shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          ) : !joined || joined.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No partners yet.</p>
          ) : (
            (() => {
              const filtered = filteredPartners;
              // Counts come from the memoized `badgeCounts` so we only pay the
              // 6 array-pass cost when `filteredPartners` actually changes.
              const { withCount, withoutCount, todayCount, weekCount, monthCount } = badgeCounts;
              const isFiltered = filtered.length !== joined.length;
              // Click-to-filter badge strip. Each badge sets the corresponding
              // partnerFilter so the grid re-filters instantly; clicking the
              // active filter again clears back to 'all'.
              const badgeBtn = (
                key: 'all' | 'with' | 'without' | 'today' | 'week' | 'month',
                colorClass: string,
                label: string,
                title: string,
              ) => {
                const active = partnerFilter === key;
                return (
                  <button
                    type="button"
                    onClick={() => setPartnerFilter(key === 'all' ? 'all' : (active ? 'all' : key))}
                    aria-pressed={active}
                    title={`${title}. Click to ${active && key !== 'all' ? 'clear this filter' : `filter by ${key === 'all' ? 'all partners' : key}`}.`}
                    className={cn(
                      'rounded-full px-2 py-0.5 border-0 text-[10px] font-bold transition-all',
                      'hover:scale-105 hover:shadow-sm focus:outline-none focus:ring-1 focus:ring-primary/40',
                      colorClass,
                      active && 'ring-2 ring-offset-1 ring-current',
                    )}
                  >
                    {label}
                  </button>
                );
              };
              const badges = (
                <div className="flex flex-wrap items-center gap-1">
                  {badgeBtn(
                    'all',
                    'bg-primary/15 text-primary',
                    `${filtered.length}${isFiltered ? ` of ${joined.length}` : ''} ${isFiltered ? 'matched' : 'total'}`,
                    isFiltered ? 'Partners matching current filter' : 'Total partners',
                  )}
                  {badgeBtn('with',    'bg-emerald-500/15 text-emerald-600', `${withCount} active`,    'With portfolios (in current filter)')}
                  {badgeBtn('without', 'bg-amber-500/15 text-amber-600',    `${withoutCount} pending`, 'No portfolio yet (in current filter)')}
                  {canWhatsAppPartners && (
                    <>
                      {badgeBtn('today', 'bg-sky-500/15 text-sky-600',       `${todayCount} today`,      'Joined today, in current filter (your local time)')}
                      {badgeBtn('week',  'bg-indigo-500/15 text-indigo-600', `${weekCount} this week`,   'Joined since Monday, in current filter (your local time)')}
                      {badgeBtn('month', 'bg-violet-500/15 text-violet-600', `${monthCount} this month`, 'Joined since the 1st of this month, in current filter (your local time)')}
                    </>
                  )}
                </div>
              );
              if (filtered.length === 0) {
                // Counts across ALL partners (not filtered) so we can suggest
                // a counterpart filter that actually has results.
                const totalWith = joined.filter(p => p.portfolio_count > 0).length;
                const totalWithout = joined.length - totalWith;
                let title = 'No partners match these filters.';
                let hint: string | null = null;
                let switchLabel: string | null = null;
                let switchTo: PartnerFilter | null = null;
                if (partnerFilter === 'with') {
                  title = 'No partners with a portfolio yet.';
                  hint = totalWithout > 0
                    ? `${totalWithout} partner${totalWithout === 1 ? '' : 's'} still need a portfolio activated.`
                    : 'Every partner already has a portfolio.';
                  if (totalWithout > 0) {
                    switchLabel = `Show ${totalWithout} without portfolio`;
                    switchTo = 'without';
                  }
                } else if (partnerFilter === 'without') {
                  title = 'No partners are waiting for a portfolio.';
                  hint = totalWith > 0
                    ? `${totalWith} partner${totalWith === 1 ? ' has' : 's have'} an active portfolio.`
                    : 'No partners have an active portfolio yet.';
                  if (totalWith > 0) {
                    switchLabel = `Show ${totalWith} with portfolio`;
                    switchTo = 'with';
                  }
                } else if (partnerFilter === 'just_joined') {
                  title = `No fresh joiners in the last ${JUST_JOINED_DAYS} days.`;
                  hint = totalWithout > 0
                    ? `${totalWithout} older partner${totalWithout === 1 ? '' : 's'} still need a portfolio activated.`
                    : 'Every partner already has a portfolio.';
                  if (totalWithout > 0) {
                    switchLabel = `Show all ${totalWithout} without portfolio`;
                    switchTo = 'without';
                  }
                }
                return (
                  <div className="space-y-2">
                    {badges}
                    {/* Mobile-first compact empty state — single icon + tight
                        title + ONE primary CTA. The reset action is a small
                        text-link below so the eye locks onto the next move. */}
                    {(() => {
                      const hasSmartSwitch = !!(switchLabel && switchTo);
                      const primaryLabel = hasSmartSwitch
                        ? switchLabel!
                        : `Show all ${joined.length.toLocaleString()} loaded`;
                      const onPrimary = () => {
                        if (hasSmartSwitch) {
                          setPartnerFilter(switchTo!);
                        } else {
                          setPartnerFilter('all');
                          setPartnerSearch('');
                          setCustomRange(undefined);
                        }
                      };
                      return (
                        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-5 sm:py-4 flex flex-col items-center text-center gap-2">
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <p className="text-sm sm:text-xs font-semibold leading-tight">
                            {title}
                          </p>
                          {hint && (
                            <p className="text-xs sm:text-[11px] text-muted-foreground leading-snug max-w-[28ch]">
                              {hint}
                            </p>
                          )}
                          <Button
                            size="sm"
                            className="mt-1 h-10 sm:h-8 px-4 text-xs sm:text-[11px] w-full sm:w-auto max-w-xs"
                            onClick={onPrimary}
                          >
                            {primaryLabel}
                          </Button>
                          {hasSmartSwitch && (
                            <button
                              type="button"
                              onClick={() => {
                                setPartnerFilter('all');
                                setPartnerSearch('');
                                setCustomRange(undefined);
                              }}
                              className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                            >
                              Or show all {joined.length.toLocaleString()} loaded
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              }
              // Infinite scroll renders every filtered row that has been
              // loaded so far. New server pages are appended automatically
              // when the sentinel scrolls into view.
              const visible = filtered;
              return (
            <div className="space-y-2">
              {badges}
              <div ref={gridScrollRef} className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[520px] overflow-y-auto pr-1">
              <div className="col-span-full text-[10px] text-muted-foreground">
                Showing {visible.length} matched · {joined.length.toLocaleString()} loaded
                {' '}of {joinedTotal.toLocaleString()} total partners
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
                  </div>
                   {/* Dedicated Portfolio status column — clickable, opens this partner's portfolio details */}
                   <TooltipProvider delayDuration={200}>
                     <Tooltip>
                       <TooltipTrigger asChild>
                         <button
                           type="button"
                           className="shrink-0 w-20 border-l border-border/50 pl-2 flex flex-col items-start justify-center text-left rounded hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
                           aria-label={`Open ${p.full_name}'s portfolio details`}
                           onClick={() => {
                             handleSelect({ id: p.user_id, full_name: p.full_name, phone: p.phone });
                             setTimeout(() => {
                               document
                                 .getElementById('partner-portfolio-details')
                                 ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                             }, 50);
                           }}
                         >
                           <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Portfolio</span>
                           {p.portfolio_count > 0 ? (
                             <span className="text-[10px] font-semibold text-emerald-600 underline-offset-2 hover:underline">
                               Active <span className="text-muted-foreground font-normal">· {p.portfolio_count}</span>
                             </span>
                           ) : (
                             <span className="text-[10px] font-semibold text-amber-600 underline-offset-2 hover:underline">None yet</span>
                           )}
                         </button>
                       </TooltipTrigger>
                       <TooltipContent side="top" align="end" className="max-w-[240px] text-[11px] leading-snug">
                         {p.portfolio_count > 0 ? (
                           <div className="space-y-1">
                             <p className="font-semibold text-emerald-500">With portfolio · {p.portfolio_count} active</p>
                             <p className="text-muted-foreground">
                               This partner has {p.portfolio_count} activated investment {p.portfolio_count === 1 ? 'portfolio' : 'portfolios'} earning returns. Click to view or edit them.
                             </p>
                           </div>
                         ) : (
                           <div className="space-y-1">
                             <p className="font-semibold text-amber-500">No portfolio yet</p>
                             <p className="text-muted-foreground">
                               Partner role is granted, but no investment portfolio has been activated. Click to open and activate one.
                             </p>
                           </div>
                         )}
                       </TooltipContent>
                     </Tooltip>
                   </TooltipProvider>
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
              {/* Auto-load sentinel — IntersectionObserver triggers
                  fetchNextPage when this scrolls into view. */}
              <div
                ref={loadMoreSentinelRef}
                className="col-span-full flex justify-center py-2 text-[10px] text-muted-foreground"
              >
                {isFetchingNextPage ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading more partners…
                  </span>
                ) : hasNextPage ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] gap-1.5"
                    onClick={() => fetchNextPage()}
                  >
                    <ChevronDown className="h-3 w-3" />
                    Load more ({Math.max(0, joinedTotal - joined.length)} remaining)
                  </Button>
                ) : joined.length > 0 ? (
                  <span>End of list · {joined.length.toLocaleString()} partners loaded</span>
                ) : null}
              </div>
            </div>
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
              <div id="partner-portfolio-details" className="rounded-xl border border-border/60 bg-card p-3 space-y-3 scroll-mt-4">
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
            // If this close came from a successful activation AND the
            // operator opened the dialog via the quick-activate banner,
            // queue an auto-advance to the next no-portfolio candidate.
            if (autoAdvanceRef.current && activationSucceededRef.current) {
              setPendingAutoAdvance(true);
            }
            autoAdvanceRef.current = false;
            activationSucceededRef.current = false;
          }
        }}
        onSuccess={() => {
          activationSucceededRef.current = true;
          lastActivatedIdRef.current = createForUser?.id ?? null;
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

      {/* Sticky mobile action bar — primary filter, sort, and quick-activate
          stay reachable while Partner Ops scrolls a long partner list on a
          phone. Hidden on sm+ where the inline toolbar is already visible. */}
      {(() => {
        const noPortfolioFilters: PartnerFilter[] = [
          'just_joined', 'without', 'recent_today', 'recent_week', 'recent_month',
        ];
        const nextCandidate = noPortfolioFilters.includes(partnerFilter)
          ? filteredPartners.find(p => p.portfolio_count === 0)
          : null;
        // Activation is "in flight" whenever the Create-Portfolio dialog is
        // open OR the auto-advance chain is waiting to open the next dialog.
        // While that's true we lock the bottom-bar Filter/Sort and show a
        // spinner on Activate so the operator can't change the candidate
        // mid-flow or double-tap.
        const activating = createOpen || pendingAutoAdvance;
        const activateLabel = pendingAutoAdvance
          ? 'Next…'
          : createOpen
            ? 'Activating…'
            : 'Activate';
        return (
          <div
            className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-primary/30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.15)]"
            role="toolbar"
            aria-label="Partner list quick actions"
            aria-busy={activating}
          >
            <div className="flex items-center gap-1.5">
              <Select
                value={partnerFilter}
                onValueChange={(v) => setPartnerFilter(v as PartnerFilter)}
                disabled={activating}
              >
                <SelectTrigger
                  className="h-11 text-xs flex-1 min-w-0 disabled:opacity-60 disabled:cursor-not-allowed"
                  aria-label="Filter partners"
                >
                  <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All partners</SelectItem>
                  <SelectItem value="just_joined">Just joined · no portfolio</SelectItem>
                  <SelectItem value="recent_today">No portfolio · today</SelectItem>
                  <SelectItem value="recent_week">No portfolio · this week</SelectItem>
                  <SelectItem value="recent_month">No portfolio · this month</SelectItem>
                  <SelectItem value="with">With portfolios</SelectItem>
                  <SelectItem value="without">No portfolios yet</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={partnerSort}
                onValueChange={(v) => setPartnerSort(v as PartnerSort)}
                disabled={activating}
              >
                <SelectTrigger
                  className="h-11 text-xs flex-1 min-w-0 disabled:opacity-60 disabled:cursor-not-allowed"
                  aria-label="Sort partners"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Newest first</SelectItem>
                  <SelectItem value="status_active">Active first</SelectItem>
                  <SelectItem value="status_none">None first</SelectItem>
                  <SelectItem value="count_desc">Count: high → low</SelectItem>
                  <SelectItem value="count_asc">Count: low → high</SelectItem>
                  <SelectItem value="name">Name (A–Z)</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-11 text-xs gap-1 shrink-0 px-3 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!nextCandidate || activating}
                aria-busy={activating}
                title={
                  activating
                    ? (pendingAutoAdvance ? 'Loading next candidate…' : 'Activation in progress…')
                    : nextCandidate
                      ? `Activate ${nextCandidate.full_name}`
                      : 'No candidate in current filter'
                }
                onClick={() => {
                  if (!nextCandidate || activating) return;
                  autoAdvanceRef.current = autoAdvanceEnabled;
                  activationSucceededRef.current = false;
                  openCreateFor({
                    id: nextCandidate.user_id,
                    full_name: nextCandidate.full_name,
                    phone: nextCandidate.phone,
                  });
                }}
              >
                {activating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Zap className="h-3.5 w-3.5" />}
                {activateLabel}
              </Button>
            </div>
          </div>
        );
      })()}
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
