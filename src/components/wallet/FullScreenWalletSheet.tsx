import { useState, useEffect, useCallback } from 'react';
import { CompactAmount } from '@/components/ui/CompactAmount';
import { useCurrency } from '@/hooks/useCurrency';
import { getDynamicCurrencyName } from '@/lib/currencyFormat';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Send, Plus, HandCoins, 
  Bell, TrendingUp, ArrowDownToLine,
  X, Calendar, ChevronRight,
  ChevronDown, FileDown, CreditCard
} from 'lucide-react';
import { fetchAgentWalletData } from '@/lib/fetchAgentWalletData';
import { generateAgentWalletReportPdf } from '@/lib/agentWalletReportPdf';
import { useWallet } from '@/hooks/useWallet';
import { SendMoneyDialog } from './SendMoneyDialog';
import DepositFlow from '@/components/payments/DepositFlow';
import { RequestMoneyDialog } from './RequestMoneyDialog';
import { PendingRequestsDialog } from './PendingRequestsDialog';
import { TransactionReceipt } from './TransactionReceipt';
import { UserDepositRequests } from './UserDepositRequests';
import { WithdrawRequestDialog } from './WithdrawRequestDialog';
import { UserWithdrawalRequests } from './UserWithdrawalRequests';
import { AnimatedBalance } from './AnimatedBalance';
import { NfcCardSetupDialog } from './NfcCardSetupDialog';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useAgentBalances } from '@/hooks/useAgentBalances';
import { UserAvatar } from '@/components/UserAvatar';
import { hapticTap } from '@/lib/haptics';
import { fetchPendingCounts, invalidatePendingCountsCache } from '@/lib/pendingCountsCache';
import { WalletLedgerStatement } from './WalletLedgerStatement';
import { ProxyPartnerFunds } from '@/components/agent/ProxyPartnerFunds';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WalletTransactionTimeline, type TabValue } from './WalletTransactionTimeline';
import { BillPaymentDialog } from './BillPaymentDialog';
import { FoodMarketDialog } from './FoodMarketDialog';
import { WalletDisclaimer } from './WalletDisclaimer';
import { AgentRentRequestsWalletSection } from './AgentRentRequestsWalletSection';
import { format } from 'date-fns';
import { EmptyHousePlacementBonusBanner } from '@/components/agent/EmptyHousePlacementBonusBanner';
import { FloatBreakdownCard } from './FloatBreakdownCard';
import { AgentMoneyMapCard } from './AgentMoneyMapCard';

