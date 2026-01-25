import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator, ArrowLeft } from 'lucide-react';
import { calculateRentRepayment, RentCalculation } from '@/lib/rentCalculations';
import { useCurrency } from '@/hooks/useCurrency';
import { CurrencySwitcher } from '@/components/CurrencySwitcher';
import IncomeTypeSelector, { IncomeType } from './IncomeTypeSelector';
import WeeklyMonthlyCalculator from './WeeklyMonthlyCalculator';

interface RentCalculatorProps {
  onProceed: () => void;
}

export default function RentCalculator({ onProceed }: RentCalculatorProps) {
  const [incomeType, setIncomeType] = useState<IncomeType | null>(null);
  const { formatAmount, currency } = useCurrency();
  const [rentAmount, setRentAmount] = useState('');
  const [duration, setDuration] = useState<'30' | '60' | '90'>('30');
  const [calculation, setCalculation] = useState<RentCalculation | null>(null);

  const handleCalculate = () => {
    const amount = parseInt(rentAmount.replace(/,/g, ''));
    if (amount > 0) {
      setCalculation(calculateRentRepayment(amount, parseInt(duration) as 30 | 60 | 90));
    }
  };

  // Show income type selector first
  if (!incomeType) {
    return <IncomeTypeSelector onSelect={setIncomeType} />;
  }

  // Show weekly/monthly calculator
  if (incomeType === 'weekly-monthly') {
    return (
      <WeeklyMonthlyCalculator
        onProceed={onProceed}
        onBack={() => setIncomeType(null)}
      />
    );
  }

  // Daily income earner calculator (existing)
  return (
    <Card className="glass-card glow-primary">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIncomeType(null)}
              className="h-8 w-8 mr-1"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Calculator className="h-5 w-5 text-primary" />
            Daily Repayment Calculator
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
            <Label>Duration</Label>
            <Select value={duration} onValueChange={(v) => setDuration(v as '30' | '60' | '90')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 Days</SelectItem>
                <SelectItem value="60">60 Days</SelectItem>
                <SelectItem value="90">90 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={handleCalculate} className="w-full">Calculate</Button>

        {calculation && (
          <div className="mt-4 p-4 rounded-lg bg-secondary/50 space-y-3">
            <div className="flex justify-between items-center text-sm mb-2">
              <span className="text-muted-foreground">Rent Amount:</span>
              <span className="font-mono font-medium">{formatAmount(calculation.rentAmount)}</span>
            </div>
            
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Daily Payment for {calculation.durationDays} days</p>
                <p className="text-2xl font-bold text-primary font-mono">{formatAmount(calculation.dailyRepayment)}</p>
              </div>
            </div>
            
            <Button onClick={onProceed} className="w-full mt-4">
              Proceed to Request
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
