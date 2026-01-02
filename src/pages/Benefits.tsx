import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Home, Users, Wallet, Receipt, ShoppingBag, TrendingUp, 
  Shield, Clock, Gift, Share2, ArrowLeft, CheckCircle2,
  Smartphone, CreditCard, Percent, Building2, Coins, Star,
  Zap, Trophy, Target, Sparkles, BadgeDollarSign, Flame
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { ReferralLeaderboard } from '@/components/ReferralLeaderboard';

// High-impact opportunities for different user types
const opportunities = [
  {
    category: "💰 EARN MONEY",
    items: [
      {
        icon: Coins,
        title: "Earn UGX 100 Per Referral - Unlimited!",
        description: "No limits! Invite 10 friends = UGX 1,000. Invite 100 friends = UGX 10,000. The more you share, the more you earn!",
        color: "bg-success/10 text-success",
        highlight: true,
        tag: "INSTANT CASH"
      },
      {
        icon: Trophy,
        title: "Win Monthly Cash Prizes - Up to UGX 30,000!",
        description: "Top 3 referrers every month win BONUS rewards: 1st = UGX 30,000, 2nd = UGX 20,000, 3rd = UGX 10,000. Could be YOU!",
        color: "bg-amber-500/10 text-amber-500",
        highlight: true,
        tag: "MONTHLY CONTEST"
      },
      {
        icon: TrendingUp,
        title: "Invest & Grow Your Money - Earn 10-15% Returns",
        description: "Be a Supporter! Fund verified rent requests and earn guaranteed returns. Your money works for you 24/7.",
        color: "bg-indigo-500/10 text-indigo-500",
        tag: "INVESTORS"
      },
      {
        icon: BadgeDollarSign,
        title: "Become an Agent - Build Your Own Business",
        description: "Earn commission on every deposit, withdrawal, loan, and sale in your area. No capital needed to start!",
        color: "bg-violet-500/10 text-violet-500",
        tag: "ENTREPRENEURS"
      }
    ]
  },
  {
    category: "🏠 SOLVE RENT STRESS",
    items: [
      {
        icon: Home,
        title: "Get Rent Money TODAY - Pay Back Over 30 Days",
        description: "Landlord breathing down your neck? Access up to 100% of your rent NOW and repay in small daily amounts. No more sleepless nights!",
        color: "bg-primary/10 text-primary",
        tag: "TENANTS"
      },
      {
        icon: Percent,
        title: "Get Up to 70% OFF Your Rent - Seriously!",
        description: "Every purchase you make with Welile receipts earns 1% back as rent credit. Shop smart, save BIG on rent!",
        color: "bg-emerald-500/10 text-emerald-500",
        tag: "EXCLUSIVE"
      },
      {
        icon: Receipt,
        title: "Turn Your Shopping Receipts Into Loan Power",
        description: "Those receipts in your pocket? They're worth money! Submit verified receipts to unlock higher loan limits instantly.",
        color: "bg-blue-500/10 text-blue-500",
        tag: "GENIUS HACK"
      }
    ]
  },
  {
    category: "💼 FOR BUSINESS OWNERS",
    items: [
      {
        icon: Building2,
        title: "Landlords: Get Paid ON TIME, Every Time",
        description: "Never chase tenants again! Receive rent directly to your wallet. We handle collection - you enjoy peace of mind.",
        color: "bg-cyan-500/10 text-cyan-500",
        tag: "LANDLORDS"
      },
      {
        icon: ShoppingBag,
        title: "Sell to 40M+ Customers - Zero Startup Cost",
        description: "List your products on our marketplace. Reach buyers across East Africa. We handle payments - you focus on selling!",
        color: "bg-orange-500/10 text-orange-500",
        tag: "VENDORS"
      }
    ]
  },
  {
    category: "⚡ INSTANT FINANCIAL SERVICES",
    items: [
      {
        icon: Wallet,
        title: "Send & Receive Money - Zero Hidden Fees",
        description: "Transfer to anyone on Welile instantly. Deposit or withdraw through agents in your neighborhood. Fast, free, simple!",
        color: "bg-rose-500/10 text-rose-500"
      },
      {
        icon: CreditCard,
        title: "Quick Loans When You Need Cash FAST",
        description: "Emergency? Bills due? Access instant loans based on your history. No paperwork, no guarantors, approved in minutes!",
        color: "bg-pink-500/10 text-pink-500"
      }
    ]
  },
  {
    category: "✅ WHY TRUST WELILE",
    items: [
      {
        icon: Shield,
        title: "Bank-Level Security - Your Money is SAFE",
        description: "Protected by advanced encryption. Verified by LC1 chairpersons. Over 40 million users trust us with their money.",
        color: "bg-green-500/10 text-green-500"
      },
      {
        icon: Clock,
        title: "24/7 Access - Works Even on Basic Phones",
        description: "No smartphone? No problem! Access anytime, anywhere. Simple interface that anyone can use.",
        color: "bg-teal-500/10 text-teal-500"
      }
    ]
  }
];

