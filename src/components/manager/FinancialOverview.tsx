import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, TrendingDown, Wallet, Users, Banknote, 
  ArrowDownLeft, ArrowUpRight, RefreshCw, PiggyBank,
  Building2, Percent, Gift
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { Button } from '@/components/ui/button';

interface FinancialMetrics {
  totalWalletBalances: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalTransfers: number;
  totalAgentEarnings: number;
  totalCommissions: number;
  totalBonuses: number;
  totalRentFacilitated: number;
  totalPlatformFees: number;
  pendingRepayments: number;
  userCount: number;
  agentCount: number;
  tenantCount: number;
  supporterCount: number;
}

export function FinancialOverview() {
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    setLoading(true);

    const [
      walletsRes,
      depositsRes,
      withdrawalsRes,
      transfersRes,
      earningsRes,
      requestsRes,
      platformTxRes,
      rolesRes
    ] = await Promise.all([
      supabase.from('wallets').select('balance'),
      supabase.from('wallet_deposits').select('amount'),
      supabase.from('wallet_withdrawals').select('amount'),
      supabase.from('wallet_transactions').select('amount'),
      supabase.from('agent_earnings').select('amount, earning_type'),
      supabase.from('rent_requests').select('rent_amount, total_repayment, access_fee, request_fee, status'),
      supabase.from('platform_transactions').select('amount, direction, transaction_type'),
      supabase.from('user_roles').select('role')
    ]);

    const wallets = walletsRes.data || [];
    const deposits = depositsRes.data || [];
    const withdrawals = withdrawalsRes.data || [];
    const transfers = transfersRes.data || [];
    const earnings = earningsRes.data || [];
    const requests = requestsRes.data || [];
    const platformTx = platformTxRes.data || [];
    const roles = rolesRes.data || [];

    const totalWalletBalances = wallets.reduce((sum, w) => sum + Number(w.balance), 0);
    const totalDeposits = deposits.reduce((sum, d) => sum + Number(d.amount), 0);
    const totalWithdrawals = withdrawals.reduce((sum, w) => sum + Number(w.amount), 0);
    const totalTransfers = transfers.reduce((sum, t) => sum + Number(t.amount), 0);
    
    const totalAgentEarnings = earnings.reduce((sum, e) => sum + Number(e.amount), 0);
    const totalCommissions = earnings.filter(e => e.earning_type === 'commission').reduce((sum, e) => sum + Number(e.amount), 0);
    const totalBonuses = earnings.filter(e => e.earning_type === 'approval_bonus').reduce((sum, e) => sum + Number(e.amount), 0);

    const completedRequests = requests.filter(r => ['funded', 'disbursed', 'completed'].includes(r.status));
    const totalRentFacilitated = completedRequests.reduce((sum, r) => sum + Number(r.rent_amount), 0);
    const totalPlatformFees = completedRequests.reduce((sum, r) => sum + Number(r.access_fee) + Number(r.request_fee), 0);
    
    const activeRequests = requests.filter(r => ['funded', 'disbursed'].includes(r.status));
    const pendingRepayments = activeRequests.reduce((sum, r) => sum + Number(r.total_repayment), 0);

    const userCount = new Set(roles.map(r => r.role)).size > 0 ? roles.length : 0;
    const agentCount = roles.filter(r => r.role === 'agent').length;
    const tenantCount = roles.filter(r => r.role === 'tenant').length;
    const supporterCount = roles.filter(r => r.role === 'supporter').length;

    setMetrics({
      totalWalletBalances,
      totalDeposits,
      totalWithdrawals,
      totalTransfers,
      totalAgentEarnings,
      totalCommissions,
      totalBonuses,
      totalRentFacilitated,
      totalPlatformFees,
      pendingRepayments,
      userCount,
      agentCount,
      tenantCount,
      supporterCount
    });

    setLoading(false);
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading financial metrics...
        </CardContent>
      </Card>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Financial Overview
        </h2>
        <Button variant="ghost" size="sm" onClick={fetchMetrics}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Total Wallet Balances</p>
                <p className="font-mono font-bold truncate">{formatUGX(metrics.totalWalletBalances)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <Banknote className="h-5 w-5 text-success" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Rent Facilitated</p>
                <p className="font-mono font-bold text-success truncate">{formatUGX(metrics.totalRentFacilitated)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <PiggyBank className="h-5 w-5 text-warning" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Platform Fees</p>
                <p className="font-mono font-bold text-warning truncate">{formatUGX(metrics.totalPlatformFees)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-chart-5/10">
                <Building2 className="h-5 w-5 text-chart-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Pending Repayments</p>
                <p className="font-mono font-bold truncate">{formatUGX(metrics.pendingRepayments)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Breakdown */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Detailed Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="money-flow" className="space-y-4">
            <TabsList className="w-full">
              <TabsTrigger value="money-flow" className="flex-1">Money Flow</TabsTrigger>
              <TabsTrigger value="agent-earnings" className="flex-1">Agent Earnings</TabsTrigger>
              <TabsTrigger value="users" className="flex-1">Users</TabsTrigger>
            </TabsList>

            <TabsContent value="money-flow" className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
                  <div className="p-2 rounded-lg bg-success/10">
                    <ArrowDownLeft className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Deposits</p>
                    <p className="font-mono font-semibold text-success">{formatUGX(metrics.totalDeposits)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <ArrowUpRight className="h-4 w-4 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Withdrawals</p>
                    <p className="font-mono font-semibold text-destructive">{formatUGX(metrics.totalWithdrawals)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Transfers</p>
                    <p className="font-mono font-semibold">{formatUGX(metrics.totalTransfers)}</p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-success/5 border border-success/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-success" />
                    <span className="font-medium">Net Flow (Deposits - Withdrawals)</span>
                  </div>
                  <span className={`font-mono font-bold ${metrics.totalDeposits - metrics.totalWithdrawals >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatUGX(metrics.totalDeposits - metrics.totalWithdrawals)}
                  </span>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="agent-earnings" className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
                  <div className="p-2 rounded-lg bg-warning/10">
                    <TrendingUp className="h-4 w-4 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Agent Earnings</p>
                    <p className="font-mono font-semibold text-warning">{formatUGX(metrics.totalAgentEarnings)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
                  <div className="p-2 rounded-lg bg-success/10">
                    <Percent className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Commissions</p>
                    <p className="font-mono font-semibold text-success">{formatUGX(metrics.totalCommissions)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
                  <div className="p-2 rounded-lg bg-warning/10">
                    <Gift className="h-4 w-4 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Bonuses</p>
                    <p className="font-mono font-semibold text-warning">{formatUGX(metrics.totalBonuses)}</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="users" className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
                  <Users className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Tenants</p>
                    <p className="font-mono font-semibold">{metrics.tenantCount}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
                  <Users className="h-5 w-5 text-warning" />
                  <div>
                    <p className="text-sm text-muted-foreground">Agents</p>
                    <p className="font-mono font-semibold">{metrics.agentCount}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
                  <Users className="h-5 w-5 text-success" />
                  <div>
                    <p className="text-sm text-muted-foreground">Supporters</p>
                    <p className="font-mono font-semibold">{metrics.supporterCount}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Roles</p>
                    <p className="font-mono font-semibold">{metrics.userCount}</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
