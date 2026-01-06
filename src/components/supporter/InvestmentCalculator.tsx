import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Calculator, TrendingUp, Target, Coins } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

const ROI_RATE = 0.15; // 15% per month

export function InvestmentCalculator() {
  const [desiredEarnings, setDesiredEarnings] = useState(150000);

  const calculations = useMemo(() => {
    const requiredInvestment = Math.ceil(desiredEarnings / ROI_RATE);
    const monthlyReturn = requiredInvestment * ROI_RATE;
    const quarterlyReturn = monthlyReturn * 3;
    const yearlyReturn = monthlyReturn * 12;
    
    return {
      requiredInvestment,
      monthlyReturn,
      quarterlyReturn,
      yearlyReturn,
    };
  }, [desiredEarnings]);

  return (
    <Card className="elevated-card overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-success/5" />
      <CardHeader className="relative pb-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg">
            <Calculator className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">Investment Calculator</CardTitle>
            <p className="text-sm text-muted-foreground">15% monthly ROI</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative space-y-6 pt-4">
        {/* Desired Earnings Input */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-muted-foreground">
            How much do you want to earn monthly?
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
              UGX
            </span>
            <Input
              type="text"
              value={desiredEarnings.toLocaleString()}
              onChange={(e) => {
                const value = parseInt(e.target.value.replace(/,/g, '')) || 0;
                setDesiredEarnings(Math.max(0, Math.min(value, 100000000)));
              }}
              className="pl-12 text-lg font-semibold h-12 bg-secondary/50 border-border/50"
            />
          </div>
          <Slider
            value={[desiredEarnings]}
            onValueChange={([value]) => setDesiredEarnings(value)}
            min={50000}
            max={5000000}
            step={50000}
            className="py-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>UGX 50K</span>
            <span>UGX 5M</span>
          </div>
        </div>

        {/* Results */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Required Investment</span>
            </div>
            <p className="text-lg font-bold text-primary">
              {formatUGX(calculations.requiredInvestment)}
            </p>
          </div>
          
          <div className="p-4 rounded-xl bg-gradient-to-br from-success/10 to-success/5 border border-success/20">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-success" />
              <span className="text-xs font-medium text-muted-foreground">Monthly Return</span>
            </div>
            <p className="text-lg font-bold text-success">
              {formatUGX(calculations.monthlyReturn)}
            </p>
          </div>
        </div>

        {/* Extended Projections */}
        <div className="p-4 rounded-xl bg-secondary/30 border border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <Coins className="h-4 w-4 text-warning" />
            <span className="text-sm font-medium">Projected Earnings</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Quarterly</p>
              <p className="font-semibold text-foreground">{formatUGX(calculations.quarterlyReturn)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Half Year</p>
              <p className="font-semibold text-foreground">{formatUGX(calculations.monthlyReturn * 6)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Yearly</p>
              <p className="font-semibold text-success">{formatUGX(calculations.yearlyReturn)}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
