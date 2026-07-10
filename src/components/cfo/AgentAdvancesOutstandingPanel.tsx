import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatUGX } from '@/lib/agentAdvanceCalculations';
import { AlertTriangle, TrendingUp, Users, Loader2, HandCoins } from 'lucide-react';
import { differenceInDays } from 'date-fns';

interface AdvanceRow {
  id: string;
  agent_id: string;
  principal: number;
  outstanding_balance: number;
  arrears_balance: number;
  status: string;
  issued_at: string;
  expires_at: string;
  profiles: { full_name: string | null; phone: string | null } | null;
}

export function AgentAdvancesOutstandingPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['cfo-outstanding-advances'],
    queryFn: async (): Promise<AdvanceRow[]> => {
      const { data, error } = await supabase
        .from('agent_advances')
        .select('id, agent_id, principal, outstanding_balance, arrears_balance, status, issued_at, expires_at, profiles:agent_id (full_name, phone)')
        .in('status', ['active', 'overdue'])
        .gt('outstanding_balance', 0)
        .order('outstanding_balance', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AdvanceRow[];
    },
    refetchOnWindowFocus: false,
  });

  const rows = data || [];

  const summary = useMemo(() => {
    const active = rows.filter(r => r.status === 'active');
    const overdue = rows.filter(r => r.status === 'overdue');
    const sum = (list: AdvanceRow[]) => list.reduce((t, r) => t + Number(r.outstanding_balance || 0), 0);
    const uniqueAgents = new Set(rows.map(r => r.agent_id)).size;
    return {
      totalOutstanding: sum(rows),
      activeOutstanding: sum(active),
      overdueOutstanding: sum(overdue),
      activeCount: active.length,
      overdueCount: overdue.length,
      uniqueAgents,
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <HandCoins className="h-3.5 w-3.5" /> Total Outstanding
            </div>
            <p className="text-xl font-bold mt-1">{formatUGX(summary.totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Active ({summary.activeCount})
            </div>
            <p className="text-xl font-bold mt-1">{formatUGX(summary.activeOutstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Overdue ({summary.overdueCount})
            </div>
            <p className="text-xl font-bold mt-1 text-destructive">{formatUGX(summary.overdueOutstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Users className="h-3.5 w-3.5" /> Agents
            </div>
            <p className="text-xl font-bold mt-1">{summary.uniqueAgents}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HandCoins className="h-4 w-4 text-primary" />
            Agents with Outstanding Advances
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No agents currently have outstanding advances.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => {
                  const overdueDays = differenceInDays(new Date(), new Date(r.expires_at));
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.profiles?.full_name || 'Unknown Agent'}</div>
                        {r.profiles?.phone && (
                          <div className="text-xs text-muted-foreground">{r.profiles.phone}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'overdue' ? 'destructive' : 'secondary'} className="capitalize">
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatUGX(Number(r.principal))}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatUGX(Number(r.outstanding_balance))}
                        {Number(r.arrears_balance || 0) > 0 && (
                          <div className="text-[10px] font-medium text-amber-600" title="Missed repayments — auto-recovered from the agent's next earnings">
                            {formatUGX(Number(r.arrears_balance))} arrears
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                        {r.status === 'overdue' && overdueDays > 0 ? `+${overdueDays}d over` : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}