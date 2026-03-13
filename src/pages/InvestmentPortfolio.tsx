import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, TrendingUp, Calendar, Wallet, CheckCircle2, Target, BarChart3,
  ChevronRight, Users, Building2, Coins, ArrowUpRight, History, Filter, ArrowUpDown
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { InvestmentTransactionHistory } from '@/components/investment/InvestmentTransactionHistory';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrency } from '@/hooks/useCurrency';

type SortOption = 'balance-desc' | 'balance-asc' | 'roi-desc' | 'roi-asc' | 'date-desc' | 'date-asc';
type FilterOption = 'all' | 'approved' | 'pending' | 'pending_activation';

interface LinkedFunding {
  id: string; rent_amount: number; status: string; funded_at: string;
  tenant_name: string; landlord_name: string; roi_earned: number; roi_pending: number;
}

interface InterestPayment {
  id: string; interest_amount: number; payment_month: string;
  credited_at: string; interest_rate: number; principal_amount: number;
}

interface InvestmentAccount {
  id: string; name: string; balance: number; color: string; status: string;
  created_at: string; updated_at: string; linked_fundings: LinkedFunding[];
  interest_payments: InterestPayment[]; total_roi_earned: number;
  portfolio_code?: string; duration_months?: number; roi_percentage?: number; roi_mode?: string;
}

