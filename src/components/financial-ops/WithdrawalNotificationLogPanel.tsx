import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatDynamic } from '@/lib/currencyFormat';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { format } from 'date-fns';
import { Bell, Search, Loader2, RefreshCw, X } from 'lucide-react';

type LogRow = {
  id: string;
  withdrawal_id: string | null;
  recipient_id: string | null;
  recipient_email: string | null;
  amount: number | null;
  status: string | null;
  error_message: string | null;
  created_at: string;
};

function statusColor(status?: string | null) {
  switch ((status || '').toLowerCase()) {
    case 'sent':
      return 'bg-emerald-500/10 text-emerald-600';
    case 'failed':
    case 'error':
      return 'bg-destructive/10 text-destructive';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

/**
 * Withdrawal Notification Log — admin audit of every merchant withdrawal
 * alert email. Filter by recipient (email), amount range and timestamp
 * window so delivery failures can be traced quickly.
 * Access is RLS-restricted to manager / super_admin / cto roles.
 */
export function WithdrawalNotificationLogPanel() {
  const [recipient, setRecipient] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const debouncedRecipient = useDebouncedValue(recipient, 300);

  const { data: rows = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['withdrawal-notification-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('withdrawal_notification_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as LogRow[];
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const q = debouncedRecipient.trim().toLowerCase();
    const min = minAmount.trim() === '' ? null : Number(minAmount);
    const max = maxAmount.trim() === '' ? null : Number(maxAmount);
    const from = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : null;
    const to = toDate ? new Date(toDate + 'T23:59:59.999').getTime() : null;

    return rows.filter((r) => {
      if (q && !(r.recipient_email || '').toLowerCase().includes(q)) return false;
      const amt = Number(r.amount ?? 0);
      if (min !== null && Number.isFinite(min) && amt < min) return false;
      if (max !== null && Number.isFinite(max) && amt > max) return false;
      const ts = new Date(r.created_at).getTime();
      if (from !== null && ts < from) return false;
      if (to !== null && ts > to) return false;
      return true;
    });
  }, [rows, debouncedRecipient, minAmount, maxAmount, fromDate, toDate]);

  const hasFilters = recipient || minAmount || maxAmount || fromDate || toDate;
  const clearFilters = () => {
    setRecipient('');
    setMinAmount('');
    setMaxAmount('');
    setFromDate('');
    setToDate('');
  };

  const sentCount = filtered.filter((r) => (r.status || '').toLowerCase() === 'sent').length;
  const failedCount = filtered.length - sentCount;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2.5">
          <Bell className="h-6 w-6 text-violet-600" />
          Withdrawal Notification Log
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Every merchant withdrawal-alert email — search by recipient, amount range and date to trace delivery failures.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Filters</CardTitle>
            <Button variant="outline" size="sm" className="gap-2 h-8" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search recipient email…"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="pl-10 h-11"
              type="email"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Min amount (UGX)</label>
              <Input inputMode="numeric" placeholder="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value.replace(/[^0-9.]/g, ''))} className="h-11" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Max amount (UGX)</label>
              <Input inputMode="numeric" placeholder="Any" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value.replace(/[^0-9.]/g, ''))} className="h-11" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">From date</label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-11" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">To date</label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-11" />
            </div>
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="gap-2 h-8" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="outline" className="px-3 py-1">{filtered.length} shown</Badge>
        <Badge className="bg-emerald-500/10 text-emerald-600 border-0 px-3 py-1">{sentCount} sent</Badge>
        <Badge className="bg-destructive/10 text-destructive border-0 px-3 py-1">{failedCount} failed</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No notification log entries match your filters.</div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[220px]">
                        <p className="truncate font-medium">{r.recipient_email || '—'}</p>
                        {r.error_message && (
                          <p className="text-[11px] text-destructive truncate" title={r.error_message}>{r.error_message}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap font-medium">{formatDynamic(Number(r.amount ?? 0))}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] px-1.5 py-0 border-0 ${statusColor(r.status)}`}>
                          {(r.status || 'unknown').replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(r.created_at), 'dd MMM yyyy, HH:mm')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}