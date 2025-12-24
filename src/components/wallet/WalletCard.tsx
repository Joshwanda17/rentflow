import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-12 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden border-0 shadow-elevated">
        <div className="gradient-primary p-5 text-primary-foreground">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm">
                <Wallet className="h-5 w-5" />
              </div>
              <span className="font-semibold">Welile Wallet</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="relative text-primary-foreground hover:bg-white/20"
              onClick={() => setPendingOpen(true)}
            >
              <Bell className="h-4 w-4" />
              {pendingCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-warning text-warning-foreground">
                  {pendingCount}
                </Badge>
              )}
            </Button>
          </div>
          
          <div className="flex items-center gap-4">
            <UserAvatar 
              avatarUrl={profile?.avatar_url} 
              fullName={profile?.full_name} 
              size="lg" 
            />
            <div>
              <p className="text-sm opacity-90">{profile?.full_name || 'User'}</p>
              <p className="text-xs opacity-70 mb-1">Available Balance</p>
              <p className="text-3xl font-bold tracking-tight">
                {formatCurrency(wallet?.balance || 0)}
              </p>
            </div>
          </div>
        </div>
        
        <CardContent className="p-5 space-y-4">

          <div className="grid grid-cols-3 gap-2">
            <Button 
              onClick={() => setSendOpen(true)} 
              className="gap-1"
              size="sm"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </Button>
            <Button 
              onClick={() => setRequestOpen(true)} 
              variant="secondary"
              className="gap-1"
              size="sm"
            >
              <HandCoins className="h-4 w-4" />
              <span className="hidden sm:inline">Request</span>
            </Button>
            <Button 
              onClick={() => setDepositOpen(true)} 
              variant="outline" 
              className="gap-1"
              size="sm"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Deposit</span>
            </Button>
          </div>

          {transactions.length > 0 && (
            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">Recent Transactions</p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => navigate('/transactions')}
                  className="gap-1 h-auto py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <History className="h-3 w-3" />
                  View All
                </Button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {transactions.slice(0, 5).map((tx) => {
                  const isSent = tx.sender_id === user?.id;
                  return (
                    <button 
                      key={tx.id} 
                      onClick={() => {
                        setSelectedTransaction(tx);
                        setReceiptOpen(true);
                      }}
                      className="flex items-center justify-between p-2 rounded-lg bg-background/50 w-full hover:bg-background/80 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-full ${isSent ? 'bg-destructive/20' : 'bg-green-500/20'}`}>
                          {isSent ? (
                            <ArrowUpRight className="h-3 w-3 text-destructive" />
                          ) : (
                            <ArrowDownLeft className="h-3 w-3 text-green-500" />
                          )}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium">
                            {isSent ? tx.recipient_name : tx.sender_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(tx.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold ${isSent ? 'text-destructive' : 'text-green-500'}`}>
                          {isSent ? '-' : '+'}{formatCurrency(tx.amount)}
                        </p>
                        <Receipt className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
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
