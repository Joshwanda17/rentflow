import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserMinus } from 'lucide-react';
import { subDays } from 'date-fns';

interface ChurnRisk {
  investor_id: string;
  name: string;
  reason: string;
  severity: 'high' | 'medium' | 'low';
  invested: number;
  detail: string;
}

export function PartnerChurnAlerts() {
  const { data: alerts } = useQuery({
    queryKey: ['partner-churn-alerts'],
    queryFn: async () => {
      // Fetch portfolios with potential churn signals
      const { data: portfolios } = await supabase.from('investor_portfolios')
        .select('id, investor_id, agent_id, investment_amount, status, maturity_date, auto_reinvest, total_roi_earned, created_at')
        .in('status', ['active', 'matured']);

      // Fetch pending/recent withdrawals
      const { data: withdrawals } = await supabase.from('investment_withdrawal_requests')
        .select('user_id, amount, status, created_at')
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(200);

      // Get names
      const ids = new Set<string>();
      (portfolios || []).forEach(p => { if (p.investor_id) ids.add(p.investor_id); else ids.add(p.agent_id); });
      const nameMap = new Map<string, string>();
      const idArr = Array.from(ids);
      for (let i = 0; i < idArr.length; i += 50) {
        const { data } = await supabase.from('profiles').select('id, full_name').in('id', idArr.slice(i, i + 50));
        (data || []).forEach(p => nameMap.set(p.id, p.full_name));
      }

      const risks: ChurnRisk[] = [];
      const withdrawMap = new Map<string, number>();
      (withdrawals || []).forEach(w => {
        const current = withdrawMap.get(w.user_id) || 0;
        withdrawMap.set(w.user_id, current + (w.amount || 0));
      });

      // Group by investor
      const investorPortfolios = new Map<string, any[]>();
      (portfolios || []).forEach(p => {
        const iid = p.investor_id || p.agent_id;
        const arr = investorPortfolios.get(iid) || [];
        arr.push(p);
        investorPortfolios.set(iid, arr);
      });

      investorPortfolios.forEach((ports, investorId) => {
        const totalInvested = ports.reduce((s, p) => s + (p.investment_amount || 0), 0);
        const name = nameMap.get(investorId) || 'Unknown';

        // Signal 1: Has pending withdrawal
        const withdrawAmount = withdrawMap.get(investorId) || 0;
        if (withdrawAmount > 0) {
          const pct = withdrawAmount / totalInvested;
          risks.push({
            investor_id: investorId, name,
            reason: 'Pending withdrawal',
            severity: pct > 0.5 ? 'high' : 'medium',
            invested: totalInvested,
            detail: `${(pct * 100).toFixed(0)}% of capital (${(withdrawAmount / 1e6).toFixed(1)}M)`,
          });
        }

        // Signal 2: Matured without auto-reinvest
        const maturedNoReinvest = ports.filter(p => p.status === 'matured' && !p.auto_reinvest);
        if (maturedNoReinvest.length > 0) {
          risks.push({
            investor_id: investorId, name,
            reason: 'Matured, no auto-reinvest',
            severity: 'medium',
            invested: totalInvested,
            detail: `${maturedNoReinvest.length} portfolio(s) matured`,
          });
        }

        // Signal 3: Low/no ROI earned (stale)
        const noROI = ports.every(p => (p.total_roi_earned || 0) === 0);
        const oldEnough = ports.some(p => new Date(p.created_at) < subDays(new Date(), 60));
        if (noROI && oldEnough) {
          risks.push({
            investor_id: investorId, name,
            reason: 'No ROI earned (60+ days)',
            severity: 'low',
            invested: totalInvested,
            detail: 'Zero returns may cause exit',
          });
        }
      });

      return risks.sort((a, b) => {
        const sev = { high: 3, medium: 2, low: 1 };
        return sev[b.severity] - sev[a.severity] || b.invested - a.invested;
      }).slice(0, 20);
    },
    staleTime: 600000,
  });

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  if (!alerts || alerts.length === 0) return null;

  const highCount = alerts.filter(a => a.severity === 'high').length;

  return (
    <Card className={highCount > 0 ? 'border-destructive/30' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <UserMinus className="h-4 w-4 text-destructive" />
          Churn Risk Alerts
          <Badge variant={highCount > 0 ? 'destructive' : 'secondary'} className="ml-auto text-[10px]">{alerts.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 max-h-64 overflow-y-auto">
        {alerts.map((alert, i) => (
          <div key={`${alert.investor_id}-${i}`} className={`flex items-center gap-2.5 rounded-lg border p-2 text-sm ${
            alert.severity === 'high' ? 'border-destructive/40 bg-destructive/5' :
            alert.severity === 'medium' ? 'border-amber-400/40 bg-amber-500/5' :
            'border-border bg-card'
          }`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className={`text-[8px] ${
                  alert.severity === 'high' ? 'text-destructive border-destructive/30' :
                  alert.severity === 'medium' ? 'text-amber-600 border-amber-300' :
                  'text-muted-foreground'
                }`}>
                  {alert.severity === 'high' ? '🔴' : alert.severity === 'medium' ? '🟡' : '🔵'} {alert.severity}
                </Badge>
                <span className="text-xs font-medium truncate">{alert.name}</span>
                <span className="text-[10px] text-muted-foreground">{fmt(alert.invested)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">{alert.reason} · {alert.detail}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
