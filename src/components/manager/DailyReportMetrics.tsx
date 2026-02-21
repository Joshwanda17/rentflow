import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { UserAvatar } from '@/components/UserAvatar';
import { 
  Users, 
  Building2, 
  TrendingUp, 
  MapPin, 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight,
  BadgeDollarSign,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  HandCoins,
  UserCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface DailyReportData {
  active_tenants: number;
  tenants_with_balance: number;
  total_rent_balance: number;
  active_landlords: number;
  total_houses: number;
  total_rent_received: number;
  active_supporters: number;
  total_invested: number;
  supporter_wallets_total: number;
  active_agents: number;
  agent_details: { id: string; full_name: string; avatar_url: string | null; tenant_count: number; wallet_balance: number; total_earnings: number }[];
  locations: { city: string; tenant_count: number }[];
  platform_cash_in: number;
  platform_cash_out: number;
  total_wallet_balance: number;
  wallets_with_balance: number;
  wallets_cash_in_today: number;
  wallets_cash_out_today: number;
}

function MetricSection({ 
  title, icon: Icon, iconColor, children, defaultOpen = false, badge 
}: { 
  title: string; 
  icon: React.ElementType; 
  iconColor: string; 
  children: React.ReactNode; 
  defaultOpen?: boolean;
  badge?: string | number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden border-border/40">
      <button 
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left active:bg-muted/50 transition-colors touch-manipulation"
      >
        <div className={cn("p-2.5 rounded-xl shrink-0", iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        {badge !== undefined && (
          <Badge variant="secondary" className="text-xs font-bold shrink-0">
            {badge}
          </Badge>
        )}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function StatRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className="text-sm font-bold">{value}</span>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export function DailyReportMetrics() {
  const [data, setData] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReport = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const { data: result, error } = await supabase.rpc('get_manager_daily_report');
      if (error) throw error;
      setData(result as unknown as DailyReportData);
    } catch (err) {
      console.error('[DailyReport] Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchReport(); }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">📊 Daily Report</h2>
          <p className="text-xs text-muted-foreground">Platform metrics overview</p>
        </div>
        <button 
          onClick={() => fetchReport(true)} 
          disabled={refreshing}
          className="p-2 rounded-xl bg-muted hover:bg-muted/80 active:scale-95 transition-all touch-manipulation"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </button>
      </div>

      {/* Top Summary Cards */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownLeft className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Cash In Today</span>
            </div>
            <p className="text-lg font-black">{formatUGX(data.wallets_cash_in_today)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpRight className="h-4 w-4 text-destructive" />
              <span className="text-[10px] font-semibold text-destructive uppercase tracking-wider">Cash Out Today</span>
            </div>
            <p className="text-lg font-black">{formatUGX(data.wallets_cash_out_today)}</p>
          </CardContent>
        </Card>
      </div>

      {/* 1. Tenants */}
      <MetricSection 
        title="Tenants" 
        icon={Users} 
        iconColor="bg-primary/10 text-primary" 
        defaultOpen={true}
        badge={data.active_tenants}
      >
        <StatRow label="Active Tenants" value={data.active_tenants} />
        <StatRow label="With Rent Balance" value={data.tenants_with_balance} />
        <StatRow label="Total Rent Balance" value={formatUGX(data.total_rent_balance)} sub="Outstanding receivables" />
      </MetricSection>

      {/* 2. Landlords */}
      <MetricSection 
        title="Landlords & Properties" 
        icon={Building2} 
        iconColor="bg-chart-2/10 text-chart-2"
        badge={data.active_landlords}
      >
        <StatRow label="Verified Landlords" value={data.active_landlords} />
        <StatRow label="Total Houses" value={data.total_houses} />
        <StatRow label="Total Rent Paid Out" value={formatUGX(data.total_rent_received)} sub="All-time rent to landlords" />
      </MetricSection>

      {/* 3. Funders / Supporters */}
      <MetricSection 
        title="Funders (Supporters)" 
        icon={HandCoins} 
        iconColor="bg-chart-4/10 text-chart-4"
        badge={data.active_supporters}
      >
        <StatRow label="Active Funders" value={data.active_supporters} />
        <StatRow label="Total Invested" value={formatUGX(data.total_invested)} />
        <StatRow label="Combined Wallet Balance" value={formatUGX(data.supporter_wallets_total)} sub="Current funder balances" />
      </MetricSection>

      {/* 4. Agents */}
      <MetricSection 
        title="Agents" 
        icon={UserCheck} 
        iconColor="bg-chart-5/10 text-chart-5"
        badge={data.active_agents}
      >
        <StatRow label="Active Agents" value={data.active_agents} />
        {data.agent_details.length > 0 && (
          <div className="space-y-2 mt-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Top Agents by Tenants</p>
            {data.agent_details.slice(0, 10).map((agent, i) => (
              <div key={agent.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-border/30">
                <span className="text-xs font-bold text-muted-foreground w-5 text-center">{i + 1}</span>
                <UserAvatar avatarUrl={agent.avatar_url} fullName={agent.full_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{agent.full_name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {agent.tenant_count} tenants · {formatUGX(agent.total_earnings)} earned
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold">{formatUGX(agent.wallet_balance)}</p>
                  <p className="text-[10px] text-muted-foreground">balance</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </MetricSection>

      {/* 5. Locations */}
      <MetricSection 
        title="Tenant Locations" 
        icon={MapPin} 
        iconColor="bg-chart-3/10 text-chart-3"
        badge={data.locations.length}
      >
        {data.locations.length > 0 ? (
          <div className="space-y-1">
            {data.locations.map((loc) => (
              <div key={loc.city} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-chart-3" />
                  <span className="text-sm">{loc.city}</span>
                </div>
                <Badge variant="outline" className="text-xs">{loc.tenant_count} tenants</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-3">No location data yet</p>
        )}
      </MetricSection>

      {/* 6. Platform Cash Flow */}
      <MetricSection 
        title="Platform Cash Flow" 
        icon={TrendingUp} 
        iconColor="bg-success/10 text-success"
        badge={formatUGX(data.platform_cash_in - data.platform_cash_out)}
      >
        <StatRow label="Total Cash In" value={formatUGX(data.platform_cash_in)} sub="All-time inflows" />
        <StatRow label="Total Cash Out" value={formatUGX(data.platform_cash_out)} sub="All-time outflows" />
        <div className="p-3 rounded-xl bg-success/10 border border-success/20 mt-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-success">Net Position</span>
            <span className="text-lg font-black text-success">
              {formatUGX(data.platform_cash_in - data.platform_cash_out)}
            </span>
          </div>
        </div>
      </MetricSection>

      {/* 7. Wallets */}
      <MetricSection 
        title="Wallet Balances" 
        icon={Wallet} 
        iconColor="bg-warning/10 text-warning"
        badge={formatUGX(data.total_wallet_balance)}
      >
        <StatRow label="Total Wallet Balance" value={formatUGX(data.total_wallet_balance)} />
        <StatRow label="Wallets with Balance" value={data.wallets_with_balance} />
        <StatRow label="Cash In Today" value={formatUGX(data.wallets_cash_in_today)} />
        <StatRow label="Cash Out Today" value={formatUGX(data.wallets_cash_out_today)} />
        <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 mt-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-warning">Today's Net</span>
            <span className={cn(
              "text-lg font-black",
              data.wallets_cash_in_today - data.wallets_cash_out_today >= 0 ? "text-success" : "text-destructive"
            )}>
              {formatUGX(data.wallets_cash_in_today - data.wallets_cash_out_today)}
            </span>
          </div>
        </div>
      </MetricSection>
    </div>
  );
}
