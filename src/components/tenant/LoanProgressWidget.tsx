import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Banknote, Calendar, TrendingUp, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { differenceInDays, format, isPast, isToday } from 'date-fns';

interface Loan {
  id: string;
  amount: number;
  interest_rate: number;
  total_repayment: number;
  paid_amount: number;
  due_date: string;
  status: string;
  created_at: string;
  lender_id: string;
  lender_name?: string;
}

interface LoanProgressWidgetProps {
  userId: string;
}

export default function LoanProgressWidget({ userId }: LoanProgressWidgetProps) {
  const navigate = useNavigate();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLoans();
  }, [userId]);

  const fetchLoans = async () => {
    const { data: loansData, error } = await supabase
      .from('user_loans')
      .select('*')
      .eq('borrower_id', userId)
      .eq('status', 'active')
      .order('due_date', { ascending: true });

    if (!error && loansData) {
      // Fetch lender names
      const lenderIds = [...new Set(loansData.map(l => l.lender_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', lenderIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
      
      const loansWithNames = loansData.map(loan => ({
        ...loan,
        lender_name: profileMap.get(loan.lender_id) || 'Unknown'
      }));

      setLoans(loansWithNames);
    }
    setLoading(false);
  };

  const getDaysUntilDue = (dueDate: string) => {
    return differenceInDays(new Date(dueDate), new Date());
  };

  const getDueDateStatus = (dueDate: string) => {
    const days = getDaysUntilDue(dueDate);
    if (isPast(new Date(dueDate)) && !isToday(new Date(dueDate))) {
      return { label: 'Overdue', variant: 'destructive' as const, urgent: true };
    }
    if (days <= 3) {
      return { label: `${days} day${days !== 1 ? 's' : ''} left`, variant: 'warning' as const, urgent: true };
    }
    if (days <= 7) {
      return { label: `${days} days left`, variant: 'default' as const, urgent: false };
    }
    return { label: format(new Date(dueDate), 'MMM d'), variant: 'secondary' as const, urgent: false };
  };

  const getProgressPercentage = (loan: Loan) => {
    return Math.min(100, (loan.paid_amount / loan.total_repayment) * 100);
  };

  if (loading) {
    return (
      <Card className="elevated-card">
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loans.length === 0) {
    return null;
  }

  const totalOwed = loans.reduce((sum, loan) => sum + (loan.total_repayment - loan.paid_amount), 0);
  const urgentLoans = loans.filter(loan => getDueDateStatus(loan.due_date).urgent);

  return (
    <Card className="elevated-card overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-warning/20 to-warning/5">
              <Banknote className="h-4 w-4 text-warning" />
            </div>
            <CardTitle className="text-lg font-semibold">Rent Payback</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {urgentLoans.length > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {urgentLoans.length} urgent
              </Badge>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/my-loans')}
              className="gap-1 text-muted-foreground hover:text-foreground"
            >
              View All
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-secondary/30 border border-border/50">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Total Owed</p>
            <p className="text-lg font-bold text-foreground">{formatUGX(totalOwed)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Active Rent Plans</p>
            <p className="text-lg font-bold text-foreground">{loans.length}</p>
          </div>
        </div>

        {/* Loan Cards */}
        <div className="space-y-3">
          {loans.slice(0, 3).map((loan) => {
            const progress = getProgressPercentage(loan);
            const remaining = loan.total_repayment - loan.paid_amount;
            const dueDateStatus = getDueDateStatus(loan.due_date);
            
            return (
              <div 
                key={loan.id}
                className={`p-4 rounded-xl border transition-all duration-200 ${
                  dueDateStatus.urgent 
                    ? 'bg-destructive/5 border-destructive/30 hover:border-destructive/50' 
                    : 'bg-secondary/30 border-border/50 hover:border-primary/30'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      Supported by {loan.lender_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {loan.interest_rate}% service fee
                    </p>
                  </div>
                  <Badge variant={dueDateStatus.variant}>
                    <Calendar className="h-3 w-3 mr-1" />
                    {dueDateStatus.label}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">
                      {formatUGX(loan.paid_amount)} / {formatUGX(loan.total_repayment)}
                    </span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {progress.toFixed(0)}% complete
                    </span>
                    <span>Remaining: {formatUGX(remaining)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {loans.length > 3 && (
          <Button 
            variant="outline" 
            className="w-full gap-2"
            onClick={() => navigate('/my-loans')}
          >
            View {loans.length - 3} more plans
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
