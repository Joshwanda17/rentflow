import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator } from 'lucide-react';
import { calculateRentRepayment, formatUGX, RentCalculation } from '@/lib/rentCalculations';

interface RentCalculatorProps {
  onProceed: () => void;
}

export default function RentCalculator({ onProceed }: RentCalculatorProps) {
  const [rentAmount, setRentAmount] = useState('');
  const [duration, setDuration] = useState<'30' | '60' | '90'>('30');
  const [calculation, setCalculation] = useState<RentCalculation | null>(null);

  const handleCalculate = () => {
    const amount = parseInt(rentAmount.replace(/,/g, ''));
    if (amount > 0) {
      setCalculation(calculateRentRepayment(amount, parseInt(duration) as 30 | 60 | 90));
    }
  };

  return (
    <Card className="glass-card glow-primary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          Rent Repayment Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Rent Amount (UGX)</Label>
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
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Rent Amount:</span></div>
              <div className="text-right font-mono">{formatUGX(calculation.rentAmount)}</div>
              
              <div><span className="text-muted-foreground">Access Fee ({calculation.accessFeeRate.toFixed(0)}%):</span></div>
              <div className="text-right font-mono">{formatUGX(calculation.accessFee)}</div>
              
              <div><span className="text-muted-foreground">Request Fee:</span></div>
              <div className="text-right font-mono">{formatUGX(calculation.requestFee)}</div>
              
              <div className="border-t border-border pt-2"><span className="font-medium">Total Repayment:</span></div>
              <div className="text-right font-mono font-bold border-t border-border pt-2">{formatUGX(calculation.totalRepayment)}</div>
              
              <div><span className="text-primary font-medium">Daily Payment:</span></div>
              <div className="text-right font-mono font-bold text-primary">{formatUGX(calculation.dailyRepayment)}</div>
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
