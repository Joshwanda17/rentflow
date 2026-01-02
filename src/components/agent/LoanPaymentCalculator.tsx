import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calculator, Calendar, TrendingUp, Banknote } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface LoanCalculation {
  principal: number;
  interestRate: number;
  durationDays: number;
  totalInterest: number;
  totalRepayment: number;
  dailyPayment: number;
  weeklyPayment: number;
  monthlyPayment: number;
  schedule: PaymentScheduleItem[];
}

interface PaymentScheduleItem {
  period: number;
  label: string;
  amount: number;
  principal: number;
  interest: number;
  balance: number;
}

export function LoanPaymentCalculator() {
  const [loanAmount, setLoanAmount] = useState('');
  const [interestRate, setInterestRate] = useState('10');
  const [durationDays, setDurationDays] = useState('30');
  const [paymentFrequency, setPaymentFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  const calculation = useMemo<LoanCalculation | null>(() => {
    const principal = parseFloat(loanAmount.replace(/,/g, ''));
    const rate = parseFloat(interestRate);
    const days = parseInt(durationDays);

    if (!principal || principal <= 0 || isNaN(rate) || isNaN(days)) return null;

    const totalInterest = Math.round(principal * (rate / 100));
    const totalRepayment = principal + totalInterest;
    const dailyPayment = Math.ceil(totalRepayment / days);
    const weeklyPayment = Math.ceil(totalRepayment / Math.ceil(days / 7));
    const monthlyPayment = Math.ceil(totalRepayment / Math.ceil(days / 30));

    // Generate payment schedule based on frequency
    const schedule: PaymentScheduleItem[] = [];
    let periodsCount = 0;
    let periodDays = 1;
    let periodPayment = dailyPayment;

    if (paymentFrequency === 'weekly') {
      periodsCount = Math.ceil(days / 7);
      periodDays = 7;
      periodPayment = weeklyPayment;
    } else if (paymentFrequency === 'monthly') {
      periodsCount = Math.ceil(days / 30);
      periodDays = 30;
      periodPayment = monthlyPayment;
    } else {
      periodsCount = days;
      periodDays = 1;
      periodPayment = dailyPayment;
    }

    let remainingBalance = totalRepayment;
    const periodInterest = totalInterest / periodsCount;
    const periodPrincipal = principal / periodsCount;

    for (let i = 1; i <= periodsCount; i++) {
      const isLastPeriod = i === periodsCount;
      const payment = isLastPeriod ? remainingBalance : periodPayment;
      remainingBalance = Math.max(0, remainingBalance - payment);

      schedule.push({
        period: i,
        label: paymentFrequency === 'daily' 
          ? `Day ${i}`
          : paymentFrequency === 'weekly'
          ? `Week ${i}`
          : `Month ${i}`,
        amount: Math.round(payment),
        principal: Math.round(periodPrincipal),
        interest: Math.round(periodInterest),
        balance: Math.round(remainingBalance)
      });
    }

    return {
      principal,
      interestRate: rate,
      durationDays: days,
      totalInterest,
      totalRepayment,
      dailyPayment,
      weeklyPayment,
      monthlyPayment,
      schedule
    };
  }, [loanAmount, interestRate, durationDays, paymentFrequency]);

  const formatNumber = (num: string) => {
    const value = num.replace(/[^0-9]/g, '');
    return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          Loan Payment Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Input Form */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-muted-foreground" />
              Loan Amount (UGX)
            </Label>
            <Input
              type="text"
              value={formatNumber(loanAmount)}
              onChange={(e) => setLoanAmount(e.target.value.replace(/,/g, ''))}
              placeholder="e.g., 500,000"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Interest Rate (%)
            </Label>
            <Input
              type="number"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              placeholder="e.g., 10"
              min="0"
              max="100"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Duration (days)
            </Label>
            <Select value={durationDays} onValueChange={setDurationDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 Days</SelectItem>
                <SelectItem value="14">14 Days</SelectItem>
                <SelectItem value="30">30 Days (1 month)</SelectItem>
                <SelectItem value="60">60 Days (2 months)</SelectItem>
                <SelectItem value="90">90 Days (3 months)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results */}
        {calculation && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-xs text-muted-foreground">Principal</p>
                <p className="text-lg font-bold">{formatUGX(calculation.principal)}</p>
              </div>
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                <p className="text-xs text-muted-foreground">Interest ({calculation.interestRate}%)</p>
                <p className="text-lg font-bold text-warning">{formatUGX(calculation.totalInterest)}</p>
              </div>
              <div className="p-3 rounded-lg bg-success/10 border border-success/20 col-span-2">
                <p className="text-xs text-muted-foreground">Total Repayment</p>
                <p className="text-xl font-bold text-success">{formatUGX(calculation.totalRepayment)}</p>
              </div>
            </div>

            {/* Payment Breakdown */}
            <div className="p-4 rounded-xl bg-secondary/30 border border-border/50">
              <h4 className="font-semibold mb-3 text-sm">Payment Breakdown</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 rounded-lg bg-background/50">
                  <p className="text-xs text-muted-foreground mb-1">Daily</p>
                  <p className="font-bold text-primary">{formatUGX(calculation.dailyPayment)}</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-background/50 ring-2 ring-primary/30">
                  <p className="text-xs text-muted-foreground mb-1">Weekly</p>
                  <p className="font-bold text-primary">{formatUGX(calculation.weeklyPayment)}</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-background/50">
                  <p className="text-xs text-muted-foreground mb-1">Monthly</p>
                  <p className="font-bold text-primary">{formatUGX(calculation.monthlyPayment)}</p>
                </div>
              </div>
            </div>

            {/* Payment Schedule */}
            <Tabs value={paymentFrequency} onValueChange={(v) => setPaymentFrequency(v as 'daily' | 'weekly' | 'monthly')}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
              </TabsList>
              <TabsContent value={paymentFrequency} className="mt-4">
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-4 gap-2 p-3 bg-muted/50 text-xs font-medium text-muted-foreground">
                    <div>Period</div>
                    <div className="text-right">Payment</div>
                    <div className="text-right">Principal</div>
                    <div className="text-right">Balance</div>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-border/50">
                    {calculation.schedule.map((item) => (
                      <div key={item.period} className="grid grid-cols-4 gap-2 p-3 text-sm hover:bg-muted/30 transition-colors">
                        <div className="font-medium">{item.label}</div>
                        <div className="text-right font-mono">{formatUGX(item.amount)}</div>
                        <div className="text-right font-mono text-muted-foreground">{formatUGX(item.principal)}</div>
                        <div className="text-right font-mono">
                          <span className={item.balance === 0 ? 'text-success font-bold' : ''}>
                            {formatUGX(item.balance)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {!calculation && loanAmount && (
          <p className="text-center text-muted-foreground py-4">
            Enter a valid loan amount to see the payment breakdown
          </p>
        )}
      </CardContent>
    </Card>
  );
}
