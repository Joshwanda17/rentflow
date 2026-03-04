import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Wallet, Send, Plus, ArrowUpRight, ArrowDownLeft, HandCoins, 
  Bell, History, TrendingUp, TrendingDown, ArrowDownToLine,
  X
} from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { SendMoneyDialog } from './SendMoneyDialog';
import { DepositDialog } from './DepositDialog';
import { RequestMoneyDialog } from './RequestMoneyDialog';
import { PendingRequestsDialog } from './PendingRequestsDialog';
import { TransactionReceipt } from './TransactionReceipt';
import { UserDepositRequests } from './UserDepositRequests';
import { WithdrawRequestDialog } from './WithdrawRequestDialog';
import { UserWithdrawalRequests } from './UserWithdrawalRequests';
import { AnimatedBalance } from './AnimatedBalance';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { hapticTap } from '@/lib/haptics';
import { fetchPendingCounts, invalidatePendingCountsCache } from '@/lib/pendingCountsCache';
import { WalletLedgerStatement } from './WalletLedgerStatement';

interface FullScreenWalletSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FullScreenWalletSheet({ open, onOpenChange }: FullScreenWalletSheetProps) {
  const navigate = useNavigate();
  const { wallet, transactions, loading, refreshWallet, refreshTransactions } = useWallet();
  const { user } = useAuth();
  const { profile } = useProfile();
  const [sendOpen, setSendOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingDeposits, setPendingDeposits] = useState(0);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const [selectedTransaction, setSelectedTransaction] = useState<typeof transactions[0] | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const fetchAllPendingCounts = useCallback(async () => {
    if (!user) return;
    const counts = await fetchPendingCounts(user.id);
    setPendingCount(counts.moneyRequests);
    setPendingDeposits(counts.deposits);
    setPendingWithdrawals(counts.withdrawals);
  }, [user]);

  useEffect(() => {
    if (open) {
      fetchAllPendingCounts();
      refreshWallet();
      refreshTransactions();
    }
  }, [open, fetchAllPendingCounts, refreshWallet, refreshTransactions]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(amount);
  };

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

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          side="bottom" 
          className="h-[100dvh] p-0 rounded-none border-0"
        >
          {/* Full-screen wallet header */}
          <div className="bg-gradient-to-br from-primary via-primary to-primary/85 text-primary-foreground safe-area-top">
            <SheetHeader className="p-4 pb-0">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-primary-foreground flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-primary-foreground/15 backdrop-blur-sm">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <span>Welile Wallet</span>
                </SheetTitle>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="relative h-10 w-10 text-primary-foreground hover:bg-primary-foreground/15 rounded-xl"
                    onClick={() => setPendingOpen(true)}
                  >
                    <Bell className="h-5 w-5" />
                    {pendingCount > 0 && (
                      <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-warning text-warning-foreground animate-pulse">
                        {pendingCount}
                      </Badge>
                    )}
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 text-primary-foreground hover:bg-primary-foreground/15 rounded-xl"
                    onClick={() => {
                      hapticTap();
                      onOpenChange(false);
                    }}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </SheetHeader>

            {/* Balance section */}
            <div className="p-4 pt-6">
              <div className="flex items-center gap-4">
                <UserAvatar 
                  avatarUrl={profile?.avatar_url} 
                  fullName={profile?.full_name} 
                  size="lg" 
                />
                <div className="flex-1">
                  <p className="text-sm opacity-80 font-medium">{profile?.full_name || 'User'}</p>
                  <AnimatedBalance 
                    value={wallet?.balance || 0} 
                    className="text-4xl font-bold tracking-tight mt-1 block"
                  />
                </div>
              </div>

