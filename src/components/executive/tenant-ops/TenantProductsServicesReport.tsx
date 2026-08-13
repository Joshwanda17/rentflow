import { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowDownRight, ArrowUpRight, Download, FileText, Loader2, Minus, RefreshCw, Search,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useTenantProductsReport, useTenantProductsRows, fetchAllTenantProductsRows, pctChange,
} from '@/hooks/useTenantProductsReport';
import { downloadTenantProductsReportPdf, downloadTenantProductsCsv } from '@/lib/tenantProductsReportPdf';

const eatToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return parts; // yyyy-mm-dd
};

const isoDay = (d: Date) => format(d, 'yyyy-MM-dd');
const ugx = (n: number) => `UGX ${Math.round(Number(n || 0)).toLocaleString()}`;

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  const p = pctChange(Number(current || 0), Number(previous || 0));
  if (p === null) return <span className="text-[11px] text-muted-foreground">no prior activity</span>;
  const up = p > 0;
  const good = invert ? !up : up;
  const Icon = p === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${p === 0 ? 'text-muted-foreground' : good ? 'text-emerald-600' : 'text-destructive'}`}>
      <Icon className="h-3 w-3" />
      {`${up ? '+' : ''}${p.toFixed(1)}%`}
      <span className="font-normal text-muted-foreground">vs prev</span>
    </span>
  );
}

function Kpi({ label, value, current, previous, invert, hint }: {
  label: string; value: string; current?: number; previous?: number; invert?: boolean; hint?: string;
}) {
  return (
    <Card className="border-border/70">
      <CardContent className="p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-bold leading-tight">{value}</p>
        <div className="mt-1 min-h-[16px]">
          {current !== undefined && previous !== undefined && (
            <Delta current={current} previous={previous} invert={invert} />
          )}
        </div>
        {hint && <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function TenantProductsServicesReport() {
  const today = eatToday();
  const [preset, setPreset] = useState<Preset>('today');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const [search, setSearch] = useState('');
  const [district, setDistrict] = useState('all');
  const [status, setStatus] = useState('all');
  const [payment, setPayment] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [exporting, setExporting] = useState<null | 'pdf' | 'csv'>(null);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    setPage(1);
    const t = new Date(`${today}T12:00:00`);
    if (p === 'today') { setFrom(today); setTo(today); }
    else if (p === 'yesterday') { const y = isoDay(subDays(t, 1)); setFrom(y); setTo(y); }
    else if (p === '7d') { setFrom(isoDay(subDays(t, 6))); setTo(today); }
    else if (p === '30d') { setFrom(isoDay(subDays(t, 29))); setTo(today); }
    else if (p === 'month') { setFrom(`${today.slice(0, 7)}-01`); setTo(today); }
  };

  const { data: report, isLoading, isFetching, refetch, error } = useTenantProductsReport(from, to);
  const rowFilters = { search, district, agentId: null, status, payment, page, pageSize };
  const { data: rowData, isLoading: rowsLoading } = useTenantProductsRows(from, to, rowFilters);

  const rows = rowData?.rows ?? [];
  const total = rowData?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const chartData = useMemo(
    () => (report?.series ?? []).map((s) => ({
      day: format(new Date(`${s.day}T12:00:00`), 'dd MMM'),
      collected: Number(s.collected || 0),
      payables: Number(s.payables || 0),
      new_tenants: Number(s.new_tenants || 0),
      applications: Number(s.applications || 0),
      paid_tenants: Number(s.paid_tenants || 0),
    })),
    [report],
  );

  const statusOptions = useMemo(
    () => Array.from(new Set((report?.application_status ?? []).map((s) => s.status))).filter(Boolean),
    [report],
  );
  const districtOptions = useMemo(
    () => Array.from(new Set((report?.districts ?? []).map((d) => d.district))).filter((d) => d && d !== 'Unmapped'),
    [report],
  );

  const handleExport = async (kind: 'pdf' | 'csv') => {
    if (!report) return;
    setExporting(kind);
    try {
      const all = await fetchAllTenantProductsRows(from, to, { search, district, agentId: null, status, payment });
      if (kind === 'pdf') downloadTenantProductsReportPdf(report, all);
      else downloadTenantProductsCsv(report, all);
      toast.success(`Exported ${all.length.toLocaleString()} tenant rows`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          Could not load the report: {(error as any)?.message ?? 'unknown error'}
        </CardContent>
      </Card>
    );
  }

  const c = report?.current;
  const p = report?.previous;

  return (
    <div className="space-y-3">
      {/* Range controls */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {([['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month']] as [Preset, string][]).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={preset === id ? 'default' : 'outline'}
                className="h-8 text-xs"
                onClick={() => applyPreset(id)}
              >
                {label}
              </Button>
            ))}
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={from}
                max={to}
                onChange={(e) => { setFrom(e.target.value); setPreset('custom'); setPage(1); }}
                className="h-8 w-[140px] text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={to}
                min={from}
                onChange={(e) => { setTo(e.target.value); setPreset('custom'); setPage(1); }}
                className="h-8 w-[140px] text-xs"
              />
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={!report || exporting !== null} onClick={() => handleExport('pdf')}>
                {exporting === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                PDF
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={!report || exporting !== null} onClick={() => handleExport('csv')}>
                {exporting === 'csv' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                CSV
              </Button>
            </div>
          </div>
          {report && (
            <p className="text-[11px] text-muted-foreground">
              {format(new Date(`${report.period.from}T12:00:00`), 'dd MMM yyyy')} → {format(new Date(`${report.period.to}T12:00:00`), 'dd MMM yyyy')} (East Africa Time) ·
              {' '}compared with {format(new Date(`${report.period.previous_from}T12:00:00`), 'dd MMM')} → {format(new Date(`${report.period.previous_to}T12:00:00`), 'dd MMM yyyy')} ·
              {' '}tenant register {report.tenant_register_total.toLocaleString()} accounts
            </p>
          )}
        </CardContent>
      </Card>

      {/* Core metrics */}
      {isLoading || !c || !p ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-[92px]" />)}
        </div>
      ) : (
        <>
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Core metrics</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <Kpi label="New Tenants" value={c.new_tenants.toLocaleString()} current={c.new_tenants} previous={p.new_tenants} hint="Tenant accounts created in the window" />
              <Kpi label="Active Tenants" value={c.active_tenants.toLocaleString()} current={c.active_tenants} previous={p.active_tenants} hint="Tenants who paid at least once in the window" />
              <Kpi label="Applications" value={c.applications.toLocaleString()} current={c.applications} previous={p.applications} hint="Rent requests created in the window" />
              <Kpi label="Accepted" value={c.accepted.toLocaleString()} current={c.accepted} previous={p.accepted} hint="Requests that reached final approval" />
              <Kpi label="Rejected" value={c.rejected.toLocaleString()} current={c.rejected} previous={p.rejected} invert hint="Requests rejected in the window" />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Financial KPIs</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <Kpi label="Rent Collected" value={ugx(c.collected)} current={c.collected} previous={p.collected} hint={`${c.payments.toLocaleString()} payments recorded`} />
              <Kpi label="Receivables (money in)" value={ugx(c.collected)} current={c.collected} previous={p.collected} hint="Rent received from tenants in the window" />
              <Kpi label="Payables raised" value={ugx(c.payables)} current={c.payables} previous={p.payables} invert hint={`${c.payable_tenants.toLocaleString()} tenants' landlord payouts`} />
              <Kpi label="Payables still unpaid" value={ugx(report!.outstanding_payables)} hint={`${report!.outstanding_payables_count.toLocaleString()} landlord payouts not yet completed (all-time)`} />
              <Kpi
                label="Acceptance rate"
                value={`${c.applications ? Math.round((c.accepted / c.applications) * 100) : 0}%`}
                hint="Accepted ÷ applications in the window"
              />
            </div>
          </div>

          {/* Trends */}
          <div className="grid gap-2 lg:grid-cols-2">
            <Card>
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm">Money in vs landlord payouts</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                      <Tooltip formatter={(v: any) => ugx(Number(v))} />
                      <Area type="monotone" dataKey="collected" name="Collected" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                      <Area type="monotone" dataKey="payables" name="Landlord payouts" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive) / 0.15)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm">Tenants & applications per day</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="new_tenants" name="New tenants" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="applications" name="Applications" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="paid_tenants" name="Paying tenants" fill="hsl(142 70% 40%)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Districts */}
          {report!.districts.length > 0 && (
            <Card>
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-sm">Top districts by rent collected</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="flex flex-wrap gap-1.5">
                  {report!.districts.map((d) => (
                    <Badge key={d.district} variant="outline" className="text-[11px] font-normal">
                      {d.district} · {ugx(d.collected)} · {d.paying_tenants} tenants
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Tenant table */}
      <Card>
        <CardHeader className="p-3 pb-0">
          <CardTitle className="text-sm">Tenants in this window {total > 0 && <span className="font-normal text-muted-foreground">({total.toLocaleString()})</span>}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search tenant, phone, agent or district"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="h-8 pl-7 text-xs"
              />
            </div>
            <Select value={district} onValueChange={(v) => { setDistrict(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="District" /></SelectTrigger>
              <SelectContent className="z-[200]">
                <SelectItem value="all">All districts</SelectItem>
                {districtOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Application status" /></SelectTrigger>
              <SelectContent className="z-[200]">
                <SelectItem value="all">All statuses</SelectItem>
                {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={payment} onValueChange={(v) => { setPayment(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[200]">
                <SelectItem value="all">Paid & unpaid</SelectItem>
                <SelectItem value="paid">Paid in window</SelectItem>
                <SelectItem value="unpaid">No payment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-2">Tenant</th>
                  <th className="py-1.5 pr-2">District</th>
                  <th className="py-1.5 pr-2">Agent</th>
                  <th className="py-1.5 pr-2">Type</th>
                  <th className="py-1.5 pr-2">Application</th>
                  <th className="py-1.5 pr-2 text-right">Paid</th>
                  <th className="py-1.5 pr-2 text-right">Outstanding</th>
                  <th className="py-1.5 pr-2 text-right">Landlord payout</th>
                </tr>
              </thead>
              <tbody>
                {rowsLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}><td colSpan={8} className="py-1"><Skeleton className="h-6 w-full" /></td></tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No tenants matched this window and filters.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.tenant_id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">
                      <span className="font-medium">{r.tenant_name ?? '—'}</span>
                      <span className="block text-[10px] text-muted-foreground">{r.tenant_phone ?? '—'}</span>
                    </td>
                    <td className="py-1.5 pr-2">{r.district ?? '—'}</td>
                    <td className="py-1.5 pr-2">{r.agent_name ?? 'Unassigned'}</td>
                    <td className="py-1.5 pr-2">
                      {r.is_new_in_period
                        ? <Badge className="h-5 bg-primary/10 text-primary text-[10px] font-medium">New</Badge>
                        : <span className="text-muted-foreground">Existing</span>}
                    </td>
                    <td className="py-1.5 pr-2">
                      <span>{r.application_status ?? '—'}</span>
                      {r.accepted_in_period && <Badge variant="outline" className="ml-1 h-5 text-[10px]">accepted</Badge>}
                      {r.rejected_in_period && <Badge variant="destructive" className="ml-1 h-5 text-[10px]">rejected</Badge>}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-medium">{Number(r.paid_in_period) > 0 ? ugx(r.paid_in_period) : '—'}</td>
                    <td className="py-1.5 pr-2 text-right">{Number(r.outstanding) > 0 ? ugx(r.outstanding) : '—'}</td>
                    <td className="py-1.5 pr-2 text-right">{Number(r.payables_in_period) > 0 ? ugx(r.payables_in_period) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">Page {page} of {pages}</p>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>Previous</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page >= pages} onClick={() => setPage((v) => v + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default TenantProductsServicesReport;
