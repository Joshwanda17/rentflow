import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KPICard } from './KPICard';
import {
  CheckCircle2, XCircle, Search, RefreshCw, Users,
  Banknote, AlertTriangle, TrendingUp, Phone, UserCog, Wallet
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';

type Filter = 'all' | 'paid' | 'unpaid';

interface ActiveTenant {
  tenant_id: string;
  tenant_name: string;
  phone: string;
  daily_repayment: number;
  rent_amount: number;
  amount_repaid: number;
  total_repayment: number;
  disbursed_at: string;
  rent_request_id: string;
  agent_id: string;
  agent_name: string;
  agent_phone: string;
  tenant_wallet: number;
  agent_wallet: number;
}

// Removed unused TodayCollection interface

export function DailyPaymentTracker() {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Fetch active rent requests (disbursed/repaying)
  const { data: activeRequests, isLoading: reqLoading, refetch } = useQuery({
    queryKey: ['daily-tracker-active'],
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

  // Fetch tenant profiles for active requests
  const tenantIds = useMemo(() => {
    return [...new Set((activeRequests || []).map(r => r.tenant_id))];
  }, [activeRequests]);

  const { data: profiles } = useQuery({
    queryKey: ['daily-tracker-profiles', tenantIds],
    queryFn: async () => {
      if (!tenantIds.length) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', tenantIds.slice(0, 100));
      return data || [];
    },
    enabled: tenantIds.length > 0,
    staleTime: 300000,
  });

  // Fetch today's collections
  const { data: todayCollections, isLoading: colLoading } = useQuery({
    queryKey: ['daily-tracker-collections', todayStr],
    queryFn: async () => {
      const startOfDay = `${todayStr}T00:00:00`;
      const endOfDay = `${todayStr}T23:59:59`;
      const { data, error } = await supabase
        .from('agent_collections')
        .select('tenant_id, amount')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);
      if (error) throw error;
      // Aggregate by tenant
      const map = new Map<string, number>();
      (data || []).forEach(c => {
        map.set(c.tenant_id, (map.get(c.tenant_id) || 0) + Number(c.amount));
      });
      return map;
    },
    staleTime: 60000,
  });

  const isLoading = reqLoading || colLoading;
  const profileMap = useMemo(() => {
    const m = new Map<string, { name: string; phone: string }>();
    (profiles || []).forEach(p => m.set(p.id, { name: p.full_name || 'Unknown', phone: p.phone || '' }));
    return m;
  }, [profiles]);

  // Build tenant list with paid/unpaid status
  const tenantList = useMemo(() => {
    if (!activeRequests) return [];

    // Group by tenant - take the one with highest daily repayment if multiple
    const tenantMap = new Map<string, ActiveTenant>();
    activeRequests.forEach(r => {
      const existing = tenantMap.get(r.tenant_id);
      const profile = profileMap.get(r.tenant_id);
      const entry: ActiveTenant = {
        tenant_id: r.tenant_id,
        tenant_name: profile?.name || r.tenant_id.slice(0, 8),
        phone: profile?.phone || '',
        daily_repayment: Number(r.daily_repayment || 0),
        rent_amount: Number(r.rent_amount || 0),
        amount_repaid: Number(r.amount_repaid || 0),
        total_repayment: Number(r.total_repayment || 0),
        disbursed_at: r.disbursed_at || '',
        rent_request_id: r.id,
      };
      if (!existing || entry.daily_repayment > existing.daily_repayment) {
        tenantMap.set(r.tenant_id, entry);
      }
    });

    return Array.from(tenantMap.values()).map(t => {
      const paidToday = todayCollections?.get(t.tenant_id) || 0;
      const hasPaid = paidToday >= t.daily_repayment * 0.5; // At least 50% of daily amount counts as paid
      return { ...t, paidToday, hasPaid };
    });
  }, [activeRequests, todayCollections, profileMap]);

  // Apply filters
  const filtered = useMemo(() => {
    let list = tenantList;
    if (filter === 'paid') list = list.filter(t => t.hasPaid);
    if (filter === 'unpaid') list = list.filter(t => !t.hasPaid);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.tenant_name.toLowerCase().includes(q) || t.phone.includes(q));
    }
    // Sort: unpaid first, then by daily amount desc
    return list.sort((a, b) => {
      if (a.hasPaid !== b.hasPaid) return a.hasPaid ? 1 : -1;
      return b.daily_repayment - a.daily_repayment;
    });
  }, [tenantList, filter, search]);

  const paidCount = tenantList.filter(t => t.hasPaid).length;
  const unpaidCount = tenantList.filter(t => !t.hasPaid).length;
  const totalCollectedToday = tenantList.reduce((s, t) => s + t.paidToday, 0);
  const totalExpectedToday = tenantList.reduce((s, t) => s + t.daily_repayment, 0);
  const collectionRate = totalExpectedToday > 0 ? Math.round((totalCollectedToday / totalExpectedToday) * 100) : 0;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <KPICard title="Paid Today" value={paidCount} icon={CheckCircle2} loading={isLoading} color="bg-emerald-500/10 text-emerald-600" />
        <KPICard title="Not Paid" value={unpaidCount} icon={XCircle} loading={isLoading} color="bg-destructive/10 text-destructive" />
        <KPICard title="Collected Today" value={formatUGX(totalCollectedToday)} icon={Banknote} loading={isLoading} color="bg-primary/10 text-primary" />
        <KPICard title="Collection Rate" value={`${collectionRate}%`} icon={TrendingUp} loading={isLoading}
          color={collectionRate >= 70 ? 'bg-emerald-500/10 text-emerald-600' : collectionRate >= 40 ? 'bg-amber-500/10 text-amber-600' : 'bg-destructive/10 text-destructive'}
        />
      </div>

      {/* Search + Filters */}
      <Card className="border shadow-sm">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tenant..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => refetch()} className="shrink-0 h-9 w-9">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-1.5">
            {([
              { key: 'all', label: `All (${tenantList.length})`, icon: Users },
              { key: 'paid', label: `Paid (${paidCount})`, icon: CheckCircle2 },
              { key: 'unpaid', label: `Unpaid (${unpaidCount})`, icon: AlertTriangle },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  filter === f.key
                    ? f.key === 'paid' ? 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/30'
                    : f.key === 'unpaid' ? 'bg-destructive/10 text-destructive ring-1 ring-destructive/30'
                    : 'bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                <f.icon className="h-3 w-3" />
                {f.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tenant List */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 px-3 sm:px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Daily Payment Status — {format(new Date(), 'dd MMM yyyy')}
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
              <p className="text-sm">No active tenants found.</p>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {filtered.map(t => {
                const repayPct = t.total_repayment > 0 ? Math.round((t.amount_repaid / t.total_repayment) * 100) : 0;
                return (
                  <div key={t.tenant_id} className="px-3 sm:px-4 py-3 flex items-center gap-3">
                    {/* Status Icon */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      t.hasPaid ? 'bg-emerald-500/15' : 'bg-destructive/15'
                    }`}>
                      {t.hasPaid
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        : <XCircle className="h-4 w-4 text-destructive" />
                      }
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{t.tenant_name}</p>
                        <Badge variant="outline" className={`text-[9px] px-1.5 ${t.hasPaid ? 'border-emerald-500/30 text-emerald-600' : 'border-destructive/30 text-destructive'}`}>
                          {t.hasPaid ? 'Paid' : 'Unpaid'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>Daily: {formatUGX(t.daily_repayment)}</span>
                        <span>•</span>
                        <span>{t.hasPaid ? `Paid: ${formatUGX(t.paidToday)}` : 'No payment yet'}</span>
                        <span>•</span>
                        <span>{repayPct}% repaid</span>
                      </div>
                    </div>

                    {/* Phone quick link */}
                    {t.phone && (
                      <a href={`tel:${t.phone}`} className="shrink-0 p-1.5 rounded-full hover:bg-muted transition-colors">
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
