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
      transition={{ duration: 0.6 }}
      className="relative"
    >
      {/* Hero Marketing Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-violet-600/15 to-success/20 p-1">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/30 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-success/30 via-transparent to-transparent" />
        
        <Card className="relative border-0 bg-background/80 backdrop-blur-2xl shadow-2xl overflow-hidden">
          {/* Animated background elements */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-primary/20 to-transparent rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-gradient-to-tr from-success/20 to-transparent rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-r from-violet-500/10 to-primary/10 rounded-full blur-3xl" />
          
          <CardContent className="relative p-6 md:p-8 space-y-8">
            {/* Hero Headline */}
            <motion.div 
              className="text-center space-y-4"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
            >
              <motion.div 
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-success/20 to-emerald-500/20 border border-success/30"
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Sparkles className="h-4 w-4 text-success" />
                <span className="text-xs font-bold text-success uppercase tracking-wider">15% Monthly Returns • Guaranteed</span>
              </motion.div>
              
              <h1 className="text-3xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
                How Much Do You Want<br />
                <span className="text-success">To Earn?</span> 💰
              </h1>
              
              <p className="text-muted-foreground text-base md:text-lg max-w-lg mx-auto font-medium">
                Tell us your monthly income goal and we'll show you exactly how to achieve it by helping tenants pay rent
              </p>
            </motion.div>

            {/* Calculator Input - Hero Style */}
            <motion.div 
              className="space-y-6 max-w-md mx-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <div className="space-y-3">
                <Label className="text-center block text-sm font-bold text-muted-foreground uppercase tracking-wider">
                  I want to earn every month
                </Label>
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary via-violet-500 to-success rounded-2xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-lg text-muted-foreground font-bold">
                      UGX
                    </span>
                    <Input
                      type="text"
                      value={desiredEarnings.toLocaleString()}
                      onChange={(e) => {
                        const value = parseInt(e.target.value.replace(/,/g, '')) || 0;
                        setDesiredEarnings(Math.max(0, Math.min(value, 100000000)));
                      }}
                      className="pl-16 text-2xl md:text-3xl font-black h-16 md:h-20 bg-background border-2 border-primary/30 focus:border-primary rounded-2xl text-center shadow-xl"
                    />
                  </div>
                </div>
                <Slider
                  value={[desiredEarnings]}
                  onValueChange={([value]) => setDesiredEarnings(value)}
                  min={50000}
                  max={5000000}
                  step={50000}
                  className="py-4"
                />
                <div className="flex justify-between text-xs text-muted-foreground font-semibold">
                  <span>UGX 50K</span>
                  <span className="text-primary flex items-center gap-1">
                    <Zap className="h-3 w-3" /> Drag to adjust
                  </span>
                  <span>UGX 5M</span>
                </div>
              </div>
            </motion.div>

            {/* Results Cards */}
            <motion.div 
              className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              <motion.div 
                className="relative p-6 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-violet-600/15 border border-primary/30 overflow-hidden"
                whileHover={{ scale: 1.03, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <div className="absolute -top-12 -right-12 w-28 h-28 bg-primary/30 rounded-full blur-2xl" />
                <div className="relative text-center">
                  <div className="inline-flex items-center justify-center gap-2 mb-3">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-violet-600 shadow-lg">
                      <Target className="h-5 w-5 text-white" />
                    </div>
                  </div>
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">You Need To Invest</p>
                  <AnimatePresence mode="wait">
                    <motion.p 
                      key={calculations.requiredInvestment}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="text-2xl md:text-3xl font-black text-foreground"
                    >
                      {formatUGX(calculations.requiredInvestment)}
                    </motion.p>
                  </AnimatePresence>
                  <p className="text-xs text-muted-foreground mt-2">One-time investment</p>
                </div>
              </motion.div>
              
              <motion.div 
                className="relative p-6 rounded-2xl bg-gradient-to-br from-success/20 via-success/10 to-emerald-600/15 border border-success/30 overflow-hidden"
                whileHover={{ scale: 1.03, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <div className="absolute -top-12 -right-12 w-28 h-28 bg-success/30 rounded-full blur-2xl" />
                <div className="relative text-center">
                  <div className="inline-flex items-center justify-center gap-2 mb-3">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-success to-emerald-600 shadow-lg">
                      <TrendingUp className="h-5 w-5 text-white" />
                    </div>
                  </div>
                  <p className="text-xs font-bold text-success uppercase tracking-wider mb-2">You'll Earn Monthly</p>
                  <AnimatePresence mode="wait">
                    <motion.p 
                      key={calculations.monthlyReturn}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="text-2xl md:text-3xl font-black text-success"
                    >
                      {formatUGX(calculations.monthlyReturn)}
                    </motion.p>
                  </AnimatePresence>
                  <p className="text-xs text-muted-foreground mt-2">Every single month 🎉</p>
                </div>
              </motion.div>
            </motion.div>

            {/* Extended Projections */}
            <motion.div 
              className="p-5 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              <div className="flex items-center justify-center gap-2 mb-4">
                <Coins className="h-4 w-4 text-warning" />
                <span className="text-sm font-bold text-foreground">Your Earnings Journey 📈</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                  <p className="text-[10px] text-muted-foreground mb-1 font-semibold uppercase tracking-wider">3 Months</p>
                  <p className="font-black text-foreground text-base md:text-lg">{formatUGX(calculations.quarterlyReturn)}</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                  <p className="text-[10px] text-muted-foreground mb-1 font-semibold uppercase tracking-wider">6 Months</p>
                  <p className="font-black text-foreground text-base md:text-lg">{formatUGX(calculations.monthlyReturn * 6)}</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-gradient-to-br from-success/20 to-success/10 border border-success/20">
                  <p className="text-[10px] text-success mb-1 font-semibold uppercase tracking-wider">1 Year 🎯</p>
                  <p className="font-black text-success text-base md:text-lg">{formatUGX(calculations.yearlyReturn)}</p>
                </div>
              </div>
            </motion.div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
