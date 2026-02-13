import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Copy, 
  Check, 
  Share2, 
  Link2, 
  Home, 
  Users, 
  Coins, 
  TrendingUp,
  Percent,
  Target,
  Sparkles,
  MessageCircle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatUGX } from '@/lib/rentCalculations';

export function RecruitTenantWelileHomes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [tenantSignups, setTenantSignups] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Referral DB calls stubbed for performance
    setLoading(false);
  }, [user]);

  const getShareLink = () => {
    if (!user) return '';
    return `${window.location.origin}/auth?ref=${user.id}&role=tenant&promo=welile-homes`;
  };

  const getWhatsAppMessage = () => {
    return `🏠 *Build Your Future Home While Paying Rent!*

Hey! I want to share an amazing opportunity with you.

✨ *Welile Homes* - Turn your rent payments into home savings!

*How It Works:*
• 10% of rent fees go into YOUR savings account
• Your savings grow at 5% compound interest MONTHLY
• Use funds to buy land, a home, or pay mortgage deposits

📊 *Example Savings:*
• Monthly Rent: UGX 500,000
• Monthly Saving: UGX 5,000
• After 5 Years: UGX 16+ Million! 🎉

*Plus, you get:*
✅ Pay rent in small daily amounts
✅ Access rent loans when needed
✅ Track all payments easily
✅ UGX 500 signup bonus!

👉 *Join now and start building your future:*
${getShareLink()}

Let's make your rent work for YOU! 💪🏡`;
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(getShareLink());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Link copied!' });
  };

  const handleShareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(getWhatsAppMessage())}`, '_blank');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Welile Homes - Build Your Future!',
          text: 'Turn your rent payments into home savings. Join now!',
          url: getShareLink(),
        });
      } catch (err) {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  // Calculate example savings
  const exampleMonthlyRent = 500000;
  const monthlyContribution = exampleMonthlyRent * 0.10;
  const calculateProjection = (months: number) => {
    let balance = 0;
    for (let i = 0; i < months; i++) {
      balance = (balance * 1.05) + monthlyContribution;
    }
    return Math.round(balance);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-2 border-purple-300 bg-gradient-to-br from-purple-50 via-background to-amber-50/30 overflow-hidden">
        <CardContent className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-lg shadow-purple-500/25">
              <Home className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base">Recruit Tenants</h3>
                <Badge className="bg-purple-100 text-purple-700 text-[10px]">
                  Welile Homes
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Help tenants build their future home!
              </p>
            </div>
          </div>

          {/* Benefits Highlight */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-purple-100 to-amber-100 border border-purple-200">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-semibold text-purple-800">Welile Homes Benefits</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Percent className="h-3 w-3 text-emerald-600" />
                </div>
                <span className="text-purple-700">5% monthly interest</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center">
                  <TrendingUp className="h-3 w-3 text-purple-600" />
                </div>
                <span className="text-purple-700">10% rent saved</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                  <Target className="h-3 w-3 text-amber-600" />
                </div>
                <span className="text-purple-700">5-year home goal</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                  <Coins className="h-3 w-3 text-blue-600" />
                </div>
                <span className="text-purple-700">UGX 500 bonus</span>
              </div>
            </div>
          </div>

          {/* Savings Projection Example */}
          <div className="p-3 rounded-xl bg-white border border-purple-200">
            <p className="text-xs text-muted-foreground mb-2">
              Example: {formatUGX(exampleMonthlyRent)}/month rent
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-purple-50">
                <p className="text-[10px] text-muted-foreground">1 Year</p>
                <p className="text-xs font-bold text-purple-700">{formatUGX(calculateProjection(12))}</p>
              </div>
              <div className="p-2 rounded-lg bg-purple-50">
                <p className="text-[10px] text-muted-foreground">2 Years</p>
                <p className="text-xs font-bold text-purple-700">{formatUGX(calculateProjection(24))}</p>
              </div>
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-100 to-amber-100 border border-purple-300">
                <p className="text-[10px] text-muted-foreground">5 Years</p>
                <p className="text-sm font-bold text-purple-800">{formatUGX(calculateProjection(60))}</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
            <Users className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-lg font-bold text-emerald-700">
                {loading ? '-' : tenantSignups}
              </p>
              <p className="text-[10px] text-muted-foreground">Tenants Recruited</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-sm font-bold text-emerald-600">
                {loading ? '-' : formatUGX(tenantSignups * 500)}
              </p>
              <p className="text-[10px] text-muted-foreground">Earned</p>
            </div>
          </div>

          {/* Link Section */}
          <div className="relative p-3 rounded-xl bg-background border border-purple-200">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Link2 className="h-3 w-3" />
              <span>Tenant recruitment link</span>
            </div>
            <div className="flex gap-2">
              <Input 
                value={getShareLink()} 
                readOnly 
                className="h-10 text-xs font-mono bg-muted/50 border-purple-200" 
              />
              <Button 
                variant={copied ? "default" : "outline"} 
                size="icon" 
                onClick={handleCopyLink}
                className={`h-10 w-10 shrink-0 transition-all ${copied ? 'bg-emerald-500 hover:bg-emerald-600' : 'border-purple-300 hover:bg-purple-50'}`}
              >
                {copied ? <Check className="h-4 w-4 text-white" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Share Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button 
              onClick={handleShareWhatsApp}
              className="h-12 gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold touch-manipulation"
            >
              <MessageCircle className="h-4 w-4" />
              Share via WhatsApp
            </Button>
            <Button 
              variant="outline"
              onClick={handleNativeShare}
              className="h-12 gap-2 border-purple-300 text-purple-700 hover:bg-purple-50 touch-manipulation"
            >
              <Share2 className="h-4 w-4" />
              Share Link
            </Button>
          </div>

          {/* Incentive Info */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
            <Coins className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800">
              <span className="font-semibold">Earn UGX 500</span> for each tenant who signs up using your link. 
              Help them build their future while earning!
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
