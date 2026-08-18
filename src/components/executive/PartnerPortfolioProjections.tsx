import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { TrendingUp, Repeat, FileText, Users } from 'lucide-react';

interface PartnerRow {
  partner_id: string;
  partner_name: string;
  phone: string | null;
  portfolios: number;
  deployed: number;
  compounding_deployed: number;
  payout_deployed: number;
  expected_monthly_return: number;
  projected_monthly_payout: number;
  projected_compound_growth: number;
  roi_earned_to_date: number;
  next_roi_date: string | null;
  top_rate: number;
}

interface SeriesRow {
  month: string;
  projected_roi_payout: number;
  projected_compounding: number;
  promissory_expected: number;
}

const fmt = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : Math.round(n || 0).toLocaleString();

export function usePartnerCapitalProjections(months = 6) {
  return useQuery({
    queryKey: ['partner-capital-projections', months],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_partner_capital_projections', { p_months: months });
      if (error) throw error;
      const payload = (data || {}) as any;
      return {
        partners: (payload.partners || []) as PartnerRow[],
        series: (payload.series || []) as SeriesRow[],
        totals: (payload.totals || {}) as Record<string, number>,
      };
    },
    staleTime: 600000,
  });
}

export function ProjectedReturnsChart({ months = 6 }: { months?: number }) {
  const { data, isLoading } = usePartnerCapitalProjections(months);
  if (isLoading || !data) return <div className="h-[180px] rounded-lg bg-muted/40 animate-pulse" />;

  const t = data.totals;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-blue-500/10 p-2.5">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" />Projected ROI / month</p>
          <p className="text-base font-bold text-blue-600">UGX {fmt(Number(t.projected_monthly_payout || 0))}</p>
        </div>
        <div className="rounded-lg bg-violet-500/10 p-2.5">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Repeat className="h-3 w-3" />Compounding ({months}m)</p>
          <p className="text-base font-bold text-violet-600">UGX {fmt(Number(t.projected_compound_growth || 0))}</p>
        </div>
        <div className="rounded-lg bg-amber-500/10 p-2.5">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" />Notes receivable</p>
          <p className="text-base font-bold text-amber-600">UGX {fmt(Number(t.promissory_expected || 0))}</p>
        </div>
      </div>

      <div>
        <p className="text-[10px] text-muted-foreground mb-1">Forward obligations &amp; receivables — next {months} months (UGX)</p>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={data.series}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => fmt(v)} width={40} />
            <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => `UGX ${fmt(v)}`} />
            <Legend wrapperStyle={{ fontSize: 9 }} />
            <Bar dataKey="projected_roi_payout" name="Projected ROI payout" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            <Bar dataKey="projected_compounding" name="Projected compounding" fill="hsl(262 83% 58%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="promissory_expected" name="Promissory receivable" fill="hsl(38 92% 50%)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[9px] text-muted-foreground mt-1">
          ROI payout = flat monthly rate on payout-mode capital. Compounding = month-on-month growth on reinvesting capital. Receivables bucket unscheduled notes into the current month.
        </p>
      </div>
    </div>
  );
}

export function PartnerPortfolioTable({ months = 6 }: { months?: number }) {
  const { data, isLoading } = usePartnerCapitalProjections(months);
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const list = data?.partners || [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(p => `${p.partner_name} ${p.phone || ''}`.toLowerCase().includes(needle));
  }, [data, q]);

  if (isLoading) return <div className="h-[220px] rounded-lg bg-muted/40 animate-pulse" />;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search partner or phone…" className="h-8 text-xs" />
        <Badge variant="outline" className="text-[9px] whitespace-nowrap">
          <Users className="h-3 w-3 mr-1" />{rows.length} partners
        </Badge>
      </div>
      <ScrollArea className="h-[300px] rounded-md border">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur">
            <tr className="text-left">
              <th className="p-2 font-medium">Partner</th>
              <th className="p-2 font-medium text-right">Plans</th>
              <th className="p-2 font-medium text-right">Deployed</th>
              <th className="p-2 font-medium text-right">ROI / month</th>
              <th className="p-2 font-medium text-right">Compounding ({months}m)</th>
              <th className="p-2 font-medium text-right">Next payout</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.partner_id} className="border-t">
                <td className="p-2">
                  <p className="font-medium truncate max-w-[160px]">{p.partner_name}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {p.top_rate}% · {p.compounding_deployed > 0 ? 'compounding' : 'payout'}
                  </p>
                </td>
                <td className="p-2 text-right">{p.portfolios}</td>
                <td className="p-2 text-right font-medium">{fmt(Number(p.deployed))}</td>
                <td className="p-2 text-right text-blue-600">{fmt(Number(p.projected_monthly_payout))}</td>
                <td className="p-2 text-right text-violet-600">{fmt(Number(p.projected_compound_growth))}</td>
                <td className="p-2 text-right text-muted-foreground">{p.next_roi_date || '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No partners match.</td></tr>
            )}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}