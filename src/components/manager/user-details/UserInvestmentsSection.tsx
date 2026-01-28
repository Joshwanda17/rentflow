import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  PiggyBank, 
  Calendar, 
  CheckCircle, 
  Clock, 
  XCircle,
  TrendingUp,
  Percent,
  Wallet,
  Plus,
  DollarSign,
  Pencil
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { hapticTap } from '@/lib/haptics';
import CreateAccountForUserDialog from './CreateAccountForUserDialog';
import { FundInvestmentAccountDialog } from '../FundInvestmentAccountDialog';
import { EditInvestmentAccountDialog } from '../EditInvestmentAccountDialog';

interface InvestmentAccount {
  id: string;
  name: string;
  balance: number;
  color: string;
  status: string;
  created_at: string;
  approved_at: string | null;
}

interface InterestPayment {
  id: string;
  account_id: string;
  interest_amount: number;
  interest_rate: number;
  principal_amount: number;
  payment_month: string;
  credited_at: string;
}

interface UserInvestmentsSectionProps {
  userId: string;
  userName?: string;
  userPhone?: string;
}

export default function UserInvestmentsSection({ userId, userName, userPhone }: UserInvestmentsSectionProps) {
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [interestPayments, setInterestPayments] = useState<InterestPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [fundDialogOpen, setFundDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<InvestmentAccount | null>(null);

  useEffect(() => {
    fetchInvestmentData();
  }, [userId]);

  const fetchInvestmentData = async () => {
    setLoading(true);
    try {
      const [{ data: accts }, { data: payments }] = await Promise.all([
        supabase
          .from('investment_accounts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('investment_interest_payments')
          .select('*')
          .eq('user_id', userId)
          .order('credited_at', { ascending: false })
      ]);

      setAccounts(accts || []);
      setInterestPayments(payments || []);
    } catch (error) {
      console.error('Error fetching investment data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-success/20 text-success"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-destructive/20 text-destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge className="bg-warning/20 text-warning"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  // Calculate totals
  const approvedAccounts = accounts.filter(a => a.status === 'approved');
  const totalInvested = approvedAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalInterestEarned = interestPayments.reduce((sum, p) => sum + p.interest_amount, 0);
  const pendingAccounts = accounts.filter(a => a.status === 'pending');

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Investment Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <PiggyBank className="h-3 w-3" />
            Total Invested
          </div>
          <p className="font-semibold text-sm">{formatUGX(totalInvested)}</p>
          <p className="text-xs text-muted-foreground">{approvedAccounts.length} accounts</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <TrendingUp className="h-3 w-3" />
            Interest Earned
          </div>
          <p className="font-semibold text-sm text-success">{formatUGX(totalInterestEarned)}</p>
          <p className="text-xs text-muted-foreground">{interestPayments.length} payments</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Wallet className="h-3 w-3" />
            Total Value
          </div>
          <p className="font-semibold text-sm">{formatUGX(totalInvested + totalInterestEarned)}</p>
        </Card>
        <Card className={`p-3 ${pendingAccounts.length > 0 ? 'border-warning/50' : ''}`}>
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Clock className="h-3 w-3" />
            Pending
          </div>
          <p className="font-semibold text-sm">{pendingAccounts.length}</p>
          <p className="text-xs text-muted-foreground">awaiting approval</p>
        </Card>
      </div>

      {/* Manager Actions */}
      <Button
        onClick={() => { hapticTap(); setCreateDialogOpen(true); }}
        className="w-full gap-2 h-12"
        variant="default"
      >
        <Plus className="h-4 w-4" />
        Create Investment Account
      </Button>

      {/* Investment Accounts List */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-primary" />
              Investment Accounts
            </span>
            <Badge variant="secondary">{accounts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {accounts.length === 0 ? (
            <div className="text-center py-6">
              <PiggyBank className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm">No investment accounts yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create one using the button above</p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => {
                const accountInterest = interestPayments
                  .filter(p => p.account_id === account.id)
                  .reduce((sum, p) => sum + p.interest_amount, 0);

                return (
                  <div key={account.id} className="overflow-hidden rounded-lg border">
                    <div className="h-1.5" style={{ backgroundColor: account.color }} />
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{account.name}</p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(account.created_at), 'MMM d, yyyy')}
                          </div>
                        </div>
                        {getStatusBadge(account.status)}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div>
                          <span className="text-muted-foreground">Balance: </span>
                          <span className="font-semibold">{formatUGX(account.balance)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Interest: </span>
                          <span className="font-semibold text-success">{formatUGX(accountInterest)}</span>
                        </div>
                      </div>

                      {/* Account Action Buttons - Mobile Optimized */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-10 gap-1.5 text-xs"
                          onClick={() => {
                            hapticTap();
                            setSelectedAccount(account);
                            setFundDialogOpen(true);
                          }}
                        >
                          <DollarSign className="h-3.5 w-3.5" />
                          Fund
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-10 gap-1.5 text-xs"
                          onClick={() => {
                            hapticTap();
                            setSelectedAccount(account);
                            setEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Interest Payment History */}
      {interestPayments.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Percent className="h-4 w-4 text-success" />
              Interest Payment History
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {interestPayments.slice(0, 5).map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{payment.payment_month}</p>
                    <p className="text-xs text-muted-foreground">
                      {payment.interest_rate}% on {formatUGX(payment.principal_amount)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-success">
                    +{formatUGX(payment.interest_amount)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      {userName && userPhone && (
        <CreateAccountForUserDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          user={{ id: userId, full_name: userName, phone: userPhone }}
          onSuccess={fetchInvestmentData}
        />
      )}

      <FundInvestmentAccountDialog
        open={fundDialogOpen}
        onOpenChange={setFundDialogOpen}
        account={selectedAccount ? {
          id: selectedAccount.id,
          name: selectedAccount.name,
          balance: selectedAccount.balance,
          user_id: userId,
          user_name: userName
        } : null}
        onSuccess={fetchInvestmentData}
      />

      <EditInvestmentAccountDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        account={selectedAccount ? {
          id: selectedAccount.id,
          name: selectedAccount.name,
          color: selectedAccount.color,
          balance: selectedAccount.balance,
          user_id: userId,
          user_name: userName
        } : null}
        onSuccess={fetchInvestmentData}
      />
    </div>
  );
}
