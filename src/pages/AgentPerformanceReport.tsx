import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Users, CheckCircle2, PieChart as PieIcon, AlertTriangle, TrendingUp,
  Wallet, Banknote, ShieldAlert, Phone, MapPin, Calendar, UserCog, Printer, Download,
  Building2, XCircle, Clock, ArrowUpRight, ArrowDownRight, Activity, Target, FileText,
  AlertCircle, Gauge,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import welileLogo from '@/assets/welile-logo.png';
import { cn } from '@/lib/utils';

// ============= DUMMY DATA =============
const agent = {
  name: 'Akampurira Onesmus',
  id: 'AGT-0021',
  branch: 'Kampala Central',
  phone: '+256 776 123 456',
  joined: '15 Jan 2024',
  supervisor: 'Nakanwagi Brenda',
  avatar: '',
};

const period = { range: 'May 7 – May 13, 2026', generated: 'May 13, 2026 09:45' };

const summaryKpis = [
  { label: 'Active Tenants', value: '43', icon: Users, tone: 'blue' },
  { label: 'Paying Tenants Today', value: '21', icon: CheckCircle2, tone: 'green' },
  { label: 'Portfolio Occupancy', value: '48.8%', icon: PieIcon, tone: 'blue' },
  { label: 'Total Outstanding Debt', value: 'UGX 14,320,000', icon: FileText, tone: 'red' },
  { label: 'Weekly Collection Rate', value: '62%', icon: TrendingUp, tone: 'amber' },
  { label: 'Wallet Balance', value: 'UGX 231,400', icon: Wallet, tone: 'blue' },
  { label: 'Float Balance', value: 'UGX 150,000', icon: Banknote, tone: 'green' },
  { label: 'Risk Status', value: 'CRITICAL', icon: ShieldAlert, tone: 'red' },
] as const;

const dailyKpis = [
  { label: 'Expected Today', value: 'UGX 480,000', tone: 'blue' },
  { label: 'Collected Today', value: 'UGX 312,000', tone: 'green' },
  { label: 'Daily Gap', value: 'UGX 168,000', tone: 'red' },
  { label: 'Collection Efficiency', value: '65%', tone: 'amber' },
  { label: 'Tenants Expected Today', value: '18', tone: 'blue' },
  { label: 'Tenants Who Paid', value: '11', tone: 'green' },
  { label: 'Missed Payments', value: '7', tone: 'red' },
  { label: 'Partial Payments', value: '3', tone: 'amber' },
];

const dailyTenants = [
  { tenant: 'John Doe', unit: 'B12', expected: 20000, paid: 20000, balance: 0, status: 'Paid' },
  { tenant: 'Sarah Namuli', unit: 'A04', expected: 15000, paid: 0, balance: 15000, status: 'Missed' },
  { tenant: 'Peter Kato', unit: 'C10', expected: 25000, paid: 10000, balance: 15000, status: 'Partial' },
  { tenant: 'Mariam N.', unit: 'A07', expected: 20000, paid: 20000, balance: 0, status: 'Paid' },
  { tenant: 'David S.', unit: 'B08', expected: 18000, paid: 0, balance: 18000, status: 'Missed' },
];

const weeklyKpis = [
  { label: 'Weekly Expected', value: 'UGX 3,200,000', tone: 'blue' },
  { label: 'Weekly Collected', value: 'UGX 2,140,000', tone: 'green' },
  { label: 'Weekly Outstanding', value: 'UGX 1,060,000', tone: 'red' },
  { label: 'Weekly Efficiency', value: '66.8%', tone: 'amber' },
  { label: 'Weekly Growth', value: '+12% ↑', tone: 'green' },
  { label: 'Arrears Recovered', value: 'UGX 540,000', tone: 'green' },
];

const weeklyTrend = [
  { day: 'May 7', Expected: 400000, Collected: 280000 },
  { day: 'May 8', Expected: 450000, Collected: 320000 },
  { day: 'May 9', Expected: 480000, Collected: 300000 },
  { day: 'May 10', Expected: 520000, Collected: 340000 },
  { day: 'May 11', Expected: 500000, Collected: 280000 },
  { day: 'May 12', Expected: 450000, Collected: 300000 },
  { day: 'May 13', Expected: 400000, Collected: 312000 },
];

