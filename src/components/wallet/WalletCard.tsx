import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wallet, Send, Plus, ArrowUpRight, ArrowDownLeft, HandCoins, Bell, Receipt, History } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { SendMoneyDialog } from './SendMoneyDialog';
import { DepositDialog } from './DepositDialog';
import { RequestMoneyDialog } from './RequestMoneyDialog';
import { PendingRequestsDialog } from './PendingRequestsDialog';
import { TransactionReceipt } from './TransactionReceipt';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { supabase } from '@/integrations/supabase/client';
import { SkeletonWallet } from '@/components/ui/skeleton';

export function WalletCard() {
  const navigate = useNavigate();
  const { wallet, transactions, loading, refreshWallet, refreshTransactions } = useWallet();
  const { user } = useAuth();
  const { profile } = useProfile();
  const [sendOpen, setSendOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
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

  useEffect(() => {
    fetchPendingCount();
  }, [fetchPendingCount]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-UG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handlePendingClose = (open: boolean) => {
    setPendingOpen(open);
    if (!open) {
      fetchPendingCount();
      refreshWallet();
      refreshTransactions();
    }
  };

  if (loading) {
    return <SkeletonWallet />;
  }

  return (
    <>
      <Card className="overflow-hidden border-border">
        {/* Header with gradient */}
        <div className="bg-primary p-4 sm:p-5 text-primary-foreground">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary-foreground/10">
                <Wallet className="h-5 w-5" />
              </div>
              <span className="font-semibold text-sm">Wallet</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="relative h-10 w-10 text-primary-foreground hover:bg-primary-foreground/10"
              onClick={() => setPendingOpen(true)}
            >
              <Bell className="h-5 w-5" />
              {pendingCount > 0 && (
                <Badge className="absolute -top-0.5 -right-0.5 h-5 w-5 p-0 flex items-center justify-center text-xs bg-warning text-warning-foreground">
                  {pendingCount}
                </Badge>
              )}
            </Button>
          </div>
          
          <div className="flex items-center gap-3">
            <UserAvatar 
              avatarUrl={profile?.avatar_url} 
              fullName={profile?.full_name} 
              size="md" 
            />
            <div className="flex-1">
              <p className="text-sm opacity-90 truncate">{profile?.full_name || 'User'}</p>
              <p className="text-3xl sm:text-2xl font-bold tracking-tight mt-0.5">
                {wallet?.balance ? (
                  wallet.balance >= 1000000 
                    ? `UGX ${(wallet.balance / 1000000).toFixed(1)}M`
                    : wallet.balance >= 1000
                    ? `UGX ${(wallet.balance / 1000).toFixed(0)}K`
                    : formatCurrency(wallet.balance)
                ) : 'UGX 0'}
              </p>
            </div>
          </div>
        </div>
        
        <CardContent className="p-3 sm:p-4 space-y-3">
          {/* Action buttons - Large touch targets */}
          <div className="grid grid-cols-3 gap-2">
            <Button 
              onClick={() => setSendOpen(true)} 
              className="flex-col gap-1 h-auto py-3 active:scale-95"
            >
              <Send className="h-5 w-5" />
              <span className="text-xs font-medium">Send</span>
            </Button>
            <Button 
              onClick={() => setRequestOpen(true)} 
              variant="secondary"
              className="flex-col gap-1 h-auto py-3 active:scale-95"
            >
              <HandCoins className="h-5 w-5" />
              <span className="text-xs font-medium">Request</span>
            </Button>
            <Button 
              onClick={() => setDepositOpen(true)} 
              variant="outline" 
              className="flex-col gap-1 h-auto py-3 active:scale-95"
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs font-medium">Add</span>
            </Button>
          </div>

          {/* Recent transactions - Simplified */}
          {transactions.length > 0 && (
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent</p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => navigate('/transactions')}
                  className="gap-1 h-auto py-1 px-2 text-xs"
                >
                  All
                  <History className="h-3 w-3" />
                </Button>
              </div>
              <div className="space-y-1">
                {transactions.slice(0, 3).map((tx) => {
                  const isSent = tx.sender_id === user?.id;
                  return (
                    <button 
                      key={tx.id} 
                      onClick={() => {
                        setSelectedTransaction(tx);
                        setReceiptOpen(true);
                      }}
                      className="flex items-center justify-between p-2.5 rounded-xl w-full hover:bg-muted/50 active:scale-[0.98] transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`p-2 rounded-full ${isSent ? 'bg-destructive/10' : 'bg-success/10'}`}>
                          {isSent ? (
                            <ArrowUpRight className="h-4 w-4 text-destructive" />
                          ) : (
                            <ArrowDownLeft className="h-4 w-4 text-success" />
                          )}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold truncate max-w-[120px]">
                            {isSent ? tx.recipient_name?.split(' ')[0] : tx.sender_name?.split(' ')[0]}
                          </p>
                        </div>
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

      <SendMoneyDialog open={sendOpen} onOpenChange={setSendOpen} />
      <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
      <RequestMoneyDialog 
        open={requestOpen} 
        onOpenChange={setRequestOpen} 
        onSuccess={fetchPendingCount}
      />
      <PendingRequestsDialog open={pendingOpen} onOpenChange={handlePendingClose} />
      <TransactionReceipt 
        open={receiptOpen} 
        onOpenChange={setReceiptOpen} 
        transaction={selectedTransaction}
        currentUserId={user?.id || ''}
      />
    </>
  );
}