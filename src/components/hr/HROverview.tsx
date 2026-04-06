import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Users, CalendarDays, Banknote, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function HROverview() {
  const { data: staffCount = 0 } = useQuery({
    queryKey: ['hr-staff-count'],
    queryFn: async () => {
      const { count } = await supabase.from('staff_profiles').select('*', { count: 'exact', head: true });
      return count || 0;
    },
  });

  const { data: pendingLeave = 0 } = useQuery({
    queryKey: ['hr-pending-leave'],
    queryFn: async () => {
      const { count } = await supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      return count || 0;
    },
  });

  const { data: activeDisciplinary = 0 } = useQuery({
    queryKey: ['hr-active-disciplinary'],
    queryFn: async () => {
      const { count } = await supabase.from('disciplinary_records').select('*', { count: 'exact', head: true }).eq('status', 'active');
      return count || 0;
    },
  });

  const { data: draftPayroll = 0 } = useQuery({
    queryKey: ['hr-draft-payroll'],
    queryFn: async () => {
      const { count } = await supabase.from('payroll_batches').select('*', { count: 'exact', head: true }).eq('status', 'draft');
      return count || 0;
    },
  });

  const { data: recentEvents = [] } = useQuery({
    queryKey: ['hr-recent-events'],
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .like('action_type', 'hr_%')
        .order('created_at', { ascending: false })
        .limit(10);
      return data || [];
    },
  });

  const kpis = [
    { label: 'Total Staff', value: staffCount, icon: Users, color: 'text-primary' },
    { label: 'Pending Leave', value: pendingLeave, icon: CalendarDays, color: 'text-warning' },
    { label: 'Draft Payroll', value: draftPayroll, icon: Banknote, color: 'text-success' },
    { label: 'Active Cases', value: activeDisciplinary, icon: AlertTriangle, color: 'text-destructive' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-foreground">HR Overview</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Recent HR Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent HR events</p>
          ) : (
            <div className="space-y-2">
              {recentEvents.map((event: any) => (
                <div key={event.id} className="flex justify-between items-center text-sm py-1.5 border-b border-border/30 last:border-0">
                  <span className="text-foreground font-medium">
                    {(event.action_type as string).replace('hr_', '').replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
