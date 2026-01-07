import { useState, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Calculator, TrendingUp, Target, Coins, Sparkles, Zap, Download, Share2, RefreshCw } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToPDF } from '@/lib/exportUtils';
import { toast } from '@/hooks/use-toast';

const ROI_RATE = 0.15; // 15% per month

interface MonthlyProjection {
  month: number;
  principal: number;
  earnings: number;
  totalEarnings: number;
  balance: number;
}

export function InvestmentCalculator() {
  const [desiredEarnings, setDesiredEarnings] = useState(150000);
  const [duration, setDuration] = useState(12);
  const [isCompounding, setIsCompounding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const projectionRef = useRef<HTMLDivElement>(null);

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

  const projections = useMemo((): MonthlyProjection[] => {
    const results: MonthlyProjection[] = [];
    let currentBalance = calculations.requiredInvestment;
    let totalEarnings = 0;

    for (let month = 1; month <= duration; month++) {
      const earnings = currentBalance * ROI_RATE;
      totalEarnings += earnings;
      
      if (isCompounding) {
        currentBalance += earnings;
      }

      results.push({
        month,
        principal: isCompounding ? currentBalance - earnings : calculations.requiredInvestment,
        earnings,
        totalEarnings,
        balance: currentBalance,
      });
    }

    return results;
  }, [calculations.requiredInvestment, duration, isCompounding]);

  const handleExportPDF = async () => {
    if (!projectionRef.current) return;
    
    setIsExporting(true);
    try {
      await exportToPDF(
        projectionRef.current,
        `Welile_Investment_Projection_${duration}months`,
        'Investment Projection Report'
      );
      toast({
        title: "PDF Downloaded",
        description: "Your investment projection has been saved as PDF.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Could not generate PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleShareWhatsApp = () => {
    const finalBalance = projections[projections.length - 1]?.balance || 0;
    const totalEarnings = projections[projections.length - 1]?.totalEarnings || 0;
    
    const message = `💰 *Welile Investment Projection*\n\n` +
      `📊 Investment: ${formatUGX(calculations.requiredInvestment)}\n` +
      `📈 Monthly ROI: 15%\n` +
      `⏱️ Duration: ${duration} months\n` +
      `${isCompounding ? '🔄 Compounding: Yes\n' : ''}\n` +
      `✨ *Results:*\n` +
      `💵 Total Earnings: ${formatUGX(totalEarnings)}\n` +
      `🏦 Final Balance: ${formatUGX(finalBalance)}\n\n` +
      `Start investing today at Welile! 🚀`;
    
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="relative space-y-6"
    >
      {/* Hero Marketing Section */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-primary/20 via-violet-600/15 to-success/20 p-0.5 sm:p-1">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/30 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-success/30 via-transparent to-transparent" />
        
        <Card className="relative border-0 bg-background/80 backdrop-blur-2xl shadow-2xl overflow-hidden">
          <div className="absolute top-0 right-0 w-48 sm:w-96 h-48 sm:h-96 bg-gradient-to-bl from-primary/20 to-transparent rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 left-0 w-36 sm:w-72 h-36 sm:h-72 bg-gradient-to-tr from-success/20 to-transparent rounded-full blur-3xl" />
          
          <CardContent className="relative p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-8">
            {/* Hero Headline */}
            <motion.div 
              className="text-center space-y-3 sm:space-y-4"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
            >
              <motion.div 
                className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full bg-gradient-to-r from-success/20 to-emerald-500/20 border border-success/30"
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 text-success" />
                <span className="text-[10px] sm:text-xs font-bold text-success uppercase tracking-wider">15% Monthly Returns • Guaranteed</span>
              </motion.div>
              
              <h1 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent leading-tight">
                How Much Do You Want<br />
                <span className="text-success">To Earn?</span> 💰
              </h1>
              
              <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-lg mx-auto font-medium px-2">
                Tell us your monthly income goal and we'll show you exactly how to achieve it
              </p>
            </motion.div>

            {/* Calculator Input */}
            <motion.div 
              className="space-y-4 sm:space-y-6 max-w-md mx-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-center block text-xs sm:text-sm font-bold text-muted-foreground uppercase tracking-wider">
                  I want to earn every month
                </Label>
                <div className="relative group">
                  <div className="absolute -inset-0.5 sm:-inset-1 bg-gradient-to-r from-primary via-violet-500 to-success rounded-xl sm:rounded-2xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />
                  <div className="relative">
                    <span className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 text-sm sm:text-lg text-muted-foreground font-bold">
                      UGX
                    </span>
                    <Input
                      type="text"
                      value={desiredEarnings.toLocaleString()}
                      onChange={(e) => {
                        const value = parseInt(e.target.value.replace(/,/g, '')) || 0;
                        setDesiredEarnings(Math.max(0, Math.min(value, 30000000000)));
                      }}
                      className="pl-12 sm:pl-16 text-xl sm:text-2xl md:text-3xl font-black h-14 sm:h-16 md:h-20 bg-background border-2 border-primary/30 focus:border-primary rounded-xl sm:rounded-2xl text-center shadow-xl"
                    />
                  </div>
                </div>
                <Slider
                  value={[desiredEarnings]}
                  onValueChange={([value]) => setDesiredEarnings(value)}
                  min={50000}
                  max={30000000000}
                  step={100000}
                  className="py-3 sm:py-4"
                />
                <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground font-semibold">
                  <span>UGX 50K</span>
                  <span className="text-primary flex items-center gap-1">
                    <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Drag to adjust
                  </span>
                  <span>UGX 30B</span>
                </div>
              </div>

              {/* Duration Selector */}
              <div className="space-y-2">
                <Label className="text-center block text-xs sm:text-sm font-bold text-muted-foreground uppercase tracking-wider">
                  Investment Duration: {duration} Months
                </Label>
                <Slider
                  value={[duration]}
                  onValueChange={([value]) => setDuration(value)}
                  min={1}
                  max={24}
                  step={1}
                  className="py-2"
                />
                <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground font-semibold">
                  <span>1 Month</span>
                  <span>24 Months</span>
                </div>
              </div>

              {/* Compounding Toggle */}
              <div className="flex items-center justify-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
                <RefreshCw className={`h-4 w-4 ${isCompounding ? 'text-success' : 'text-muted-foreground'}`} />
                <Label htmlFor="compounding" className="text-sm font-medium cursor-pointer">
                  Compound Monthly ROI
                </Label>
                <Switch
                  id="compounding"
                  checked={isCompounding}
                  onCheckedChange={setIsCompounding}
                />
              </div>
            </motion.div>

            {/* Results Cards */}
            <motion.div 
              className="grid grid-cols-1 xs:grid-cols-2 gap-3 sm:gap-4 max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              <motion.div 
                className="relative p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-violet-600/15 border border-primary/30 overflow-hidden"
                whileHover={{ scale: 1.03, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <div className="absolute -top-8 sm:-top-12 -right-8 sm:-right-12 w-20 sm:w-28 h-20 sm:h-28 bg-primary/30 rounded-full blur-2xl" />
                <div className="relative text-center">
                  <div className="inline-flex items-center justify-center gap-2 mb-2 sm:mb-3">
                    <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-gradient-to-br from-primary to-violet-600 shadow-lg">
                      <Target className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                    </div>
                  </div>
                  <p className="text-[10px] sm:text-xs font-bold text-primary uppercase tracking-wider mb-1 sm:mb-2">You Need To Invest</p>
                  <AnimatePresence mode="wait">
                    <motion.p 
                      key={calculations.requiredInvestment}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="text-lg sm:text-2xl md:text-3xl font-black text-foreground"
                    >
                      {formatUGX(calculations.requiredInvestment)}
                    </motion.p>
                  </AnimatePresence>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">One-time investment</p>
                </div>
              </motion.div>
              
              <motion.div 
                className="relative p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-gradient-to-br from-success/20 via-success/10 to-emerald-600/15 border border-success/30 overflow-hidden"
                whileHover={{ scale: 1.03, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <div className="absolute -top-8 sm:-top-12 -right-8 sm:-right-12 w-20 sm:w-28 h-20 sm:h-28 bg-success/30 rounded-full blur-2xl" />
                <div className="relative text-center">
                  <div className="inline-flex items-center justify-center gap-2 mb-2 sm:mb-3">
                    <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-gradient-to-br from-success to-emerald-600 shadow-lg">
                      <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                    </div>
                  </div>
                  <p className="text-[10px] sm:text-xs font-bold text-success uppercase tracking-wider mb-1 sm:mb-2">
                    {isCompounding ? `After ${duration} Months` : "You'll Earn Monthly"}
                  </p>
                  <AnimatePresence mode="wait">
                    <motion.p 
                      key={`${isCompounding}-${projections[projections.length - 1]?.totalEarnings}`}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="text-lg sm:text-2xl md:text-3xl font-black text-success"
                    >
                      {formatUGX(isCompounding ? projections[projections.length - 1]?.totalEarnings || 0 : calculations.monthlyReturn)}
                    </motion.p>
                  </AnimatePresence>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">
                    {isCompounding ? 'Total earnings with compounding 🚀' : 'Every single month 🎉'}
                  </p>
                </div>
              </motion.div>
            </motion.div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <Button
                onClick={handleExportPDF}
                disabled={isExporting}
                className="flex-1 gap-2 bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-600/90"
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Generating...' : 'Download PDF'}
              </Button>
              <Button
                onClick={handleShareWhatsApp}
                variant="outline"
                className="flex-1 gap-2 border-success/50 text-success hover:bg-success/10"
              >
                <Share2 className="h-4 w-4" />
                Share on WhatsApp
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Printable Projection Table */}
      <div ref={projectionRef} className="bg-background rounded-2xl border border-border overflow-hidden">
        {/* PDF Header with Logo */}
        <div className="p-4 sm:p-6 border-b border-border bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-primary via-violet-600 to-success bg-clip-text text-transparent">
                Welile
              </span>
            </div>
            <div className="text-right text-xs sm:text-sm text-muted-foreground">
              <p className="font-semibold">Investment Projection Report</p>
              <p>Generated: {new Date().toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 sm:p-6 border-b border-border">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-primary/10">
              <p className="text-xs text-muted-foreground mb-1">Initial Investment</p>
              <p className="font-bold text-primary">{formatUGX(calculations.requiredInvestment)}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-success/10">
              <p className="text-xs text-muted-foreground mb-1">Monthly ROI</p>
              <p className="font-bold text-success">15%</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground mb-1">Duration</p>
              <p className="font-bold">{duration} Months</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-warning/10">
              <p className="text-xs text-muted-foreground mb-1">Compounding</p>
              <p className="font-bold text-warning">{isCompounding ? 'Yes' : 'No'}</p>
            </div>
          </div>
        </div>

        {/* Monthly Breakdown Table */}
        <div className="p-4 sm:p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Coins className="h-5 w-5 text-warning" />
            Monthly Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 font-semibold text-muted-foreground">Month</th>
                  <th className="text-right py-3 px-2 font-semibold text-muted-foreground">Principal</th>
                  <th className="text-right py-3 px-2 font-semibold text-muted-foreground">Earnings</th>
                  <th className="text-right py-3 px-2 font-semibold text-muted-foreground">Total Earnings</th>
                  <th className="text-right py-3 px-2 font-semibold text-muted-foreground">Balance</th>
                </tr>
              </thead>
              <tbody>
                {projections.map((row, index) => (
                  <tr 
                    key={row.month} 
                    className={`border-b border-border/50 ${index % 2 === 0 ? 'bg-muted/20' : ''}`}
                  >
                    <td className="py-3 px-2 font-medium">Month {row.month}</td>
                    <td className="py-3 px-2 text-right">{formatUGX(row.principal)}</td>
                    <td className="py-3 px-2 text-right text-success font-medium">+{formatUGX(row.earnings)}</td>
                    <td className="py-3 px-2 text-right text-primary font-medium">{formatUGX(row.totalEarnings)}</td>
                    <td className="py-3 px-2 text-right font-bold">{formatUGX(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-success/10 font-bold">
                  <td className="py-3 px-2">Total</td>
                  <td className="py-3 px-2 text-right">-</td>
                  <td className="py-3 px-2 text-right text-success">-</td>
                  <td className="py-3 px-2 text-right text-success">{formatUGX(projections[projections.length - 1]?.totalEarnings || 0)}</td>
                  <td className="py-3 px-2 text-right">{formatUGX(projections[projections.length - 1]?.balance || 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-border bg-muted/30 text-center">
          <p className="text-xs text-muted-foreground">
            This projection is for illustrative purposes. Actual returns may vary. 
            Contact Welile for more information.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
