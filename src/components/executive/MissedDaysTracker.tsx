import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { KPICard } from './KPICard';
import {
  CalendarX2, Search, RefreshCw, Users, Banknote,
  AlertTriangle, Phone, TrendingDown, Clock
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, differenceInDays, parseISO } from 'date-fns';

type SortBy = 'missed_days' | 'balance' | 'name';

interface TenantMissedData {
  tenant_id: string;
  tenant_name: string;
  phone: string;
  daily_repayment: number;
  rent_amount: number;
  amount_repaid: number;
  total_repayment: number;
  outstanding_balance: number;
  disbursed_at: string;
  days_since_disbursed: number;
  expected_repaid: number;
  missed_days: number;
  repayment_pct: number;
  agent_id: string;
  agent_name: string;
  agent_phone: string;
  tenant_wallet: number;
  agent_wallet: number;
}

export function MissedDaysTracker() {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('missed_days');
  const [riskFilter, setRiskFilter] = useState<'all' | 'critical' | 'warning' | 'on_track'>('all');

  // Fetch active rent requests
  const { data: activeRequests, isLoading: reqLoading, refetch } = useQuery({
    queryKey: ['missed-days-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rent_requests')
        .select('id, tenant_id, agent_id, daily_repayment, rent_amount, amount_repaid, total_repayment, disbursed_at, status')
        .in('status', ['disbursed', 'repaying', 'funded'])
        .not('disbursed_at', 'is', null);
      if (error) throw error;
      return data || [];
    },
    staleTime: 120000,
  });

  const tenantIds = useMemo(() => {
    return [...new Set((activeRequests || []).map(r => r.tenant_id))];
  }, [activeRequests]);

  const agentIds = useMemo(() => {
    return [...new Set((activeRequests || []).map(r => r.agent_id).filter(Boolean))];
  }, [activeRequests]);

  const allUserIds = useMemo(() => [...new Set([...tenantIds, ...agentIds])], [tenantIds, agentIds]);

  const { data: profiles } = useQuery({
    queryKey: ['missed-days-profiles', allUserIds],
    queryFn: async () => {
      if (!allUserIds.length) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', allUserIds.slice(0, 200));
      return data || [];
    },
    enabled: allUserIds.length > 0,
    staleTime: 300000,
  });

  // Fetch wallet balances
  const { data: wallets } = useQuery({
    queryKey: ['missed-days-wallets', allUserIds],
    queryFn: async () => {
      if (!allUserIds.length) return [];
      const { data } = await supabase
        .from('wallets')
        .select('user_id, balance')
        .in('user_id', allUserIds.slice(0, 200));
      return data || [];
    },
    enabled: allUserIds.length > 0,
    staleTime: 120000,
  });

  // Fetch total collections per tenant (all time)
  const { data: allCollections, isLoading: colLoading } = useQuery({
    queryKey: ['missed-days-all-collections', tenantIds],
    queryFn: async () => {
      if (!tenantIds.length) return new Map<string, number>();
      const { data, error } = await supabase
        .from('agent_collections')
        .select('tenant_id, amount')
        .in('tenant_id', tenantIds.slice(0, 100));
      if (error) throw error;
      const map = new Map<string, number>();
      (data || []).forEach(c => {
        map.set(c.tenant_id, (map.get(c.tenant_id) || 0) + Number(c.amount));
      });
      return map;
    },
    enabled: tenantIds.length > 0,
    staleTime: 120000,
  });

  const isLoading = reqLoading || colLoading;

  const profileMap = useMemo(() => {
    const m = new Map<string, { name: string; phone: string }>();
    (profiles || []).forEach(p => m.set(p.id, { name: p.full_name || 'Unknown', phone: p.phone || '' }));
    return m;
  }, [profiles]);

  const tenantList = useMemo(() => {
    if (!activeRequests) return [];
    const today = new Date();

    // Group by tenant - aggregate if multiple requests
    const tenantMap = new Map<string, TenantMissedData>();
    activeRequests.forEach(r => {
      const profile = profileMap.get(r.tenant_id);
      const dailyRepayment = Number(r.daily_repayment || 0);
      const totalRepayment = Number(r.total_repayment || 0);
      const amountRepaid = Number(r.amount_repaid || 0);
      const outstandingBalance = totalRepayment - amountRepaid;
      const disbursedAt = r.disbursed_at ? parseISO(r.disbursed_at) : today;
      const daysSinceDisbursed = Math.max(1, differenceInDays(today, disbursedAt));
      const expectedRepaid = Math.min(dailyRepayment * daysSinceDisbursed, totalRepayment);
      const missedDays = dailyRepayment > 0
        ? Math.max(0, Math.round((expectedRepaid - amountRepaid) / dailyRepayment))
        : 0;
      const repaymentPct = totalRepayment > 0 ? Math.round((amountRepaid / totalRepayment) * 100) : 0;

      const existing = tenantMap.get(r.tenant_id);
      if (!existing || outstandingBalance > existing.outstanding_balance) {
        tenantMap.set(r.tenant_id, {
          tenant_id: r.tenant_id,
          tenant_name: profile?.name || r.tenant_id.slice(0, 8),
          phone: profile?.phone || '',
          daily_repayment: dailyRepayment,
          rent_amount: Number(r.rent_amount || 0),
          amount_repaid: amountRepaid,
          total_repayment: totalRepayment,
          outstanding_balance: outstandingBalance,
          disbursed_at: r.disbursed_at || '',
          days_since_disbursed: daysSinceDisbursed,
          expected_repaid: expectedRepaid,
          missed_days: missedDays,
          repayment_pct: repaymentPct,
        });
      }
    });

    return Array.from(tenantMap.values());
  }, [activeRequests, profileMap]);

  // Risk classification
  const getRisk = (t: TenantMissedData) => {
    if (t.missed_days >= 5) return 'critical';
    if (t.missed_days >= 2) return 'warning';
    return 'on_track';
  };

  const filtered = useMemo(() => {
    let list = tenantList;
    if (riskFilter !== 'all') list = list.filter(t => getRisk(t) === riskFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.tenant_name.toLowerCase().includes(q) || t.phone.includes(q));
    }
    return list.sort((a, b) => {
      if (sortBy === 'missed_days') return b.missed_days - a.missed_days;
      if (sortBy === 'balance') return b.outstanding_balance - a.outstanding_balance;
      return a.tenant_name.localeCompare(b.tenant_name);
    });
  }, [tenantList, riskFilter, search, sortBy]);

  const criticalCount = tenantList.filter(t => getRisk(t) === 'critical').length;
  const warningCount = tenantList.filter(t => getRisk(t) === 'warning').length;
  const onTrackCount = tenantList.filter(t => getRisk(t) === 'on_track').length;
  const totalOutstanding = tenantList.reduce((s, t) => s + t.outstanding_balance, 0);
  const totalMissedDays = tenantList.reduce((s, t) => s + t.missed_days, 0);

  const riskColor = (risk: string) => {
    if (risk === 'critical') return 'bg-destructive/15 text-destructive border-destructive/30';
    if (risk === 'warning') return 'bg-amber-500/15 text-amber-600 border-amber-500/30';
    return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30';
  };

  const riskLabel = (risk: string) => {
    if (risk === 'critical') return 'Critical';
    if (risk === 'warning') return 'Warning';
    return 'On Track';
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <KPICard title="Critical (5+ days)" value={criticalCount} icon={AlertTriangle} loading={isLoading} color="bg-destructive/10 text-destructive" />
        <KPICard title="Warning (2-4 days)" value={warningCount} icon={Clock} loading={isLoading} color="bg-amber-500/10 text-amber-600" />
        <KPICard title="Total Outstanding" value={formatUGX(totalOutstanding)} icon={Banknote} loading={isLoading} color="bg-primary/10 text-primary" />
        <KPICard title="Total Missed Days" value={totalMissedDays} icon={CalendarX2} loading={isLoading} color="bg-destructive/10 text-destructive" />
      </div>

      {/* Search + Filters */}
      <Card className="border shadow-sm">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search tenant..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            <Button variant="outline" size="icon" onClick={() => refetch()} className="shrink-0 h-9 w-9">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {([
              { key: 'all' as const, label: `All (${tenantList.length})`, icon: Users },
              { key: 'critical' as const, label: `Critical (${criticalCount})`, icon: AlertTriangle },
              { key: 'warning' as const, label: `Warning (${warningCount})`, icon: Clock },
              { key: 'on_track' as const, label: `On Track (${onTrackCount})`, icon: TrendingDown },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setRiskFilter(f.key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  riskFilter === f.key
                    ? f.key === 'critical' ? 'bg-destructive/10 text-destructive ring-1 ring-destructive/30'
                    : f.key === 'warning' ? 'bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/30'
                    : f.key === 'on_track' ? 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/30'
                    : 'bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                <f.icon className="h-3 w-3" />
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <span className="text-[10px] text-muted-foreground self-center mr-1">Sort:</span>
            {([
              { key: 'missed_days' as const, label: 'Missed Days' },
              { key: 'balance' as const, label: 'Balance' },
              { key: 'name' as const, label: 'Name' },
            ]).map(s => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                  sortBy === s.key ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tenant List */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 px-3 sm:px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarX2 className="h-4 w-4 text-destructive" />
            Missed Days & Balances
            {isLoading && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary/20 border-t-primary" />
            </div>
          ) : !filtered.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No tenants match the current filter.</p>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {filtered.map(t => {
                const risk = getRisk(t);
                return (
                  <div key={t.tenant_id} className="px-3 sm:px-4 py-3 flex items-start gap-3">
                    {/* Risk indicator */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      risk === 'critical' ? 'bg-destructive/15' : risk === 'warning' ? 'bg-amber-500/15' : 'bg-emerald-500/15'
                    }`}>
                      {risk === 'critical' ? <AlertTriangle className="h-4 w-4 text-destructive" />
                        : risk === 'warning' ? <Clock className="h-4 w-4 text-amber-600" />
                        : <TrendingDown className="h-4 w-4 text-emerald-600" />
                      }
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{t.tenant_name}</p>
                        <Badge variant="outline" className={`text-[9px] px-1.5 ${riskColor(risk)}`}>
                          {riskLabel(risk)}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                        <span>Missed: <strong className="text-foreground">{t.missed_days} days</strong></span>
                        <span>Balance: <strong className="text-foreground">{formatUGX(t.outstanding_balance)}</strong></span>
                        <span>Daily: {formatUGX(t.daily_repayment)}</span>
                        <span>Repaid: {t.repayment_pct}%</span>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-1.5 w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            risk === 'critical' ? 'bg-destructive' : risk === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, t.repayment_pct)}%` }}
                        />
                      </div>
                    </div>

                    {/* Phone */}
                    {t.phone && (
                      <a href={`tel:${t.phone}`} className="shrink-0 p-1.5 rounded-full hover:bg-muted transition-colors mt-0.5">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
