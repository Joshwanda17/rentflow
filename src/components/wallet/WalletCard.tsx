import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, Send, Plus, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { SendMoneyDialog } from './SendMoneyDialog';
import { DepositDialog } from './DepositDialog';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

export function WalletCard() {
  const { wallet, transactions, loading } = useWallet();
  const { user } = useAuth();
  const [sendOpen, setSendOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);

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
      <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wallet className="h-5 w-5 text-primary" />
            Welile Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Available Balance</p>
            <p className="text-2xl md:text-3xl font-bold text-foreground">
              {formatCurrency(wallet?.balance || 0)}
            </p>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={() => setSendOpen(true)} 
              className="flex-1 gap-2"
              size="sm"
            >
              <Send className="h-4 w-4" />
              Send
            </Button>
            <Button 
              onClick={() => setDepositOpen(true)} 
              variant="outline" 
              className="flex-1 gap-2"
              size="sm"
            >
              <Plus className="h-4 w-4" />
              Deposit
            </Button>
          </div>

          {transactions.length > 0 && (
            <div className="pt-4 border-t border-border">
              <p className="text-sm font-medium mb-3">Recent Transactions</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {transactions.slice(0, 5).map((tx) => {
                  const isSent = tx.sender_id === user?.id;
                  return (
                    <div 
                      key={tx.id} 
                      className="flex items-center justify-between p-2 rounded-lg bg-background/50"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-full ${isSent ? 'bg-destructive/20' : 'bg-green-500/20'}`}>
                          {isSent ? (
                            <ArrowUpRight className="h-3 w-3 text-destructive" />
                          ) : (
                            <ArrowDownLeft className="h-3 w-3 text-green-500" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {isSent ? tx.recipient_name : tx.sender_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(tx.created_at)}
                          </p>
                        </div>
                      </div>
                      <p className={`text-sm font-semibold ${isSent ? 'text-destructive' : 'text-green-500'}`}>
                        {isSent ? '-' : '+'}{formatCurrency(tx.amount)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SendMoneyDialog open={sendOpen} onOpenChange={setSendOpen} />
      <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
    </>
  );
}
