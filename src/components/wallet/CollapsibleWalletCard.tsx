import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Wallet, Send, Plus, ArrowUpRight, ArrowDownLeft, HandCoins, 
  Bell, History, TrendingUp, TrendingDown, ArrowDownToLine,
  ChevronDown, ChevronUp
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
import { supabase } from '@/integrations/supabase/client';
import { hapticTap } from '@/lib/haptics';

export function CollapsibleWalletCard() {
  const navigate = useNavigate();
  const { wallet, transactions, loading, refreshWallet, refreshTransactions } = useWallet();
  const { user } = useAuth();
  const { profile } = useProfile();
  const [isOpen, setIsOpen] = useState(false);
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

  const fetchPendingCount = useCallback(async () => {
    if (!user) return;
    
    const { count } = await supabase
      .from('money_requests')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('status', 'pending');
    
    setPendingCount(count || 0);
  }, [user]);

  const fetchPendingRequests = useCallback(async () => {
    if (!user) return;
    
    const [depositRes, withdrawRes] = await Promise.all([
      supabase
        .from('deposit_requests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'pending'),
      supabase
        .from('withdrawal_requests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'pending')
    ]);
    
    setPendingDeposits(depositRes.count || 0);
    setPendingWithdrawals(withdrawRes.count || 0);
  }, [user]);

  useEffect(() => {
    fetchPendingCount();
    fetchPendingRequests();
  }, [fetchPendingCount, fetchPendingRequests]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handlePendingClose = (open: boolean) => {
    setPendingOpen(open);
    if (!open) {
      fetchPendingCount();
      refreshWallet();
      refreshTransactions();
    }
  };

  const handleToggle = () => {
    hapticTap();
    setIsOpen(!isOpen);
  };

  const totalPending = pendingCount + pendingDeposits + pendingWithdrawals;

  // Calculate income/expense from recent transactions
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
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            onClick={handleToggle}
            className="w-full justify-between h-12 px-4 rounded-xl border-primary/30 bg-primary/5 hover:bg-primary/10 active:scale-[0.98] transition-all touch-manipulation"
          >
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-primary/20">
                <Wallet className="h-4 w-4 text-primary" />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Wallet Balance</span>
                {!loading && wallet && (
                  <span className="text-sm font-bold text-primary">
                    {wallet.balance >= 1000000 
                      ? `${(wallet.balance / 1000000).toFixed(1)}M` 
                      : wallet.balance >= 1000 
                        ? `${(wallet.balance / 1000).toFixed(0)}K` 
                        : formatCurrency(wallet.balance)}
                  </span>
                )}
              </div>
              {totalPending > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-warning/20 text-warning">
                  {totalPending}
                </Badge>
              )}
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-3 space-y-3"
              >
                {/* Wallet Card */}
                <Card className="overflow-hidden border-border/50 shadow-lg rounded-2xl">
                  {/* Header with gradient */}
                  <div className="bg-gradient-to-br from-primary via-primary to-primary/85 p-4 text-primary-foreground">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <motion.div 
                          className="p-2 rounded-xl bg-primary-foreground/15 backdrop-blur-sm"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Wallet className="h-4 w-4" />
                        </motion.div>
                        <span className="font-semibold text-xs tracking-wide uppercase opacity-90">Balance</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="relative h-9 w-9 text-primary-foreground hover:bg-primary-foreground/15 rounded-xl"
                        onClick={() => setPendingOpen(true)}
                      >
                        <Bell className="h-4 w-4" />
                        {pendingCount > 0 && (
                          <Badge className="absolute -top-0.5 -right-0.5 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-warning text-warning-foreground animate-pulse">
                            {pendingCount}
                          </Badge>
                        )}
                      </Button>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <UserAvatar 
                        avatarUrl={profile?.avatar_url} 
                        fullName={profile?.full_name} 
                        size="sm" 
                      />
                      <div className="flex-1">
                        <p className="text-xs opacity-80 truncate font-medium">{profile?.full_name || 'User'}</p>
                        <AnimatedBalance 
                          value={wallet?.balance || 0} 
                          className="text-2xl font-bold tracking-tight mt-0.5 block"
                        />
                      </div>
                    </div>

                    {/* Quick Stats Row */}
                    {transactions.length > 0 && (
                      <motion.div 
                        className="flex gap-3 mt-3 pt-2.5 border-t border-primary-foreground/20"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <div className="p-1 rounded-full bg-success/20">
                            <TrendingUp className="h-3 w-3 text-success" />
                          </div>
                          <div>
                            <p className="text-[9px] opacity-70 uppercase tracking-wide">In</p>
                            <p className="text-xs font-semibold">
                              {recentStats.received >= 1000 
                                ? `${(recentStats.received / 1000).toFixed(0)}K` 
                                : recentStats.received}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-1">
                          <div className="p-1 rounded-full bg-destructive/20">
                            <TrendingDown className="h-3 w-3 text-destructive" />
                          </div>
                          <div>
                            <p className="text-[9px] opacity-70 uppercase tracking-wide">Out</p>
                            <p className="text-xs font-semibold">
                              {recentStats.sent >= 1000 
                                ? `${(recentStats.sent / 1000).toFixed(0)}K` 
                                : recentStats.sent}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                  
                  <CardContent className="p-3 space-y-3">
                    {/* Action buttons */}
                    <div className="grid grid-cols-4 gap-2">
                      <Button 
                        onClick={() => setSendOpen(true)} 
                        className="flex-col gap-1 h-auto py-2.5 rounded-xl active:scale-95 transition-all shadow-sm hover:shadow-md"
                      >
                        <Send className="h-4 w-4" />
                        <span className="text-[9px] font-semibold tracking-wide">Send</span>
                      </Button>
                      <Button 
                        onClick={() => setRequestOpen(true)} 
                        variant="secondary"
                        className="flex-col gap-1 h-auto py-2.5 rounded-xl active:scale-95 transition-all"
                      >
                        <HandCoins className="h-4 w-4" />
                        <span className="text-[9px] font-semibold tracking-wide">Request</span>
                      </Button>
                      <Button 
                        onClick={() => setDepositOpen(true)} 
                        variant="outline" 
                        className="flex-col gap-1 h-auto py-2.5 rounded-xl active:scale-95 transition-all border-border/60"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="text-[9px] font-semibold tracking-wide">Add</span>
                      </Button>
                      <Button 
                        onClick={() => setWithdrawOpen(true)} 
                        variant="outline" 
                        className="flex-col gap-1 h-auto py-2.5 rounded-xl active:scale-95 transition-all border-warning/50 text-warning hover:bg-warning/10"
                      >
                        <ArrowDownToLine className="h-4 w-4" />
                        <span className="text-[9px] font-semibold tracking-wide">Withdraw</span>
                      </Button>
                    </div>

                    {/* Recent transactions */}
                    {transactions.length > 0 && (
                      <div className="pt-2.5 border-t border-border/50">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Recent</p>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => navigate('/transactions')}
                            className="gap-1 h-auto py-0.5 px-2 text-xs"
                          >
                            All
                            <History className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="space-y-1">
                          {transactions.slice(0, 2).map((tx) => {
                            const isSent = tx.sender_id === user?.id;
                            return (
                              <button 
                                key={tx.id} 
                                onClick={() => {
                                  setSelectedTransaction(tx);
                                  setReceiptOpen(true);
                                }}
                                className="flex items-center justify-between p-2 rounded-xl w-full hover:bg-muted/50 active:scale-[0.98] transition-all"
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`p-1.5 rounded-full ${isSent ? 'bg-destructive/10' : 'bg-success/10'}`}>
                                    {isSent ? (
                                      <ArrowUpRight className="h-3.5 w-3.5 text-destructive" />
                                    ) : (
                                      <ArrowDownLeft className="h-3.5 w-3.5 text-success" />
                                    )}
                                  </div>
                                  <p className="text-sm font-semibold truncate max-w-[100px]">
                                    {isSent ? tx.recipient_name?.split(' ')[0] : tx.sender_name?.split(' ')[0]}
                                  </p>
                                </div>
                                <p className={`text-sm font-bold tabular-nums ${isSent ? 'text-destructive' : 'text-success'}`}>
                                  {isSent ? '-' : '+'}
                                  {tx.amount >= 1000 ? `${(tx.amount / 1000).toFixed(0)}K` : tx.amount}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* User's Requests - Collapsible */}
                <UserDepositRequests />
                <UserWithdrawalRequests />
              </motion.div>
            )}
          </AnimatePresence>
        </CollapsibleContent>
      </Collapsible>

      {/* Dialogs */}
      <SendMoneyDialog open={sendOpen} onOpenChange={setSendOpen} />
      <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
      <RequestMoneyDialog 
        open={requestOpen} 
        onOpenChange={setRequestOpen} 
        onSuccess={fetchPendingCount}
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
