import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import {
  AlertTriangle, CalendarIcon, ChevronDown, ChevronUp, Inbox, Loader2, RefreshCw, Search, X,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface GmailTx {
  id: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  snippet: string | null;
  amount: number | null;
  transaction_id: string | null;
  counterparty: string | null;
  internal_date: string | null;
  parsed: boolean;
  direction: string | null;
  linked_deposit_request_id: string | null;
}

interface PendingDeposit {
  id: string;
  amount: number;
  transaction_id: string | null;
  created_at: string;
  user_id: string;
  full_name?: string | null;
  phone?: string | null;
}

const fmtUgx = (n: number | null | undefined) =>
  n == null ? '—' : `UGX ${Math.round(n).toLocaleString()}`;

/**
 * "Needs Review" queue — surfaces inbound parsed Gmail rows that the
 * auto-match engine could not safely link, split into:
 *   • Unmatched   — no candidate pending deposit could be found
 *   • Conflicting — multiple pending deposits share the same amount in window
 *
 * Operators filter by date range and by a specific deposit request
 * (ID, Transaction ID, depositor name, or phone) to triage faster.
 */
const PAGE_SIZE = 10;

export function EmailNeedsReviewPanel() {
  const { toast } = useToast();
  const [emails, setEmails] = useState<GmailTx[]>([]);
  const [pending, setPending] = useState<PendingDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fromDate, setFromDate] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [toDate, setToDate] = useState<Date | undefined>(undefined);
  const [depositFilter, setDepositFilter] = useState('');
  const [unmatchedOpen, setUnmatchedOpen] = useState(true);
  const [conflictingOpen, setConflictingOpen] = useState(true);
  const [unmatchedPage, setUnmatchedPage] = useState(1);
  const [conflictingPage, setConflictingPage] = useState(1);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const fromIso = fromDate ? fromDate.toISOString() : null;
      const toIso = toDate
        ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59).toISOString()
        : null;

      let emailQ: any = (supabase.from('gmail_transactions') as any)
        .select('id,from_email,from_name,subject,snippet,amount,transaction_id,counterparty,internal_date,parsed,direction,linked_deposit_request_id')
        .is('linked_deposit_request_id', null)
        .eq('parsed', true)
        .order('internal_date', { ascending: false, nullsFirst: false })
        .limit(300);
      if (fromIso) emailQ = emailQ.gte('internal_date', fromIso);
      if (toIso) emailQ = emailQ.lte('internal_date', toIso);

      let pendingQ: any = supabase.from('deposit_requests')
        .select('id,amount,transaction_id,created_at,user_id,profiles!deposit_requests_user_id_fkey(full_name,phone)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(500);
      if (fromIso) pendingQ = pendingQ.gte('created_at', fromIso);
      if (toIso) pendingQ = pendingQ.lte('created_at', toIso);

      const [{ data: e, error: eErr }, { data: p, error: pErr }] = await Promise.all([emailQ, pendingQ]);
      if (eErr) throw eErr;
      if (pErr) {
        // FK relationship name may differ; fall back to plain select.
        const { data: p2 } = await supabase.from('deposit_requests')
          .select('id,amount,transaction_id,created_at,user_id')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(500);
        const userIds = Array.from(new Set((p2 ?? []).map((x: any) => x.user_id)));
        const { data: profs } = userIds.length
          ? await supabase.from('profiles').select('id,full_name,phone').in('id', userIds)
          : { data: [] as any[] };
        const pmap = new Map<string, any>();
        (profs ?? []).forEach((x: any) => pmap.set(x.id, x));
        setPending((p2 ?? []).map((x: any) => ({
          ...x,
          full_name: pmap.get(x.user_id)?.full_name ?? null,
          phone: pmap.get(x.user_id)?.phone ?? null,
        })));
      } else {
        setPending((p ?? []).map((x: any) => ({
          id: x.id,
          amount: Number(x.amount),
          transaction_id: x.transaction_id,
          created_at: x.created_at,
          user_id: x.user_id,
          full_name: x.profiles?.full_name ?? null,
          phone: x.profiles?.phone ?? null,
        })));
      }
      setEmails((e as GmailTx[]) ?? []);
    } catch (err: any) {
      if (!silent) toast({ title: 'Failed to load review queue', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fromDate, toDate, toast]);

  useEffect(() => { load(); }, [load]);

  // Bucket emails into unmatched vs conflicting + filter by deposit search.
  const { unmatched, conflicting } = useMemo(() => {
    const q = depositFilter.trim().toLowerCase();
    const matchesDepositFilter = (e: GmailTx, candidates: PendingDeposit[]) => {
      if (!q) return true;
      // Match the email if any candidate pending deposit matches the search,
      // or the email's own TID / counterparty contains the query.
      if (e.transaction_id?.toLowerCase().includes(q)) return true;
      if (e.counterparty?.toLowerCase().includes(q)) return true;
      if (e.from_email?.toLowerCase().includes(q)) return true;
      return candidates.some((d) =>
        d.id.toLowerCase().includes(q)
        || d.transaction_id?.toLowerCase().includes(q)
        || d.full_name?.toLowerCase().includes(q)
        || d.phone?.toLowerCase().includes(q)
      );
    };

    const u: Array<{ email: GmailTx; candidates: PendingDeposit[] }> = [];
    const c: Array<{ email: GmailTx; candidates: PendingDeposit[] }> = [];

    for (const e of emails) {
      if (e.amount == null) continue;
      const cands = pending.filter((d) => Math.abs(d.amount - (e.amount ?? 0)) < 0.5);
      if (!matchesDepositFilter(e, cands)) continue;
      if (cands.length >= 2) c.push({ email: e, candidates: cands });
      else u.push({ email: e, candidates: cands });
    }
    return { unmatched: u, conflicting: c };
  }, [emails, pending, depositFilter]);

  const linkEmail = async (emailId: string, depositId: string) => {
    const { error } = await (supabase.from('gmail_transactions') as any)
      .update({
        linked_deposit_request_id: depositId,
        auto_matched_at: new Date().toISOString(),
        auto_match_method: 'amount_strong',
      })
      .eq('id', emailId);
    if (error) {
      toast({ title: 'Link failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Linked', description: 'Email is now paired with the deposit request and ready to approve in the auto-match panel above.' });
    setEmails((cur) => cur.filter((x) => x.id !== emailId));
  };

  const renderRow = (item: { email: GmailTx; candidates: PendingDeposit[] }, conflict: boolean) => {
    const e = item.email;
    return (
      <li key={e.id} className="p-3 sm:p-4 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={conflict ? 'destructive' : 'secondary'} className="text-[10px]">
                {conflict ? <><AlertTriangle className="h-3 w-3 mr-1" /> Conflicting</> : <><Inbox className="h-3 w-3 mr-1" /> Unmatched</>}
              </Badge>
              <span className="font-semibold text-sm">{fmtUgx(e.amount)}</span>
              {e.transaction_id && (
                <span className="text-[11px] text-muted-foreground font-mono">TID {e.transaction_id}</span>
              )}
              {e.internal_date && (
                <span className="text-[11px] text-muted-foreground">{format(new Date(e.internal_date), 'dd MMM HH:mm')}</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {e.from_name ?? e.from_email ?? 'Unknown sender'}
              {e.counterparty && <> · from {e.counterparty}</>}
            </div>
            {e.subject && <div className="text-xs text-foreground truncate">{e.subject}</div>}
            {e.snippet && <div className="text-[11px] text-muted-foreground line-clamp-2 italic">"{e.snippet}"</div>}
          </div>
        </div>

        {item.candidates.length > 0 ? (
          <div className="rounded-md border bg-muted/30 p-2 space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              {conflict ? `${item.candidates.length} pending deposits share this amount` : 'Possible pending deposit'}
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {conflict
                ? 'Pick the depositor whose name or phone matches the email, then tap Link. The others stay pending.'
                : 'If this is the right depositor, tap Link to credit their wallet. If not, leave it — the next scan will try again.'}
            </p>
            <ul className="divide-y">
              {item.candidates.map((d) => (
                <li key={d.id} className="py-1.5 flex items-center gap-2 justify-between text-xs">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{d.full_name ?? 'Unknown depositor'}</div>
                    <div className="text-[11px] text-muted-foreground truncate font-mono">
                      {d.phone ?? '—'} · TID {d.transaction_id ?? '—'} · {format(new Date(d.created_at), 'dd MMM HH:mm')}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    onClick={() => linkEmail(e.id, d.id)}
                    title={`Credit this email's amount to ${d.full_name ?? 'this depositor'} and mark the deposit approved.`}
                  >
                    Link
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground italic">
            No pending deposit matches this amount in the selected window. Likely a legacy email or an unrequested deposit — safe to leave alone.
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="p-4 border-b bg-gradient-to-r from-amber-500/5 to-transparent flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-sm sm:text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Needs Review
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Parsed inbox emails the auto-matcher couldn't safely link — either no candidate or multiple candidates share the same amount.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing} className="gap-2">
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <DateField label="From" value={fromDate} onChange={setFromDate} />
          <DateField label="To" value={toDate} onChange={setToDate} />
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={depositFilter}
              onChange={(ev) => setDepositFilter(ev.target.value)}
              placeholder="Filter by deposit ID, TID, depositor name or phone…"
              className="pl-7 h-9 text-xs"
            />
            {depositFilter && (
              <button
                type="button"
                onClick={() => setDepositFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          Loading review queue…
        </div>
      ) : (
        <Tabs defaultValue="unmatched" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0">
            <TabsTrigger value="unmatched" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
              Unmatched <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{unmatched.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="conflicting" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
              Conflicting <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-[10px]">{conflicting.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="unmatched" className="m-0">
            {unmatched.length === 0 ? (
              <EmptyState text="Nothing to review — every parsed email is linked or has no candidate." />
            ) : (
              <ul className="divide-y">{unmatched.map((x) => renderRow(x, false))}</ul>
            )}
          </TabsContent>

          <TabsContent value="conflicting" className="m-0">
            {conflicting.length === 0 ? (
              <EmptyState text="No conflicting emails — no two pending deposits share an amount in this window." />
            ) : (
              <ul className="divide-y">{conflicting.map((x) => renderRow(x, true))}</ul>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: Date | undefined; onChange: (d: Date | undefined) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-9 text-xs gap-2 justify-start min-w-[150px]', !value && 'text-muted-foreground')}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          {label}: {value ? format(value, 'dd MMM yyyy') : 'Any'}
          {value && (
            <X
              className="h-3 w-3 ml-auto hover:text-destructive"
              onClick={(ev) => { ev.stopPropagation(); ev.preventDefault(); onChange(undefined); }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          initialFocus
          className={cn('p-3 pointer-events-auto')}
        />
      </PopoverContent>
    </Popover>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">
      <Inbox className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
      {text}
    </div>
  );
}