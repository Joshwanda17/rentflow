import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { TrendingUp, UserPlus, Target, Megaphone, BarChart3, Users, CalendarRange } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval, isBefore, isAfter } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function CMODashboard() {
  const now = new Date();
  const [startMonth, setStartMonth] = useState(format(subMonths(now, 5), 'yyyy-MM'));
  const [endMonth, setEndMonth] = useState(format(now, 'yyyy-MM'));

  const start = startOfMonth(new Date(startMonth + '-01'));
  const end = endOfMonth(new Date(endMonth + '-01'));
  const months = eachMonthOfInterval({ start, end });

  const { data: signupTrend, isLoading } = useQuery({
    queryKey: ['exec-signup-trend', startMonth, endMonth],
    queryFn: async () => {
      const results = [];
      for (const m of months) {
        const s = startOfMonth(m);
        const e = endOfMonth(m);
        const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
          .gte('created_at', s.toISOString()).lte('created_at', e.toISOString());
        results.push({ month: format(s, 'MMM yyyy'), signups: count || 0 });
      }
      return results;
    },
    staleTime: 600000,
  });

  const { data: referralStats } = useQuery({
    queryKey: ['exec-referral-stats', startMonth, endMonth],
    queryFn: async () => {
      const { count: totalReferrals } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .not('referrer_id', 'is', null)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      const byMonth: Record<string, number> = {};
      for (const m of months) {
        const s = startOfMonth(m);
        const e = endOfMonth(m);
        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .not('referrer_id', 'is', null)
          .gte('created_at', s.toISOString())
          .lte('created_at', e.toISOString());
        byMonth[format(s, 'MMM yyyy')] = count || 0;
      }

      return { totalReferrals: totalReferrals || 0, byMonth };
    },
    staleTime: 600000,
  });

  const { data: totalUsers } = useQuery({
    queryKey: ['exec-total-users-cmo'],
    queryFn: async () => {
      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    staleTime: 600000,
  });

  const totalSignups = (signupTrend || []).reduce((s, m) => s + m.signups, 0);
  const lastMonth = signupTrend?.[signupTrend.length - 1]?.signups || 0;
  const prevMonth = signupTrend?.[signupTrend.length - 2]?.signups || 1;
  const growthRate = prevMonth > 0 ? Math.round(((lastMonth - prevMonth) / prevMonth) * 100) : 0;

  const referralData = signupTrend?.map(m => ({
    ...m,
    referrals: referralStats?.byMonth[m.month] || 0,
  })) || [];

  const recentSignupsColumns: Column<any>[] = [
    { key: 'created_at', label: 'Date', render: (v) => v ? format(new Date(v as string), 'dd MMM yy') : '—' },
    { key: 'full_name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'referrer_id', label: 'Referred', render: (v) => v ? '✓ Yes' : 'Organic' },
  ];

  const { data: recentUsers, isLoading: loadingUsers } = useQuery({
    queryKey: ['exec-recent-users', startMonth, endMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, phone, referrer_id, created_at')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false })
        .limit(200);
      return data || [];
    },
    staleTime: 600000,
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="start-month" className="text-xs">From</Label>
          <Input
            id="start-month"
            type="month"
            value={startMonth}
            onChange={(e) => {
              const val = e.target.value;
              if (val <= endMonth) setStartMonth(val);
            }}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="end-month" className="text-xs">To</Label>
          <Input
            id="end-month"
            type="month"
            value={endMonth}
            onChange={(e) => {
              const val = e.target.value;
              if (val >= startMonth) setEndMonth(val);
            }}
            className="w-40"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const n = new Date();
            setStartMonth(format(subMonths(n, 5), 'yyyy-MM'));
            setEndMonth(format(n, 'yyyy-MM'));
          }}
        >
          <CalendarRange className="w-4 h-4 mr-1" />
          Last 6 Months
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <KPICard title="Total Users" value={(totalUsers || 0).toLocaleString()} icon={Users} loading={isLoading} />
        <KPICard title="Monthly Signups" value={lastMonth} icon={UserPlus} loading={isLoading} color="bg-green-500/10 text-green-600" trend={{ value: growthRate, label: 'vs prev month' }} />
        <KPICard title="Referral Signups" value={referralStats?.totalReferrals || 0} icon={Megaphone} color="bg-purple-500/10 text-purple-600" />
        <KPICard title="Conversion Rate" value={totalUsers ? `${Math.round((referralStats?.totalReferrals || 0) / totalUsers * 100)}%` : '0%'} icon={Target} color="bg-orange-500/10 text-orange-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <h3 className="text-sm font-semibold mb-3">Signup Growth</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={signupTrend || []}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Area type="monotone" dataKey="signups" fill="hsl(var(--primary)/0.2)" stroke="hsl(var(--primary))" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Referral Performance</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={referralData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar dataKey="referrals" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Recent Signups</h3>
        <ExecutiveDataTable data={recentUsers || []} columns={recentSignupsColumns} loading={loadingUsers} title="Signups" />
      </div>
    </div>
  );
}
