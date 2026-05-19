import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';

interface Entry {
  id: string;
  created_at: string;
  classification: string | null;
  category: string;
  direction: string;
  amount: number;
  description: string | null;
  transaction_group_id: string | null;
  linked_party: string | null;
}
interface DetailPayload {
  profile: {
    id: string;
    full_name: string | null;
    phone: string | null;
    cached_withdrawable: number | null;
    cached_float: number | null;
    cached_advance: number | null;
    cached_total: number | null;
  } | null;
  summary: {
    window_days: number;
    since: string;
    admin_net: number;
    admin_abs: number;
    admin_count: number;
    production_net: number;
    production_abs: number;
    production_count: number;
    strict_withdrawable: number;
  };
  entries: Entry[];
}

function signed(e: Entry): number {
  const positive = e.direction === 'cash_in' || e.direction === 'credit';
  return positive ? Number(e.amount) : -Number(e.amount);
}

function EntryTable({ entries, emptyLabel }: { entries: Entry[]; emptyLabel: string }) {
  if (entries.length === 0) {
    return <div className="p-4 text-center text-xs text-muted-foreground border rounded-md">{emptyLabel}</div>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-left">
          <tr>
            <th className="p-2">When</th>
            <th className="p-2">Category</th>
            <th className="p-2">Direction</th>
            <th className="p-2 text-right">Amount</th>
            <th className="p-2 text-right">Signed</th>
            <th className="p-2">Description</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const s = signed(e);
            return (
              <tr key={e.id} className="border-t align-top">
                <td className="p-2 whitespace-nowrap text-muted-foreground">
                  {format(new Date(e.created_at), 'MMM d HH:mm')}
                </td>
                <td className="p-2 font-mono">{e.category}</td>
                <td className="p-2">{e.direction}</td>
                <td className="p-2 text-right tabular-nums">{formatUGX(Number(e.amount))}</td>
                <td className={`p-2 text-right tabular-nums ${s < 0 ? 'text-destructive' : 'text-emerald-700'}`}>
                  {s < 0 ? '−' : '+'}
                  {formatUGX(Math.abs(s))}
                </td>
                <td className="p-2 max-w-[420px] truncate" title={e.description ?? ''}>
                  {e.description ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PhantomDriftDetailPage() {
  const { userId = '' } = useParams<{ userId: string }>();
  const [params] = useSearchParams();
  const windowDays = Math.max(1, Number(params.get('window') ?? 30) || 30);

  const { data, isLoading, error } = useQuery({
    queryKey: ['phantom-drift-detail', userId, windowDays],
    queryFn: async (): Promise<DetailPayload> => {
      const { data, error } = await supabase.rpc('get_phantom_correction_drift_detail', {
        p_user_id: userId,
        p_window_days: windowDays,
      });
      if (error) throw error;
      return data as unknown as DetailPayload;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const admin = useMemo(() => (data?.entries ?? []).filter((e) => e.classification === 'admin_correction'), [data]);
  const production = useMemo(() => (data?.entries ?? []).filter((e) => e.classification !== 'admin_correction'), [data]);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/cfo/dashboard">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to CFO Dashboard
        </Link>
      </Button>

      <Card className="border-amber-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Phantom Drift Drill-down
          </CardTitle>
          {data?.profile && (
            <p className="text-sm">
              <span className="font-medium">{data.profile.full_name || '—'}</span>{' '}
              <span className="text-muted-foreground">{data.profile.phone}</span>{' '}
              <span className="font-mono text-[11px] text-muted-foreground">{data.profile.id.slice(0, 8)}…</span>
            </p>
          )}
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading drill-down…
            </div>
          )}
          {error && (
            <div className="text-sm text-destructive">{(error as Error).message}</div>
          )}
          {data?.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">Window</div>
                <div className="text-sm font-semibold">{data.summary.window_days} days</div>
                <div className="text-[10px] text-muted-foreground">
                  since {format(new Date(data.summary.since), 'MMM d')}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">Admin / system net</div>
                <div className="text-sm font-semibold text-emerald-700">{formatUGX(data.summary.admin_net)}</div>
                <div className="text-[10px] text-muted-foreground">
                  |Σ| {formatUGX(data.summary.admin_abs)} · {data.summary.admin_count} entries
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">Production net</div>
                <div
                  className={`text-sm font-semibold ${data.summary.production_net < 0 ? 'text-destructive' : ''}`}
                >
                  {formatUGX(data.summary.production_net)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  |Σ| {formatUGX(data.summary.production_abs)} · {data.summary.production_count} entries
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">Cached / Strict W</div>
                <div className="text-sm font-semibold">
                  {formatUGX(data.profile?.cached_withdrawable ?? 0)} /{' '}
                  {formatUGX(data.summary.strict_withdrawable)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Float {formatUGX(data.profile?.cached_float ?? 0)}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            Admin / system corrections
            <Badge variant="destructive">{admin.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EntryTable entries={admin} emptyLabel="No admin corrections in this window." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            Real production activity
            <Badge variant="secondary">{production.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EntryTable entries={production} emptyLabel="No production activity in this window." />
        </CardContent>
      </Card>
    </div>
  );
}