export default function Benefits() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [referralCount, setReferralCount] = useState(0);
  const [referralEarnings, setReferralEarnings] = useState(0);

  // Generate share URL with user's referral code if logged in
  const shareUrl = user 
    ? `${window.location.origin}/auth?ref=${user.id}`
    : `${window.location.origin}/auth`;

  const shareMessage = `🔥 STOP! This Changed My Life! 🔥

💰 I just discovered Welile - and I'm making money daily!

HERE'S WHAT YOU GET:
✅ UGX 100 CASH for every friend you invite (unlimited!)
✅ Up to 70% OFF your rent - yes, really!
✅ Get rent money TODAY, pay back slowly
✅ Win up to UGX 30,000 monthly prizes
✅ Instant loans - no guarantors needed
✅ Send/receive money FREE

40 MILLION people in East Africa are already using it!

👇 JOIN FREE NOW - Start earning TODAY:
${shareUrl}

Trust me, you'll thank me later! 🙏`;

  // Fetch referral stats with realtime updates
  useEffect(() => {
    if (!user) return;

    const fetchReferrals = async () => {
      const { data } = await supabase
        .from('referrals')
        .select('id, bonus_amount, credited')
        .eq('referrer_id', user.id);
      
      if (data) {
        setReferralCount(data.length);
        setReferralEarnings(data.filter(r => r.credited).reduce((sum, r) => sum + Number(r.bonus_amount), 0));
      }
    };

    fetchReferrals();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('referral-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'referrals',
          filter: `referrer_id=eq.${user.id}`
        },
        (payload) => {
          console.log('New referral!', payload);
          setReferralCount(prev => prev + 1);
          setReferralEarnings(prev => prev + Number(payload.new.bonus_amount || 100));
          toast.success('🎉 You earned UGX 100 for a new referral!');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleWhatsAppShare = () => {
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(whatsappUrl, '_blank');
    toast.success('Opening WhatsApp to share');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied to clipboard!');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Welile - Make Money & Save on Rent!',
          text: shareMessage,
          url: shareUrl
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          handleWhatsAppShare();
        }
      }
    } else {
      handleWhatsAppShare();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-semibold">Your Opportunity Awaits</h1>
          <Button variant="ghost" size="icon" onClick={handleNativeShare}>
            <Share2 className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 pb-32 max-w-2xl">
        {/* Hero - More Compelling */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <motion.div 
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-600 dark:text-amber-400 text-sm font-bold mb-4"
          >
            <Flame className="h-4 w-4" />
            <span>40M+ Users Can't Be Wrong!</span>
            <Flame className="h-4 w-4" />
          </motion.div>
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            <span className="text-primary">Make Money.</span>{' '}
            <span className="text-emerald-500">Save on Rent.</span>{' '}
            <span className="text-amber-500">Live Better.</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Join the financial revolution sweeping East Africa 🌍
          </p>
        </motion.div>

        {/* Urgent CTA Banner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <Card className="border-2 border-primary/50 bg-gradient-to-r from-primary/10 via-amber-500/10 to-success/10 overflow-hidden">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="font-bold text-lg">🎁 JOIN FREE TODAY</span>
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                No fees. No hidden charges. Start earning in 2 minutes!
              </p>
              <Button 
                size="lg" 
                className="w-full bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90"
                onClick={() => navigate('/auth')}
              >
                <Zap className="h-4 w-4 mr-2" />
                Start Making Money NOW
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Referral Stats - Only show for logged in users */}
        {user && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <Card className="border-success/30 bg-gradient-to-r from-success/5 to-primary/5 overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-success/10">
                    <Coins className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <h3 className="font-semibold">💰 Your Earnings Dashboard</h3>
                    <p className="text-xs text-muted-foreground">Keep inviting - no limits on how much you can earn!</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-background/60 text-center">
                    <p className="text-2xl font-bold text-success">{referralCount}</p>
                    <p className="text-xs text-muted-foreground">Friends Earning With You</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background/60 text-center">
                    <p className="text-2xl font-bold text-success">{formatUGX(referralEarnings)}</p>
                    <p className="text-xs text-muted-foreground">Cash Earned So Far</p>
                  </div>
                </div>
                {referralCount > 0 && (
                  <p className="text-center text-xs text-success mt-3 font-medium">
                    🔥 You're doing great! Invite {10 - referralCount > 0 ? 10 - referralCount : 'more'} friends to earn {formatUGX((10 - referralCount) * 100)}+ more!
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Referral Leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h3 className="font-bold text-lg">Top Earners This Month</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            These people are earning REAL money. You could be next! 👇
          </p>
          <ReferralLeaderboard limit={10} />
        </motion.div>

        {/* Opportunities by Category */}
        {opportunities.map((section, sectionIndex) => (
          <motion.div
            key={section.category}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + sectionIndex * 0.1 }}
            className="mb-8"
          >
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              {section.category}
            </h3>
            <div className="grid gap-3">
              {section.items.map((item, index) => (
                <Card 
                  key={item.title}
                  className={`border-border/50 hover:border-primary/30 transition-all hover:shadow-lg ${item.highlight ? 'ring-2 ring-success/30 bg-gradient-to-r from-success/5 to-amber-500/5' : ''}`}
                >
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className={`p-3 rounded-xl ${item.color} shrink-0`}>
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h4 className="font-semibold text-sm">{item.title}</h4>
                        {item.tag && (
                          <Badge 
                            variant={item.highlight ? "success" : "secondary"} 
                            className="text-[10px]"
                          >
                            {item.tag}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-1" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        ))}

        {/* Social Proof Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mb-8"
        >
          <h3 className="font-bold text-lg mb-4 text-center">📊 The Numbers Don't Lie</h3>
          <div className="grid grid-cols-2 gap-3">
            <Card className="text-center p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <p className="text-3xl font-bold text-primary">40M+</p>
              <p className="text-xs text-muted-foreground font-medium">Active Users</p>
            </Card>
            <Card className="text-center p-4 bg-gradient-to-br from-success/10 to-success/5 border-success/20">
              <p className="text-3xl font-bold text-success">5+</p>
              <p className="text-xs text-muted-foreground font-medium">Countries</p>
            </Card>
            <Card className="text-center p-4 bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
              <p className="text-3xl font-bold text-amber-500">70%</p>
              <p className="text-xs text-muted-foreground font-medium">Max Rent Discount</p>
            </Card>
            <Card className="text-center p-4 bg-gradient-to-br from-violet-500/10 to-violet-500/5 border-violet-500/20">
              <p className="text-3xl font-bold text-violet-500">24/7</p>
              <p className="text-xs text-muted-foreground font-medium">Always Available</p>
            </Card>
          </div>
        </motion.div>

        {/* Testimonial */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="mb-8"
        >
          <Card className="bg-muted/30 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-1 mb-2">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm italic mb-3">
                "I was struggling to pay rent every month. Now I invite friends, earn money, and even get discounts! Welile saved my life. If you're not using it, you're missing out!"
              </p>
              <p className="text-xs text-muted-foreground font-medium">
                — Sarah M., Kampala 🇺🇬
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Final CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="text-center mb-6"
        >
          <Card className="border-2 border-dashed border-primary/50 bg-primary/5 p-6">
            <h3 className="font-bold text-xl mb-2">⏰ What Are You Waiting For?</h3>
            <p className="text-muted-foreground mb-4">
              Every minute you delay, someone else is earning. Join NOW and start making money TODAY!
            </p>
            <Button 
              size="lg" 
              className="w-full mb-3 bg-gradient-to-r from-success to-primary hover:from-success/90 hover:to-primary/90 text-white font-bold"
              onClick={() => navigate('/auth')}
            >
              <Gift className="h-5 w-5 mr-2" />
              YES! I Want to Start Earning FREE
            </Button>
            <p className="text-xs text-muted-foreground">
              ✓ 100% Free ✓ No Credit Card ✓ Takes 2 Minutes
            </p>
          </Card>
        </motion.div>
      </main>

      {/* Floating Share Button */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t border-border"
      >
        <div className="container mx-auto max-w-2xl">
          <p className="text-center text-xs text-muted-foreground mb-2 font-medium">
            👇 Share now & earn UGX 100 for every friend who joins!
          </p>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={handleCopyLink}
            >
              <Share2 className="h-4 w-4 mr-2" />
              Copy Link
            </Button>
            <Button 
              className="flex-1 bg-[#25D366] hover:bg-[#128C7E] text-white font-bold"
              onClick={handleWhatsAppShare}
            >
              <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              Share & Earn UGX 100
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