const debtSummary = [
  { label: 'Total Outstanding Debt', value: 'UGX 14,320,000', icon: FileText, tone: 'red' },
  { label: 'Current Month Arrears', value: 'UGX 4,100,000', icon: Calendar, tone: 'amber' },
  { label: 'Old Arrears (> 30 Days)', value: 'UGX 10,220,000', icon: Clock, tone: 'red' },
  { label: 'Highest Debtor', value: 'UGX 1,200,000', icon: AlertTriangle, tone: 'red' },
  { label: 'Recovery Rate (This Month)', value: '23%', icon: Activity, tone: 'amber' },
];

const debtAging = [
  { name: '0–30 Days', value: 4100000, color: '#3b82f6' },
  { name: '31–60 Days', value: 3600000, color: '#f59e0b' },
  { name: '61–90 Days', value: 2900000, color: '#fbbf24' },
  { name: '90+ Days', value: 3720000, color: '#ef4444' },
];

const topDefaulters = [
  { tenant: 'Isaac Mutebi', debt: 1200000, daysLate: 48, last: 'Apr 2, 2026' },
  { tenant: 'Brian Ssemanda', debt: 860000, daysLate: 31, last: 'Apr 18, 2026' },
  { tenant: 'Frank N.', debt: 750000, daysLate: 29, last: 'Apr 20, 2026' },
  { tenant: 'Mariam N.', debt: 620000, daysLate: 27, last: 'Apr 22, 2026' },
  { tenant: 'David S.', debt: 580000, daysLate: 25, last: 'Apr 24, 2026' },
];

const debtKpiStrip = [
  { label: 'Tenants in Arrears', value: '22', sub: '(51.2%)', icon: Users, tone: 'red' },
  { label: 'Avg. Debt per Tenant', value: 'UGX 333,023', icon: Banknote, tone: 'amber' },
  { label: '% of Portfolio in Arrears', value: '33.3%', icon: Target, tone: 'red' },
  { label: 'Debt Trend (vs Last Week)', value: '+5.6%', icon: ArrowUpRight, tone: 'red' },
];

const kpiScorecard = [
  { kpi: 'Daily Collection Efficiency', weight: 35, score: 65 },
  { kpi: 'Weekly Performance', weight: 25, score: 66.8 },
  { kpi: 'Debt Recovery', weight: 20, score: 43 },
  { kpi: 'Tenant Retention', weight: 10, score: 80 },
  { kpi: 'Missed Payment Rate', weight: 10, score: 40 },
];

const statusGuide = [
  { range: '85 – 100', status: 'Excellent', desc: 'Outstanding performance', color: 'text-emerald-600' },
  { range: '70 – 84', status: 'Good', desc: 'Good performance', color: 'text-green-600' },
  { range: '50 – 69', status: 'Warning', desc: 'Needs improvement', color: 'text-amber-600' },
  { range: 'Below 50', status: 'Critical', desc: 'Immediate action required', color: 'text-red-600' },
];

// ============= STYLING HELPERS =============
const toneText: Record<string, string> = {
  blue: 'text-blue-600',
  green: 'text-emerald-600',
  red: 'text-red-600',
  amber: 'text-amber-600',
};
const toneBg: Record<string, string> = {
  blue: 'bg-blue-50',
  green: 'bg-emerald-50',
  red: 'bg-red-50',
  amber: 'bg-amber-50',
};

const fmtUGX = (n: number) => `UGX ${n.toLocaleString()}`;

