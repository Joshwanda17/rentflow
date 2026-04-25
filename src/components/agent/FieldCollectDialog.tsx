import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
  getCachedNormalizedIndex, saveCachedNormalizedIndex,
  type CachedTenant, type FieldEntry, type NormalizedTenantEntry,
} from '@/lib/fieldCollectStore';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';
import { FieldCollectDailyTotals } from '@/components/agent/FieldCollectDailyTotals';
import { normalizeName, normalizePhone, tenantListFingerprint } from '@/lib/tenantSearch';

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

/** Render text with the matched span wrapped in <mark>. */
function renderHighlighted(text: string, start: number, end: number): React.ReactNode {
  if (start < 0 || end <= start) return text;
  return (
    <>
      {text.slice(0, start)}
      <mark className="bg-primary/20 text-foreground rounded px-0.5 font-semibold">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

/**
 * Highlight the matching part of a tenant name. Uses normalized comparison so
 * "obrien" highlights inside "O'Brien" and "jose" inside "José". Falls back
 * to a plain case-insensitive substring search if normalization can't locate
 * the query (e.g. when the query has been split across whitespace).
 */
function highlightName(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;

  // 1. Try normalized match — walk both strings in parallel, mapping each
  //    source character to its normalized form, and find a contiguous span
  //    in the original text whose normalized projection equals the query.
  const qNorm = normalizeName(q);
  if (qNorm) {
    const map: { src: number; norm: string }[] = [];
    let normRun = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const cleaned = ch.replace(/[^a-z0-9\s]+/g, ' ');
      // Collapse runs of whitespace (matches normalizeName) by skipping
      // additional whitespace once the previous emitted char was a space.
      const prev = normRun[normRun.length - 1];
      const emit = cleaned === ' ' && prev === ' ' ? '' : cleaned;
      map.push({ src: i, norm: emit });
      normRun += emit;
    }
    const trimmedNorm = normRun.trim();
    const trimOffset = normRun.indexOf(trimmedNorm);
    const idx = trimmedNorm.indexOf(qNorm);
    if (idx !== -1) {
      // Walk the map to find the source-text positions for [start, end) of the
      // normalized hit.
      const targetStart = trimOffset + idx;
      const targetEnd = targetStart + qNorm.length;
      let cursor = 0;
      let srcStart = -1;
      let srcEnd = -1;
      for (let i = 0; i < map.length; i++) {
        const len = map[i].norm.length;
        if (srcStart === -1 && cursor + len > targetStart) srcStart = map[i].src;
        if (cursor + len >= targetEnd) { srcEnd = map[i].src + 1; break; }
        cursor += len;
      }
      if (srcStart !== -1 && srcEnd !== -1) return renderHighlighted(text, srcStart, srcEnd);
    }
  }

  // 2. Fallback: plain case-insensitive substring.
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return renderHighlighted(text, idx, idx + q.length);
}

/**
 * Highlight the matching part of a phone number. Compares only digits so
 * "0772" finds "+256 772 123 456" and the highlighted span covers the
 * formatted digits (and intervening spaces/dashes) in the original text.
 */
function highlightPhone(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const qDigits = q.replace(/\D+/g, '');
  if (!qDigits) return text;

  // Map each character in the original text to its digit position.
  const digits: string[] = [];
  const digitToSrc: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (/\d/.test(text[i])) {
      digits.push(text[i]);
      digitToSrc.push(i);
    }
  }
  const digitsStr = digits.join('');

  // Try the query as typed first, then with leading "0" stripped, then
  // with leading "256" stripped — covers "0772…", "+256 772…" and "772…".
  const candidates = [qDigits];
  if (qDigits.startsWith('0')) candidates.push(qDigits.slice(1));
  if (qDigits.startsWith('256')) candidates.push(qDigits.slice(3));

  for (const candidate of candidates) {
    if (!candidate) continue;
    const idx = digitsStr.indexOf(candidate);
    if (idx !== -1) {
      const srcStart = digitToSrc[idx];
      const srcEnd = digitToSrc[idx + candidate.length - 1] + 1;
      return renderHighlighted(text, srcStart, srcEnd);
    }
  }

  return text;
}

