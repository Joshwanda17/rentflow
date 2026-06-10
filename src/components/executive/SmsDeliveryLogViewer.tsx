import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { KPICard } from './KPICard';
import { SmsFailoverAlerts } from './SmsFailoverAlerts';
import { MessageSquare, Search, Loader2, CheckCircle2, XCircle, Radio, CalendarDays, CalendarRange, Calendar, FileDown } from 'lucide-react';
import { format, formatDistanceToNow, subDays, startOfWeek, startOfMonth, startOfDay } from 'date-fns';
import { downloadAuditPdf } from '@/lib/pdfAuditReport';
import { toast } from 'sonner';

type SmsLog = {
  id: string;
  created_at: string;
  recipient_phone: string;
  recipient_name: string | null;
  message: string | null;
  status: string;
  provider: string;
  provider_response: any;
  reference_id: string | null;
  source: string | null;
  error: string | null;
};

const PROVIDER_LABEL: Record<string, string> = {
  yoola: 'Yoola',
  africastalking: "Africa's Talking",
  africas_talking: "Africa's Talking",
};

function providerLabel(p: string) {
  return PROVIDER_LABEL[(p || '').toLowerCase()] || p || 'Unknown';
}

function providerColor(p: string) {
  const v = (p || '').toLowerCase();
  if (v === 'yoola') return 'bg-primary/10 text-primary border-0';
  if (v.includes('africa')) return 'bg-amber-500/10 text-amber-600 border-0';
  return 'bg-muted text-muted-foreground border-0';
}

function isSuccess(status: string) {
  const s = (status || '').toLowerCase();
  return s === 'sent' || s === 'success' || s === 'delivered' || s === 'accepted';
}

type MetricRow = { created_at: string; status: string; provider: string };

