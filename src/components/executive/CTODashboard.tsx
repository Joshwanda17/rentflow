import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { Server, Activity, ShieldAlert, Users, Bug, Wifi, Database, Clock } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { format, subDays } from 'date-fns';

export function CTODashboard() {
  const { data: activeUsers, isLoading } = useQuery({
    queryKey: ['exec-active-users'],
    queryFn: async () => {
      const since = subDays(new Date(), 7).toISOString();
      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
        .gte('last_active_at', since);
      return count || 0;
    },
    staleTime: 600000,
  });

  const { data: totalProfiles } = useQuery({
    queryKey: ['exec-total-profiles'],
    queryFn: async () => {
      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    staleTime: 600000,
  });

  const { data: recentNotifications, isLoading: loadingNotifs } = useQuery({
    queryKey: ['exec-system-notifs'],
    queryFn: async () => {
      const { data } = await supabase.from('notifications').select('id, title, message, type, created_at')
        .order('created_at', { ascending: false }).limit(50);
      return data || [];
    },
    staleTime: 600000,
  });

  const errorCount = (recentNotifications || []).filter(n => n.type === 'error' || n.type === 'alert').length;
  const securityAlerts = (recentNotifications || []).filter(n => n.type === 'security' || n.title?.toLowerCase().includes('fraud')).length;

  // Mock uptime & performance data (would come from monitoring in prod)
  const uptimeData = Array.from({ length: 7 }, (_, i) => ({
    day: format(subDays(new Date(), 6 - i), 'EEE'),
    uptime: 99.5 + Math.random() * 0.5,
    latency: 80 + Math.random() * 120,
  }));

  const notifsColumns: Column<any>[] = [
    { key: 'created_at', label: 'Time', render: (v) => v ? format(new Date(v as string), 'dd MMM HH:mm') : '—' },
    { key: 'type', label: 'Type', render: (v) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted'}`}>
        {String(v)}
      </span>
    )},
    { key: 'title', label: 'Title' },
    { key: 'message', label: 'Details', className: 'max-w-[200px] truncate' },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard title="System Uptime" value="99.8%" icon={Server} color="bg-green-500/10 text-green-600" />
        <KPICard title="Active Users (7d)" value={(activeUsers || 0).toLocaleString()} icon={Users} loading={isLoading} color="bg-blue-500/10 text-blue-600" />
        <KPICard title="Total Users" value={(totalProfiles || 0).toLocaleString()} icon={Activity} loading={isLoading} />
        <KPICard title="API Latency (p95)" value="142ms" icon={Clock} color="bg-orange-500/10 text-orange-600" />
        <KPICard title="Error Count" value={errorCount} icon={Bug} color="bg-destructive/10 text-destructive" />
        <KPICard title="Security Alerts" value={securityAlerts} icon={ShieldAlert} color="bg-amber-500/10 text-amber-600" />
        <KPICard title="DB Query Load" value="Normal" icon={Database} color="bg-teal-500/10 text-teal-600" />
        <KPICard title="Network Status" value="Healthy" icon={Wifi} color="bg-emerald-500/10 text-emerald-600" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Uptime (7-day)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={uptimeData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" className="text-xs" />
              <YAxis domain={[99, 100]} className="text-xs" />
              <Tooltip />
              <Line type="monotone" dataKey="uptime" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">API Latency (ms)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={uptimeData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Line type="monotone" dataKey="latency" stroke="hsl(var(--chart-2, var(--primary)))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* System Logs */}
      <div>
        <h3 className="text-sm font-semibold mb-3">System Notifications</h3>
        <ExecutiveDataTable
          data={recentNotifications || []}
          columns={notifsColumns}
          loading={loadingNotifs}
          title="System Logs"
          filters={[{
            key: 'type',
            label: 'Type',
            options: [
              { value: 'error', label: 'Error' },
              { value: 'alert', label: 'Alert' },
              { value: 'info', label: 'Info' },
              { value: 'security', label: 'Security' },
            ],
          }]}
        />
      </div>
    </div>
  );
}
