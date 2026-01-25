import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Calculator, ArrowLeft } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { CurrencySwitcher } from '@/components/CurrencySwitcher';

interface WeeklyMonthlyCalculatorProps {
  onProceed: () => void;
  onBack: () => void;
}

const PLATFORM_FEE = 10000; // UGX 10,000
const MONTHLY_COMPOUND_RATE = 0.33; // 33% per month (compounding)
const MAX_DAYS = 120;
const MIN_DAYS = 7;

// Quick select options for common periods
const quickOptions = [
  { days: 7, label: '1 Week' },
  { days: 14, label: '2 Weeks' },
  { days: 21, label: '3 Weeks' },
  { days: 30, label: '1 Month' },
  { days: 60, label: '2 Months' },
  { days: 90, label: '3 Months' },
  { days: 120, label: '4 Months' },
];

/**
 * Calculate access fee with monthly compounding (33% per month)
 * Prorated for partial months
 */
function calculateCompoundingAccessFee(amount: number, days: number): number {
  const months = days / 30;
  // Compounding 33% per month, prorated
  const rate = Math.pow(1 + MONTHLY_COMPOUND_RATE, months) - 1;
  return Math.round(amount * rate);
}

export default function WeeklyMonthlyCalculator({ onProceed, onBack }: WeeklyMonthlyCalculatorProps) {
  const { formatAmount, currency } = useCurrency();
  const [rentAmount, setRentAmount] = useState('');
  const [paybackDays, setPaybackDays] = useState(30);

  const calculation = useMemo(() => {
    const amount = parseInt(rentAmount.replace(/,/g, ''));
    if (!amount || amount <= 0) return null;

    // Access fee with monthly compounding
    const accessFee = calculateCompoundingAccessFee(amount, paybackDays);
    
    // Total repayment = rent + access fee + platform fee
    const totalRepayment = amount + accessFee + PLATFORM_FEE;

    return {
      rentAmount: amount,
      days: paybackDays,
      platformFee: PLATFORM_FEE,
      accessFee,
      totalRepayment,
    };
  }, [rentAmount, paybackDays]);

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
            Repayment Calculator
          </span>
          <CurrencySwitcher variant="compact" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Rent Amount Input */}
        <div className="space-y-2">
          <Label>Rent Amount ({currency.code})</Label>
          <Input
            type="text"
            value={rentAmount}
            onChange={(e) => setRentAmount(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="e.g., 500000"
          />
        </div>

        {/* Quick Select Buttons */}
        <div className="space-y-2">
          <Label>Quick Select</Label>
          <div className="flex flex-wrap gap-2">
            {quickOptions.map((option) => (
              <Button
                key={option.days}
                variant={paybackDays === option.days ? "default" : "outline"}
                size="sm"
                onClick={() => setPaybackDays(option.days)}
                className="text-xs"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Custom Days Slider */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>Payback Period</Label>
            <span className="text-sm font-medium text-primary">{paybackDays} days</span>
          </div>
          <Slider
            value={[paybackDays]}
            onValueChange={(value) => setPaybackDays(value[0])}
            min={MIN_DAYS}
            max={MAX_DAYS}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{MIN_DAYS} days</span>
            <span>{MAX_DAYS} days</span>
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
              <span className="text-muted-foreground">Access Fee:</span>
              <span className="font-mono font-medium text-warning">{formatAmount(calculation.accessFee)}</span>
            </div>
            
            <div className="border-t border-border pt-3">
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">
                    Total to Pay Back in {calculation.days} days
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
