import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import { CreditCard, Users, CheckCircle, Loader2, Search, Banknote, TrendingUp, Calendar, Calculator } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { format, addDays } from 'date-fns';
import { LoanPaymentCalculator } from './LoanPaymentCalculator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface LoanLimit {
  user_id: string;
  total_verified_amount: number;
  available_limit: number;
  used_limit: number;
  profiles?: {
    full_name: string;
    phone: string;
    email: string;
  };
}

interface UserLoan {
  id: string;
  borrower_id: string;
  lender_id: string;
  amount: number;
  interest_rate: number;
  total_repayment: number;
  status: string;
  due_date: string;
  created_at: string;
  borrower?: {
    full_name: string;
    phone: string;
  };
}

interface LoanManagementProps {
  agentId: string;
}

export function LoanManagement({ agentId }: LoanManagementProps) {
  const { toast } = useToast();
  const [loanLimits, setLoanLimits] = useState<LoanLimit[]>([]);
  const [loans, setLoans] = useState<UserLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchPhone, setSearchPhone] = useState('');
  const [searchedUser, setSearchedUser] = useState<LoanLimit | null>(null);
  const [searching, setSearching] = useState(false);
  
  // Loan form
  const [loanAmount, setLoanAmount] = useState('');
  const [interestRate, setInterestRate] = useState('10');
  const [durationDays, setDurationDays] = useState('30');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    // loan_limits and user_loans tables removed - feature not active
    setLoanLimits([]);
    setLoans([]);
    setLoading(false);
  };

  const handleSearchUser = async () => {
    if (!searchPhone.trim()) return;
    setSearching(true);
    setSearchedUser(null);
    // Feature not active
    toast({ title: 'Loans feature not active', variant: 'destructive' });
    setSearching(false);
  };

  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    // Feature not active
    toast({ title: 'Loans feature not active', variant: 'destructive' });
  };

  const handleMarkRepaid = async (loanId: string) => {
    // Feature not active
    toast({ title: 'Loans feature not active', variant: 'destructive' });
  };

  const activeLoans = loans.filter(l => l.status === 'active');
  const repaidLoans = loans.filter(l => l.status === 'repaid');
  const totalLent = activeLoans.reduce((sum, l) => sum + l.amount, 0);
  const totalExpected = activeLoans.reduce((sum, l) => sum + l.total_repayment, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="management" className="space-y-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="management" className="gap-2">
          <Banknote className="h-4 w-4" />
          Loan Management
        </TabsTrigger>
        <TabsTrigger value="calculator" className="gap-2">
          <Calculator className="h-4 w-4" />
          Payment Calculator
        </TabsTrigger>
      </TabsList>

      <TabsContent value="calculator">
        <LoanPaymentCalculator />
      </TabsContent>

      <TabsContent value="management" className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Banknote className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Active Loans</p>
                  <p className="text-xl font-bold">{activeLoans.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-warning/5 border-warning/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-warning" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Lent</p>
                  <p className="text-lg font-bold text-warning">{formatUGX(totalLent)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-success/5 border-success/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-success" />
                <div>
                  <p className="text-sm text-muted-foreground">Expected Return</p>
                  <p className="text-lg font-bold text-success">{formatUGX(totalExpected)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Repaid</p>
                  <p className="text-xl font-bold">{repaidLoans.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      {/* Create Loan */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogTrigger asChild>
          <Button className="w-full gap-2" size="lg">
            <CreditCard className="h-5 w-5" />
            Create New Loan
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Loan for User</DialogTitle>
          </DialogHeader>
          
          {/* Search User */}
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter user phone number"
                value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
              />
              <Button onClick={handleSearchUser} disabled={searching}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            {searchedUser && (
              <Card className="bg-success/5 border-success/20">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{searchedUser.profiles?.full_name}</p>
                      <p className="text-sm text-muted-foreground">{searchedUser.profiles?.phone}</p>
                    </div>
                    <Badge variant="success">Eligible</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 rounded bg-background/50">
                      <p className="text-muted-foreground">Available Limit</p>
                      <p className="font-bold text-success">{formatUGX(searchedUser.available_limit)}</p>
                    </div>
                    <div className="p-2 rounded bg-background/50">
                      <p className="text-muted-foreground">Used Limit</p>
                      <p className="font-bold">{formatUGX(searchedUser.used_limit)}</p>
                    </div>
                  </div>

                  <form onSubmit={handleCreateLoan} className="space-y-3 pt-2 border-t">
                    <div className="space-y-2">
                      <Label>Loan Amount (UGX)</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount"
                        value={loanAmount}
                        onChange={(e) => setLoanAmount(e.target.value)}
                        required
                        max={searchedUser.available_limit}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Interest Rate (%)</Label>
                        <Input
                          type="number"
                          value={interestRate}
                          onChange={(e) => setInterestRate(e.target.value)}
                          required
                          min="0"
                          max="50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Duration (days)</Label>
                        <Input
                          type="number"
                          value={durationDays}
                          onChange={(e) => setDurationDays(e.target.value)}
                          required
                          min="7"
                          max="90"
                        />
                      </div>
                    </div>
                    {loanAmount && (
                      <div className="p-3 rounded-lg bg-primary/10 text-sm space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Principal:</span>
                          <span className="font-mono">{formatUGX(parseFloat(loanAmount))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Interest ({interestRate}%):</span>
                          <span className="font-mono text-warning">{formatUGX(parseFloat(loanAmount) * parseFloat(interestRate) / 100)}</span>
                        </div>
                        <div className="flex justify-between border-t border-border pt-2">
                          <span className="font-medium">Total Repayment:</span>
                          <span className="font-bold">{formatUGX(parseFloat(loanAmount) * (1 + parseFloat(interestRate) / 100))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Due Date:</span>
                          <span className="font-medium">{format(addDays(new Date(), parseInt(durationDays)), 'MMM d, yyyy')}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
                          <div className="text-center p-2 rounded bg-background/50">
                            <p className="text-xs text-muted-foreground">Daily</p>
                            <p className="font-bold text-xs">{formatUGX(Math.ceil(parseFloat(loanAmount) * (1 + parseFloat(interestRate) / 100) / parseInt(durationDays)))}</p>
                          </div>
                          <div className="text-center p-2 rounded bg-background/50">
                            <p className="text-xs text-muted-foreground">Weekly</p>
                            <p className="font-bold text-xs">{formatUGX(Math.ceil(parseFloat(loanAmount) * (1 + parseFloat(interestRate) / 100) / Math.ceil(parseInt(durationDays) / 7)))}</p>
                          </div>
                          <div className="text-center p-2 rounded bg-background/50">
                            <p className="text-xs text-muted-foreground">Monthly</p>
                            <p className="font-bold text-xs">{formatUGX(Math.ceil(parseFloat(loanAmount) * (1 + parseFloat(interestRate) / 100) / Math.ceil(parseInt(durationDays) / 30)))}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Create Loan
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Eligible Users */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Users with Rent Access Limits
          </CardTitle>
          <CardDescription>Users who have verified shopping receipts</CardDescription>
        </CardHeader>
        <CardContent>
          {loanLimits.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No eligible users yet</p>
          ) : (
            <div className="space-y-3">
              {loanLimits.map((limit) => (
                <div 
                  key={limit.user_id} 
                  className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/50"
                >
                  <div>
                    <p className="font-semibold">{limit.profiles?.full_name || 'Unknown'}</p>
                    <p className="text-sm text-muted-foreground">{limit.profiles?.phone}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-success">{formatUGX(limit.available_limit)}</p>
                    <p className="text-xs text-muted-foreground">Available</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Loans */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Banknote className="h-5 w-5 text-warning" />
            My Active Loans
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeLoans.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No active loans</p>
          ) : (
            <div className="space-y-3">
              {activeLoans.map((loan) => (
                <div 
                  key={loan.id} 
                  className="p-4 rounded-xl bg-warning/5 border border-warning/20 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{loan.borrower?.full_name || 'Unknown'}</p>
                      <p className="text-sm text-muted-foreground">{loan.borrower?.phone}</p>
                    </div>
                    <Badge variant="warning" className="gap-1">
                      <Calendar className="h-3 w-3" />
                      Due: {new Date(loan.due_date).toLocaleDateString()}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Principal</p>
                      <p className="font-bold">{formatUGX(loan.amount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Total Due</p>
                      <p className="font-bold text-warning">{formatUGX(loan.total_repayment)}</p>
                    </div>
                  </div>
                  <Button 
                    onClick={() => handleMarkRepaid(loan.id)} 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark as Repaid
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </TabsContent>
    </Tabs>
  );
}
