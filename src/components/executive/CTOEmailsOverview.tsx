import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import {
  Mail, Send, AlertTriangle, Clock, Users, Ban, TrendingUp, Inbox,
  ShieldAlert,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';

interface EmailOverview {
  rangeDays: number;
  kpis: {
    total: number;
    totalSent: number;
    totalFailed: number;
    totalBounced: number;
    totalPending: number;
    totalSuppressed: number;
    suppressedTotal: number;
    deliveryRate: number;
    uniqueRecipients: number;
    topErrorCategory: string | null;
    topErrorCategoryCount: number;
    distinctErrorCategories: number;
  };
  series: { day: string; sent: number; failed: number; pending: number; total: number }[];
  templateSummary: { template: string; total: number; sent: number; failed: number; pending: number; lastSentAt: string | null }[];
  recent: { id: string; template_name: string; recipient_email: string; status: string; error_message: string | null; created_at: string }[];
  errorCategories: { category: string; count: number }[];
  topErrorMessages: { message: string; count: number; category: string; lastSeen: string }[];
}

const RANGE_OPTIONS = [
  { label: '7d', value: 7 },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

export function CTOEmailsOverview() {
  const [days, setDays] = useState(30);

  const { data, isLoading, error } = useQuery({
    queryKey: ['cto-email-overview', days],
    queryFn: async () => {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cto-email-overview?days=${days}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as EmailOverview;
    },
    staleTime: 60_000,
  });

  const kpis = data?.kpis;

  const templateColumns: Column<EmailOverview['templateSummary'][number]>[] = [
    { key: 'template', label: 'Template' },
    { key: 'total', label: 'Total', render: (v) => Number(v).toLocaleString() },
    {
      key: 'sent',
      label: 'Sent',
      render: (v) => <span className="text-green-600 font-medium">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'failed',
      label: 'Failed',
      render: (v) => (
        <span className={Number(v) > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
          {Number(v).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'pending',
      label: 'Pending',
      render: (v) => <span className="text-amber-600">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'lastSentAt',
      label: 'Last Activity',
      render: (v) => (v ? format(new Date(v as string), 'dd MMM HH:mm') : '—'),
    },
  ];

  const recentColumns: Column<EmailOverview['recent'][number]>[] = [
    { key: 'created_at', label: 'Time', render: (v) => format(new Date(v as string), 'dd MMM HH:mm') },
    { key: 'template_name', label: 'Template' },
    { key: 'recipient_email', label: 'Recipient', className: 'max-w-[220px] truncate' },
    {
      key: 'status',
      label: 'Status',
      render: (v) => {
        const s = String(v);
        const cls =
          s === 'sent' ? 'bg-green-500/10 text-green-600' :
          s === 'failed' || s === 'dlq' || s === 'bounced' ? 'bg-destructive/10 text-destructive' :
          s === 'pending' ? 'bg-amber-500/10 text-amber-700' :
          'bg-muted text-muted-foreground';
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{s}</span>;
      },
    },
    { key: 'error_message', label: 'Error', className: 'max-w-[260px] truncate text-xs text-muted-foreground' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Emails Overview
          </h2>
          <p className="text-xs text-muted-foreground">
            Sent, delivered, failed, and queued transactional emails over the last {data?.rangeDays ?? days} days.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {RANGE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={days === opt.value ? 'default' : 'ghost'}
              className="h-7 px-3 text-xs"
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load email overview: {(error as Error).message}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <KPICard
          title="Total Emails"
          value={(kpis?.total ?? 0).toLocaleString()}
          icon={Inbox}
          loading={isLoading}
          subtitle={`Last ${data?.rangeDays ?? days} days`}
        />
        <KPICard
          title="Delivered"
          value={(kpis?.totalSent ?? 0).toLocaleString()}
          icon={Send}
          loading={isLoading}
          color="bg-green-500/10 text-green-600"
          subtitle={kpis ? `${kpis.deliveryRate}% delivery rate` : undefined}
        />
        <KPICard
          title="Failed / Bounced"
          value={((kpis?.totalFailed ?? 0) + (kpis?.totalBounced ?? 0)).toLocaleString()}
          icon={AlertTriangle}
          loading={isLoading}
          color="bg-destructive/10 text-destructive"
          subtitle="Requires attention"
        />
        <KPICard
          title="Pending in Queue"
          value={(kpis?.totalPending ?? 0).toLocaleString()}
          icon={Clock}
          loading={isLoading}
          color="bg-amber-500/10 text-amber-600"
        />
        <KPICard
          title="Unique Recipients"
          value={(kpis?.uniqueRecipients ?? 0).toLocaleString()}
          icon={Users}
          loading={isLoading}
          color="bg-blue-500/10 text-blue-600"
        />
        <KPICard
          title="Delivery Rate"
          value={kpis ? `${kpis.deliveryRate}%` : '—'}
          icon={TrendingUp}
          loading={isLoading}
          color={
            kpis && kpis.deliveryRate >= 90
              ? 'bg-green-500/10 text-green-600'
              : kpis && kpis.deliveryRate >= 70
              ? 'bg-amber-500/10 text-amber-600'
              : 'bg-destructive/10 text-destructive'
          }
        />
        <KPICard
          title="Suppressed"
          value={(kpis?.suppressedTotal ?? 0).toLocaleString()}
          icon={Ban}
          loading={isLoading}
          color="bg-rose-500/10 text-rose-600"
          subtitle="Bounce / unsubscribe / complaint"
        />
        <KPICard
          title="Templates Used"
          value={(data?.templateSummary?.length ?? 0).toLocaleString()}
          icon={Mail}
          loading={isLoading}
          color="bg-violet-500/10 text-violet-600"
        />
        <KPICard
          title="Top Error Category"
          value={kpis?.topErrorCategory ?? '—'}
          icon={ShieldAlert}
          loading={isLoading}
          color="bg-orange-500/10 text-orange-600"
          subtitle={
            kpis && kpis.topErrorCategoryCount > 0
              ? `${kpis.topErrorCategoryCount.toLocaleString()} of ${(kpis.totalFailed + kpis.totalBounced).toLocaleString()} failures • ${kpis.distinctErrorCategories} categories`
              : 'No failures in range'
          }
        />
      </div>

      {/* Line Graph */}
      <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Email Volume Trend</h3>
          <span className="text-[10px] text-muted-foreground">Daily • last {data?.rangeDays ?? days} days</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data?.series ?? []}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="day"
              className="text-xs"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => format(new Date(v), 'dd MMM')}
            />
            <YAxis className="text-xs" tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => format(new Date(v as string), 'EEE dd MMM yyyy')}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="sent" name="Sent" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="failed" name="Failed" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="pending" name="Pending" stroke="hsl(38 92% 50%)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Template summary table */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Summary by Template</h3>
        <ExecutiveDataTable
          data={data?.templateSummary ?? []}
          columns={templateColumns}
          loading={isLoading}
          title="Templates"
        />
      </div>

      {/* Failure breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-orange-600" />
            Failures by Error Category
          </h3>
          <ExecutiveDataTable
            data={data?.errorCategories ?? []}
            columns={[
              { key: 'category', label: 'Category' },
              {
                key: 'count',
                label: 'Count',
                render: (v) => <span className="font-medium text-destructive">{Number(v).toLocaleString()}</span>,
              },
              {
                key: 'count',
                label: 'Share',
                render: (v) => {
                  const totalFails = (data?.errorCategories ?? []).reduce((sum, c) => sum + c.count, 0);
                  const pct = totalFails > 0 ? Math.round((Number(v) / totalFails) * 1000) / 10 : 0;
                  return <span className="text-muted-foreground">{pct}%</span>;
                },
              },
            ]}
            loading={isLoading}
            title="Categories"
          />
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Top Error Messages
          </h3>
          <ExecutiveDataTable
            data={data?.topErrorMessages ?? []}
            columns={[
              {
                key: 'message',
                label: 'Error',
                className: 'max-w-[360px] truncate text-xs',
              },
              { key: 'category', label: 'Category', render: (v) => <span className="text-xs text-muted-foreground">{String(v)}</span> },
              {
                key: 'count',
                label: 'Count',
                render: (v) => <span className="font-medium text-destructive">{Number(v).toLocaleString()}</span>,
              },
              {
                key: 'lastSeen',
                label: 'Last Seen',
                render: (v) => (v ? format(new Date(v as string), 'dd MMM HH:mm') : '—'),
              },
            ]}
            loading={isLoading}
            title="Top 10 errors"
          />
        </div>
      </div>

      {/* Recent emails table */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Recent Emails</h3>
        <ExecutiveDataTable
          data={data?.recent ?? []}
          columns={recentColumns}
          loading={isLoading}
          title="Latest 100 emails"
          filters={[{
            key: 'status',
            label: 'Status',
            options: [
              { value: 'sent', label: 'Sent' },
              { value: 'failed', label: 'Failed' },
              { value: 'pending', label: 'Pending' },
              { value: 'dlq', label: 'DLQ' },
              { value: 'bounced', label: 'Bounced' },
              { value: 'suppressed', label: 'Suppressed' },
            ],
          }]}
        />
      </div>
    </div>
  );
}