import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Home, Users, Wallet, Receipt, ShoppingBag, TrendingUp, 
  Shield, Clock, Gift, Share2, ArrowLeft, CheckCircle2,
  Smartphone, CreditCard, Percent, Building2, Coins
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

const benefits = [
  {
    icon: Coins,
    title: "Earn UGX 100 Per Referral",
    description: "Share your link and earn UGX 100 instantly when anyone joins through your link!",
    color: "bg-success/10 text-success",
    highlight: true
  },
  {
    icon: Home,
    title: "Access Rent Today",
    description: "Get up to 100% of your monthly rent and pay back in small daily amounts over 30 days.",
    color: "bg-primary/10 text-primary"
  },
  {
    icon: Percent,
    title: "Up to 70% Rent Discount",
    description: "Pay your landlord through Welile and get 1% of your verified receipts as rent discount.",
    color: "bg-emerald-500/10 text-emerald-500"
  },
  {
    icon: Receipt,
    title: "Build Loan Limit with Receipts",
    description: "Every verified receipt increases your loan limit. Shop anywhere, submit receipts, grow your limit.",
    color: "bg-blue-500/10 text-blue-500"
  },
  {
    icon: Wallet,
    title: "Digital Wallet",
    description: "Send and receive money instantly. Deposit and withdraw through authorized agents near you.",
    color: "bg-violet-500/10 text-violet-500"
  },
  {
    icon: ShoppingBag,
    title: "Marketplace",
    description: "Shop from trusted vendors and pay with your wallet. Earn receipts on every purchase.",
    color: "bg-orange-500/10 text-orange-500"
  },
  {
    icon: CreditCard,
    title: "Quick Loans",
    description: "Access instant loans from agents based on your verified purchase history.",
    color: "bg-pink-500/10 text-pink-500"
  },
  {
    icon: Building2,
    title: "For Landlords",
    description: "Receive rent payments directly to your wallet. No more chasing tenants for payment.",
    color: "bg-cyan-500/10 text-cyan-500"
  },
  {
    icon: Users,
    title: "For Agents",
    description: "Earn commissions on deposits, loans, and marketplace sales.",
    color: "bg-amber-500/10 text-amber-500"
  },
  {
    icon: TrendingUp,
    title: "For Supporters",
    description: "Invest in verified rent requests and earn returns. Help others while growing your money.",
    color: "bg-indigo-500/10 text-indigo-500"
  },
  {
    icon: Shield,
    title: "Safe & Secure",
    description: "Your money and data are protected with bank-level security. Verified by LC1 chairpersons.",
    color: "bg-green-500/10 text-green-500"
  },
  {
    icon: Clock,
    title: "24/7 Availability",
    description: "Access your wallet and services anytime. Mobile-first platform that works everywhere.",
    color: "bg-rose-500/10 text-rose-500"
  },
  {
    icon: Smartphone,
    title: "Easy to Use",
    description: "Simple, intuitive interface. No complicated forms. Get started in minutes.",
    color: "bg-teal-500/10 text-teal-500"
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

  const shareMessage = `🏠 Discover Welile - Africa's Rent Facilitation Platform!

✅ Access rent today, pay back over time
✅ Get up to 70% rent discount
✅ Build loan limits with receipts
✅ Send & receive money instantly
✅ Shop from trusted vendors
✅ Earn UGX 100 for every friend you invite!

Join 40M+ users across East Africa!

👉 ${shareUrl}`;

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
          title: 'Welile - Africa\'s Rent Facilitation Platform',
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
          <h1 className="font-semibold">Why Welile?</h1>
          <Button variant="ghost" size="icon" onClick={handleNativeShare}>
            <Share2 className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 pb-32 max-w-2xl">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Gift className="h-4 w-4" />
            <span>Africa's #1 Rent Platform</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Everything You Need for <span className="text-primary">Better Living</span>
          </h2>
          <p className="text-muted-foreground">
            Join 40M+ users across Uganda, Kenya, Tanzania, and Rwanda
          </p>
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
                    <h3 className="font-semibold">Your Referral Earnings</h3>
                    <p className="text-xs text-muted-foreground">Earn UGX 100 for every friend who joins</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-background/60 text-center">
                    <p className="text-2xl font-bold text-success">{referralCount}</p>
                    <p className="text-xs text-muted-foreground">Friends Joined</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background/60 text-center">
                    <p className="text-2xl font-bold text-success">{formatUGX(referralEarnings)}</p>
                    <p className="text-xs text-muted-foreground">Total Earned</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Benefits Grid */}
        <div className="grid gap-4 mb-8">
          {benefits.map((benefit, index) => (
            <motion.div
              key={benefit.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className={`border-border/50 hover:border-primary/30 transition-colors ${(benefit as any).highlight ? 'ring-2 ring-success/30 bg-success/5' : ''}`}>
                <CardContent className="p-4 flex items-start gap-4">
                  <div className={`p-3 rounded-xl ${benefit.color}`}>
                    <benefit.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold mb-1">{benefit.title}</h3>
                      {(benefit as any).highlight && (
                        <Badge variant="success" className="text-[10px]">NEW</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{benefit.description}</p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-1" />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="grid grid-cols-3 gap-3 mb-8"
        >
          <Card className="text-center p-4 bg-primary/5 border-primary/20">
            <p className="text-2xl font-bold text-primary">40M+</p>
            <p className="text-xs text-muted-foreground">Users</p>
          </Card>
          <Card className="text-center p-4 bg-emerald-500/5 border-emerald-500/20">
            <p className="text-2xl font-bold text-emerald-500">5+</p>
            <p className="text-xs text-muted-foreground">Countries</p>
          </Card>
          <Card className="text-center p-4 bg-violet-500/5 border-violet-500/20">
            <p className="text-2xl font-bold text-violet-500">70%</p>
            <p className="text-xs text-muted-foreground">Max Discount</p>
          </Card>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="text-center mb-6"
        >
          <Button 
            size="lg" 
            className="w-full mb-3"
            onClick={() => navigate('/auth')}
          >
            Get Started for Free
          </Button>
          <p className="text-sm text-muted-foreground">
            No fees to join. Start benefiting today!
          </p>
        </motion.div>
      </main>

      {/* Floating Share Button */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t border-border"
      >
        <div className="container mx-auto max-w-2xl flex gap-3">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={handleCopyLink}
          >
            <Share2 className="h-4 w-4 mr-2" />
            Copy Link
          </Button>
          <Button 
            className="flex-1 bg-[#25D366] hover:bg-[#128C7E] text-white"
            onClick={handleWhatsAppShare}
          >
            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            Share on WhatsApp
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
