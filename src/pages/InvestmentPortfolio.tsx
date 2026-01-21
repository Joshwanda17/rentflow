import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  TrendingUp,
  Calendar,
  Wallet,
  Clock,
  CheckCircle2,
  Gift,
  Target,
  BarChart3,
  PiggyBank,
  Sparkles,
  ChevronRight,
  Users,
  Building2,
  Eye,
  Coins,
  ArrowUpRight,
  History
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, differenceInDays } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

interface LinkedFunding {
  id: string;
  rent_amount: number;
  status: string;
  funded_at: string;
  tenant_name: string;
  landlord_name: string;
  roi_earned: number;
  roi_pending: number;
}

interface InterestPayment {
  id: string;
  interest_amount: number;
  payment_month: string;
  credited_at: string;
  interest_rate: number;
  principal_amount: number;
}

interface InvestmentAccount {
  id: string;
  name: string;
  balance: number;
  color: string;
  status: string;
  created_at: string;
  updated_at: string;
  linked_fundings: LinkedFunding[];
  interest_payments: InterestPayment[];
  total_roi_earned: number;
}

export default function InvestmentPortfolio() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<InvestmentAccount | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchPortfolioData();
    }
  }, [user]);

  const fetchPortfolioData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch all investment accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from('investment_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (accountsError) throw accountsError;

      // For each account, fetch linked fundings and interest payments
      const enrichedAccounts = await Promise.all(
        (accountsData || []).map(async (account) => {
          // Fetch fundings linked to this account (by matching creation month)
          const accountMonth = new Date(account.created_at);
          const monthStart = new Date(accountMonth.getFullYear(), accountMonth.getMonth(), 1);
          const monthEnd = new Date(accountMonth.getFullYear(), accountMonth.getMonth() + 1, 0, 23, 59, 59);

          const { data: fundingsData } = await supabase
            .from('landlord_payment_proofs')
            .select(`
              id,
              amount,
              status,
              created_at,
              verified_at,
              total_roi_paid,
              rent_request:rent_requests(
                id,
                rent_amount,
                funded_at,
                status,
                tenant:profiles!rent_requests_tenant_id_fkey(full_name),
                landlord:landlords!rent_requests_landlord_id_fkey(name)
              )
            `)
            .eq('supporter_id', user.id)
            .gte('created_at', monthStart.toISOString())
            .lte('created_at', monthEnd.toISOString());

          // Fetch interest payments for this account
          const { data: interestData } = await supabase
            .from('investment_interest_payments')
            .select('*')
            .eq('account_id', account.id)
            .order('credited_at', { ascending: false });

          const linkedFundings: LinkedFunding[] = (fundingsData || []).map((f: any) => ({
            id: f.id,
            rent_amount: Number(f.rent_request?.rent_amount || f.amount),
            status: f.status,
            funded_at: f.rent_request?.funded_at || f.created_at,
            tenant_name: f.rent_request?.tenant?.full_name || 'Unknown Tenant',
            landlord_name: f.rent_request?.landlord?.name || 'Unknown Landlord',
            roi_earned: Number(f.total_roi_paid || 0),
            roi_pending: f.status === 'verified' ? Math.round(Number(f.amount) * 0.15) : 0
          }));

          const interestPayments: InterestPayment[] = (interestData || []).map((i: any) => ({
            id: i.id,
            interest_amount: Number(i.interest_amount),
            payment_month: i.payment_month,
            credited_at: i.credited_at,
            interest_rate: Number(i.interest_rate),
            principal_amount: Number(i.principal_amount)
          }));

          const totalRoiEarned = interestPayments.reduce((sum, p) => sum + p.interest_amount, 0) +
            linkedFundings.reduce((sum, f) => sum + f.roi_earned, 0);

          return {
            ...account,
            balance: Number(account.balance),
            linked_fundings: linkedFundings,
            interest_payments: interestPayments,
            total_roi_earned: totalRoiEarned
          };
        })
      );

      setAccounts(enrichedAccounts);
    } catch (error) {
      console.error('Error fetching portfolio data:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const totalRoiEarned = accounts.reduce((sum, a) => sum + a.total_roi_earned, 0);
  const totalFundings = accounts.reduce((sum, a) => sum + a.linked_fundings.length, 0);
  const expectedMonthlyRoi = totalBalance * 0.15;

  const handleViewDetails = (account: InvestmentAccount) => {
    setSelectedAccount(account);
    setDetailsOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-success/10 text-success border-success/30';
      case 'pending': case 'pending_activation': return 'bg-warning/10 text-warning border-warning/30';
      case 'rejected': return 'bg-destructive/10 text-destructive border-destructive/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-bold flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Investment Portfolio
            </h1>
            <p className="text-xs text-muted-foreground">Track your investments & returns</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-2xl">
        {/* Portfolio Overview Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-violet-600 p-5 text-white shadow-xl"
        >
          <div className="absolute top-0 right-0 opacity-10">
            <PiggyBank className="h-28 w-28 -mt-4 -mr-4" />
          </div>
          
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-primary-foreground/70" />
            <span className="text-primary-foreground/70 text-xs font-medium uppercase tracking-wide">Total Portfolio Value</span>
          </div>
          <p className="text-3xl font-black">{formatUGX(totalBalance)}</p>
          
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Badge className="bg-white/20 text-white border-0 text-xs">
              {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
            </Badge>
            <Badge className="bg-white/20 text-white border-0 text-xs">
              {totalFundings} {totalFundings === 1 ? 'funding' : 'fundings'}
            </Badge>
          </div>
        </motion.div>

        {/* Quick Stats Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3"
        >
          <Card className="border-0 bg-gradient-to-br from-success/10 to-success/5">
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-success/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <p className="text-lg font-bold text-success">{formatUGX(totalRoiEarned)}</p>
              <p className="text-xs text-muted-foreground">Total ROI Earned</p>
            </CardContent>
          </Card>
          <Card className="border-0 bg-gradient-to-br from-primary/10 to-primary/5">
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-primary/20 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <p className="text-lg font-bold text-primary">{formatUGX(expectedMonthlyRoi)}</p>
              <p className="text-xs text-muted-foreground">Monthly ROI</p>
            </CardContent>
          </Card>
          <Card className="border-0 bg-gradient-to-br from-violet-500/10 to-violet-500/5">
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-violet-500/20 flex items-center justify-center">
                <Gift className="h-5 w-5 text-violet-500" />
              </div>
              <p className="text-lg font-bold text-violet-600">15%</p>
              <p className="text-xs text-muted-foreground">ROI Rate</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Investment Accounts Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              My Accounts
            </h2>
            <Badge variant="secondary" className="font-medium">
              {accounts.length} total
            </Badge>
          </div>

          {accounts.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <Wallet className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-bold text-foreground mb-1">No Investment Accounts Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Start funding rent requests to build your investment portfolio
                </p>
                <Button onClick={() => navigate('/dashboard')} className="gap-2">
                  <Target className="h-4 w-4" />
                  Browse Opportunities
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {accounts.map((account, index) => (
                  <motion.div
                    key={account.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card 
                      className="border-0 bg-card shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-[0.98] overflow-hidden"
                      onClick={() => handleViewDetails(account)}
                    >
                      <CardContent className="p-0">
                        {/* Colored top border */}
                        <div 
                          className="h-1 w-full"
                          style={{ backgroundColor: account.color }}
                        />
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div 
                                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                                style={{ backgroundColor: `${account.color}15` }}
                              >
                                <Wallet className="h-6 w-6" style={{ color: account.color }} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <p className="font-bold text-foreground truncate">{account.name}</p>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-[10px] shrink-0 ${getStatusColor(account.status)}`}
                                  >
                                    {account.status === 'approved' ? 'Active' : 
                                     account.status === 'pending_activation' ? 'Pending' : account.status}
                                  </Badge>
                                </div>
                                <p className="text-2xl font-black text-foreground tracking-tight">
                                  {formatUGX(account.balance)}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            </div>
                          </div>
                          
                          {/* Stats row */}
                          <div className="flex items-center gap-4 mt-3 pt-3 border-t">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Users className="h-3.5 w-3.5" />
                              <span>{account.linked_fundings.length} fundings</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-success font-medium">
                              <ArrowUpRight className="h-3.5 w-3.5" />
                              <span>+{formatUGX(account.total_roi_earned)} ROI</span>
                            </div>
                            <div className="flex-1 text-right text-xs text-muted-foreground">
                              {format(new Date(account.created_at), 'MMM yyyy')}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.section>

        {/* Performance Summary */}
        {accounts.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="border-0 bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Performance Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Invested</span>
                  <span className="font-bold">{formatUGX(totalBalance)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Returns</span>
                  <span className="font-bold text-success">+{formatUGX(totalRoiEarned)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">ROI Percentage</span>
                  <span className="font-bold text-primary">
                    {totalBalance > 0 ? ((totalRoiEarned / totalBalance) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <Progress 
                  value={totalBalance > 0 ? Math.min((totalRoiEarned / totalBalance) * 100, 100) : 0} 
                  className="h-2 mt-2"
                />
              </CardContent>
            </Card>
          </motion.section>
        )}
      </main>

      {/* Account Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedAccount && (
                <>
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${selectedAccount.color}20` }}
                  >
                    <Wallet className="h-4 w-4" style={{ color: selectedAccount.color }} />
                  </div>
                  {selectedAccount.name}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedAccount && (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 pb-4">
                {/* Account Summary */}
                <div className="grid grid-cols-2 gap-3">
                  <Card className="border-0 bg-primary/5">
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Balance</p>
                      <p className="text-lg font-black text-primary">{formatUGX(selectedAccount.balance)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 bg-success/5">
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">ROI Earned</p>
                      <p className="text-lg font-black text-success">+{formatUGX(selectedAccount.total_roi_earned)}</p>
                    </CardContent>
                  </Card>
                </div>

                <Tabs defaultValue="fundings" className="w-full">
                  <TabsList className="w-full grid grid-cols-2">
                    <TabsTrigger value="fundings" className="gap-1.5 text-xs">
                      <Users className="h-3 w-3" />
                      Linked Fundings
                    </TabsTrigger>
                    <TabsTrigger value="roi" className="gap-1.5 text-xs">
                      <History className="h-3 w-3" />
                      ROI History
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="fundings" className="mt-3 space-y-2">
                    {selectedAccount.linked_fundings.length === 0 ? (
                      <div className="text-center py-6">
                        <Users className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">No linked fundings yet</p>
                      </div>
                    ) : (
                      selectedAccount.linked_fundings.map((funding) => (
                        <Card key={funding.id} className="border-0 bg-muted/30">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge 
                                    variant="outline" 
                                    className={`text-[10px] ${
                                      funding.status === 'verified' 
                                        ? 'bg-success/10 text-success border-success/30'
                                        : 'bg-warning/10 text-warning border-warning/30'
                                    }`}
                                  >
                                    {funding.status === 'verified' ? 'Verified' : 'Pending'}
                                  </Badge>
                                </div>
                                <p className="font-medium text-foreground">{funding.tenant_name}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Building2 className="h-3 w-3" />
                                  {funding.landlord_name}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {format(new Date(funding.funded_at), 'MMM d, yyyy')}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-foreground">{formatUGX(funding.rent_amount)}</p>
                                {funding.roi_earned > 0 && (
                                  <p className="text-xs text-success">+{formatUGX(funding.roi_earned)} earned</p>
                                )}
                                {funding.roi_pending > 0 && funding.status === 'verified' && (
                                  <p className="text-xs text-primary">+{formatUGX(funding.roi_pending)}/mo</p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="roi" className="mt-3 space-y-2">
                    {selectedAccount.interest_payments.length === 0 ? (
                      <div className="text-center py-6">
                        <Coins className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">No ROI payments yet</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          First payment arrives 30 days after verification
                        </p>
                      </div>
                    ) : (
                      selectedAccount.interest_payments.map((payment) => (
                        <Card key={payment.id} className="border-0 bg-success/5">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-foreground">{payment.payment_month}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(payment.credited_at), 'MMM d, yyyy')}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {payment.interest_rate}% on {formatUGX(payment.principal_amount)}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-success">+{formatUGX(payment.interest_amount)}</p>
                                <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Credited
                                </Badge>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </TabsContent>
                </Tabs>

                {/* Account Info */}
                <div className="pt-4 border-t space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-medium">{format(new Date(selectedAccount.created_at), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className={getStatusColor(selectedAccount.status)}>
                      {selectedAccount.status === 'approved' ? 'Active' : selectedAccount.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Monthly ROI Rate</span>
                    <span className="font-medium text-success">15%</span>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