// `normalizeName` / `normalizePhone` live in `@/lib/tenantSearch` so the
// scoring logic can be unit-tested without dragging the dialog into vitest.

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

  /**
   * Keyboard navigation for the tenant picker.
   * activeIdx walks a single virtual list: [...recentTenants, ...filtered].
   * - ArrowDown / ArrowUp move the highlight (wraps).
   * - Enter picks the highlighted tenant.
   * - Escape clears the search box (and highlight) without closing the dialog.
   * Resets whenever the underlying list contents change.
   */
  const [activeIdx, setActiveIdx] = useState(0);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  /**
   * Ref to the tenant search input. Used by the section-level type-to-search
   * handler so a printable key pressed anywhere in Step 1 (e.g. while focus is
   * on a "Recent" chip) routes that character into the search input and
   * snaps the highlight to the first match.
   */
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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
  /**
   * Pre-normalized index over the tenant cache. Computed once per tenant-list
   * change so each keystroke does O(N) string comparisons against already-
   * normalized values instead of re-running normalizeName/normalizePhone for
   * every tenant on every render. Significant speed-up for agents with
   * hundreds/thousands of cached tenants.
   *
   * The index is also persisted to IndexedDB keyed by a fingerprint of the
   * tenant list so the heavy O(N) normalization work survives reloads. On
   * cold start we attempt to hydrate from the persisted cache; we only
   * recompute (and re-persist) when the fingerprint changes.
   */
  const fingerprint = useMemo(() => tenantListFingerprint(tenants), [tenants]);
  // Per-tenantId normalized lookup. Hydrated from IndexedDB or recomputed.
  const [normalizedById, setNormalizedById] = useState<Map<string, NormalizedTenantEntry>>(new Map());

  useEffect(() => {
    if (!user?.id) return;
    if (!tenants.length) {
      setNormalizedById(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      // 1. Try to hydrate from the persisted cache.
      const cached = await getCachedNormalizedIndex(user.id, fingerprint);
      if (cancelled) return;
      if (cached && cached.length === tenants.length) {
        setNormalizedById(new Map(cached.map(e => [e.tenantId, e])));
        return;
      }
      // 2. Cache miss → recompute and persist for next reload.
      const entries: NormalizedTenantEntry[] = tenants.map(t => {
        const name = normalizeName(t.fullName);
        return {
          tenantId: t.tenantId,
          name,
          phone: normalizePhone(t.phone),
          nameWords: name.split(' ').filter(Boolean),
        };
      });
      if (cancelled) return;
      setNormalizedById(new Map(entries.map(e => [e.tenantId, e])));
      // Fire-and-forget persistence — don't block the UI on IndexedDB.
      void saveCachedNormalizedIndex(user.id, fingerprint, entries);
    })();
    return () => { cancelled = true; };
  }, [user?.id, fingerprint, tenants]);

  /**
   * Adapter that exposes the normalized index in the shape the existing
   * filter/scoring code consumes — `{ t, name, phone, nameWords }` per tenant.
   * Falls back to on-the-fly normalization for any tenant that hasn't been
   * indexed yet (e.g. mid-hydration), so search never returns empty results
   * just because the cache hasn't loaded.
   */
  const tenantIndex = useMemo(
    () => tenants.map(t => {
      const cached = normalizedById.get(t.tenantId);
      if (cached) return { t, name: cached.name, phone: cached.phone, nameWords: cached.nameWords };
      const name = normalizeName(t.fullName);
      return {
        t,
        name,
        phone: normalizePhone(t.phone),
        nameWords: name.split(' ').filter(Boolean),
      };
    }),
    [tenants, normalizedById],
  );

  const filtered = useMemo(() => {
    const raw = search.trim();
    const q = normalizeName(raw);
    if (!q) return tenants.slice(0, 8).map(t => ({ t, score: 0, matchType: null as 'phone' | 'name' | 'both' | null, ambiguous: false }));
    const phoneQ = normalizePhone(raw);
    // Treat the query as "phone-y" if the user typed mostly digits — even
    // with spaces, dashes, plus signs or a leading 0/256.
    const isPhoneQuery = phoneQ.length >= 3 && /\d/.test(raw) && raw.replace(/[\s\-+()]/g, '').replace(/\D+/g, '').length >= raw.replace(/[\s\-+()]/g, '').length - 1;
    /**
     * Short phone queries (3–4 digits) are inherently ambiguous: the agent is
     * usually recalling only the tail of the number ("…456"). To avoid the
     * dangerous case where the search lands on the *wrong* tenant by chance,
     * we restrict short phone-y queries to **last-N-digits** matches and
     * require at least 2 candidates before showing them. If only one tenant
     * matches, we suppress the result so the agent is forced to type more
     * digits or switch to name search — preventing an accidental mis-pick.
     */
    const isShortPhoneQuery = isPhoneQuery && phoneQ.length >= 3 && phoneQ.length <= 4;
    const scored = tenantIndex
      .map(({ t, name, phone, nameWords }) => {
        let score = 0;
        let phoneScore = 0;
        let nameScore = 0;
        // Phone matches always outrank name matches when the query is phone-y.
        if (isShortPhoneQuery && phone) {
          // Short query → only match the tail of the phone (last digits the
          // agent remembers). Anything-anywhere matching produces too many
          // false positives on 3–4 digit queries.
          if (phone.endsWith(phoneQ)) phoneScore = 110;
        } else if (isPhoneQuery && phone && phone.includes(phoneQ)) {
          if (phone === phoneQ) phoneScore = 200;          // exact full match — pin to top
          else if (phone.startsWith(phoneQ)) phoneScore = 150; // prefix match
          else if (phone.endsWith(phoneQ)) phoneScore = 130; // tail match (e.g. last 4-7)
          else phoneScore = 110;                            // substring match
        } else if (phoneQ && phone && phone.includes(phoneQ)) {
          // Mixed query (digits + letters) — phone still helps but doesn't dominate.
          phoneScore = phone.startsWith(phoneQ) ? 100 : 70;
        }
        // Name scoring runs in addition so a tenant matching both ranks higher.
        if (name.startsWith(q)) {
          nameScore = 90;
        } else if (nameWords.some(w => w.startsWith(q))) {
          nameScore = 80;
        } else if (name.includes(q)) {
          nameScore = 50;
        }
        score = Math.max(phoneScore, nameScore);
        // Match type is whichever scoring lane won; ties (both > 0 with same score)
        // are labeled 'both' so the agent sees the full picture on the top result.
        let matchType: 'phone' | 'name' | 'both' | null = null;
        if (phoneScore > 0 && nameScore > 0 && phoneScore === nameScore) matchType = 'both';
        else if (phoneScore > nameScore) matchType = 'phone';
        else if (nameScore > 0) matchType = 'name';
        return { t, score, matchType };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    // Safety net for short digit queries: only surface phone-only matches
    // when there are ≥2 candidates. If a short query produces a single phone
    // hit (with no name overlap), suppress it and show nothing — the empty
    // state will tell the agent to type more digits.
    if (isShortPhoneQuery) {
      const phoneOnly = scored.filter(s => s.matchType === 'phone');
      const nameAny = scored.filter(s => s.matchType === 'name' || s.matchType === 'both');
      if (phoneOnly.length === 1 && nameAny.length === 0) {
        return [] as typeof scored;
      }
    }

    // Tag every row in the result set as ambiguous when the query is a short
    // digit query and there are multiple candidates — drives the UI hint.
    const ambiguous = isShortPhoneQuery && scored.length > 1;
    return scored.map(s => ({ ...s, ambiguous }));
  }, [tenantIndex, tenants, search]);

  /** Just the tenant rows — used by keyboard nav & recents merge. */
  const filteredTenants = useMemo<CachedTenant[]>(
    () => filtered.map(s => s.t),
    [filtered],
  );

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

  /**
   * Combined keyboard-navigable option list for Step 1.
   * Recents come first (prepended) so the most likely tap is at index 0
   * before the agent starts typing. Once they type, recents drop away and
   * only the scored suggestions remain.
   */
  const keyboardOptions = useMemo<CachedTenant[]>(() => {
    if (search.trim()) return filteredTenants;
    // Avoid duplicates between recents and the alphabetical default list.
    const recentIds = new Set(recentTenants.map(t => t.tenantId));
    return [...recentTenants, ...filteredTenants.filter(t => !recentIds.has(t.tenantId))];
  }, [search, filteredTenants, recentTenants]);

  /* Reset highlight whenever the option list shape changes */
  useEffect(() => {
    setActiveIdx(0);
  }, [keyboardOptions.length, search]);

  /* Keep the highlighted option scrolled into view */
  useEffect(() => {
    const el = optionRefs.current[activeIdx];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  /**
   * Last captured entry for the picked tenant — drives the small preview panel
   * (date, amount, notes) so the agent can avoid double-recording. Matches by
   * tenantId first, falling back to a name match (case-insensitive) so walk-up
   * conversions still resolve. Excludes any in-flight save by ignoring entries
   * captured in the last 1.5s.
   */
  const lastEntryForPicked = useMemo<FieldEntry | null>(() => {
    if (!picked) return null;
    const cutoff = Date.now() - 1500;
    const nameKey = picked.fullName.trim().toLowerCase();
    const matches = entries.filter(e => {
      if (e.capturedAt > cutoff) return false;
      if (picked.tenantId && e.tenantId === picked.tenantId) return true;
      if (!e.tenantId && (e.tenantName || '').trim().toLowerCase() === nameKey) return true;
      return false;
    });
    if (matches.length === 0) return null;
    return matches.reduce((latest, e) => (e.capturedAt > latest.capturedAt ? e : latest), matches[0]);
  }, [picked, entries]);

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

  /** Single entry point used by mouse, touch, and keyboard selection. */
  const pickTenant = useCallback((t: CachedTenant) => {
    setPicked(t);
    setSearch(t.fullName);
  }, []);

  /**
   * Search-input keyboard handler: ArrowDown/Up cycle through the merged
   * recent + suggestion list, Enter picks the highlight, Escape clears.
   */
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!keyboardOptions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => (i + 1) % keyboardOptions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => (i - 1 + keyboardOptions.length) % keyboardOptions.length);
    } else if (e.key === 'Enter') {
      const opt = keyboardOptions[activeIdx];
      if (opt) {
        e.preventDefault();
        pickTenant(opt);
      }
    } else if (e.key === 'Escape' && search) {
      e.preventDefault();
      setSearch('');
      setActiveIdx(0);
    }
  };

  /**
   * Section-level type-to-search (typeahead).
   * If the agent presses a printable single character while focus is NOT in
   * an editable field (e.g. they tabbed to a "Recent" chip, or just opened
   * the dialog and the autoFocus moved elsewhere), we:
   *   1) Focus the tenant search input.
   *   2) Append (or start) the query with that character.
   *   3) The existing `setActiveIdx(0)` effect snaps the highlight to the
   *      first match — no extra wiring needed.
   * Modifier keys (Ctrl/Cmd/Alt) are ignored so shortcuts still work, and we
   * deliberately let the input's own onKeyDown handle keys when it's already
   * focused (so we don't double-insert).
   */
  const handleStep1TypeAhead = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.defaultPrevented) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Only single printable characters (letters, digits, common symbols).
    // Excludes 'Enter', 'ArrowDown', 'Tab', 'Escape', etc. which all have
    // multi-char key names.
    if (e.key.length !== 1) return;
    const target = e.target as HTMLElement | null;
    // Don't hijack typing inside the search input itself or any editable area.
    if (target && (
      target === searchInputRef.current ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      (target as HTMLElement).isContentEditable
    )) {
      return;
    }
    e.preventDefault();
    const ch = e.key;
    setSearch(prev => prev + ch);
    setPicked(null);
    // Defer focus until after React applies the value so caret lands at end.
    requestAnimationFrame(() => {
      const el = searchInputRef.current;
      if (el) {
        el.focus();
        const len = el.value.length;
        try { el.setSelectionRange(len, len); } catch { /* ignore */ }
      }
    });
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
            <section
              className="space-y-3"
              aria-labelledby="step1-title"
              onKeyDown={handleStep1TypeAhead}
            >
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
                <div className="rounded-2xl bg-primary/5 border border-primary/20 px-4 py-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 min-h-[48px]">
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

                  {/* Last-payment preview — quiet helper to avoid double-recording */}
                  {lastEntryForPicked ? (
                    <div className="rounded-xl border bg-background/70 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Last payment
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                            lastEntryForPicked.syncState === 'synced'
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : lastEntryForPicked.syncState === 'queued'
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                              : 'bg-destructive/10 text-destructive',
                          )}
                        >
                          {lastEntryForPicked.syncState === 'synced' && 'Sent'}
                          {lastEntryForPicked.syncState === 'queued' && 'Waiting'}
                          {lastEntryForPicked.syncState === 'error' && 'Failed'}
                          {lastEntryForPicked.syncState === 'duplicate' && 'Duplicate'}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2 mt-1">
                        <p className="text-base font-bold tabular-nums">
                          {formatUGX(lastEntryForPicked.amount)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {(() => {
                            const ms = Date.now() - lastEntryForPicked.capturedAt;
                            const mins = Math.floor(ms / 60_000);
                            if (mins < 1) return 'Just now';
                            if (mins < 60) return `${mins}m ago`;
                            const hrs = Math.floor(mins / 60);
                            if (hrs < 24) return `${hrs}h ago`;
                            const days = Math.floor(hrs / 24);
                            if (days < 7) return `${days}d ago`;
                            return new Date(lastEntryForPicked.capturedAt).toLocaleDateString();
                          })()}
                          {' · '}
                          {new Date(lastEntryForPicked.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {lastEntryForPicked.notes && (
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                          “{lastEntryForPicked.notes}”
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed bg-background/40 px-3 py-2 text-[11px] text-muted-foreground text-center">
                      No previous collection on this device.
                    </div>
                  )}
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
                        {recentTenants.map((t) => {
                          const optIdx = keyboardOptions.findIndex(o => o.tenantId === t.tenantId);
                          const isActive = optIdx === activeIdx;
                          const initials = t.fullName
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map(s => s[0]?.toUpperCase())
                            .join('') || '?';
                          return (
                            <button
                              key={`recent-${t.tenantId}`}
                              ref={el => { if (optIdx >= 0) optionRefs.current[optIdx] = el; }}
                              type="button"
                              onClick={() => pickTenant(t)}
                              onMouseEnter={() => optIdx >= 0 && setActiveIdx(optIdx)}
                              role="option"
                              aria-selected={isActive}
                              className={cn(
                                'shrink-0 flex items-center gap-2 rounded-full border bg-card hover:bg-accent active:bg-accent/80 pl-1.5 pr-3.5 py-1.5 min-h-[40px] transition-colors touch-manipulation',
                                isActive && 'ring-2 ring-primary border-primary bg-accent',
                              )}
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
                      ref={searchInputRef}
                      value={search}
                      onChange={e => { setSearch(e.target.value); setPicked(null); }}
                      onKeyDown={handleSearchKeyDown}
                      placeholder={tenants.length ? 'Search name or phone' : 'Connect to load tenants'}
                      className="pl-11 pr-11 h-14 text-base rounded-2xl"
                      autoComplete="off"
                      autoFocus
                      role="combobox"
                      aria-expanded={keyboardOptions.length > 0}
                      aria-controls="tenant-suggestion-list"
                      aria-activedescendant={
                        keyboardOptions[activeIdx]
                          ? `tenant-opt-${keyboardOptions[activeIdx].tenantId}`
                          : undefined
                      }
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
                    <div
                      className="rounded-2xl border max-h-72 overflow-y-auto"
                      id="tenant-suggestion-list"
                      role="listbox"
                    >
                      {(() => {
                        // Detect a short digit-only query (3–4 digits). Drives both the
                        // empty-state hint and the "type more digits" prompt the agent
                        // sees when a single match was suppressed for safety.
                        const phoneQ = normalizePhone(search);
                        const isShortDigitQuery =
                          phoneQ.length >= 3 && phoneQ.length <= 4 &&
                          /\d/.test(search) &&
                          search.replace(/[\s\-+()]/g, '').replace(/\D+/g, '').length >=
                            search.replace(/[\s\-+()]/g, '').length - 1;
                        const isAmbiguous = filtered.length > 0 && (filtered[0] as any).ambiguous;
                        if (filtered.length === 0) {
                          return (
                            <p className="p-4 text-sm text-muted-foreground text-center">
                              {isShortDigitQuery
                                ? 'Too few digits to be sure. Type more digits or search by name.'
                                : 'No match. Use walk-up below.'}
                            </p>
                          );
                        }
                        return (
                          <>
                            {isAmbiguous && (
                              <div className="px-4 py-2 text-[11px] font-medium text-warning bg-warning/10 border-b">
                                {filtered.length} possible matches for "{search}" — pick carefully or type more digits.
                              </div>
                            )}
                            {filtered.map(({ t, matchType }, idx) => {
                        const optIdx = keyboardOptions.findIndex(o => o.tenantId === t.tenantId);
                        const isActive = optIdx === activeIdx;
                        return (
                        <button
                          key={t.tenantId}
                          id={`tenant-opt-${t.tenantId}`}
                          ref={el => { if (optIdx >= 0) optionRefs.current[optIdx] = el; }}
                          onClick={() => pickTenant(t)}
                          onMouseEnter={() => optIdx >= 0 && setActiveIdx(optIdx)}
                          role="option"
                          aria-selected={isActive}
                          className={cn(
                            'w-full text-left px-4 py-4 min-h-[60px] border-b last:border-b-0 flex items-center justify-between gap-2 active:bg-accent/80 touch-manipulation transition-colors',
                            isActive ? 'bg-accent' : 'hover:bg-accent',
                          )}
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <p className="text-base font-semibold truncate">
                                {highlightName(t.fullName, search)}
                              </p>
                              {idx === 0 && search && (
                                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                  Best match
                                </span>
                              )}
                              {/*
                               * Match-type chips on the top result: tells the agent *why*
                               * this tenant was suggested — phone-digit match, name match,
                               * or both. Shown on the top 3 results so the ranking is
                               * transparent without flooding the rest of the list.
                               */}
                              {idx < 3 && search && matchType && (
                                <>
                                  {matchType === 'both' && (
                                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide bg-primary/15 text-primary px-1.5 py-0.5 rounded ring-1 ring-primary/30">
                                      Phone + Name match
                                    </span>
                                  )}
                                  {matchType === 'phone' && (
                                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide bg-success/10 text-success px-1.5 py-0.5 rounded">
                                      Phone match
                                    </span>
                                  )}
                                  {matchType === 'name' && (
                                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide bg-accent text-accent-foreground px-1.5 py-0.5 rounded">
                                      Name match
                                    </span>
                                  )}
                                </>
                              )}
                              {/*
                               * When there is no search query, show a neutral
                               * "Recent" chip on the top suggestions so agents
                               * still understand why these tenants appear first
                               * (most recent / default order, not a search match).
                               */}
                              {idx < 3 && !search && (
                                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                                  Recent
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {t.phone ? highlightPhone(t.phone, search) : 'No phone'}
                            </p>
                          </div>
                          {t.monthlyRent ? (
                            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                              {formatUGX(t.monthlyRent)}/mo
                            </span>
                          ) : null}
                        </button>
                        );
                            })}
                          </>
                        );
                      })()}
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