import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, UserPlus, AlertTriangle, CalendarClock, DollarSign, CheckCircle2, type LucideIcon } from 'lucide-react';
import { format, subHours } from 'date-fns';

export function PartnerOpsBrief() {
  const { data } = useQuery({
    queryKey: ['partner-ops-brief'],
    queryFn: async () => {
      const since = subHours(new Date(), 24).toISOString();

      const [
        newPortfoliosRes,
        pendingApprovalsRes,
        { data: maturingSoon },
        { data: recentROI },
        escalationsRes,
      ] = await Promise.all([
        supabase.from('investor_portfolios').select('*', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('investor_portfolios').select('*', { count: 'exact', head: true }).eq('status', 'pending_approval'),
        supabase.from('investor_portfolios').select('id').eq('status', 'active')
          .lte('maturity_date', format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd')),
        supabase.from('supporter_roi_payments').select('roi_amount').gte('due_date', since).eq('status', 'paid'),
        supabase.from('partner_escalations').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      ]);

      const roiPaid24h = (recentROI || []).reduce((s, p) => s + (p.roi_amount || 0), 0);

      return {
        newPortfolios: newPortfolios || 0,
        pendingApprovals: pendingApprovals || 0,
        maturingSoon: (maturingSoon || []).length,
        roiPaid24h,
        openEscalations: escalations || 0,
      };
    },
    staleTime: 300000,
  });

  if (!data) return null;

  const items = [
    { icon: UserPlus, label: 'New Portfolios (24h)', value: data.newPortfolios, color: 'text-blue-500' },
    { icon: AlertTriangle, label: 'Pending Approval', value: data.pendingApprovals, color: data.pendingApprovals > 0 ? 'text-amber-500' : 'text-muted-foreground' },
    { icon: CalendarClock, label: 'Maturing in 7 days', value: data.maturingSoon, color: data.maturingSoon > 0 ? 'text-orange-500' : 'text-muted-foreground' },
    { icon: DollarSign, label: 'ROI Paid (24h)', value: data.roiPaid24h > 0 ? `${(data.roiPaid24h / 1e3).toFixed(0)}K` : '0', color: 'text-green-500' },
    { icon: CheckCircle2, label: 'Open Escalations', value: data.openEscalations, color: data.openEscalations > 0 ? 'text-red-500' : 'text-green-500' },
  ];

  return (
    <Card className="bg-gradient-to-r from-primary/5 to-transparent border-primary/20">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Daily Partners Brief
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-2">
          {items.map(item => (
            <div key={item.label} className="text-center">
              <item.icon className={`h-4 w-4 mx-auto mb-0.5 ${item.color}`} />
              <p className="text-lg font-bold">{item.value}</p>
              <p className="text-[9px] text-muted-foreground leading-tight">{item.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
