// ═══════════════════════════════════════════════════════════════════════════
// Invited Portfolios Panel
// Lists portfolios in the invite pipeline (statuses `awaiting_partner_details`
// and `pending_ops_approval`). Searchable by partner name/phone or portfolio
// code. For `pending_ops_approval` rows, Ops can Approve inline — the call
// goes to the `approve-pending-portfolio` edge function which flips the
// portfolio to `active` and dispatches the final signed agreement.
// ═══════════════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { extractFromErrorObject } from '@/lib/extractEdgeFunctionError';
import { formatDistanceToNow, format } from 'date-fns';
import { Loader2, Search, Mail, MailWarning, ShieldCheck, RefreshCw, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

type InviteStatus = 'awaiting_partner_details' | 'pending_ops_approval';

interface Row {
  id: string;
  portfolio_code: string;
  investment_amount: number;
  roi_percentage: number;
  roi_mode: string | null;
  duration_months: number | null;
  status: InviteStatus;
  created_at: string;
  investor_id: string;
  partner_name: string;
  partner_phone: string | null;
  partner_email: string | null;
  token_expires_at: string | null;
  token_consumed_at: string | null;
}

type Filter = 'all' | InviteStatus;

export function InvitedPortfoliosPanel() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery<Row[]>({
    queryKey: ['invited-portfolios'],
    queryFn: async () => {
      // Single round-trip: pull portfolios in the invite pipeline, then batch
      // the partner profiles + latest token per portfolio.
      const { data: portfolios, error } = await supabase
        .from('investor_portfolios')
        .select('id, portfolio_code, investment_amount, roi_percentage, roi_mode, duration_months, status, created_at, investor_id')
        .in('status', ['awaiting_partner_details', 'pending_ops_approval'])
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      if (!portfolios || portfolios.length === 0) return [];

      const partnerIds = Array.from(new Set(portfolios.map(p => p.investor_id).filter(Boolean)));
      const portfolioIds = portfolios.map(p => p.id);

      const [{ data: profiles }, { data: tokens }] = await Promise.all([
        (supabase.from('profiles') as any)
          .select('id, full_name, phone, email')
          .in('id', partnerIds),
        (supabase.from('portfolio_completion_tokens') as any)
          .select('portfolio_id, expires_at, consumed_at')
          .in('portfolio_id', portfolioIds),
      ]);

      const nameMap = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]));
      const tokenMap = new Map<string, any>((tokens || []).map((t: any) => [t.portfolio_id, t]));

      return portfolios.map((p): Row => {
        const prof = nameMap.get(p.investor_id) || {};
        const tok = tokenMap.get(p.id) || {};
        return {
          id: p.id,
          portfolio_code: p.portfolio_code,
          investment_amount: Number(p.investment_amount) || 0,
          roi_percentage: Number(p.roi_percentage) || 0,
          roi_mode: p.roi_mode,
          duration_months: p.duration_months,
          status: p.status as InviteStatus,
          created_at: p.created_at,
          investor_id: p.investor_id,
          partner_name: prof.full_name || '—',
          partner_phone: prof.phone || null,
          partner_email: prof.email || null,
          token_expires_at: tok.expires_at || null,
          token_consumed_at: tok.consumed_at || null,
        };
      });
    },
    staleTime: 15000,
  });

  // Client-side search + filter (list is capped at 200 rows on the server).
  const filtered = useMemo(() => {
    const rows = data || [];
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.partner_name.toLowerCase().includes(q) ||
        (r.partner_phone || '').toLowerCase().includes(q) ||
        (r.partner_email || '').toLowerCase().includes(q) ||
        r.portfolio_code.toLowerCase().includes(q)
      );
    });
  }, [data, search, filter]);

  const counts = useMemo(() => {
    const rows = data || [];
    return {
      all: rows.length,
      awaiting_partner_details: rows.filter(r => r.status === 'awaiting_partner_details').length,
      pending_ops_approval: rows.filter(r => r.status === 'pending_ops_approval').length,
    };
  }, [data]);

  const handleApprove = async (row: Row) => {
    setApprovingId(row.id);
    try {
      const { data: res, error } = await supabase.functions.invoke('approve-pending-portfolio', {
        body: { portfolio_id: row.id },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      toast.success('Portfolio approved', {
        description: `${row.portfolio_code} is now active. Final agreement sent to ${row.partner_name}.`,
      });
      await queryClient.invalidateQueries({ queryKey: ['invited-portfolios'] });
      await queryClient.invalidateQueries({ queryKey: ['exec-partner-portfolios'] });
    } catch (err: any) {
      toast.error('Approval failed', { description: extractFromErrorObject(err) || err.message });
    } finally {
      setApprovingId(null);
    }
  };

  const isExpired = (row: Row) =>
    row.status === 'awaiting_partner_details' &&
    row.token_expires_at &&
    new Date(row.token_expires_at) < new Date() &&
    !row.token_consumed_at;

  return (
    <div className="space-y-3">
      {/* Header + refresh */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" />
            Invited Portfolios
          </h2>
          <p className="text-xs text-muted-foreground">
            Portfolios awaiting partner completion or Ops approval. Active portfolios move to the Portfolios tab.
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </Button>
      </div>

      {/* Search + status filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search partner name, phone, email, or portfolio code"
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {([
            { key: 'all', label: 'All' },
            { key: 'awaiting_partner_details', label: 'Awaiting partner' },
            { key: 'pending_ops_approval', label: 'Pending approval' },
          ] as { key: Filter; label: string }[]).map(({ key, label }) => {
            const count = counts[key];
            const active = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                )}
              >
                {label}
                <span className={cn('ml-1.5 text-[10px] font-bold', active ? 'opacity-80' : 'text-muted-foreground')}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Inbox className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium">No invited portfolios</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search || filter !== 'all'
                ? 'Nothing matches this filter.'
                : 'Send an invite from a partner\'s detail view to see it here.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const expired = isExpired(row);
            return (
              <Card key={row.id} className={cn('overflow-hidden', expired && 'border-destructive/40 bg-destructive/[0.02]')}>
                <CardContent className="p-3.5 space-y-3">
                  {/* Top: partner + status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{row.partner_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {row.partner_phone || row.partner_email || 'No contact on file'}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{row.portfolio_code}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {row.status === 'awaiting_partner_details' ? (
                        <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                          <Mail className="h-3 w-3" /> Awaiting partner
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] gap-1 border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400">
                          <ShieldCheck className="h-3 w-3" /> Pending Ops approval
                        </Badge>
                      )}
                      {expired && (
                        <Badge variant="outline" className="text-[10px] gap-1 border-destructive/40 bg-destructive/10 text-destructive">
                          <MailWarning className="h-3 w-3" /> Invite expired
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Amount</p>
                      <p className="font-bold">{formatUGX(row.investment_amount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">ROI</p>
                      <p className="font-semibold">{row.roi_percentage}%{row.roi_mode ? ` · ${row.roi_mode.replace(/_/g, ' ')}` : ''}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tenor</p>
                      <p className="font-semibold">{row.duration_months ?? '—'} mo</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Invited</p>
                      <p className="font-semibold" title={format(new Date(row.created_at), 'PPpp')}>
                        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>

                  {/* Approve action */}
                  {row.status === 'pending_ops_approval' && (
                    <div className="flex justify-end pt-1 border-t border-border/40">
                      <Button
                        size="sm"
                        className="gap-1.5 text-xs"
                        disabled={approvingId === row.id}
                        onClick={() => handleApprove(row)}
                      >
                        {approvingId === row.id
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Approving…</>
                          : <><ShieldCheck className="h-3.5 w-3.5" /> Approve & send final agreement</>}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}