export default function InvestmentPortfolio() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { formatAmount } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<InvestmentAccount | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  useEffect(() => { if (user) fetchPortfolioData(); }, [user]);

  const fetchPortfolioData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: portfolios, error } = await supabase
        .from('investor_portfolios').select('*')
        .or(`investor_id.eq.${user.id},agent_id.eq.${user.id}`)
        .in('status', ['active', 'pending_approval'])
        .order('created_at', { ascending: false });
      if (error) { console.error(error); setAccounts([]); return; }
      const colors = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#8b5cf6'];
      setAccounts((portfolios || []).map((p: any, i: number) => ({
        id: p.id, name: p.portfolio_code || `Portfolio ${i + 1}`,
        balance: p.investment_amount || 0, color: colors[i % colors.length],
        status: p.status === 'active' ? 'approved' : p.status,
        created_at: p.created_at, updated_at: p.created_at,
        linked_fundings: [], interest_payments: [],
        total_roi_earned: p.total_roi_earned || 0,
        portfolio_code: p.portfolio_code, duration_months: p.duration_months,
        roi_percentage: p.roi_percentage, roi_mode: p.roi_mode,
      })));
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const totalRoiEarned = accounts.reduce((s, a) => s + a.total_roi_earned, 0);
  const totalFundings = accounts.reduce((s, a) => s + a.linked_fundings.length, 0);
  const expectedMonthlyRoi = totalBalance * 0.15;

  const filteredAndSortedAccounts = useMemo(() => {
    let result = [...accounts];
    if (filterBy !== 'all') result = result.filter(a => a.status === filterBy);
    result.sort((a, b) => {
      switch (sortBy) {
        case 'balance-desc': return b.balance - a.balance;
        case 'balance-asc': return a.balance - b.balance;
        case 'roi-desc': return b.total_roi_earned - a.total_roi_earned;
        case 'roi-asc': return a.total_roi_earned - b.total_roi_earned;
        case 'date-desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'date-asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        default: return 0;
      }
    });
    return result;
  }, [accounts, filterBy, sortBy]);

  const getStatusColor = (s: string) => {
    if (s === 'approved') return 'bg-success/10 text-success border-success/20';
    if (['pending', 'pending_activation', 'pending_approval'].includes(s)) return 'bg-warning/10 text-warning border-warning/20';
    if (s === 'rejected') return 'bg-destructive/10 text-destructive border-destructive/20';
    return 'bg-muted text-muted-foreground';
  };

  const getStatusLabel = (s: string) => {
    if (s === 'approved') return 'Active';
    if (s === 'pending_approval') return 'Awaiting';
    if (['pending_activation', 'pending'].includes(s)) return 'Pending';
    return s;
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-3 gap-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/40">
        <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base font-bold text-foreground truncate">Support Accounts</h1>
          <Badge variant="secondary" className="ml-auto text-[10px] shrink-0">{accounts.length}</Badge>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* Hero Balance */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-5 text-primary-foreground">
          <p className="text-[10px] font-semibold opacity-60 uppercase tracking-[0.15em] mb-1">Total Value</p>
          <p className="text-[clamp(1.15rem,5vw,1.75rem)] font-extrabold tracking-tight leading-none">
            {formatAmount(totalBalance)}
          </p>
          <p className="text-[11px] opacity-70 mt-2">{totalFundings} fundings</p>
        </motion.div>

        {/* Stats Row */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="grid grid-cols-3 gap-2">
          {[
            { label: 'Earned', value: totalRoiEarned, icon: TrendingUp, color: 'text-success' },
            { label: 'Monthly', value: expectedMonthlyRoi, icon: Calendar, color: 'text-primary' },
            { label: 'Rate', value: null, icon: Target, color: 'text-foreground' },
          ].map((stat) => (
            <Card key={stat.label} className="border border-border/40 shadow-none">
              <CardContent className="p-2.5 text-center">
                <stat.icon className={`h-3.5 w-3.5 mx-auto mb-1 ${stat.color} opacity-60`} />
                <p className={`text-[clamp(0.65rem,2.8vw,0.8rem)] font-extrabold ${stat.color} leading-tight truncate`}>
                  {stat.value !== null ? formatAmount(stat.value) : '15%'}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5 font-medium">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Accounts List */}
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Accounts</h2>
            <span className="text-[10px] text-muted-foreground">{filteredAndSortedAccounts.length} of {accounts.length}</span>
          </div>

          {accounts.length > 0 && (
            <div className="flex gap-2">
              <Select value={filterBy} onValueChange={(v) => setFilterBy(v as FilterOption)}>
                <SelectTrigger className="h-8 text-[11px] w-auto min-w-[90px] border-border/40">
                  <Filter className="h-3 w-3 mr-1 text-muted-foreground" /><SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="approved">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="h-8 text-[11px] w-auto min-w-[100px] border-border/40">
                  <ArrowUpDown className="h-3 w-3 mr-1 text-muted-foreground" /><SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-desc">Newest</SelectItem>
                  <SelectItem value="date-asc">Oldest</SelectItem>
                  <SelectItem value="balance-desc">Highest</SelectItem>
                  <SelectItem value="balance-asc">Lowest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {accounts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Wallet className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="font-semibold text-sm mb-1">No Accounts Yet</p>
                <p className="text-xs text-muted-foreground mb-4">Support tenants to build your account</p>
                <Button size="sm" onClick={() => navigate('/dashboard')}><Target className="h-3.5 w-3.5 mr-1.5" />Browse</Button>
              </CardContent>
            </Card>
          ) : filteredAndSortedAccounts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center">
                <Filter className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm font-medium mb-2">No matches</p>
                <Button variant="outline" size="sm" onClick={() => setFilterBy('all')}>Clear</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {filteredAndSortedAccounts.map((account, index) => (
                  <motion.div key={account.id} layout
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    transition={{ delay: index * 0.02 }}>
                    <Card className="border border-border/40 shadow-none hover:border-border transition-colors cursor-pointer active:scale-[0.99]"
                      onClick={() => { setSelectedAccount(account); setDetailsOpen(true); }}>
                      <CardContent className="p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${account.color}12` }}>
                            <Wallet className="h-4 w-4" style={{ color: account.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <p className="text-[13px] font-bold text-foreground truncate">{account.name}</p>
                              <Badge variant="outline" className={`text-[8px] px-1.5 py-0 shrink-0 ${getStatusColor(account.status)}`}>
                                {getStatusLabel(account.status)}
                              </Badge>
                            </div>
                            <p className="text-[clamp(0.8rem,3.5vw,0.95rem)] font-extrabold text-foreground leading-tight truncate">
                              {formatAmount(account.balance)}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                        </div>
                        <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-border/20">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Users className="h-3 w-3" />{account.linked_fundings.length}
                          </span>
                          <span className="text-[10px] text-success font-semibold flex items-center gap-0.5">
                            <ArrowUpRight className="h-3 w-3" />+{formatAmount(account.total_roi_earned)}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-auto">{format(new Date(account.created_at), 'MMM yyyy')}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.section>

        {/* Summary */}
        {accounts.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="border border-border/40 shadow-none">
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em] flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" />Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {[
                  { l: 'Total Supported', v: formatAmount(totalBalance), c: '' },
                  { l: 'Total Rewards', v: `+${formatAmount(totalRoiEarned)}`, c: 'text-success' },
                  { l: 'Reward Rate', v: `${totalBalance > 0 ? ((totalRoiEarned / totalBalance) * 100).toFixed(1) : 0}%`, c: 'text-primary' },
                ].map(r => (
                  <div key={r.l} className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{r.l}</span>
                    <span className={`text-[12px] font-bold ${r.c}`}>{r.v}</span>
                  </div>
                ))}
                <Progress value={totalBalance > 0 ? Math.min((totalRoiEarned / totalBalance) * 100, 100) : 0} className="h-1.5 mt-1" />
              </CardContent>
            </Card>
          </motion.section>
        )}
      </main>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
            <DialogTitle className="flex items-center gap-2.5 text-sm">
              {selectedAccount && (
                <>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${selectedAccount.color}15` }}>
                    <Wallet className="h-4 w-4" style={{ color: selectedAccount.color }} />
                  </div>
                  <span className="truncate">{selectedAccount.name}</span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedAccount && (
            <ScrollArea className="flex-1 px-5 py-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-primary/5 p-3">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Balance</p>
                    <p className="text-[clamp(0.75rem,3.5vw,0.95rem)] font-extrabold text-primary leading-tight truncate">{formatAmount(selectedAccount.balance)}</p>
                  </div>
                  <div className="rounded-xl bg-success/5 p-3">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Rewards</p>
                    <p className="text-[clamp(0.75rem,3.5vw,0.95rem)] font-extrabold text-success leading-tight truncate">+{formatAmount(selectedAccount.total_roi_earned)}</p>
                  </div>
                </div>

                <Tabs defaultValue="history" className="w-full">
                  <TabsList className="w-full grid grid-cols-3 h-9">
                    <TabsTrigger value="history" className="text-[11px] gap-1"><History className="h-3 w-3" />History</TabsTrigger>
                    <TabsTrigger value="fundings" className="text-[11px] gap-1"><Users className="h-3 w-3" />Fundings</TabsTrigger>
                    <TabsTrigger value="roi" className="text-[11px] gap-1"><TrendingUp className="h-3 w-3" />Rewards</TabsTrigger>
                  </TabsList>
                  <TabsContent value="history" className="mt-3">
                    <InvestmentTransactionHistory accountId={selectedAccount.id} maxItems={20} showHeader={false} />
                  </TabsContent>
                  <TabsContent value="fundings" className="mt-3 space-y-2">
                    {selectedAccount.linked_fundings.length === 0 ? (
                      <div className="text-center py-8"><Users className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-xs text-muted-foreground">No linked fundings</p></div>
                    ) : selectedAccount.linked_fundings.map(f => (
                      <div key={f.id} className="rounded-xl bg-muted/30 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Badge variant="outline" className={`text-[9px] mb-1 ${f.status === 'verified' ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20'}`}>
                              {f.status === 'verified' ? 'Verified' : 'Pending'}
                            </Badge>
                            <p className="text-sm font-medium truncate">{f.tenant_name}</p>
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" />{f.landlord_name}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[12px] font-bold">{formatAmount(f.rent_amount)}</p>
                            {f.roi_earned > 0 && <p className="text-[10px] text-success">+{formatAmount(f.roi_earned)}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </TabsContent>
                  <TabsContent value="roi" className="mt-3 space-y-2">
                    {selectedAccount.interest_payments.length === 0 ? (
                      <div className="text-center py-8"><Coins className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-xs text-muted-foreground">No reward payments yet</p></div>
                    ) : selectedAccount.interest_payments.map(p => (
                      <div key={p.id} className="rounded-xl bg-success/5 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{p.payment_month}</p>
                            <p className="text-[10px] text-muted-foreground">{format(new Date(p.credited_at), 'MMM d, yyyy')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[13px] font-bold text-success">+{formatAmount(p.interest_amount)}</p>
                            <Badge variant="outline" className="text-[8px] bg-success/10 text-success border-success/20">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Credited
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </TabsContent>
                </Tabs>

                <div className="pt-3 border-t border-border/40 space-y-2">
                  {[
                    { l: 'Created', v: format(new Date(selectedAccount.created_at), 'MMM d, yyyy') },
                    { l: 'Status', v: selectedAccount.status === 'approved' ? 'Active' : selectedAccount.status },
                    { l: 'Monthly Rate', v: '15%' },
                  ].map(r => (
                    <div key={r.l} className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{r.l}</span>
                      <span className="font-semibold">{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