              {/* Stats Row */}
              {transactions.length > 0 && (
                <motion.div 
                  className="flex gap-4 mt-6 pt-4 border-t border-primary-foreground/20"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="flex items-center gap-3 flex-1 bg-primary-foreground/10 rounded-xl p-3">
                    <div className="p-2 rounded-full bg-success/20">
                      <TrendingUp className="h-4 w-4 text-success" />
                    </div>
                    <div>
                      <p className="text-xs opacity-70 uppercase tracking-wide">Money In</p>
                      <p className="text-lg font-bold">
                        {formatCurrency(recentStats.received)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-1 bg-primary-foreground/10 rounded-xl p-3">
                    <div className="p-2 rounded-full bg-destructive/20">
                      <TrendingDown className="h-4 w-4 text-destructive" />
                    </div>
                    <div>
                      <p className="text-xs opacity-70 uppercase tracking-wide">Money Out</p>
                      <p className="text-lg font-bold">
                        {formatCurrency(recentStats.sent)}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Scrollable content */}
          <div 
            className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 bg-background"
            style={{ 
              height: 'calc(100dvh - 280px)',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {/* Action buttons - larger for full screen */}
            <div className="grid grid-cols-4 gap-3">
              <Button 
                onClick={() => {
                  hapticTap();
                  setSendOpen(true);
                }} 
                className="flex-col gap-2 h-auto py-4 rounded-2xl active:scale-95 transition-all shadow-md hover:shadow-lg"
              >
                <Send className="h-6 w-6" />
                <span className="text-xs font-semibold">Send</span>
              </Button>
              <Button 
                onClick={() => {
                  hapticTap();
                  setRequestOpen(true);
                }} 
                variant="secondary"
                className="flex-col gap-2 h-auto py-4 rounded-2xl active:scale-95 transition-all"
              >
                <HandCoins className="h-6 w-6" />
                <span className="text-xs font-semibold">Request</span>
              </Button>
              <Button 
                onClick={() => {
                  hapticTap();
                  setDepositOpen(true);
                }} 
                variant="outline" 
                className="flex-col gap-2 h-auto py-4 rounded-2xl active:scale-95 transition-all border-border"
              >
                <Plus className="h-6 w-6" />
                <span className="text-xs font-semibold">Add</span>
              </Button>
              <Button 
                onClick={() => {
                  hapticTap();
                  setWithdrawOpen(true);
                }} 
                variant="outline" 
                className="flex-col gap-2 h-auto py-4 rounded-2xl active:scale-95 transition-all border-warning/50 text-warning hover:bg-warning/10"
              >
                <ArrowDownToLine className="h-6 w-6" />
                <span className="text-xs font-semibold">Withdraw</span>
              </Button>
            </div>

            {/* Ledger-based wallet statement */}
            <WalletLedgerStatement />

            {/* Recent transactions */}
            <Card className="border-border/50 rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Recent Transactions</h3>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      hapticTap();
                      onOpenChange(false);
                      navigate('/transactions');
                    }}
                    className="gap-1 h-8 px-3 text-xs"
                  >
                    View All
                    <History className="h-3.5 w-3.5" />
                  </Button>
                </div>
                
                {transactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Wallet className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No transactions yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {transactions.slice(0, 5).map((tx) => {
                      const isSent = tx.sender_id === user?.id;
                      return (
                        <button 
                          key={tx.id} 
                          onClick={() => {
                            hapticTap();
                            setSelectedTransaction(tx);
                            setReceiptOpen(true);
                          }}
                          className="flex items-center justify-between p-3 rounded-xl w-full hover:bg-muted/50 active:scale-[0.98] transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${isSent ? 'bg-destructive/10' : 'bg-success/10'}`}>
                              {isSent ? (
                                <ArrowUpRight className="h-4 w-4 text-destructive" />
                              ) : (
                                <ArrowDownLeft className="h-4 w-4 text-success" />
                              )}
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-semibold">
                                {isSent ? tx.recipient_name : tx.sender_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(tx.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <p className={`text-base font-bold tabular-nums ${isSent ? 'text-destructive' : 'text-success'}`}>
                            {isSent ? '-' : '+'}{formatCurrency(tx.amount)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* User's Pending Requests */}
            <UserDepositRequests />
            <UserWithdrawalRequests />

            {/* Bottom padding for safe area */}
            <div className="h-8 safe-area-bottom" />
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialogs */}
      <SendMoneyDialog open={sendOpen} onOpenChange={setSendOpen} />
      <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
      <RequestMoneyDialog 
        open={requestOpen} 
        onOpenChange={setRequestOpen} 
        onSuccess={fetchAllPendingCounts}
      />
      <PendingRequestsDialog open={pendingOpen} onOpenChange={handlePendingClose} />
      <WithdrawRequestDialog 
        open={withdrawOpen} 
        onOpenChange={setWithdrawOpen} 
        walletBalance={wallet?.balance || 0}
        onSuccess={refreshWallet}
      />
      <TransactionReceipt 
        open={receiptOpen} 
        onOpenChange={setReceiptOpen} 
        transaction={selectedTransaction}
        currentUserId={user?.id || ''}
      />
    </>
  );
}
