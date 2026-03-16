import { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TrendingUp, Target, Coins, Sparkles, Zap, Download, Share2, RefreshCw, BarChart3, GitCompare, ChevronDown, Shield, Clock, ArrowRight, Save, Trash2, Layers, X, Wifi, WifiOff, DollarSign, Loader2, Mail, Heart } from 'lucide-react';
import welileLogo from '@/assets/welile-logo.png';
import { formatUGX } from '@/lib/rentCalculations';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToPDF } from '@/lib/exportUtils';
import { toast } from '@/hooks/use-toast';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { useCurrency } from '@/hooks/useCurrency';
import { formatDistanceToNow } from 'date-fns';

const REWARD_RATE = 0.15; // 15% monthly platform rewards

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
  requiredContribution: number;
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
  const { currency, formatAmount, isLoadingRates, lastUpdated, refreshRates, usdRate } = useCurrency();
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
  const [isRefreshingRates, setIsRefreshingRates] = useState(false);
  const projectionRef = useRef<HTMLDivElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);

  const handleRefreshRates = async () => {
    setIsRefreshingRates(true);
    await refreshRates();
    setIsRefreshingRates(false);
    toast({
      title: "Exchange Rates Updated",
      description: `1 USD = ${usdRate.toLocaleString()} UGX`,
    });
  };

  // Load saved scenarios from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('welile-support-scenarios');
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
      localStorage.setItem('welile-support-scenarios', JSON.stringify(savedScenarios));
    }
  }, [savedScenarios]);

  const calculations = useMemo(() => {
    const requiredContribution = Math.ceil(desiredEarnings / REWARD_RATE);
    const monthlyReward = requiredContribution * REWARD_RATE;
    const quarterlyReward = monthlyReward * 3;
    const yearlyReward = monthlyReward * 12;
    
    return {
      requiredContribution,
      monthlyReward,
      quarterlyReward,
      yearlyReward,
    };
  }, [desiredEarnings]);

  const projections = useMemo((): MonthlyProjection[] => {
    const results: MonthlyProjection[] = [];
    let currentBalance = calculations.requiredContribution;
    let totalEarnings = 0;

    for (let month = 1; month <= duration; month++) {
      const earnings = currentBalance * REWARD_RATE;
      totalEarnings += earnings;
      
      if (isCompounding) {
        currentBalance += earnings;
      }

      results.push({
        month,
        principal: isCompounding ? currentBalance - earnings : calculations.requiredContribution,
        earnings,
        totalEarnings,
        balance: currentBalance,
      });
    }

    return results;
  }, [calculations.requiredContribution, duration, isCompounding]);

  // Generate both compounding and non-compounding projections for comparison
  const comparisonData = useMemo(() => {
    const data = [{ 
      month: 0, 
      compoundingBalance: calculations.requiredContribution, 
      simpleBalance: calculations.requiredContribution,
      compoundingEarnings: 0,
      simpleEarnings: 0
    }];

    let compoundBalance = calculations.requiredContribution;
    let compoundTotalEarnings = 0;
    let simpleTotalEarnings = 0;

    for (let month = 1; month <= duration; month++) {
      const compoundEarnings = compoundBalance * REWARD_RATE;
      compoundTotalEarnings += compoundEarnings;
      compoundBalance += compoundEarnings;

      const simpleEarnings = calculations.requiredContribution * REWARD_RATE;
      simpleTotalEarnings += simpleEarnings;

      data.push({
        month,
        compoundingBalance: compoundBalance,
        simpleBalance: calculations.requiredContribution,
        compoundingEarnings: compoundTotalEarnings,
        simpleEarnings: simpleTotalEarnings,
      });
    }

    return data;
  }, [calculations.requiredContribution, duration]);

  // Generate comparison data for saved scenarios
  const scenarioComparisonData = useMemo(() => {
    if (savedScenarios.length === 0) return [];
    
    const maxDuration = Math.max(...savedScenarios.map(s => s.duration), duration);
    const data = [];
    
    for (let month = 0; month <= maxDuration; month++) {
      const point: Record<string, number> = { month };
      
      // Current scenario
      if (month <= duration) {
        let currentBalance = calculations.requiredContribution;
        let totalEarnings = 0;
        for (let m = 1; m <= month; m++) {
          const earnings = currentBalance * REWARD_RATE;
          totalEarnings += earnings;
          if (isCompounding) currentBalance += earnings;
        }
        point['current'] = totalEarnings;
      }
      
      // Saved scenarios
      savedScenarios.forEach(scenario => {
        if (month <= scenario.duration) {
          let currentBalance = scenario.requiredContribution;
          let totalEarnings = 0;
          for (let m = 1; m <= month; m++) {
            const earnings = currentBalance * REWARD_RATE;
            totalEarnings += earnings;
            if (scenario.isCompounding) currentBalance += earnings;
          }
          point[scenario.id] = totalEarnings;
        }
      });
      
      data.push(point);
    }
    
    return data;
  }, [savedScenarios, calculations.requiredContribution, duration, isCompounding]);

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
      requiredContribution: calculations.requiredContribution,
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
        localStorage.removeItem('welile-support-scenarios');
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
        `Welile_Support_Scenario_Comparison_${savedScenarios.length + 1}scenarios`,
        'Support Scenarios Comparison'
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
    message += `Compare ${savedScenarios.length + 1} support scenarios:\n\n`;
    
    // Current scenario
    message += `📍 *CURRENT SCENARIO*\n`;
    message += `💰 Contribution: ${formatUGX(calculations.requiredContribution)}\n`;
    message += `⏱️ Duration: ${duration} months\n`;
    message += `🔄 Reinvesting Rewards: ${isCompounding ? 'Yes' : 'No'}\n`;
    message += `✨ Total Earnings: ${formatUGX(currentEarnings)}\n\n`;
    
    // Saved scenarios
    savedScenarios.forEach((scenario, index) => {
      message += `${index + 1}️⃣ *${scenario.name.toUpperCase()}*\n`;
      message += `💰 Contribution: ${formatUGX(scenario.requiredContribution)}\n`;
      message += `⏱️ Duration: ${scenario.duration} months\n`;
      message += `🔄 Reinvesting: ${scenario.isCompounding ? 'Yes' : 'No'}\n`;
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
    message += `✅ *WHY SUPPORT WITH WELILE?*\n`;
    message += `• 15% Monthly Platform Rewards\n`;
    message += `• Help tenants access rent facilitation\n`;
    message += `• Trusted agent collection network\n`;
    message += `• 90-day notice for capital withdrawal\n\n`;
    message += `🚀 Start earning with Welile today!`;
    
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  const handleExportPDF = async () => {
    if (!projectionRef.current) return;
    
    setIsExporting(true);
    try {
      await exportToPDF(
        projectionRef.current,
        `Welile_Support_Projection_${duration}months`,
        'Tenant Support Projection Report'
      );
      toast({
        title: "PDF Downloaded",
        description: "Your support projection has been saved as PDF.",
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
    
    const message = `💰 *Welile Earnings Projection*\n\n` +
      `📊 Contribution: ${formatUGX(calculations.requiredContribution)}\n` +
      `📈 Monthly Rewards: 15%\n` +
      `⏱️ Duration: ${duration} months\n` +
      `${isCompounding ? '🔄 Reinvesting Rewards: Yes\n' : ''}\n` +
      `✨ *Results:*\n` +
      `💵 Total Earnings: ${formatUGX(totalEarnings)}\n` +
      `🏦 Final Balance: ${formatUGX(finalBalance)}\n\n` +
      `Support tenants through Welile today! 🚀`;
    
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  const handleSharePDFWhatsApp = async () => {
    if (!projectionRef.current) return;
    
    setIsExporting(true);
    try {
      let breakdownText = `📊 *WELILE EARNINGS PROJECTION*\n`;
      breakdownText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      breakdownText += `💰 Initial Contribution: ${formatUGX(calculations.requiredContribution)}\n`;
      breakdownText += `📈 Monthly Rewards: 15%\n`;
      breakdownText += `⏱️ Duration: ${duration} months\n`;
      breakdownText += `🔄 Reinvesting Rewards: ${isCompounding ? 'Yes' : 'No'}\n\n`;
      breakdownText += `📋 *MONTHLY BREAKDOWN*\n`;
      breakdownText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      projections.forEach((row) => {
        breakdownText += `*Month ${row.month}*\n`;
        breakdownText += `  Contribution: ${formatUGX(row.principal)}\n`;
        breakdownText += `  Rewards: +${formatUGX(row.earnings)}\n`;
        breakdownText += `  Total Earned: ${formatUGX(row.totalEarnings)}\n`;
        breakdownText += `  Balance: ${formatUGX(row.balance)}\n\n`;
      });
      
      breakdownText += `━━━━━━━━━━━━━━━━━━━━\n`;
      breakdownText += `🏆 *FINAL RESULTS*\n`;
      breakdownText += `💵 Total Earnings: ${formatUGX(projections[projections.length - 1]?.totalEarnings || 0)}\n`;
      breakdownText += `🏦 Final Balance: ${formatUGX(projections[projections.length - 1]?.balance || 0)}\n\n`;
      breakdownText += `━━━━━━━━━━━━━━━━━━━━\n`;
      breakdownText += `✅ *WHY SUPPORT WITH WELILE?*\n`;
      breakdownText += `• Earn by helping tenants access rent facilitation\n`;
      breakdownText += `• Welile coordinates rent collection through our Agent Network\n`;
      breakdownText += `• Withdraw capital with 90-day notice\n\n`;
      breakdownText += `🚀 Start earning 15% monthly rewards today!\n`;
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

  const handleShareEmail = () => {
    let body = `WELILE EARNINGS PROJECTION\n\n`;
    body += `Initial Contribution: ${formatUGX(calculations.requiredContribution)}\n`;
    body += `Monthly Rewards: 15%\n`;
    body += `Duration: ${duration} months\n`;
    body += `Reinvesting Rewards: ${isCompounding ? 'Yes' : 'No'}\n\n`;
    body += `MONTHLY BREAKDOWN\n`;
    body += `${'—'.repeat(30)}\n\n`;

    projections.forEach((row) => {
      body += `Month ${row.month}\n`;
      body += `  Contribution: ${formatUGX(row.principal)}\n`;
      body += `  Rewards: +${formatUGX(row.earnings)}\n`;
      body += `  Total Earned: ${formatUGX(row.totalEarnings)}\n`;
      body += `  Balance: ${formatUGX(row.balance)}\n\n`;
    });

    body += `${'—'.repeat(30)}\n`;
    body += `FINAL RESULTS\n`;
    body += `Total Earnings: ${formatUGX(projections[projections.length - 1]?.totalEarnings || 0)}\n`;
    body += `Final Balance: ${formatUGX(projections[projections.length - 1]?.balance || 0)}\n\n`;
    body += `Start earning 15% monthly rewards with Welile today!`;

    const subject = `Welile Earnings Projection – ${formatUGX(calculations.requiredContribution)} over ${duration} months`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_self');

    toast({
      title: "Opening Email",
      description: "Monthly breakdown ready to send!",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="relative space-y-6"
    >
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-success/15 p-0.5 sm:p-1">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-success/20 via-transparent to-transparent" />
        
        <Card className="relative border-0 bg-background/80 backdrop-blur-2xl shadow-2xl overflow-hidden">
          <div className="absolute top-0 right-0 w-48 sm:w-96 h-48 sm:h-96 bg-gradient-to-bl from-primary/15 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-36 sm:w-72 h-36 sm:h-72 bg-gradient-to-tr from-success/15 to-transparent rounded-full blur-3xl" />
          
          <CardContent className="relative p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-8">
            {/* Hero Headline */}
            <motion.div 
              className="text-center space-y-3 sm:space-y-4"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
            >
              <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full bg-gradient-to-r from-success/15 to-emerald-500/15 border border-success/20">
                <Heart className="h-3 w-3 sm:h-4 sm:w-4 text-success" />
                <span className="text-[10px] sm:text-xs font-bold text-success uppercase tracking-wider">15% Monthly Rewards • Tenant Support</span>
              </div>
              
              <h1 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent leading-tight">
                Earnings<br />
                <span className="text-success">Calculator</span> 📊
              </h1>
              
              <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-lg mx-auto font-medium px-2">
                Set your monthly earnings goal and see exactly how much to contribute to your Support Account
              </p>
            </motion.div>

            {/* Live Exchange Rate Indicator */}
            <motion.div
              className="flex flex-wrap items-center justify-center gap-2 sm:gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border">
                <DollarSign className="h-3.5 w-3.5 text-success" />
                <span className="text-xs font-semibold">
                  1 USD = <span className="text-success">{usdRate.toLocaleString()}</span> UGX
                </span>
              </div>
              
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border">
                {isLoadingRates || isRefreshingRates ? (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                ) : (
                  <Wifi className="h-3 w-3 text-success" />
                )}
                <span className="text-[10px] text-muted-foreground">
                  {lastUpdated 
                    ? `Updated ${formatDistanceToNow(lastUpdated, { addSuffix: true })}`
                    : 'Loading rates...'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 ml-1"
                  onClick={handleRefreshRates}
                  disabled={isRefreshingRates}
                >
                  <RefreshCw className={`h-3 w-3 ${isRefreshingRates ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              
              {currency.code !== 'UGX' && (
                <Badge variant="outline" className="gap-1 text-xs">
                  {currency.flag} Viewing in {currency.code}
                </Badge>
              )}
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
                  <div className="absolute -inset-0.5 sm:-inset-1 bg-gradient-to-r from-primary via-primary/60 to-success rounded-xl sm:rounded-2xl blur-lg opacity-30 group-hover:opacity-50 transition-opacity" />
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
                  Support Duration: {duration} Months
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

              {/* Toggles */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border flex-1 w-full justify-center">
                  <RefreshCw className={`h-4 w-4 ${isCompounding ? 'text-success' : 'text-muted-foreground'}`} />
                  <Label htmlFor="compounding" className="text-sm font-medium cursor-pointer">
                    Reinvest Monthly Rewards
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
                className="relative p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary/15 via-primary/8 to-primary/15 border border-primary/20 overflow-hidden"
                whileHover={{ scale: 1.03, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <div className="absolute -top-8 sm:-top-12 -right-8 sm:-right-12 w-20 sm:w-28 h-20 sm:h-28 bg-primary/20 rounded-full blur-2xl" />
                <div className="relative text-center">
                  <div className="inline-flex items-center justify-center gap-2 mb-2 sm:mb-3">
                    <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg">
                      <Target className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
                    </div>
                  </div>
                  <p className="text-[10px] sm:text-xs font-bold text-primary uppercase tracking-wider mb-1 sm:mb-2">Contribution Needed</p>
                  <AnimatePresence mode="wait">
                    <motion.div 
                      key={calculations.requiredContribution}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                    >
                      <p className="text-lg sm:text-2xl md:text-3xl font-black text-foreground">
                        {formatUGX(calculations.requiredContribution)}
                      </p>
                      {currency.code !== 'UGX' && (
                        <p className="text-xs sm:text-sm font-semibold text-primary mt-0.5">
                          ≈ {formatAmount(calculations.requiredContribution)}
                        </p>
                      )}
                    </motion.div>
                  </AnimatePresence>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">One-time contribution</p>
                </div>
              </motion.div>
              
              <motion.div 
                className="relative p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-gradient-to-br from-success/15 via-success/8 to-success/15 border border-success/20 overflow-hidden"
                whileHover={{ scale: 1.03, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <div className="absolute -top-8 sm:-top-12 -right-8 sm:-right-12 w-20 sm:w-28 h-20 sm:h-28 bg-success/20 rounded-full blur-2xl" />
                <div className="relative text-center">
                  <div className="inline-flex items-center justify-center gap-2 mb-2 sm:mb-3">
                    <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-gradient-to-br from-success to-success/80 shadow-lg">
                      <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-success-foreground" />
                    </div>
                  </div>
                  <p className="text-[10px] sm:text-xs font-bold text-success uppercase tracking-wider mb-1 sm:mb-2">
                    {isCompounding ? `Total Earnings (${duration}mo)` : "Monthly Rewards"}
                  </p>
                  <AnimatePresence mode="wait">
                    <motion.div 
                      key={`${isCompounding}-${projections[projections.length - 1]?.totalEarnings}`}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                    >
                      <p className="text-lg sm:text-2xl md:text-3xl font-black text-success">
                        {formatUGX(isCompounding ? projections[projections.length - 1]?.totalEarnings || 0 : calculations.monthlyReward)}
                      </p>
                      {currency.code !== 'UGX' && (
                        <p className="text-xs sm:text-sm font-semibold text-success mt-0.5">
                          ≈ {formatAmount(isCompounding ? projections[projections.length - 1]?.totalEarnings || 0 : calculations.monthlyReward)}
                        </p>
                      )}
                    </motion.div>
                  </AnimatePresence>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">
                    {isCompounding ? 'With rewards reinvested 🚀' : 'Every single month 🎉'}
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
                  className="flex-1 gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
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
              <Button
                onClick={handleShareEmail}
                variant="outline"
                className="w-full gap-2 border-primary/50 text-primary hover:bg-primary/10"
              >
                <Mail className="h-4 w-4" />
                📧 Share Monthly Breakdown via Email
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
                    <div className="hidden print:block p-4 border-b border-border">
                      <h2 className="text-2xl font-bold text-primary" style={{ fontFamily: "'Chewy', cursive" }}>Welile</h2>
                      <p className="text-xs text-muted-foreground">Support Scenarios Comparison • {new Date().toLocaleDateString()}</p>
                    </div>
                    
                    <h4 className="font-bold flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      Saved Scenarios ({savedScenarios.length}/5)
                    </h4>
                    
                    {/* Scenario Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {savedScenarios.map((scenario) => (
                        <div
                          key={scenario.id}
                          className="p-3 rounded-xl border border-border/60 bg-card/50 relative group"
                        >
                          <button
                            onClick={() => handleDeleteScenario(scenario.id)}
                            className="absolute top-2 right-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
                          >
                            <X className="h-3 w-3 text-destructive" />
                          </button>
                          
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: scenario.color }} />
                            <span className="font-bold text-sm truncate">{scenario.name}</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                            <div>
                              <p className="text-muted-foreground">Contribution</p>
                              <p className="font-semibold">{formatUGX(scenario.requiredContribution)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Earnings</p>
                              <p className="font-semibold text-success">{formatUGX(scenario.totalEarnings)}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px]">
                              {scenario.duration}mo
                            </Badge>
                            {scenario.isCompounding && (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <RefreshCw className="h-2 w-2" /> Reinvest
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-auto h-6 text-[10px] px-2"
                              onClick={() => handleLoadScenario(scenario)}
                            >
                              Load
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Scenario Comparison Chart */}
                    {scenarioComparisonData.length > 0 && (
                      <div className="space-y-3">
                        <h5 className="text-sm font-medium flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-primary" />
                          Earnings Growth Comparison
                        </h5>
                        <div className="h-64 sm:h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={scenarioComparisonData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                              <defs>
                                <linearGradient id="currentGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                                </linearGradient>
                                {savedScenarios.map((s) => (
                                  <linearGradient key={`grad-${s.id}`} id={`gradient-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={s.color} stopOpacity={0.4} />
                                    <stop offset="95%" stopColor={s.color} stopOpacity={0.05} />
                                  </linearGradient>
                                ))}
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                              <XAxis dataKey="month" tick={{ fontSize: 12 }} tickFormatter={(v) => `M${v}`} />
                              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => {
                                if (v >= 1000000000) return `${(v / 1000000000).toFixed(1)}B`;
                                if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                                if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
                                return v.toString();
                              }} />
                              <Tooltip content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg">
                                      <p className="font-semibold mb-2">Month {label}</p>
                                      {payload.map((entry, i) => (
                                        <p key={i} className="text-sm" style={{ color: entry.color }}>
                                          {entry.name}: {formatUGX(entry.value as number)}
                                        </p>
                                      ))}
                                    </div>
                                  );
                                }
                                return null;
                              }} />
                              <Legend wrapperStyle={{ fontSize: '12px' }} />
                              <Area type="monotone" dataKey="current" name="Current" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#currentGradient)" />
                              {savedScenarios.map((s) => (
                                <Area key={s.id} type="monotone" dataKey={s.id} name={s.name} stroke={s.color} strokeWidth={2} fill={`url(#gradient-${s.id})`} />
                              ))}
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                        
                        {/* Summary Bar */}
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
                        
                        {/* Footer */}
                        <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-primary/5 via-muted/30 to-success/5 border border-border/50">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                            <div className="flex items-start gap-2 p-2 rounded-lg bg-background/50">
                              <div className="p-1 rounded-full bg-success/20">
                                <Heart className="h-3 w-3 text-success" />
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold text-foreground">Support Tenants</p>
                                <p className="text-[8px] text-muted-foreground">Your contribution helps tenants access rent facilitation.</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2 p-2 rounded-lg bg-background/50">
                              <div className="p-1 rounded-full bg-primary/20">
                                <Shield className="h-3 w-3 text-primary" />
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold text-foreground">Trusted Collection</p>
                                <p className="text-[8px] text-muted-foreground">Welile coordinates rent collection via agents.</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2 p-2 rounded-lg bg-background/50">
                              <div className="p-1 rounded-full bg-warning/20">
                                <Clock className="h-3 w-3 text-warning" />
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold text-foreground">90-Day Withdrawal Notice</p>
                                <p className="text-[8px] text-muted-foreground">Withdraw capital with 90 days notice.</p>
                              </div>
                            </div>
                          </div>
                          <p className="text-[9px] text-muted-foreground text-center">
                            This comparison is for illustrative purposes. Earnings are based on a 15% monthly platform rewards model and are not guaranteed.
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {/* Export & Share Comparison Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                      <Button
                        onClick={handleExportComparisonPDF}
                        disabled={isExportingComparison}
                        className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
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
        {/* PDF Header */}
        <div className="p-4 sm:p-6 border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-primary" style={{ fontFamily: "'Chewy', cursive" }}>Welile</h2>
              <p className="text-xs text-muted-foreground">Earnings Projection</p>
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
              <p className="text-xs text-muted-foreground mb-1">Contribution</p>
              <p className="font-bold text-primary">{formatUGX(calculations.requiredContribution)}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-success/10">
              <p className="text-xs text-muted-foreground mb-1">Monthly Rewards</p>
              <p className="font-bold text-success">15%</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground mb-1">Duration</p>
              <p className="font-bold">{duration} Months</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-warning/10">
              <p className="text-xs text-muted-foreground mb-1">Reinvesting</p>
              <p className="font-bold text-warning">{isCompounding ? 'Yes' : 'No'}</p>
            </div>
          </div>
        </div>

        {/* Growth Chart */}
        <div className="p-4 sm:p-6 border-b border-border">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            {showComparison ? 'Reinvesting vs Standard Rewards Comparison' : 'Earnings Growth Over Time'}
          </h3>
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={showComparison 
                  ? comparisonData 
                  : [
                      { month: 0, balance: calculations.requiredContribution, earnings: 0 },
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
                <Legend wrapperStyle={{ fontSize: '12px' }} />
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
                  
                  if (milestone > maxValue * 1.2 || milestone < calculations.requiredContribution * 0.5) return null;
                  
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
                      name="Reinvested Rewards"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#compoundGradient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="simpleEarnings"
                      name="Standard Rewards"
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
                <p className="text-xs text-muted-foreground mb-1">Reinvested Rewards</p>
                <p className="font-bold text-primary">{formatUGX(comparisonData[comparisonData.length - 1]?.compoundingEarnings || 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-center">
                <p className="text-xs text-muted-foreground mb-1">Standard Rewards</p>
                <p className="font-bold text-warning">{formatUGX(comparisonData[comparisonData.length - 1]?.simpleEarnings || 0)}</p>
              </div>
              <div className="col-span-2 p-3 rounded-lg bg-success/10 border border-success/30 text-center">
                <p className="text-xs text-muted-foreground mb-1">Extra Earnings with Reinvesting</p>
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
                      <th className="text-right py-3 px-2 font-semibold text-muted-foreground">Contribution</th>
                      <th className="text-right py-3 px-2 font-semibold text-muted-foreground">Rewards</th>
                      <th className="text-right py-3 px-2 font-semibold text-muted-foreground">Total Earned</th>
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
            {/* How It Works */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-background/50 border border-border/50">
                <div className="p-1.5 rounded-full bg-success/20">
                  <Heart className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Earn by Supporting Tenants</p>
                  <p className="text-[10px] text-muted-foreground">Your contribution helps tenants access rent facilitation when they need it most.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-background/50 border border-border/50">
                <div className="p-1.5 rounded-full bg-primary/20">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Trusted Collection Network</p>
                  <p className="text-[10px] text-muted-foreground">Welile coordinates rent collection through our trusted Agent Network.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-background/50 border border-border/50">
                <div className="p-1.5 rounded-full bg-warning/20">
                  <Clock className="h-4 w-4 text-warning" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">90-Day Withdrawal Notice</p>
                  <p className="text-[10px] text-muted-foreground">Withdraw your capital by notifying Welile 90 days in advance.</p>
                </div>
              </div>
            </div>
            
            {/* Disclaimer */}
            <div className="text-center pt-3 border-t border-border/50 space-y-2">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                <strong>Disclaimer:</strong> This projection is for illustrative purposes only and does not constitute financial advice or a guarantee of earnings. 
                Platform rewards are variable and subject to the performance of the rent facilitation pool. 
                By contributing through Welile, you are participating in a business that supports tenants to access rent facilitation.
                Welile Technologies Ltd is not a licensed financial institution, bank, or deposit-taking entity.
              </p>
              
              {/* CTA Button */}
              <div className="pt-3">
                <Link to="/become-supporter">
                  <Button 
                    size="lg" 
                    className="w-full sm:w-auto gap-2 bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70 text-success-foreground font-bold shadow-lg hover:shadow-xl transition-all"
                  >
                    <Heart className="h-5 w-5" />
                    Become a Supporter Today
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Start earning monthly rewards by supporting tenants
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
