import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Wallet, Clock, CheckCircle, XCircle, ArrowDownToLine, Sparkles } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { InvestmentAccount } from '@/components/supporter/InvestmentAccountCard';

interface SimpleAccountsListProps {
  accounts: InvestmentAccount[];
  onCreateAccount: () => void;
  onFundAccount: (account: InvestmentAccount) => void;
  onWithdrawAccount: (account: InvestmentAccount) => void;
  onViewDetails: (account: InvestmentAccount) => void;
}

export function SimpleAccountsList({ 
  accounts, 
  onCreateAccount, 
  onFundAccount,
  onWithdrawAccount,
  onViewDetails 
}: SimpleAccountsListProps) {
  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-3.5 w-3.5 text-success" />;
      case 'pending':
        return <Clock className="h-3.5 w-3.5 text-warning" />;
      case 'rejected':
        return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'approved':
        return 'bg-success/10 text-success border-success/30';
      case 'pending':
        return 'bg-warning/10 text-warning border-warning/30';
      case 'rejected':
        return 'bg-destructive/10 text-destructive border-destructive/30';
      default:
        return '';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xl">💼</span>
          <h3 className="font-bold text-foreground">My Accounts</h3>
        </div>
        <Button 
          size="sm" 
          onClick={onCreateAccount}
          className="h-9 gap-1.5 bg-gradient-to-r from-primary to-primary/80"
        >
          <Plus className="h-4 w-4" />
          New
        </Button>
      </div>

      {/* Accounts */}
      {accounts.length === 0 ? (
        <Card className="border-0 bg-muted/30">
          <CardContent className="p-6 text-center space-y-3">
            <div className="p-4 rounded-full bg-primary/10 w-fit mx-auto">
              <Wallet className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground">No Accounts Yet</p>
              <p className="text-sm text-muted-foreground mb-4">Create one to start investing!</p>
              <Button onClick={onCreateAccount} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Account
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {accounts.map((account, index) => (
            <motion.div
              key={account.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => onViewDetails(account)}
              className="cursor-pointer"
            >
              <Card className="border-0 bg-gradient-to-r from-primary/5 to-transparent hover:from-primary/10 transition-all active:scale-[0.98]">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    {/* Account Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span 
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: `hsl(var(--${account.color === 'blue' ? 'primary' : account.color === 'green' ? 'success' : 'primary'}))` }}
                        />
                        <p className="font-bold text-foreground truncate">{account.name}</p>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${getStatusColor(account.status)}`}>
                          {getStatusIcon(account.status)}
                          <span className="ml-1 capitalize">{account.status}</span>
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-black text-foreground">{formatUGX(account.balance)}</p>
                        <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30">
                          15% ROI
                        </Badge>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    {account.status === 'approved' && (
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          onClick={() => onFundAccount(account)}
                          className="h-10 w-10 p-0 bg-primary/20 hover:bg-primary/30 text-primary"
                          variant="ghost"
                        >
                          <Sparkles className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => onWithdrawAccount(account)}
                          className="h-10 w-10 p-0"
                          variant="outline"
                          disabled={account.balance <= 0}
                        >
                          <ArrowDownToLine className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
