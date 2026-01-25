import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Calculator, TrendingUp, ArrowRight, Sparkles, Shield, Clock, Share2, WifiOff } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap, hapticSuccess } from '@/lib/haptics';

export default function TryCalculator() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referrerId = searchParams.get('ref') || searchParams.get('s');
  
  const [amount, setAmount] = useState(500000);
  const [months, setMonths] = useState(6);
  const [hasTriedCalculator, setHasTriedCalculator] = useState(false);
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

  const monthlyRate = 0.15; // 15% monthly
  const monthlyEarnings = amount * monthlyRate;
  const totalEarnings = monthlyEarnings * months;
  const finalBalance = amount + totalEarnings;

  const handleCalculate = () => {
    hapticTap();
    setHasTriedCalculator(true);
  };

  const handleSignUp = () => {
    hapticSuccess();
    // Navigate to auth with supporter role pre-selected and referrer
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

      <div className="container mx-auto px-4 py-8 max-w-lg">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-success/10 text-success px-4 py-2 rounded-full text-sm font-medium mb-4">
            <TrendingUp className="h-4 w-4" />
            15% Monthly Returns
          </div>
          <h1 className="text-2xl font-bold mb-2">
            Investment Calculator
          </h1>
          <p className="text-muted-foreground">
            See how much you can earn as a Tenant Supporter
          </p>
        </div>

        {/* Calculator Card */}
        <Card className="mb-6 shadow-xl border-2">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calculator className="h-5 w-5 text-primary" />
              Calculate Your Earnings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Investment Amount */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Investment Amount</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="text-lg h-12 font-semibold"
                min={50000}
                step={50000}
              />
              <Slider
                value={[amount]}
                onValueChange={([v]) => setAmount(v)}
                min={50000}
                max={10000000}
                step={50000}
                className="mt-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>UGX 50,000</span>
                <span>UGX 10,000,000</span>
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Investment Period</Label>
              <div className="grid grid-cols-4 gap-2">
                {[3, 6, 9, 12].map((m) => (
                  <Button
                    key={m}
                    variant={months === m ? 'default' : 'outline'}
                    onClick={() => setMonths(m)}
                    className="h-12"
                  >
                    {m} mo
                  </Button>
                ))}
              </div>
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
        {hasTriedCalculator && (
          <Card className="mb-6 bg-gradient-to-br from-success/10 to-emerald-500/5 border-success/30 shadow-lg animate-in fade-in slide-in-from-bottom-4">
            <CardContent className="pt-6">
              <div className="text-center mb-4">
                <p className="text-sm text-muted-foreground mb-1">After {months} months you'll have</p>
                <p className="text-3xl font-bold text-success">{formatUGX(finalBalance)}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center p-3 bg-background rounded-xl">
                  <p className="text-xs text-muted-foreground">Your Investment</p>
                  <p className="font-bold">{formatUGX(amount)}</p>
                </div>
                <div className="text-center p-3 bg-background rounded-xl">
                  <p className="text-xs text-muted-foreground">Total Earnings</p>
                  <p className="font-bold text-success">+{formatUGX(totalEarnings)}</p>
                </div>
              </div>

              <div className="p-3 bg-primary/5 rounded-xl mb-4">
                <p className="text-center text-sm">
                  <span className="font-semibold">{formatUGX(monthlyEarnings)}</span>
                  <span className="text-muted-foreground"> earned every month</span>
                </p>
              </div>

              <Button 
                onClick={handleSignUp} 
                className="w-full h-14 text-lg gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
              >
                Start Earning Now
                <ArrowRight className="h-5 w-5" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Trust Badges */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="flex items-center gap-2 p-3 bg-white/60 dark:bg-card/60 rounded-xl">
            <Shield className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-xs font-medium">Secure</p>
              <p className="text-[10px] text-muted-foreground">Protected funds</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-white/60 dark:bg-card/60 rounded-xl">
            <Clock className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-xs font-medium">Flexible</p>
              <p className="text-[10px] text-muted-foreground">Withdraw anytime</p>
            </div>
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
