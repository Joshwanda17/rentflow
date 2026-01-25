import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { 
  Calculator, TrendingUp, ArrowRight, Sparkles, Shield, Clock, 
  Share2, WifiOff, RefreshCw, Download, ArrowUp, ChevronDown 
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';

interface MonthlyProjection {
  month: number;
  principal: number;
  earnings: number;
  totalEarnings: number;
  balance: number;
}

const ROI_RATE = 0.15; // 15% monthly

export default function TryCalculator() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referrerId = searchParams.get('ref') || searchParams.get('s');
  const projectionRef = useRef<HTMLDivElement>(null);
  
  const [amount, setAmount] = useState(500000);
  const [months, setMonths] = useState(12);
  const [isCompounding, setIsCompounding] = useState(false);
  const [hasTriedCalculator, setHasTriedCalculator] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Calculate projections
  const projections = useMemo((): MonthlyProjection[] => {
    const results: MonthlyProjection[] = [];
    let currentBalance = amount;
    let totalEarnings = 0;

    for (let month = 1; month <= months; month++) {
      const earnings = currentBalance * ROI_RATE;
      totalEarnings += earnings;
      if (isCompounding) currentBalance += earnings;

      results.push({
        month,
        principal: isCompounding ? currentBalance - earnings : amount,
        earnings,
        totalEarnings,
        balance: isCompounding ? currentBalance : amount + totalEarnings,
      });
    }
    return results;
  }, [amount, months, isCompounding]);

  const finalProjection = projections[projections.length - 1];
  const monthlyEarnings = amount * ROI_RATE;

  const handleCalculate = () => {
    hapticTap();
    setHasTriedCalculator(true);
  };

  const handleSignUp = () => {
    hapticSuccess();
    const params = new URLSearchParams({ role: 'supporter' });
    if (referrerId) params.set('ref', referrerId);
    navigate(`/auth?${params.toString()}`);
  };

  const handleShare = async () => {
    hapticTap();
    const shareLink = `${window.location.origin}/try-calculator${referrerId ? `?ref=${referrerId}` : ''}`;
    const shareMessage = `💰 Want to earn 15% monthly returns?

📊 Try this FREE Investment Calculator - no signup needed!
📈 See exactly how much you can earn
🔄 With compounding up to 60 months!
🎁 Sign up & we BOTH earn UGX 500!

👉 Try it: ${shareLink}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Welile Investment Calculator',
          text: shareMessage,
          url: shareLink,
        });
        return;
      } catch {
        // Fall through to WhatsApp
      }
    }
    
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleDownloadPDF = async () => {
    hapticTap();
    setIsExporting(true);
    
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFillColor(124, 58, 237); // primary violet
      doc.rect(0, 0, pageWidth, 35, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('Welile Investment Projection', pageWidth / 2, 18, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 28, { align: 'center' });
      
      // Summary Box
      doc.setTextColor(0, 0, 0);
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(15, 45, pageWidth - 30, 35, 3, 3, 'F');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Investment Summary', 20, 55);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const summaryY = 63;
      doc.text(`Principal: ${formatUGX(amount)}`, 20, summaryY);
      doc.text(`Duration: ${months} months`, 80, summaryY);
      doc.text(`Compounding: ${isCompounding ? 'Yes' : 'No'}`, 140, summaryY);
      doc.text(`Monthly ROI: 15%`, 20, summaryY + 8);
      doc.text(`Total Earnings: ${formatUGX(finalProjection?.totalEarnings || 0)}`, 80, summaryY + 8);
      doc.setTextColor(34, 197, 94);
      doc.text(`Final Balance: ${formatUGX(finalProjection?.balance || 0)}`, 140, summaryY + 8);
      
      // Table Header
      doc.setTextColor(0, 0, 0);
      doc.setFillColor(124, 58, 237);
      doc.rect(15, 90, pageWidth - 30, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Month', 20, 97);
      doc.text('Principal', 50, 97);
      doc.text('Earnings', 95, 97);
      doc.text('Total Earnings', 130, 97);
      doc.text('Balance', 170, 97);
      
      // Table Rows
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      let yPos = 107;
      const rowHeight = 7;
      const maxRowsPerPage = 25;
      
      projections.forEach((row, index) => {
        if (index > 0 && index % maxRowsPerPage === 0) {
          doc.addPage();
          yPos = 20;
          
          // Repeat header on new page
          doc.setFillColor(124, 58, 237);
          doc.rect(15, yPos - 10, pageWidth - 30, 10, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.text('Month', 20, yPos - 3);
          doc.text('Principal', 50, yPos - 3);
          doc.text('Earnings', 95, yPos - 3);
          doc.text('Total Earnings', 130, yPos - 3);
          doc.text('Balance', 170, yPos - 3);
          doc.setTextColor(0, 0, 0);
          doc.setFont('helvetica', 'normal');
          yPos += 7;
        }
        
        // Alternate row colors
        if (index % 2 === 0) {
          doc.setFillColor(250, 250, 250);
          doc.rect(15, yPos - 5, pageWidth - 30, rowHeight, 'F');
        }
        
        doc.setFontSize(8);
        doc.text(`${row.month}`, 20, yPos);
        doc.text(formatUGX(row.principal), 50, yPos);
        doc.setTextColor(34, 197, 94);
        doc.text(`+${formatUGX(row.earnings)}`, 95, yPos);
        doc.text(formatUGX(row.totalEarnings), 130, yPos);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.text(formatUGX(row.balance), 170, yPos);
        doc.setFont('helvetica', 'normal');
        
        yPos += rowHeight;
      });
      
      // Footer
      const lastPage = doc.getNumberOfPages();
      doc.setPage(lastPage);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('This projection is for illustration purposes. Past performance does not guarantee future results.', pageWidth / 2, doc.internal.pageSize.getHeight() - 15, { align: 'center' });
      doc.text('Start investing at welile.com', pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
      
      doc.save(`Welile_Projection_${months}months_${isCompounding ? 'compound' : 'simple'}.pdf`);
      hapticSuccess();
    } catch (error) {
      console.error('PDF export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const quickMonths = [6, 12, 24, 60];

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50 dark:from-violet-950/30 dark:via-purple-950/20 dark:to-background">
      {/* Offline indicator */}
      {!isOnline && (
        <div className="bg-warning/20 border-b border-warning/30 px-4 py-2 flex items-center justify-center gap-2 text-sm">
          <WifiOff className="h-4 w-4 text-warning" />
          <span className="text-warning-foreground">Offline - Calculator still works!</span>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-background/80 backdrop-blur-xl border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <span 
            className="text-xl font-bold text-primary cursor-pointer"
            style={{ fontFamily: "'Chewy', cursive" }}
            onClick={() => navigate('/')}
          >
            Welile
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleShare} className="h-9 w-9">
              <Share2 className="h-4 w-4" />
            </Button>
            <Button onClick={handleSignUp} size="sm" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Start Earning
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-lg">
        {/* Hero */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-success/10 text-success px-4 py-2 rounded-full text-sm font-medium mb-3">
            <TrendingUp className="h-4 w-4" />
            15% Monthly Returns
          </div>
          <h1 className="text-2xl font-bold mb-1">
            Investment Calculator
          </h1>
          <p className="text-muted-foreground text-sm">
            With compounding projections up to 60 months
          </p>
        </div>

        {/* Calculator Card */}
        <Card className="mb-4 shadow-xl border-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calculator className="h-5 w-5 text-primary" />
              Calculate Your Earnings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Investment Amount */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Investment Amount</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={amount.toLocaleString()}
                onChange={(e) => {
                  const value = parseInt(e.target.value.replace(/,/g, '')) || 0;
                  setAmount(Math.max(0, Math.min(value, 100000000)));
                }}
                className="text-lg h-12 font-semibold text-center"
              />
              <Slider
                value={[amount]}
                onValueChange={([v]) => setAmount(v)}
                min={50000}
                max={50000000}
                step={50000}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>50K</span>
                <span>50M</span>
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Duration</Label>
                <span className="text-sm text-primary font-semibold">{months} months</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {quickMonths.map((m) => (
                  <Button
                    key={m}
                    variant={months === m ? 'default' : 'outline'}
                    onClick={() => setMonths(m)}
                    size="sm"
                    className="h-10"
                  >
                    {m}mo
                  </Button>
                ))}
              </div>
              <Slider
                value={[months]}
                onValueChange={([v]) => setMonths(v)}
                min={1}
                max={60}
                step={1}
                className="mt-2"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>1 mo</span>
                <span>60 mo</span>
              </div>
            </div>

            {/* Compounding Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border">
              <div className="flex items-center gap-2">
                <RefreshCw className={`h-4 w-4 ${isCompounding ? 'text-success' : 'text-muted-foreground'}`} />
                <div>
                  <p className="text-sm font-medium">Compound Earnings</p>
                  <p className="text-[10px] text-muted-foreground">Reinvest monthly returns</p>
                </div>
              </div>
              <Switch checked={isCompounding} onCheckedChange={setIsCompounding} />
            </div>

            <Button 
              onClick={handleCalculate} 
              className="w-full h-12 text-lg gap-2"
            >
              <Calculator className="h-5 w-5" />
              Calculate
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        <AnimatePresence>
          {hasTriedCalculator && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="mb-4 bg-gradient-to-br from-success/10 to-emerald-500/5 border-success/30 shadow-lg">
                <CardContent className="pt-6">
                  <div className="text-center mb-4">
                    <p className="text-xs text-muted-foreground mb-1">
                      After {months} months {isCompounding ? '(compounded)' : ''}
                    </p>
                    <p className="text-3xl font-bold text-success">{formatUGX(finalProjection?.balance || 0)}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="text-center p-3 bg-background rounded-xl">
                      <p className="text-[10px] text-muted-foreground">Your Investment</p>
                      <p className="font-bold text-sm">{formatUGX(amount)}</p>
                    </div>
                    <div className="text-center p-3 bg-background rounded-xl">
                      <p className="text-[10px] text-muted-foreground">Total Earnings</p>
                      <p className="font-bold text-sm text-success">+{formatUGX(finalProjection?.totalEarnings || 0)}</p>
                    </div>
                  </div>

                  {!isCompounding && (
                    <div className="p-2 bg-primary/5 rounded-xl mb-4">
                      <p className="text-center text-xs">
                        <span className="font-semibold">{formatUGX(monthlyEarnings)}</span>
                        <span className="text-muted-foreground"> earned every month</span>
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mb-4">
                    <Button 
                      onClick={() => setShowBreakdown(!showBreakdown)} 
                      variant="outline" 
                      className="flex-1 gap-2"
                      size="sm"
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
                      {showBreakdown ? 'Hide' : 'View'} Breakdown
                    </Button>
                    <Button 
                      onClick={handleDownloadPDF} 
                      variant="outline" 
                      className="gap-2"
                      size="sm"
                      disabled={isExporting}
                    >
                      <Download className="h-4 w-4" />
                      {isExporting ? '...' : 'PDF'}
                    </Button>
                  </div>

                  {/* Monthly Breakdown */}
                  <AnimatePresence>
                    {showBreakdown && (
                      <motion.div
                        ref={projectionRef}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="max-h-64 overflow-y-auto rounded-xl border bg-background">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-muted border-b">
                              <tr>
                                <th className="text-left py-2 px-2 font-semibold">Mo</th>
                                <th className="text-right py-2 px-2 font-semibold">Earnings</th>
                                <th className="text-right py-2 px-2 font-semibold">Total</th>
                                <th className="text-right py-2 px-2 font-semibold">Balance</th>
                              </tr>
                            </thead>
                            <tbody>
                              {projections.map((row, i) => (
                                <tr key={row.month} className={i % 2 === 0 ? 'bg-muted/30' : ''}>
                                  <td className="py-1.5 px-2 font-medium">{row.month}</td>
                                  <td className="py-1.5 px-2 text-right text-success">+{formatUGX(row.earnings)}</td>
                                  <td className="py-1.5 px-2 text-right">{formatUGX(row.totalEarnings)}</td>
                                  <td className="py-1.5 px-2 text-right font-semibold">{formatUGX(row.balance)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Button 
                    onClick={handleSignUp} 
                    className="w-full h-12 text-lg gap-2 mt-4 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                  >
                    Start Earning Now
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Trust Badges */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <div className="flex flex-col items-center gap-1 p-3 bg-white/60 dark:bg-card/60 rounded-xl text-center">
            <Shield className="h-5 w-5 text-primary" />
            <p className="text-[10px] font-medium">Secure</p>
          </div>
          <div className="flex flex-col items-center gap-1 p-3 bg-white/60 dark:bg-card/60 rounded-xl text-center">
            <Clock className="h-5 w-5 text-primary" />
            <p className="text-[10px] font-medium">Flexible</p>
          </div>
          <div className="flex flex-col items-center gap-1 p-3 bg-white/60 dark:bg-card/60 rounded-xl text-center">
            <WifiOff className="h-5 w-5 text-primary" />
            <p className="text-[10px] font-medium">Works Offline</p>
          </div>
        </div>

        {/* CTA Footer */}
        {!hasTriedCalculator && (
          <p className="text-center text-sm text-muted-foreground">
            Try the calculator above to see your potential earnings!
          </p>
        )}
      </div>
    </div>
  );
}
