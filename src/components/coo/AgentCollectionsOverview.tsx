import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatUGX } from '@/lib/rentCalculations';
import { Loader2, Users } from 'lucide-react';
import { startOfDay, startOfWeek, startOfMonth } from 'date-fns';

interface AgentSummary {
  agentId: string;
  agentName: string;
  todayAmount: number;
  weekAmount: number;
  monthAmount: number;
  visitCount: number;
  paymentCount: number;
}

export default function AgentCollectionsOverview() {
  const todayISO = startOfDay(new Date()).toISOString();
  const weekISO = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
  const monthISO = startOfMonth(new Date()).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ['coo-agent-collections-overview'],
    queryFn: async () => {
      const [collectionsRes, visitsRes] = await Promise.all([
        supabase.from('agent_collections').select('agent_id, amount, created_at'),
        supabase.from('agent_visits').select('agent_id, id'),
      ]);

      const collections = collectionsRes.data || [];
      const visits = visitsRes.data || [];

      // Get unique agent IDs first, then fetch only those profiles
      const agentIds = [...new Set(collections.map(c => c.agent_id))];
      
      const profileMap = new Map<string, string>();
      if (agentIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', agentIds);
        for (const p of profiles || []) {
          profileMap.set(p.id, p.full_name || 'Unnamed Agent');
        }
      }

      const agentMap = new Map<string, AgentSummary>();

      for (const c of collections) {
        const existing = agentMap.get(c.agent_id) || {
          agentId: c.agent_id,
          agentName: profileMap.get(c.agent_id) || 'Unnamed Agent',
          todayAmount: 0, weekAmount: 0, monthAmount: 0, visitCount: 0, paymentCount: 0,
        };
        const d = c.created_at;
        if (d >= monthISO) existing.monthAmount += c.amount;
        if (d >= weekISO) existing.weekAmount += c.amount;
        if (d >= todayISO) existing.todayAmount += c.amount;
        existing.paymentCount++;
        agentMap.set(c.agent_id, existing);
      }

      for (const v of visits) {
        const existing = agentMap.get(v.agent_id);
        if (existing) existing.visitCount++;
      }

      return [...agentMap.values()].sort((a, b) => b.monthAmount - a.monthAmount);
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> Agent Collections Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : !data || data.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">No agent collections recorded</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[120px]">Agent</TableHead>
                  <TableHead className="text-right min-w-[90px]">Today</TableHead>
                  <TableHead className="text-right min-w-[100px]">This Week</TableHead>
                  <TableHead className="text-right min-w-[100px]">This Month</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Payments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map(a => (
                  <TableRow key={a.agentId}>
                    <TableCell className="font-medium text-sm">{a.agentName}</TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap">{formatUGX(a.todayAmount)}</TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap">{formatUGX(a.weekAmount)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold whitespace-nowrap">{formatUGX(a.monthAmount)}</TableCell>
                    <TableCell className="text-right text-sm">{a.visitCount}</TableCell>
                    <TableCell className="text-right text-sm">{a.paymentCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