interface FullScreenWalletSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FullScreenWalletSheet({ open, onOpenChange }: FullScreenWalletSheetProps) {
  const navigate = useNavigate();
  const { wallet, transactions, loading, refreshWallet, refreshTransactions } = useWallet();
  const { user, role } = useAuth();
  const { profile } = useProfile();
  const isAgent = role === 'agent';
  const { commissionBalance, withdrawableBalance } = useAgentBalances();
  const { floatBalance: walletFloatBalance, advanceBalance, pendingHolds } = useAgentBalances();
  // STRICT: total visible balance is float + ledger-backed withdrawable.
  // We never use the raw cached `wallets.balance` because it can drift
  // above the user's true ledger-backed position.
  const realWithdrawableBalance = Math.max(0, withdrawableBalance);
  const displayBalance = isAgent
    ? walletFloatBalance + realWithdrawableBalance
    : realWithdrawableBalance;
  const balanceLabel = 'Total Balance';
  const [sendOpen, setSendOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [nfcCardOpen, setNfcCardOpen] = useState(false);
  const [billsOpen, setBillsOpen] = useState(false);
  const [foodMarketOpen, setFoodMarketOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingDeposits, setPendingDeposits] = useState(0);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const [selectedTransaction, setSelectedTransaction] = useState<typeof transactions[0] | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [hasProxyPartners, setHasProxyPartners] = useState(false);

  const fetchAllPendingCounts = useCallback(async () => {
    if (!user) return;
    const counts = await fetchPendingCounts(user.id);
    setPendingCount(counts.moneyRequests);
    setPendingDeposits(counts.deposits);
    setPendingWithdrawals(counts.withdrawals);
  }, [user]);

  // Check if the agent has proxy partners or proxy ROI entries. Custody v2
  // payouts can be approved directly to the partner wallet (target_wallet_user_id
  // is null/partner), so gating the tab only on old agent-wallet approvals hides
  // today's CFO-approved proxy partner list.
  useEffect(() => {
    const checkProxy = async () => {
      if (!user?.id) return;
      const { count } = await supabase
        .from('proxy_agent_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', user.id)
        .eq('beneficiary_role', 'supporter')
        .eq('is_active', true)
        .eq('approval_status', 'approved');
      setHasProxyPartners((count || 0) > 0);
    };
    if (open) checkProxy();
  }, [open, user?.id]);

  useEffect(() => {
    if (open) {
      fetchAllPendingCounts();
      refreshWallet();
      refreshTransactions();
    }
  }, [open, fetchAllPendingCounts, refreshWallet, refreshTransactions]);

  const { formatAmount: formatCurrency } = useCurrency();

  const handlePendingClose = (isOpen: boolean) => {
    setPendingOpen(isOpen);
    if (!isOpen) {
      invalidatePendingCountsCache();
      fetchAllPendingCounts();
      refreshWallet();
      refreshTransactions();
    }
  };

  const totalPending = pendingCount + pendingDeposits + pendingWithdrawals;

  const recentStats = transactions.reduce(
    (acc, tx) => {
      if (tx.sender_id === user?.id) {
        acc.sent += tx.amount;
      } else {
        acc.received += tx.amount;
      }
      return acc;
    },
    { sent: 0, received: 0 }
  );

  const netAmount = recentStats.received - recentStats.sent;
  const currentMonth = format(new Date(), 'MMMM yyyy');
  const spentGoal = 500000; // Example goal
  const spentPercent = spentGoal > 0 ? Math.min((recentStats.sent / spentGoal) * 100, 100) : 0;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          side="bottom" 
          className="h-[100dvh] p-0 rounded-none border-0 flex flex-col"
        >
          {/* Clean white top bar */}
          <div className="safe-area-top bg-background border-b border-border/40">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <UserAvatar 
                  avatarUrl={profile?.avatar_url} 
                  fullName={profile?.full_name} 
                  size="sm" 
                />
                <span className="text-lg font-bold text-foreground tracking-tight">Welile</span>
              </div>
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="relative h-9 w-9 text-foreground hover:bg-muted rounded-full"
                  onClick={() => setPendingOpen(true)}
                >
                  <Bell className="h-5 w-5" />
                  {pendingCount > 0 && (
                    <Badge className="absolute -top-0.5 -right-0.5 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground">
                      {pendingCount}
                    </Badge>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <div 
            className="flex-1 overflow-y-auto overscroll-contain bg-muted/30"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="p-4 space-y-4">
              {/* Purple gradient balance card */}
              <Card className="overflow-hidden border-0 shadow-lg">
                <div className="portfolio-hero-card p-6 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70 mb-2">
                    {balanceLabel}
                  </p>
                  <AnimatedBalance 
                    value={displayBalance} 
                    className="text-[clamp(2rem,9vw,3rem)] font-black text-white tracking-tight block leading-none"
                  />
                  <p className="text-[11px] text-white/50 mt-2 uppercase tracking-widest font-medium">
                    {getDynamicCurrencyName()}
                  </p>
                  <WalletDisclaimer variant="dark" />
                </div>
              </Card>

              {/* Plain-language money breakdown (agents only) */}
              {isAgent && (
                <AgentMoneyMapCard
                  withdrawable={realWithdrawableBalance}
                  float={walletFloatBalance}
                  advance={advanceBalance}
                  pendingHolds={pendingHolds}
                />
              )}

              {/* Bounty: empty houses waiting for a tenant (agents only) */}
              {isAgent && <EmptyHousePlacementBonusBanner />}

              {/* Float breakdown (agents only) */}
              {isAgent && walletFloatBalance > 0 && (
                <FloatBreakdownCard floatBalance={walletFloatBalance} />
              )}

              {/* Deposit card */}
              <Card 
                className="border-border/50 shadow-sm cursor-pointer active:scale-[0.98] transition-all"
                onClick={() => { hapticTap(); setDepositOpen(true); }}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-[hsl(270,80%,55%)]/10 flex items-center justify-center shrink-0">
                    <Plus className="h-6 w-6 text-[hsl(270,80%,55%)]" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-foreground">Deposit</p>
                    <p className="text-xs text-muted-foreground">Add funds to your wallet</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground/50" />
                </CardContent>
              </Card>

              {/* Withdraw card */}
              <Card 
                className="border-border/50 shadow-sm cursor-pointer active:scale-[0.98] transition-all"
                onClick={() => { hapticTap(); setWithdrawOpen(true); }}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center shrink-0">
                    <ArrowDownToLine className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-foreground">Withdraw</p>
                    <p className="text-xs text-muted-foreground">Cash out to mobile money</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground/50" />
                </CardContent>
              </Card>

              {/* Setup Card (NFC) */}
              <Card
                className="border-border/50 shadow-sm cursor-pointer active:scale-[0.98] transition-all"
                onClick={() => { hapticTap(); setNfcCardOpen(true); }}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-[hsl(270,80%,55%)]/10 flex items-center justify-center shrink-0">
                    <CreditCard className="h-6 w-6 text-[hsl(270,80%,55%)]" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-foreground">Setup Card</p>
                    <p className="text-xs text-muted-foreground">Configure NFC card & PIN</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground/50" />
                </CardContent>
              </Card>

              {/* Quick actions row */}
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  onClick={() => { hapticTap(); setSendOpen(true); }} 
                  variant="outline"
                  className="h-auto py-3 rounded-2xl border-border/50 flex items-center gap-2"
                >
                  <Send className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Send</span>
                </Button>
                <Button 
                  onClick={() => { hapticTap(); setRequestOpen(true); }} 
                  variant="outline"
                  className="h-auto py-3 rounded-2xl border-border/50 flex items-center gap-2"
                >
                  <HandCoins className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Request</span>
                </Button>
              </div>

              {/* Wallet Statement section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-base font-bold text-foreground">Wallet Statement</h3>
                    <p className="text-xs text-muted-foreground">Updated just now</p>
                  </div>
                </div>

                {/* All-time net card */}
                <Card className="border-border/50 shadow-sm mb-4">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">All-Time Net</p>
                      <p className={`text-xl font-black tabular-nums ${netAmount >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {netAmount >= 0 ? '+' : ''}{formatCurrency(netAmount)}
                      </p>
                    </div>
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${netAmount >= 0 ? 'bg-success/10' : 'bg-destructive/10'}`}>
                      <TrendingUp className={`h-5 w-5 ${netAmount >= 0 ? 'text-success' : 'text-destructive'}`} />
                    </div>
                  </CardContent>
                </Card>

                {/* Monthly summary card */}
                <Card className="border-border/50 shadow-sm mb-4">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Summary for {currentMonth}
                      </p>
                    </div>
                    <div className="flex items-end justify-between mb-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Spent</p>
                        <p className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(recentStats.sent)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Goal</p>
                        <p className="text-sm font-semibold text-muted-foreground tabular-nums">{formatCurrency(spentGoal)}</p>
                      </div>
                    </div>
                    <Progress 
                      value={spentPercent} 
                      size="sm" 
                      variant={spentPercent > 80 ? 'destructive' : spentPercent > 50 ? 'warning' : 'default'} 
                    />
                  </CardContent>
                </Card>

                {/* Download Statement Button */}
                {isAgent && user?.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 text-xs"
                    onClick={async () => {
                      try {
                        const data = await fetchAgentWalletData(user.id);
                        const blob = await generateAgentWalletReportPdf(data);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `My_Wallet_Statement.pdf`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch (e) { console.error(e); }
                    }}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    Download Wallet Statement (PDF)
                  </Button>
                )}

                {/* Ledger statement with optional proxy tab */}
                {hasProxyPartners ? (
                  <Tabs defaultValue="statement">
                    <TabsList variant="pills" className="w-full">
                      <TabsTrigger value="statement" variant="pills">Wallet Statement</TabsTrigger>
                      <TabsTrigger value="proxy" variant="pills">Proxy Partners</TabsTrigger>
                    </TabsList>
                    <TabsContent value="statement">
                      <WalletLedgerStatement />
                    </TabsContent>
                    <TabsContent value="proxy">
                      <ProxyPartnerFunds />
                    </TabsContent>
                  </Tabs>
                ) : (
                  <WalletLedgerStatement />
                )}
              </div>

              {/* Recent Transactions */}
              <WalletTransactionTimeline
                transactions={transactions}
                currentUserId={user?.id || ''}
                currentBalance={displayBalance}
                formatCurrency={formatCurrency}
                onSelectTransaction={(tx) => {
                  setSelectedTransaction(tx);
                  setReceiptOpen(true);
                }}
                onViewAll={() => {
                  onOpenChange(false);
                  navigate('/transactions');
                }}
                ownerName={profile?.full_name || undefined}
                ownerPhone={profile?.phone || undefined}
              />

              {/* Agent Rent Requests — verify inline */}
              <AgentRentRequestsWalletSection />

              {/* User's Pending Requests */}
              <UserDepositRequests />
              <UserWithdrawalRequests />

              {/* Bottom padding for safe area */}
              <div className="h-8 safe-area-bottom" />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialogs */}
      <SendMoneyDialog open={sendOpen} onOpenChange={setSendOpen} />
      <DepositFlow
        open={depositOpen}
        onOpenChange={setDepositOpen}
        {...(isAgent
          ? { allowedPurposes: ['operational_float', 'personal_deposit'] as const, lockPurpose: true, requirePurposeChoice: true }
          : role === 'supporter'
            ? { allowedPurposes: ['partnership_deposit'] as const, defaultPurpose: 'partnership_deposit' as const, lockPurpose: true }
            : {})}
      />
      <RequestMoneyDialog 
        open={requestOpen} 
        onOpenChange={setRequestOpen} 
        onSuccess={fetchAllPendingCounts}
      />
      <PendingRequestsDialog open={pendingOpen} onOpenChange={handlePendingClose} />
      <WithdrawRequestDialog 
        open={withdrawOpen} 
        onOpenChange={setWithdrawOpen} 
        // For agents: total = withdrawable + float (float is reserved for proxy
        // partner payouts but should still be visible so the agent knows their
        // real wallet position). The backend enforces proxy-only float spending.
        walletBalance={isAgent ? (realWithdrawableBalance + walletFloatBalance) : (wallet?.balance || 0)}
        onSuccess={refreshWallet}
      />
      <TransactionReceipt 
        open={receiptOpen} 
        onOpenChange={setReceiptOpen} 
        transaction={selectedTransaction}
        currentUserId={user?.id || ''}
      />
      <BillPaymentDialog open={billsOpen} onOpenChange={setBillsOpen} />
      <FoodMarketDialog open={foodMarketOpen} onOpenChange={setFoodMarketOpen} />
      <NfcCardSetupDialog open={nfcCardOpen} onOpenChange={setNfcCardOpen} />
    </>
  );
}