export function SmsDeliveryLogViewer() {
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [generating, setGenerating] = useState(false);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['cto-sms-delivery-log', providerFilter, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('sms_delivery_log')
        .select('id, created_at, recipient_phone, recipient_name, message, status, provider, provider_response, reference_id, source, error')
        .order('created_at', { ascending: false })
        .limit(300);
      if (providerFilter !== 'all') query = query.eq('provider', providerFilter);
      if (statusFilter === 'success') query = query.in('status', ['sent', 'success', 'delivered', 'accepted']);
      if (statusFilter === 'failed') query = query.not('status', 'in', '(sent,success,delivered,accepted)');
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SmsLog[];
    },
    staleTime: 30_000,
  });

  // Traffic metrics: fetch lightweight rows over the last 90 days for aggregation.
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['cto-sms-metrics'],
    queryFn: async () => {
      const since = subDays(startOfDay(new Date()), 89).toISOString();
      const { data, error } = await supabase
        .from('sms_delivery_log')
        .select('created_at, status, provider')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20000);
      if (error) throw error;
      return (data || []) as MetricRow[];
    },
    staleTime: 60_000,
  });

  const rows = metrics || [];
  const now = new Date();
  const dayStart = startOfDay(now).getTime();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }).getTime();
  const monthStart = startOfMonth(now).getTime();

  const countSince = (cutoff: number) => {
    let sent = 0, fail = 0;
    for (const r of rows) {
      if (new Date(r.created_at).getTime() < cutoff) continue;
      if (isSuccess(r.status)) sent++; else fail++;
    }
    return { total: sent + fail, sent, fail };
  };
  const today = countSince(dayStart);
  const thisWeek = countSince(weekStart);
  const thisMonth = countSince(monthStart);

  // Daily traffic chart (last 30 days), delivered vs failed.
  const dailyTraffic = (() => {
    const byDay: Record<string, { delivered: number; failed: number }> = {};
    for (let i = 29; i >= 0; i--) {
      byDay[format(subDays(now, i), 'yyyy-MM-dd')] = { delivered: 0, failed: 0 };
    }
    for (const r of rows) {
      const key = format(new Date(r.created_at), 'yyyy-MM-dd');
      if (!byDay[key]) continue;
      if (isSuccess(r.status)) byDay[key].delivered++; else byDay[key].failed++;
    }
    return Object.entries(byDay).map(([date, v]) => ({
      day: format(new Date(date), 'dd MMM'),
      delivered: v.delivered,
      failed: v.failed,
    }));
  })();

  const handleGenerateReport = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      // Pull a wider window directly for the report (last 90 days).
      const since = subDays(startOfDay(new Date()), 89).toISOString();
      const { data, error } = await supabase
        .from('sms_delivery_log')
        .select('created_at, status, provider')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(50000);
      if (error) throw error;
      const report = (data || []) as MetricRow[];
      if (report.length === 0) {
        toast.error('No SMS traffic in the last 90 days to report.');
        return;
      }
      // Per-day rollup.
      const agg: Record<string, { total: number; delivered: number; failed: number; yoola: number; at: number; other: number }> = {};
      for (const r of report) {
        const key = format(new Date(r.created_at), 'yyyy-MM-dd');
        agg[key] ||= { total: 0, delivered: 0, failed: 0, yoola: 0, at: 0, other: 0 };
        const a = agg[key];
        a.total++;
        if (isSuccess(r.status)) a.delivered++; else a.failed++;
        const p = (r.provider || '').toLowerCase();
        if (p === 'yoola') a.yoola++;
        else if (p.includes('africa')) a.at++;
        else a.other++;
      }
      const reportRows = Object.entries(agg)
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .map(([day, a]) => [
          format(new Date(day), 'dd MMM yyyy'),
          a.total,
          a.delivered,
          a.failed,
          a.total ? `${Math.round((a.delivered / a.total) * 100)}%` : '—',
          a.yoola,
          a.at,
          a.other,
        ]);
      const totalAll = report.length;
      const deliveredAll = report.filter((r) => isSuccess(r.status)).length;
      await downloadAuditPdf(
        `sms-otp-traffic-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`,
        ['Date', 'Total', 'Delivered', 'Failed', 'Success %', 'Yoola', "Africa's Talking", 'Other'],
        reportRows,
        {
          title: 'SMS / OTP Traffic Report',
          subtitle: 'Welile Technologies — CTO Communications',
          filters: [
            `Window: last 90 days (since ${format(new Date(since), 'dd MMM yyyy')})`,
            `Total messages: ${totalAll.toLocaleString()}`,
            `Delivered: ${deliveredAll.toLocaleString()} (${totalAll ? Math.round((deliveredAll / totalAll) * 100) : 0}%)`,
            `Today: ${today.total} · This week: ${thisWeek.total} · This month: ${thisMonth.total}`,
          ],
          footerLabel: 'Welile SMS/OTP Traffic',
        },
      );
      toast.success('SMS traffic report generated.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate report.');
    } finally {
      setGenerating(false);
    }
  };

  const filtered = search.trim()
    ? logs.filter((l) => {
        const q = search.trim().toLowerCase();
        return (
          (l.recipient_phone || '').toLowerCase().includes(q) ||
          (l.recipient_name || '').toLowerCase().includes(q) ||
          (l.source || '').toLowerCase().includes(q) ||
          (l.reference_id || '').toLowerCase().includes(q) ||
          (l.message || '').toLowerCase().includes(q)
        );
      })
    : logs;

  const total = logs.length;
  const yoolaSent = logs.filter((l) => (l.provider || '').toLowerCase() === 'yoola' && isSuccess(l.status)).length;
  const atSent = logs.filter((l) => (l.provider || '').toLowerCase().includes('africa') && isSuccess(l.status)).length;
  const failed = logs.filter((l) => !isSuccess(l.status)).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          OTP / SMS Delivery Logs
        </h2>
        <p className="text-xs text-muted-foreground">
          Per-provider audit trail — which gateway was attempted (Yoola primary → Africa's Talking fallback), timestamps, and final outcome.
        </p>
      </div>

      <SmsFailoverAlerts />

      {/* Traffic metrics — daily / weekly / monthly */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <KPICard
          title="Sent Today"
          value={today.total.toLocaleString()}
          icon={CalendarDays}
          color="bg-primary/10 text-primary"
          loading={metricsLoading}
          subtitle={`${today.sent} delivered · ${today.fail} failed`}
        />
        <KPICard
          title="This Week"
          value={thisWeek.total.toLocaleString()}
          icon={CalendarRange}
          color="bg-blue-500/10 text-blue-600"
          loading={metricsLoading}
          subtitle={`${thisWeek.sent} delivered · ${thisWeek.fail} failed`}
        />
        <KPICard
          title="This Month"
          value={thisMonth.total.toLocaleString()}
          icon={Calendar}
          color="bg-teal-500/10 text-teal-600"
          loading={metricsLoading}
          subtitle={`${thisMonth.sent} delivered · ${thisMonth.fail} failed`}
        />
      </div>

      {/* Daily traffic chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" /> Daily Traffic (30d)
            </CardTitle>
            <Button size="sm" variant="outline" onClick={handleGenerateReport} disabled={generating} className="h-8 text-xs gap-1.5">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              Generate Report
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {metricsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={dailyTraffic}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="delivered" name="Delivered" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="failed" name="Failed" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <KPICard title="Total (last 300)" value={total.toLocaleString()} icon={Radio} loading={isLoading} />
        <KPICard title="Yoola Delivered" value={yoolaSent.toLocaleString()} icon={CheckCircle2} color="bg-primary/10 text-primary" loading={isLoading} />
        <KPICard title="AT Fallback Delivered" value={atSent.toLocaleString()} icon={CheckCircle2} color="bg-amber-500/10 text-amber-600" loading={isLoading} />
        <KPICard title="Failed Attempts" value={failed.toLocaleString()} icon={XCircle} color={failed > 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'} loading={isLoading} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" /> Delivery Attempts
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search phone, name, source…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-xs" />
              </div>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Providers</SelectItem>
                  <SelectItem value="yoola">Yoola</SelectItem>
                  <SelectItem value="africastalking">Africa's Talking</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Delivered</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[600px]">
            {isLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No SMS delivery logs found</div>
            ) : (
              <div className="space-y-1.5">
                {filtered.map((log) => {
                  const ok = isSuccess(log.status);
                  const attempts: any[] = Array.isArray(log.provider_response?.attempts)
                    ? log.provider_response.attempts
                    : [];
                  return (
                    <div key={log.id} className="flex items-start gap-3 p-2.5 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                      <div className="mt-0.5">
                        {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className={`text-[10px] px-1.5 py-0 ${providerColor(log.provider)}`}>{providerLabel(log.provider)}</Badge>
                          <Badge variant={ok ? 'secondary' : 'destructive'} className="text-[10px] px-1.5 py-0">{log.status}</Badge>
                          {log.source && <span className="text-[10px] text-muted-foreground">via {log.source}</span>}
                        </div>
                        <p className="text-sm mt-0.5">
                          <span className="font-medium">{log.recipient_name || log.recipient_phone}</span>
                          {log.recipient_name && <span className="text-muted-foreground text-xs"> · {log.recipient_phone}</span>}
                        </p>
                        {log.error && <p className="text-[11px] text-destructive truncate">{log.error}</p>}
                        {attempts.length > 0 && (
                          <div className="mt-1 flex flex-col gap-0.5">
                            {attempts.map((a, i) => (
                              <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                                <span className="font-medium">{i + 1}.</span>
                                <Badge className={`text-[9px] px-1 py-0 ${providerColor(a.provider)}`}>{providerLabel(a.provider)}</Badge>
                                <span className={a.accepted ? 'text-emerald-600' : 'text-destructive'}>
                                  {a.accepted ? 'accepted' : a.attempted === false ? 'skipped' : 'failed'}
                                </span>
                                {a.reason && <span className="italic truncate">{a.reason}</span>}
                                {a.started_at && a.finished_at && (
                                  <span className="text-muted-foreground/60">
                                    ({Math.max(0, new Date(a.finished_at).getTime() - new Date(a.started_at).getTime())}ms)
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {log.reference_id && <p className="text-[10px] text-muted-foreground/70">Ref: {log.reference_id}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</p>
                        <p className="text-[10px] text-muted-foreground/60">{format(new Date(log.created_at), 'dd MMM HH:mm:ss')}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}