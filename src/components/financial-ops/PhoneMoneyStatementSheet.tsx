import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ArrowDownLeft, ArrowUpRight, Banknote, Loader2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export type PhoneMoneyLine = 'mtn_momo' | 'airtel_money' | 'cash';

interface Props {
  line: PhoneMoneyLine | null;
  onOpenChange: (open: boolean) => void;
}

const TITLES: Record<PhoneMoneyLine, string> = {
  mtn_momo: 'MTN Money statement',
  airtel_money: 'Airtel Money statement',
  cash: 'Cash at hand statement',
};

interface Row {
  id: string;
  at: string | null;
  amount: number;
  direction: 'in' | 'out' | 'charge' | 'cash';
  party: string;
  reference: string | null;
  balanceAfter: number | null;
  note: string | null;
}

/**
 * Detailed movement statement for one Actual Money line. Read-only: it simply
 * replays the provider SMS/emails (or verified cash deposits) that produced the
 * balance shown on the card, and resolves who the money came from / went to.
 */
export function PhoneMoneyStatementSheet({ line, onOpenChange }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['finops-phone-money-statement', line],
    enabled: !!line,
    staleTime: 15_000,
    queryFn: async (): Promise<Row[]> => {
      if (line === 'cash') {
        const { data: cash, error } = await supabase
          .from('cash_deposit_verifications')
          .select('id, amount, user_id, verified_at, created_at, deposit_request_id')
          .not('verified_at', 'is', null)
          .order('verified_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        const names = await resolveNames((cash ?? []).map((c: any) => c.user_id));
        return (cash ?? []).map((c: any) => ({
          id: c.id,
          at: c.verified_at ?? c.created_at,
          amount: Number(c.amount ?? 0),
          direction: 'cash' as const,
          party: names.get(c.user_id) ?? 'Unknown depositor',
          reference: c.deposit_request_id ? String(c.deposit_request_id).slice(0, 8) : null,
          balanceAfter: null,
          note: 'Verified cash collected — awaiting banking',
        }));
      }

      const { data: tx, error } = await supabase
        .from('gmail_transactions')
        .select('id, amount, direction, counterparty, balance, internal_date, created_at, transaction_id, snippet, linked_deposit_request_id')
        .eq('channel', line as string)
        .order('internal_date', { ascending: false })
        .limit(120);
      if (error) throw error;

      const depositIds = (tx ?? []).map((t: any) => t.linked_deposit_request_id).filter(Boolean);
      let depositUsers = new Map<string, string>();
      if (depositIds.length) {
        const { data: deps } = await supabase
          .from('deposit_requests')
          .select('id, user_id')
          .in('id', depositIds);
        const names = await resolveNames((deps ?? []).map((d: any) => d.user_id));
        depositUsers = new Map((deps ?? []).map((d: any) => [d.id, names.get(d.user_id) ?? 'Unknown user']));
      }

      return (tx ?? []).map((t: any) => {
        const linked = t.linked_deposit_request_id ? depositUsers.get(t.linked_deposit_request_id) : null;
        const raw = (t.counterparty || '').trim();
        const fromSnippet = extractParty(t.snippet);
        const party = linked || (raw && raw.toLowerCase() !== 'you have received' ? raw : '') || fromSnippet || 'Unnamed counterparty';
        return {
          id: t.id,
          at: t.internal_date ?? t.created_at,
          amount: Number(t.amount ?? 0),
          direction: (t.direction === 'out' ? 'out' : t.direction === 'charge' ? 'charge' : 'in') as Row['direction'],
          party,
          reference: t.transaction_id ?? null,
          balanceAfter: t.balance != null ? Number(t.balance) : null,
          note: t.snippet ? String(t.snippet).slice(0, 180) : null,
        };
      });
    },
  });

  const rows = data ?? [];
  const totals = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    rows.forEach((r) => {
      if (r.direction === 'in' || r.direction === 'cash') inflow += r.amount;
      else outflow += r.amount;
    });
    return { inflow, outflow };
  }, [rows]);

  return (
    <Sheet open={!!line} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="p-5 pb-3 border-b border-border">
          <SheetTitle>{line ? TITLES[line] : 'Statement'}</SheetTitle>
          <SheetDescription>
            {line === 'cash'
              ? 'Verified cash deposits collected by agents and not yet banked.'
              : 'Every money-in and money-out movement parsed from provider messages on this line.'}
          </SheetDescription>
          <div className="flex gap-4 pt-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Money in</p>
              <p className="font-mono text-sm font-semibold text-success">{formatUGX(totals.inflow)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Money out</p>
              <p className="font-mono text-sm font-semibold text-destructive">{formatUGX(totals.outflow)}</p>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {isLoading && (
            <div className="p-8 flex items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading statement…
            </div>
          )}
          {!isLoading && rows.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">No movements recorded on this line yet.</p>
          )}
          {rows.map((r) => {
            const isIn = r.direction === 'in' || r.direction === 'cash';
            return (
              <div key={r.id} className="p-4 flex items-start gap-3">
                <div className={cn('p-2 rounded-lg shrink-0', isIn ? 'bg-success/10' : 'bg-destructive/10')}>
                  {r.direction === 'cash' ? (
                    <Banknote className="h-4 w-4 text-success" />
                  ) : isIn ? (
                    <ArrowDownLeft className="h-4 w-4 text-success" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4 text-destructive" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground break-words">
                    {isIn ? 'From' : 'To'} {r.party}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.at ? format(new Date(r.at), 'd MMM yyyy, HH:mm') : 'No date'}
                    {r.reference ? ` • ${r.reference}` : ''}
                  </p>
                  {r.note && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground break-words">{r.note}</p>}
                  {r.direction === 'charge' && (
                    <Badge variant="outline" className="mt-1 text-[10px]">Provider charge</Badge>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className={cn('font-mono text-sm font-semibold tabular-nums', isIn ? 'text-success' : 'text-destructive')}>
                    {isIn ? '+' : '-'}{formatUGX(r.amount)}
                  </p>
                  {r.balanceAfter != null && (
                    <p className="text-[11px] text-muted-foreground font-mono">Bal {formatUGX(r.balanceAfter)}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

async function resolveNames(userIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean) as string[]));
  if (!ids.length) return new Map();
  const { data } = await supabase.from('profiles').select('id, full_name, phone').in('id', ids);
  return new Map((data ?? []).map((p: any) => [p.id, p.full_name || p.phone || 'Unnamed user']));
}

/** Pull a human name/phone out of a provider SMS snippet when the parser left counterparty empty. */
function extractParty(snippet: string | null): string | null {
  if (!snippet) return null;
  const m =
    snippet.match(/from\s+([A-Z][A-Za-z' ]{2,40}?)(?:\s+\d|,|\.|\s+on\b)/) ||
    snippet.match(/to\s+([A-Z][A-Za-z' ]{2,40}?)(?:\s+\d|,|\.|\s+on\b)/) ||
    snippet.match(/(2567\d{8}|07\d{8})/);
  return m ? m[1].trim() : null;
}
