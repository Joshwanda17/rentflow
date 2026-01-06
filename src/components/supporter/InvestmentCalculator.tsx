import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Calculator, TrendingUp, Target, Coins, Sparkles, Zap } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { motion, AnimatePresence } from 'framer-motion';

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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary/10 via-background to-success/10 backdrop-blur-xl shadow-xl">
        {/* Decorative elements */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-primary/20 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-success/20 to-transparent rounded-full blur-3xl" />
        
        <CardHeader className="relative pb-2">
          <div className="flex items-center gap-4">
            <motion.div 
              className="p-3.5 rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-violet-600 shadow-xl shadow-primary/30"
              whileHover={{ scale: 1.05, rotate: -5 }}
            >
              <Calculator className="h-6 w-6 text-primary-foreground" />
            </motion.div>
            <div>
              <CardTitle className="text-xl font-black tracking-tight">ROI Calculator</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Zap className="h-3.5 w-3.5 text-warning" />
                <p className="text-sm text-muted-foreground font-medium">15% guaranteed monthly returns</p>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="relative space-y-6 pt-4">
          {/* Desired Earnings Input */}
          <div className="space-y-4">
            <Label className="text-sm font-semibold text-foreground">
              💰 How much do you want to earn monthly?
            </Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-bold">
                UGX
              </span>
              <Input
                type="text"
                value={desiredEarnings.toLocaleString()}
                onChange={(e) => {
                  const value = parseInt(e.target.value.replace(/,/g, '')) || 0;
                  setDesiredEarnings(Math.max(0, Math.min(value, 100000000)));
                }}
                className="pl-14 text-xl font-black h-14 bg-white/5 border-white/20 focus:border-primary/50 backdrop-blur-sm rounded-xl"
              />
            </div>
            <Slider
              value={[desiredEarnings]}
              onValueChange={([value]) => setDesiredEarnings(value)}
              min={50000}
              max={5000000}
              step={50000}
              className="py-3"
            />
            <div className="flex justify-between text-xs text-muted-foreground font-medium">
              <span>UGX 50K</span>
              <span className="text-primary font-bold">Slide to adjust</span>
              <span>UGX 5M</span>
            </div>
          </div>

          {/* Results */}
          <div className="grid grid-cols-2 gap-4">
            <motion.div 
              className="relative p-5 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-violet-600/10 border border-primary/30 overflow-hidden"
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              <div className="absolute -top-8 -right-8 w-20 h-20 bg-primary/20 rounded-full blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">Invest This</span>
                </div>
                <AnimatePresence mode="wait">
                  <motion.p 
                    key={calculations.requiredInvestment}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-xl font-black text-foreground"
                  >
                    {formatUGX(calculations.requiredInvestment)}
                  </motion.p>
                </AnimatePresence>
              </div>
            </motion.div>
            
            <motion.div 
              className="relative p-5 rounded-2xl bg-gradient-to-br from-success/20 via-success/10 to-emerald-600/10 border border-success/30 overflow-hidden"
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              <div className="absolute -top-8 -right-8 w-20 h-20 bg-success/20 rounded-full blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <span className="text-xs font-bold text-success uppercase tracking-wider">You Earn</span>
                </div>
                <AnimatePresence mode="wait">
                  <motion.p 
                    key={calculations.monthlyReturn}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-xl font-black text-success"
                  >
                    {formatUGX(calculations.monthlyReturn)}
                  </motion.p>
                </AnimatePresence>
              </div>
            </motion.div>
          </div>

          {/* Extended Projections */}
          <motion.div 
            className="p-5 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-warning" />
              <span className="text-sm font-bold text-foreground">Projected Earnings 📈</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-xl bg-white/5">
                <p className="text-[10px] text-muted-foreground mb-1 font-semibold uppercase tracking-wider">3 Months</p>
                <p className="font-black text-foreground text-lg">{formatUGX(calculations.quarterlyReturn)}</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-white/5">
                <p className="text-[10px] text-muted-foreground mb-1 font-semibold uppercase tracking-wider">6 Months</p>
                <p className="font-black text-foreground text-lg">{formatUGX(calculations.monthlyReturn * 6)}</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-gradient-to-br from-success/20 to-success/10 border border-success/20">
                <p className="text-[10px] text-success mb-1 font-semibold uppercase tracking-wider">1 Year</p>
                <p className="font-black text-success text-lg">{formatUGX(calculations.yearlyReturn)}</p>
              </div>
            </div>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
