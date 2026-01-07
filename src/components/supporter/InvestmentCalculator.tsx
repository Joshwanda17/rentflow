import { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TrendingUp, Target, Coins, Sparkles, Zap, Download, Share2, RefreshCw, BarChart3, GitCompare, ChevronDown, Shield, Clock, ArrowRight, Save, Trash2, Layers, X } from 'lucide-react';
import welileLogo from '@/assets/welile-logo.png';
import { formatUGX } from '@/lib/rentCalculations';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToPDF } from '@/lib/exportUtils';
import { toast } from '@/hooks/use-toast';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, BarChart, Bar } from 'recharts';

const ROI_RATE = 0.15; // 15% per month

interface MonthlyProjection {
  month: number;
  principal: number;
  earnings: number;
  totalEarnings: number;
  balance: number;
}

interface SavedScenario {
  id: string;
  name: string;
  desiredEarnings: number;
  duration: number;
  isCompounding: boolean;
  requiredInvestment: number;
  totalEarnings: number;
  finalBalance: number;
  color: string;
  createdAt: Date;
}

const SCENARIO_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(142, 76%, 36%)',
  'hsl(280, 65%, 60%)',
  'hsl(200, 80%, 50%)',
];

export function InvestmentCalculator() {
  const [desiredEarnings, setDesiredEarnings] = useState(150000);
  const [duration, setDuration] = useState(12);
  const [isCompounding, setIsCompounding] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [showSavedScenarios, setShowSavedScenarios] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [isExportingComparison, setIsExportingComparison] = useState(false);
  const projectionRef = useRef<HTMLDivElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);

  // Load saved scenarios from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('welile-investment-scenarios');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSavedScenarios(parsed.map((s: SavedScenario) => ({
          ...s,
          createdAt: new Date(s.createdAt)
        })));
      } catch (e) {
        console.error('Failed to load saved scenarios', e);
      }
    }
  }, []);

  // Save scenarios to localStorage
  useEffect(() => {
    if (savedScenarios.length > 0) {
      localStorage.setItem('welile-investment-scenarios', JSON.stringify(savedScenarios));
    }
  }, [savedScenarios]);

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

  // Generate both compounding and non-compounding projections for comparison
  const comparisonData = useMemo(() => {
    const data = [{ 
      month: 0, 
      compoundingBalance: calculations.requiredInvestment, 
      simpleBalance: calculations.requiredInvestment,
      compoundingEarnings: 0,
      simpleEarnings: 0
    }];

    let compoundBalance = calculations.requiredInvestment;
    let compoundTotalEarnings = 0;
    let simpleTotalEarnings = 0;

    for (let month = 1; month <= duration; month++) {
      const compoundEarnings = compoundBalance * ROI_RATE;
      compoundTotalEarnings += compoundEarnings;
      compoundBalance += compoundEarnings;

      const simpleEarnings = calculations.requiredInvestment * ROI_RATE;
      simpleTotalEarnings += simpleEarnings;

      data.push({
        month,
        compoundingBalance: compoundBalance,
        simpleBalance: calculations.requiredInvestment,
        compoundingEarnings: compoundTotalEarnings,
        simpleEarnings: simpleTotalEarnings,
      });
    }

    return data;
  }, [calculations.requiredInvestment, duration]);

  // Generate comparison data for saved scenarios
  const scenarioComparisonData = useMemo(() => {
    if (savedScenarios.length === 0) return [];
    
    const maxDuration = Math.max(...savedScenarios.map(s => s.duration), duration);
    const data = [];
    
    for (let month = 0; month <= maxDuration; month++) {
      const point: Record<string, number> = { month };
      
      // Current scenario
      if (month <= duration) {
        let currentBalance = calculations.requiredInvestment;
        let totalEarnings = 0;
        for (let m = 1; m <= month; m++) {
          const earnings = currentBalance * ROI_RATE;
          totalEarnings += earnings;
          if (isCompounding) currentBalance += earnings;
        }
        point['current'] = totalEarnings;
      }
      
      // Saved scenarios
      savedScenarios.forEach(scenario => {
        if (month <= scenario.duration) {
          let currentBalance = scenario.requiredInvestment;
          let totalEarnings = 0;
          for (let m = 1; m <= month; m++) {
            const earnings = currentBalance * ROI_RATE;
            totalEarnings += earnings;
            if (scenario.isCompounding) currentBalance += earnings;
          }
          point[scenario.id] = totalEarnings;
        }
      });
      
      data.push(point);
    }
    
    return data;
  }, [savedScenarios, calculations.requiredInvestment, duration, isCompounding]);

  const handleSaveScenario = () => {
    if (savedScenarios.length >= 5) {
      toast({
        title: "Maximum Scenarios Reached",
        description: "You can save up to 5 scenarios. Delete one to add more.",
        variant: "destructive",
      });
      return;
    }
    
    const finalProjection = projections[projections.length - 1];
    const newScenario: SavedScenario = {
      id: `scenario-${Date.now()}`,
      name: scenarioName || `Scenario ${savedScenarios.length + 1}`,
      desiredEarnings,
      duration,
      isCompounding,
      requiredInvestment: calculations.requiredInvestment,
      totalEarnings: finalProjection?.totalEarnings || 0,
      finalBalance: finalProjection?.balance || 0,
      color: SCENARIO_COLORS[savedScenarios.length % SCENARIO_COLORS.length],
      createdAt: new Date(),
    };
    
    setSavedScenarios(prev => [...prev, newScenario]);
    setScenarioName('');
    toast({
      title: "Scenario Saved",
      description: `"${newScenario.name}" has been saved for comparison.`,
    });
  };

  const handleDeleteScenario = (id: string) => {
    setSavedScenarios(prev => {
      const updated = prev.filter(s => s.id !== id);
      if (updated.length === 0) {
        localStorage.removeItem('welile-investment-scenarios');
      }
      return updated;
    });
    toast({
      title: "Scenario Deleted",
      description: "The scenario has been removed.",
    });
  };

  const handleLoadScenario = (scenario: SavedScenario) => {
    setDesiredEarnings(scenario.desiredEarnings);
    setDuration(scenario.duration);
    setIsCompounding(scenario.isCompounding);
    toast({
      title: "Scenario Loaded",
      description: `"${scenario.name}" settings have been applied.`,
    });
  };

  const handleExportComparisonPDF = async () => {
    if (!comparisonRef.current || savedScenarios.length === 0) {
      toast({
        title: "No Scenarios to Export",
        description: "Save at least one scenario to export a comparison.",
        variant: "destructive",
      });
      return;
    }
    
    setIsExportingComparison(true);
    try {
      await exportToPDF(
        comparisonRef.current,
        `Welile_Scenario_Comparison_${savedScenarios.length + 1}scenarios`,
        'Investment Scenarios Comparison'
      );
      toast({
        title: "Comparison PDF Downloaded",
        description: "Your scenario comparison has been saved as PDF.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Could not generate PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingComparison(false);
    }
  };

  const handleShareComparisonWhatsApp = () => {
    if (savedScenarios.length === 0) {
      toast({
        title: "No Scenarios to Share",
        description: "Save at least one scenario to share a comparison.",
        variant: "destructive",
      });
      return;
    }
    
    const currentEarnings = projections[projections.length - 1]?.totalEarnings || 0;
    
    let message = `📊 *WELILE SCENARIO COMPARISON*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    message += `Compare ${savedScenarios.length + 1} investment scenarios:\n\n`;
    
    // Current scenario
    message += `📍 *CURRENT SCENARIO*\n`;
    message += `💰 Investment: ${formatUGX(calculations.requiredInvestment)}\n`;
    message += `⏱️ Duration: ${duration} months\n`;
    message += `🔄 Compounding: ${isCompounding ? 'Yes' : 'No'}\n`;
    message += `✨ Total Earnings: ${formatUGX(currentEarnings)}\n\n`;
    
    // Saved scenarios
    savedScenarios.forEach((scenario, index) => {
      message += `${index + 1}️⃣ *${scenario.name.toUpperCase()}*\n`;
      message += `💰 Investment: ${formatUGX(scenario.requiredInvestment)}\n`;
      message += `⏱️ Duration: ${scenario.duration} months\n`;
      message += `🔄 Compounding: ${scenario.isCompounding ? 'Yes' : 'No'}\n`;
      message += `✨ Total Earnings: ${formatUGX(scenario.totalEarnings)}\n\n`;
    });
    
    // Find best scenario
    const allScenarios = [
      { name: 'Current', earnings: currentEarnings },
      ...savedScenarios.map(s => ({ name: s.name, earnings: s.totalEarnings }))
    ];
    const bestScenario = allScenarios.reduce((best, current) => 
      current.earnings > best.earnings ? current : best
    );
    
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `🏆 *BEST OPTION: ${bestScenario.name}*\n`;
    message += `💵 Highest Earnings: ${formatUGX(bestScenario.earnings)}\n\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `✅ *WHY INVEST WITH WELILE?*\n`;
    message += `• 15% Monthly ROI\n`;
    message += `• Support tenants to access rent\n`;
    message += `• Guaranteed rent collection\n`;
    message += `• 90-day withdrawal notice\n\n`;
    message += `🚀 Start earning today with Welile!`;
    
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

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

  const handleSharePDFWhatsApp = async () => {
    if (!projectionRef.current) return;
    
    setIsExporting(true);
    try {
      // Generate monthly breakdown text for WhatsApp
      let breakdownText = `📊 *WELILE INVESTMENT PROJECTION*\n`;
      breakdownText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      breakdownText += `💰 Initial Investment: ${formatUGX(calculations.requiredInvestment)}\n`;
      breakdownText += `📈 Monthly ROI: 15%\n`;
      breakdownText += `⏱️ Duration: ${duration} months\n`;
      breakdownText += `🔄 Compounding: ${isCompounding ? 'Yes' : 'No'}\n\n`;
      breakdownText += `📋 *MONTHLY BREAKDOWN*\n`;
      breakdownText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      projections.forEach((row) => {
        breakdownText += `*Month ${row.month}*\n`;
        breakdownText += `  Principal: ${formatUGX(row.principal)}\n`;
        breakdownText += `  Earnings: +${formatUGX(row.earnings)}\n`;
        breakdownText += `  Total Earned: ${formatUGX(row.totalEarnings)}\n`;
        breakdownText += `  Balance: ${formatUGX(row.balance)}\n\n`;
      });
      
      breakdownText += `━━━━━━━━━━━━━━━━━━━━\n`;
      breakdownText += `🏆 *FINAL RESULTS*\n`;
      breakdownText += `💵 Total Earnings: ${formatUGX(projections[projections.length - 1]?.totalEarnings || 0)}\n`;
      breakdownText += `🏦 Final Balance: ${formatUGX(projections[projections.length - 1]?.balance || 0)}\n\n`;
      breakdownText += `━━━━━━━━━━━━━━━━━━━━\n`;
      breakdownText += `✅ *WHY INVEST WITH WELILE?*\n`;
      breakdownText += `• Earn by supporting tenants access rent\n`;
      breakdownText += `• Welile guarantees rent collection through our Agent Network\n`;
      breakdownText += `• Withdraw principal with 90-day notice\n\n`;
      breakdownText += `🚀 Start earning 15% monthly returns today!\n`;
      breakdownText += `📱 Visit Welile to become a Supporter`;
      
      const encodedMessage = encodeURIComponent(breakdownText);
      window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
      
      toast({
        title: "Opening WhatsApp",
        description: "Monthly breakdown ready to share!",
      });
    } catch (error) {
      toast({
        title: "Share Failed",
        description: "Could not prepare share content. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
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
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border flex-1 w-full justify-center">
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
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border flex-1 w-full justify-center">
                  <GitCompare className={`h-4 w-4 ${showComparison ? 'text-primary' : 'text-muted-foreground'}`} />
                  <Label htmlFor="comparison" className="text-sm font-medium cursor-pointer">
                    Compare Mode
                  </Label>
                  <Switch
                    id="comparison"
                    checked={showComparison}
                    onCheckedChange={setShowComparison}
                  />
                </div>
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
            <div className="flex flex-col gap-3 justify-center max-w-lg mx-auto">
              <div className="flex flex-col sm:flex-row gap-3">
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
                  Share Summary
                </Button>
              </div>
              <Button
                onClick={handleSharePDFWhatsApp}
                disabled={isExporting}
                variant="outline"
                className="w-full gap-2 border-primary/50 text-primary hover:bg-primary/10"
              >
                <Share2 className="h-4 w-4" />
                📊 Share Monthly Breakdown on WhatsApp
              </Button>
              
              {/* Save Scenario Section */}
              <div className="flex flex-col sm:flex-row gap-2 mt-2">
                <Input
                  placeholder="Name this scenario..."
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={handleSaveScenario}
                  variant="outline"
                  className="gap-2 border-warning/50 text-warning hover:bg-warning/10"
                >
                  <Save className="h-4 w-4" />
                  Save Scenario
                </Button>
              </div>
              
              {savedScenarios.length > 0 && (
                <Button
                  onClick={() => setShowSavedScenarios(!showSavedScenarios)}
                  variant="ghost"
                  className="gap-2"
                >
                  <Layers className="h-4 w-4" />
                  {showSavedScenarios ? 'Hide' : 'Show'} Saved Scenarios ({savedScenarios.length})
                  <ChevronDown className={`h-4 w-4 transition-transform ${showSavedScenarios ? 'rotate-180' : ''}`} />
                </Button>
              )}
            </div>
            
            {/* Saved Scenarios Comparison */}
            <AnimatePresence>
              {showSavedScenarios && savedScenarios.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div ref={comparisonRef} className="space-y-4 pt-4 border-t border-border/50 mt-4 bg-background">
                    {/* PDF Header for Comparison Export */}
                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-primary/10 via-violet-500/10 to-primary/10 rounded-xl">
                      <div>
                        <h2 className="text-2xl font-bold text-primary" style={{ fontFamily: "'Chewy', cursive" }}>Welile</h2>
                        <p className="text-xs text-muted-foreground">Scenario Comparison</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p className="font-semibold text-foreground">{savedScenarios.length + 1} Scenarios</p>
                        <p>{new Date().toLocaleDateString()}</p>
                      </div>
                    </div>
                    
                    <h3 className="font-bold text-lg flex items-center gap-2 justify-center">
                      <Layers className="h-5 w-5 text-primary" />
                      Compare Scenarios
                    </h3>
                    
                    {/* Scenarios Cards - Side by Side */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {/* Current Scenario */}
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-xl border-2 border-primary bg-primary/5"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-bold text-primary text-sm">📍 Current</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary">Active</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Investment:</span>
                            <span className="font-semibold">{formatUGX(calculations.requiredInvestment)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Duration:</span>
                            <span className="font-semibold">{duration} months</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Compounding:</span>
                            <span className="font-semibold">{isCompounding ? '✓ Yes' : '✗ No'}</span>
                          </div>
                          <div className="flex justify-between border-t border-border/50 pt-2 mt-2">
                            <span className="text-muted-foreground">Total Earnings:</span>
                            <span className="font-bold text-success">{formatUGX(projections[projections.length - 1]?.totalEarnings || 0)}</span>
                          </div>
                        </div>
                      </motion.div>
                      
                      {/* Saved Scenarios */}
                      {savedScenarios.map((scenario, index) => (
                        <motion.div
                          key={scenario.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-bold text-sm truncate max-w-[120px]" style={{ color: scenario.color }}>
                              {scenario.name}
                            </span>
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => handleLoadScenario(scenario)}
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteScenario(scenario.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Investment:</span>
                              <span className="font-semibold">{formatUGX(scenario.requiredInvestment)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Duration:</span>
                              <span className="font-semibold">{scenario.duration} months</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Compounding:</span>
                              <span className="font-semibold">{scenario.isCompounding ? '✓ Yes' : '✗ No'}</span>
                            </div>
                            <div className="flex justify-between border-t border-border/50 pt-2 mt-2">
                              <span className="text-muted-foreground">Total Earnings:</span>
                              <span className="font-bold text-success">{formatUGX(scenario.totalEarnings)}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    
                    {/* Comparison Chart */}
                    {savedScenarios.length > 0 && (
                      <div className="mt-6 p-4 rounded-xl bg-muted/30 border border-border">
                        <h4 className="font-semibold mb-4 flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-primary" />
                          Earnings Comparison Over Time
                        </h4>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={scenarioComparisonData}>
                              <defs>
                                <linearGradient id="currentGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                                </linearGradient>
                                {savedScenarios.map((scenario, index) => (
                                  <linearGradient key={scenario.id} id={`gradient-${scenario.id}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={scenario.color} stopOpacity={0.4} />
                                    <stop offset="95%" stopColor={scenario.color} stopOpacity={0.05} />
                                  </linearGradient>
                                ))}
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                              <XAxis 
                                dataKey="month" 
                                tick={{ fontSize: 10 }}
                                tickFormatter={(value) => `M${value}`}
                              />
                              <YAxis 
                                tick={{ fontSize: 10 }}
                                tickFormatter={(value) => {
                                  if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}B`;
                                  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                                  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                                  return value.toString();
                                }}
                              />
                              <Tooltip 
                                content={({ active, payload, label }) => {
                                  if (active && payload && payload.length) {
                                    return (
                                      <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg">
                                        <p className="font-semibold mb-2">Month {label}</p>
                                        {payload.map((entry, index) => (
                                          <p key={index} className="text-sm" style={{ color: entry.color }}>
                                            {entry.name}: {formatUGX(entry.value as number)}
                                          </p>
                                        ))}
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Legend wrapperStyle={{ fontSize: '11px' }} />
                              <Area
                                type="monotone"
                                dataKey="current"
                                name="📍 Current"
                                stroke="hsl(var(--primary))"
                                strokeWidth={2}
                                fill="url(#currentGradient)"
                              />
                              {savedScenarios.map((scenario) => (
                                <Area
                                  key={scenario.id}
                                  type="monotone"
                                  dataKey={scenario.id}
                                  name={scenario.name}
                                  stroke={scenario.color}
                                  strokeWidth={2}
                                  fill={`url(#gradient-${scenario.id})`}
                                />
                              ))}
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                        
                        {/* Summary Bar Chart */}
                        <div className="mt-4 pt-4 border-t border-border/50">
                          <h5 className="text-sm font-medium mb-3 text-center">Total Earnings Comparison</h5>
                          <div className="flex flex-wrap gap-2 justify-center">
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30">
                              <div className="w-3 h-3 rounded-full bg-primary" />
                              <span className="text-xs font-medium">Current:</span>
                              <span className="text-sm font-bold text-primary">{formatUGX(projections[projections.length - 1]?.totalEarnings || 0)}</span>
                            </div>
                            {savedScenarios.map((scenario) => (
                              <div key={scenario.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: scenario.color }} />
                                <span className="text-xs font-medium truncate max-w-[80px]">{scenario.name}:</span>
                                <span className="text-sm font-bold" style={{ color: scenario.color }}>{formatUGX(scenario.totalEarnings)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        {/* Footer for PDF */}
                        <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-primary/5 via-muted/30 to-success/5 border border-border/50">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                            <div className="flex items-start gap-2 p-2 rounded-lg bg-background/50">
                              <div className="p-1 rounded-full bg-success/20">
                                <TrendingUp className="h-3 w-3 text-success" />
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold text-foreground">Earn by Supporting Tenants</p>
                                <p className="text-[8px] text-muted-foreground">Your investment helps tenants access rent.</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2 p-2 rounded-lg bg-background/50">
                              <div className="p-1 rounded-full bg-primary/20">
                                <Shield className="h-3 w-3 text-primary" />
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold text-foreground">Guaranteed Collection</p>
                                <p className="text-[8px] text-muted-foreground">Welile guarantees rent collection.</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2 p-2 rounded-lg bg-background/50">
                              <div className="p-1 rounded-full bg-warning/20">
                                <Clock className="h-3 w-3 text-warning" />
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold text-foreground">90-Day Withdrawal Notice</p>
                                <p className="text-[8px] text-muted-foreground">Withdraw with 90 days notice.</p>
                              </div>
                            </div>
                          </div>
                          <p className="text-[9px] text-muted-foreground text-center">
                            This comparison is for illustrative purposes. Returns are based on a 15% monthly ROI model.
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {/* Export & Share Comparison Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                      <Button
                        onClick={handleExportComparisonPDF}
                        disabled={isExportingComparison}
                        className="gap-2 bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-600/90"
                      >
                        <Download className="h-4 w-4" />
                        {isExportingComparison ? 'Generating PDF...' : 'Download Comparison PDF'}
                      </Button>
                      <Button
                        onClick={handleShareComparisonWhatsApp}
                        variant="outline"
                        className="gap-2 border-success/50 text-success hover:bg-success/10"
                      >
                        <Share2 className="h-4 w-4" />
                        Share Comparison on WhatsApp
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>

      {/* Printable Projection Table */}
      <div ref={projectionRef} className="bg-background rounded-2xl border border-border overflow-hidden">
        {/* PDF Header with Purple Text Logo Only */}
        <div className="p-4 sm:p-6 border-b border-border bg-gradient-to-r from-primary/10 via-violet-500/10 to-primary/10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-primary" style={{ fontFamily: "'Chewy', cursive" }}>Welile</h2>
              <p className="text-xs text-muted-foreground">Investment Projection</p>
            </div>
            <div className="text-right text-xs sm:text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">Report</p>
              <p>{new Date().toLocaleDateString()}</p>
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

        {/* Growth Chart */}
        <div className="p-4 sm:p-6 border-b border-border">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            {showComparison ? 'Compounding vs Simple Interest Comparison' : 'Investment Growth Over Time'}
          </h3>
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={showComparison 
                  ? comparisonData 
                  : [
                      { month: 0, balance: calculations.requiredInvestment, earnings: 0 },
                      ...projections.map(p => ({
                        month: p.month,
                        balance: p.balance,
                        earnings: p.totalEarnings,
                      }))
                    ]
                }
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="compoundGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="simpleGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--warning))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--warning))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `M${value}`}
                  className="text-muted-foreground"
                />
                <YAxis 
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => {
                    if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}B`;
                    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                    return value.toString();
                  }}
                  className="text-muted-foreground"
                />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg">
                          <p className="font-semibold mb-2">Month {label}</p>
                          {payload.map((entry, index) => (
                            <p key={index} className="text-sm" style={{ color: entry.color }}>
                              {entry.name}: {formatUGX(entry.value as number)}
                            </p>
                          ))}
                          {showComparison && label > 0 && (
                            <p className="text-xs text-muted-foreground mt-2 border-t border-border pt-2">
                              Difference: {formatUGX(
                                (payload.find(p => p.dataKey === 'compoundingEarnings')?.value as number || 0) -
                                (payload.find(p => p.dataKey === 'simpleEarnings')?.value as number || 0)
                              )}
                            </p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '12px' }}
                />
                {/* Milestone Reference Lines */}
                {[1000000, 5000000, 10000000, 50000000, 100000000, 500000000, 1000000000].map((milestone) => {
                  const maxValue = showComparison 
                    ? Math.max(
                        comparisonData[comparisonData.length - 1]?.compoundingEarnings || 0,
                        comparisonData[comparisonData.length - 1]?.simpleEarnings || 0
                      )
                    : Math.max(
                        projections[projections.length - 1]?.balance || 0,
                        projections[projections.length - 1]?.totalEarnings || 0
                      );
                  
                  // Only show milestones that are within the chart's range
                  if (milestone > maxValue * 1.2 || milestone < calculations.requiredInvestment * 0.5) return null;
                  
                  const label = milestone >= 1000000000 
                    ? `${(milestone / 1000000000).toFixed(0)}B` 
                    : milestone >= 1000000 
                      ? `${(milestone / 1000000).toFixed(0)}M` 
                      : `${(milestone / 1000).toFixed(0)}K`;
                  
                  return (
                    <ReferenceLine
                      key={milestone}
                      y={milestone}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="5 5"
                      strokeOpacity={0.6}
                      label={{
                        value: `🎯 ${label}`,
                        position: 'right',
                        fill: 'hsl(var(--muted-foreground))',
                        fontSize: 10,
                        fontWeight: 'bold',
                      }}
                    />
                  );
                })}
                {showComparison ? (
                  <>
                    <Area
                      type="monotone"
                      dataKey="compoundingEarnings"
                      name="Compounding Earnings"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#compoundGradient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="simpleEarnings"
                      name="Simple Earnings"
                      stroke="hsl(var(--warning))"
                      strokeWidth={2}
                      fill="url(#simpleGradient)"
                    />
                  </>
                ) : (
                  <>
                    <Area
                      type="monotone"
                      dataKey="balance"
                      name="Total Balance"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#balanceGradient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="earnings"
                      name="Total Earnings"
                      stroke="hsl(var(--success))"
                      strokeWidth={2}
                      fill="url(#earningsGradient)"
                    />
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {showComparison && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 text-center">
                <p className="text-xs text-muted-foreground mb-1">Compounding Earnings</p>
                <p className="font-bold text-primary">{formatUGX(comparisonData[comparisonData.length - 1]?.compoundingEarnings || 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-center">
                <p className="text-xs text-muted-foreground mb-1">Simple Earnings</p>
                <p className="font-bold text-warning">{formatUGX(comparisonData[comparisonData.length - 1]?.simpleEarnings || 0)}</p>
              </div>
              <div className="col-span-2 p-3 rounded-lg bg-success/10 border border-success/30 text-center">
                <p className="text-xs text-muted-foreground mb-1">Extra Earnings with Compounding</p>
                <p className="font-bold text-success">
                  +{formatUGX(
                    (comparisonData[comparisonData.length - 1]?.compoundingEarnings || 0) - 
                    (comparisonData[comparisonData.length - 1]?.simpleEarnings || 0)
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Monthly Breakdown Table - Collapsible */}
        <Collapsible open={showBreakdown} onOpenChange={setShowBreakdown}>
          <div className="p-4 sm:p-6">
            <CollapsibleTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full justify-between gap-2 h-12 text-left"
              >
                <div className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-warning" />
                  <span className="font-bold">View Monthly Breakdown</span>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${showBreakdown ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
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
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Footer - Business Information */}
        <div className="p-4 sm:p-6 border-t border-border bg-gradient-to-br from-primary/5 via-muted/30 to-success/5">
          <div className="space-y-4">
            {/* Business Model */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-background/50 border border-border/50">
                <div className="p-1.5 rounded-full bg-success/20">
                  <TrendingUp className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Earn by Supporting Tenants</p>
                  <p className="text-[10px] text-muted-foreground">Your investment helps tenants access rent when they need it most.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-background/50 border border-border/50">
                <div className="p-1.5 rounded-full bg-primary/20">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Guaranteed Collection</p>
                  <p className="text-[10px] text-muted-foreground">Welile guarantees rent collection through our trusted Agent Network.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-background/50 border border-border/50">
                <div className="p-1.5 rounded-full bg-warning/20">
                  <Clock className="h-4 w-4 text-warning" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">90-Day Withdrawal Notice</p>
                  <p className="text-[10px] text-muted-foreground">Withdraw your principal by notifying Welile 90 days in advance.</p>
                </div>
              </div>
            </div>
            
            {/* Disclaimer */}
            <div className="text-center pt-3 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground">
                This projection is for illustrative purposes. Returns are based on a 15% monthly ROI model. 
                By investing with Welile, you are participating in a business that supports tenants to access rent financing.
              </p>
              
              {/* CTA Button */}
              <div className="pt-4">
                <Link to="/become-supporter">
                  <Button 
                    size="lg" 
                    className="w-full sm:w-auto gap-2 bg-gradient-to-r from-success to-emerald-600 hover:from-success/90 hover:to-emerald-600/90 text-white font-bold shadow-lg hover:shadow-xl transition-all"
                  >
                    <Sparkles className="h-5 w-5" />
                    Become a Supporter Today
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Start earning 15% monthly returns by supporting tenants
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