// ============= REUSABLE COMPONENTS =============
function SectionCard({ index, title, right, children }: { index: number; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-blue-600 text-white text-xs font-bold shrink-0">{index}</span>
          <h2 className="text-sm sm:text-base font-bold tracking-wide text-slate-800 uppercase truncate">{title}</h2>
        </div>
        {right}
      </header>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

function KpiCard({ icon: Icon, label, value, tone = 'blue', sub }: { icon?: any; label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="group rounded-xl border border-slate-200 bg-white p-3.5 hover:shadow-md hover:border-slate-300 transition-all min-w-0">
      <div className="flex items-start gap-2.5">
        {Icon && (
          <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', toneBg[tone])}>
            <Icon className={cn('h-4 w-4', toneText[tone])} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-slate-500 leading-tight uppercase tracking-wide">{label}</p>
          <p className={cn('text-lg sm:text-xl font-bold mt-1 leading-tight truncate', toneText[tone])}>{value}</p>
          {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, tone = 'blue', currency }: { label: string; value: string; tone?: string; currency?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 hover:shadow-sm transition-all">
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide leading-tight">{label}</p>
      {currency && <p className="text-[10px] text-slate-400 mt-1.5">UGX</p>}
      <p className={cn('text-lg sm:text-xl font-bold mt-0.5 leading-tight', toneText[tone])}>{value}</p>
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    Paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Missed: 'bg-red-100 text-red-700 border-red-200',
    Partial: 'bg-amber-100 text-amber-700 border-amber-200',
  };
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border', map[s] || 'bg-slate-100 text-slate-700')}>
      {s}
    </span>
  );
}

// ============= GAUGE =============
function PerformanceGauge({ score }: { score: number }) {
  const angle = (score / 100) * 180;
  const rad = (180 - angle) * (Math.PI / 180);
  const cx = 110, cy = 110, r = 80;
  const needleX = cx + r * Math.cos(rad);
  const needleY = cy - r * Math.sin(rad);
  const status = score >= 85 ? 'EXCELLENT' : score >= 70 ? 'GOOD' : score >= 50 ? 'WARNING' : 'CRITICAL';
  const statusColor = score >= 85 ? 'text-emerald-600' : score >= 70 ? 'text-green-600' : score >= 50 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 220 140" className="w-full max-w-[260px]">
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        {/* Track */}
        <path d={`M 30 110 A 80 80 0 0 1 190 110`} fill="none" stroke="#e2e8f0" strokeWidth="18" strokeLinecap="round" />
        {/* Colored arc */}
        <path d={`M 30 110 A 80 80 0 0 1 190 110`} fill="none" stroke="url(#gaugeGrad)" strokeWidth="18" strokeLinecap="round" />
        {/* Tick labels */}
        <text x="20" y="130" className="fill-slate-500" fontSize="10">0</text>
        <text x="50" y="40" className="fill-slate-500" fontSize="10">25</text>
        <text x="105" y="22" className="fill-slate-500" fontSize="10">50</text>
        <text x="160" y="40" className="fill-slate-500" fontSize="10">75</text>
        <text x="190" y="130" className="fill-slate-500" fontSize="10">100</text>
        {/* Needle */}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="6" fill="#0f172a" />
      </svg>
      <div className="text-center mt-1">
        <p className="text-3xl font-bold text-slate-900">{score}<span className="text-base text-slate-500"> / 100</span></p>
        <p className={cn('text-sm font-bold tracking-wider mt-1', statusColor)}>{status}</p>
      </div>
    </div>
  );
}

// ============= MAIN PAGE =============
export default function AgentPerformanceReport() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const overrideName = params.get('name');
  const displayAgent = { ...agent, name: overrideName || agent.name };

  const totalDebt = useMemo(() => debtAging.reduce((s, d) => s + d.value, 0), []);
  const totalScore = useMemo(
    () => Math.round(kpiScorecard.reduce((s, r) => s + (r.score * r.weight) / 100, 0)),
    []
  );

  return (
    <div className="min-h-screen bg-slate-50/60 print:bg-white">
      {/* ===== STICKY HEADER ===== */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200 shadow-sm print:static print:shadow-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0 print:hidden">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <img src={welileLogo} alt="Welile" className="h-9 w-auto shrink-0" />
          <div className="hidden md:block flex-1 text-center min-w-0">
            <h1 className="text-lg lg:text-2xl font-bold tracking-tight text-slate-900 truncate">AGENT PERFORMANCE REPORT</h1>
            <p className="text-xs text-slate-500">Performance Overview and Collection Intelligence</p>
          </div>
          <div className="hidden sm:block text-right shrink-0">
            <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Report Period</p>
            <p className="text-sm font-bold text-blue-600">{period.range}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Generated: {period.generated}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
              <Printer className="h-4 w-4" /> <span className="hidden sm:inline">Print</span>
            </Button>
            <Button size="sm" className="gap-1.5">
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export PDF</span>
            </Button>
          </div>
        </div>
        <div className="md:hidden text-center pb-2 px-4">
          <h1 className="text-base font-bold tracking-tight text-slate-900">AGENT PERFORMANCE REPORT</h1>
          <p className="text-[11px] text-slate-500">{period.range}</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* ===== SECTION 1: AGENT SUMMARY ===== */}
        <SectionCard index={1} title="Agent Summary">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Profile */}
            <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 flex flex-col sm:flex-row lg:flex-col items-center sm:items-start lg:items-center gap-4 text-center sm:text-left lg:text-center">
              <div className="h-24 w-24 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center text-3xl font-bold shrink-0 ring-4 ring-blue-100">
                {displayAgent.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate-900">{displayAgent.name}</h3>
                <p className="text-sm text-slate-500">Agent ID: <span className="text-blue-600 font-semibold">{displayAgent.id}</span></p>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-600 text-left">
                  <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-slate-400" /> Branch: {displayAgent.branch}</li>
                  <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400" /> {displayAgent.phone}</li>
                  <li className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-slate-400" /> Joined: {displayAgent.joined}</li>
                  <li className="flex items-center gap-2"><UserCog className="h-3.5 w-3.5 text-slate-400" /> Supervisor: {displayAgent.supervisor}</li>
                </ul>
              </div>
            </div>
            {/* KPI grid */}
            <div className="lg:col-span-8">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {summaryKpis.map(k => (
                  <KpiCard key={k.label} icon={k.icon} label={k.label} value={k.value} tone={k.tone} />
                ))}
              </div>
            </div>
          </div>

          {/* Score bars */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-700">Recovery Score</span>
                <span className="text-xs font-bold text-red-600">43/100</span>
              </div>
              <Progress value={43} className="h-2 [&>div]:bg-red-500" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-700">Performance Score</span>
                <span className="text-xs font-bold text-amber-600">{totalScore}/100</span>
              </div>
              <Progress value={totalScore} className="h-2 [&>div]:bg-amber-500" />
            </div>
          </div>
        </SectionCard>

        {/* ===== SECTIONS 2 & 3 SIDE BY SIDE: Daily / Weekly ===== */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* SECTION 2: DAILY */}
          <SectionCard index={2} title="Daily Performance" right={<span className="text-xs text-slate-500 hidden sm:inline">Date: May 13, 2026 (Today)</span>}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {dailyKpis.map(k => <MiniMetric key={k.label} label={k.label} value={k.value} tone={k.tone} />)}
            </div>

            <div className="mt-5">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Daily Tenant Breakdown</h4>
              <div className="rounded-xl border border-slate-200 overflow-hidden max-h-[320px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="text-xs">Tenant</TableHead>
                      <TableHead className="text-xs">Unit</TableHead>
                      <TableHead className="text-xs text-right">Expected</TableHead>
                      <TableHead className="text-xs text-right">Paid</TableHead>
                      <TableHead className="text-xs text-right">Balance</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyTenants.map((t, i) => (
                      <TableRow key={i} className={cn('hover:bg-blue-50/40', i % 2 === 1 && 'bg-slate-50/60')}>
                        <TableCell className="font-medium text-sm">{t.tenant}</TableCell>
                        <TableCell className="text-sm text-slate-600">{t.unit}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{t.expected.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{t.paid.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-semibold">{t.balance.toLocaleString()}</TableCell>
                        <TableCell><StatusBadge s={t.status} /></TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-blue-50/50 font-bold">
                      <TableCell colSpan={2} className="text-blue-700 text-sm">TOTAL</TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-blue-700">98,000</TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-blue-700">50,000</TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-blue-700">48,000</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </SectionCard>

          {/* SECTION 3: WEEKLY */}
          <SectionCard index={3} title="Weekly Performance" right={<span className="text-xs text-slate-500 hidden sm:inline">{period.range}</span>}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {weeklyKpis.map(k => <MiniMetric key={k.label} label={k.label} value={k.value} tone={k.tone} />)}
            </div>

            <div className="mt-5">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Weekly Collection Trend</h4>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={weeklyTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${v / 1000}K`} />
                    <Tooltip
                      formatter={(v: number) => fmtUGX(v)}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="Expected" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="Collected" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-2 px-2 text-xs border-t border-slate-100 mt-2">
                  <span className="text-slate-500">Total Expected: <span className="font-bold text-blue-600">UGX 3,200,000</span></span>
                  <span className="text-slate-500">Total Collected: <span className="font-bold text-emerald-600">UGX 2,140,000</span></span>
                  <span className="text-slate-500">Efficiency: <span className="font-bold text-amber-600">66.8%</span></span>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ===== SECTION 4: DEBT SUMMARY ===== */}
        <SectionCard index={4} title="Outstanding Balance / Debt Summary">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left */}
            <div className="lg:col-span-4 space-y-2.5">
              {debtSummary.map(d => (
                <div key={d.label} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:shadow-sm transition-all">
                  <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', toneBg[d.tone])}>
                    <d.icon className={cn('h-4 w-4', toneText[d.tone])} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">{d.label}</p>
                  </div>
                  <p className={cn('text-sm font-bold tabular-nums shrink-0', toneText[d.tone])}>{d.value}</p>
                </div>
              ))}
            </div>
            {/* Center: Pie */}
            <div className="lg:col-span-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 text-center">Debt Aging Analysis</h4>
              <div className="relative">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={debtAging} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {debtAging.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmtUGX(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-xl font-bold text-slate-900">{(totalDebt / 1_000_000).toFixed(2)}M</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total Debt</p>
                </div>
              </div>
              <ul className="mt-2 space-y-1">
                {debtAging.map(d => {
                  const pct = ((d.value / totalDebt) * 100).toFixed(1);
                  return (
                    <li key={d.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />{d.name}</span>
                      <span className="tabular-nums text-slate-600"><span className="font-semibold text-slate-900">{d.value.toLocaleString()}</span> ({pct}%)</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            {/* Right: Top defaulters */}
            <div className="lg:col-span-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Top Defaulters</h4>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs">Tenant</TableHead>
                      <TableHead className="text-xs text-right">Debt</TableHead>
                      <TableHead className="text-xs text-right">Days Late</TableHead>
                      <TableHead className="text-xs">Last Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topDefaulters.map((t, i) => (
                      <TableRow key={i} className="hover:bg-red-50/30">
                        <TableCell className="text-sm font-medium">{t.tenant}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-semibold">{t.debt.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          <span className={cn('font-bold', t.daysLate >= 40 ? 'text-red-600' : t.daysLate >= 30 ? 'text-orange-600' : 'text-amber-600')}>{t.daysLate}</span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{t.last}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* Bottom KPI strip */}
          <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {debtKpiStrip.map(k => (
              <KpiCard key={k.label} icon={k.icon} label={k.label} value={k.value} tone={k.tone} sub={k.sub} />
            ))}
          </div>
        </SectionCard>

        {/* ===== SECTION 5: PERFORMANCE SCORING ===== */}
        <SectionCard index={5} title="Performance Scoring">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left: KPI Scorecard */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">KPI Scorecard</h4>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs">KPI</TableHead>
                      <TableHead className="text-xs text-right">Weight</TableHead>
                      <TableHead className="text-xs text-right">Score</TableHead>
                      <TableHead className="text-xs text-right">Weighted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kpiScorecard.map((r, i) => (
                      <TableRow key={i} className="hover:bg-slate-50/60">
                        <TableCell className="text-sm font-medium">{r.kpi}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{r.weight}%</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{r.score}%</TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-semibold">{((r.score * r.weight) / 100).toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-blue-50/60 font-bold">
                      <TableCell colSpan={3} className="text-sm text-blue-700">TOTAL PERFORMANCE SCORE</TableCell>
                      <TableCell className="text-right text-sm text-red-600 tabular-nums">{totalScore} / 100</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
            {/* Center: Gauge */}
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 text-center flex items-center justify-center gap-1.5">
                <Gauge className="h-3.5 w-3.5" /> Performance Gauge
              </h4>
              <PerformanceGauge score={totalScore} />
            </div>
            {/* Right: Status guide */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Performance Status Guide</h4>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs">Score Range</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statusGuide.map((s, i) => (
                      <TableRow key={i} className="hover:bg-slate-50/60">
                        <TableCell className="text-sm tabular-nums">{s.range}</TableCell>
                        <TableCell className={cn('text-sm font-bold', s.color)}>{s.status}</TableCell>
                        <TableCell className="text-xs text-slate-600">{s.desc}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ===== INSIGHT BAR ===== */}
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            <span className="font-bold">Insight:</span> Collections below target and high outstanding debt require immediate action.
          </p>
        </div>

        <footer className="flex items-center justify-between text-[11px] text-slate-500 pt-2 pb-6">
          <span>Generated by Welile</span>
          <span>Page 1 of 1</span>
        </footer>
      </main>
    </div>
  );
}
