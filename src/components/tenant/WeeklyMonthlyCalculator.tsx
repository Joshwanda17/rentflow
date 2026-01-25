import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator, ArrowLeft } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { CurrencySwitcher } from '@/components/CurrencySwitcher';

interface WeeklyMonthlyCalculatorProps {
  onProceed: () => void;
  onBack: () => void;
}

type RepaymentPeriod = '7' | '14' | '21' | '120'; // 7 days, 14 days, 21 days, 4 months (120 days)

const PLATFORM_FEE = 10000; // UGX 10,000
const DAILY_ACCESS_FEE_RATE = 0.011; // 1.1% per day

const repaymentOptions: { value: RepaymentPeriod; label: string; days: number }[] = [
  { value: '7', label: 'Weekly (7 days)', days: 7 },
  { value: '14', label: 'After 2 Weeks (14 days)', days: 14 },
  { value: '21', label: 'After 3 Weeks (21 days)', days: 21 },
  { value: '120', label: 'After 4 Months (120 days)', days: 120 },
];

export default function WeeklyMonthlyCalculator({ onProceed, onBack }: WeeklyMonthlyCalculatorProps) {
  const { formatAmount, currency } = useCurrency();
  const [rentAmount, setRentAmount] = useState('');
  const [repaymentPeriod, setRepaymentPeriod] = useState<RepaymentPeriod>('7');

  const calculation = useMemo(() => {
    const amount = parseInt(rentAmount.replace(/,/g, ''));
    if (!amount || amount <= 0) return null;

    const selectedOption = repaymentOptions.find(o => o.value === repaymentPeriod);
    if (!selectedOption) return null;

    const days = selectedOption.days;
    
    // Access fee = 1.1% per day × rent amount × number of days
    const accessFee = Math.round(amount * DAILY_ACCESS_FEE_RATE * days);
    
    // Total repayment = rent + access fee + platform fee
    const totalRepayment = amount + accessFee + PLATFORM_FEE;

    return {
      rentAmount: amount,
      days,
      periodLabel: selectedOption.label,
      platformFee: PLATFORM_FEE,
      accessFee,
      accessFeePerDay: Math.round(amount * DAILY_ACCESS_FEE_RATE),
      totalRepayment,
    };
  }, [rentAmount, repaymentPeriod]);

  return (
    <Card className="glass-card glow-primary">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-8 w-8 mr-1"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Calculator className="h-5 w-5 text-primary" />
            Weekly/Monthly Repayment Calculator
          </span>
          <CurrencySwitcher variant="compact" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Rent Amount ({currency.code})</Label>
            <Input
              type="text"
              value={rentAmount}
              onChange={(e) => setRentAmount(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="e.g., 500000"
            />
          </div>
          <div className="space-y-2">
            <Label>When to Pay Back</Label>
            <Select value={repaymentPeriod} onValueChange={(v) => setRepaymentPeriod(v as RepaymentPeriod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {repaymentOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {calculation && (
          <div className="mt-4 p-4 rounded-lg bg-secondary/50 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Rent Amount:</span>
              <span className="font-mono font-medium">{formatAmount(calculation.rentAmount)}</span>
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Platform Fee:</span>
              <span className="font-mono font-medium">{formatAmount(calculation.platformFee)}</span>
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">
                Access Fee ({calculation.days} days × 1.1%/day):
              </span>
              <span className="font-mono font-medium text-warning">{formatAmount(calculation.accessFee)}</span>
            </div>
            
            <div className="text-xs text-muted-foreground pl-2 border-l-2 border-muted">
              Daily access fee: {formatAmount(calculation.accessFeePerDay)}/day
            </div>
            
            <div className="border-t border-border pt-3">
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">
                    Total to Pay Back ({calculation.periodLabel})
                  </p>
                  <p className="text-2xl font-bold text-primary font-mono">
                    {formatAmount(calculation.totalRepayment)}
                  </p>
                </div>
              </div>
            </div>
            
            <Button onClick={onProceed} className="w-full mt-4">
              Proceed to Request
            </Button>
          </div>
        )}

        {!calculation && rentAmount && (
          <p className="text-center text-muted-foreground py-4">
            Enter a valid rent amount to see the repayment breakdown
          </p>
        )}
      </CardContent>
    </Card>
  );
}
