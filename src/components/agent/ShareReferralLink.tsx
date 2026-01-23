import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Copy, Check, Share2, Link2, Gift, Users, Coins, Trophy, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatUGX } from '@/lib/rentCalculations';
import { Progress } from '@/components/ui/progress';

// Milestone thresholds and bonus amounts
const MILESTONES = [
  { count: 5, bonus: 2500, label: 'Starter' },
  { count: 10, bonus: 5000, label: 'Rising Star' },
  { count: 25, bonus: 15000, label: 'Champion' },
  { count: 50, bonus: 35000, label: 'Elite' },
  { count: 100, bonus: 75000, label: 'Legend' },
];

export function ShareReferralLink() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState({ signups: 0, earned: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    const fetchStats = async () => {
      const { data, error } = await supabase
        .from('referrals')
        .select('bonus_amount, credited')
        .eq('referrer_id', user.id);

      if (!error && data) {
        setStats({
          signups: data.length,
          earned: data.filter(r => r.credited).reduce((sum, r) => sum + Number(r.bonus_amount), 0),
        });
      }
      setLoading(false);
    };

    fetchStats();

    // Real-time subscription for new referrals
    const channel = supabase
      .channel(`referral-stats-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'referrals',
          filter: `referrer_id=eq.${user.id}`,
        },
        (payload) => {
          const newReferral = payload.new as { bonus_amount: number; credited: boolean };
          setStats(prev => ({
            signups: prev.signups + 1,
            earned: newReferral.credited ? prev.earned + Number(newReferral.bonus_amount) : prev.earned,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const getShareLink = () => {
    if (!user) return '';
    return `${window.location.origin}/auth?ref=${user.id}`;
  };

  const getWhatsAppMessage = () => {
    return `👋 Hey! Join me on Welile!

🏠 Welile helps you manage rent payments easily.

✨ Benefits:
• Pay rent in small daily amounts
• Access rent loans when needed
• Track all your payments

🎁 Sign up using my link and earn UGX 500!

👉 TAP HERE TO JOIN:
${getShareLink()}

Let's make rent easy! 💪`;
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
          title: 'Join Welile',
          text: 'Join me on Welile and get started with easy rent management!',
          url: getShareLink(),
        });
      } catch (err) {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-violet-500/5 overflow-hidden">
        <CardContent className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-lg shadow-primary/25">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                Invite & Earn
              </h3>
              <p className="text-xs text-muted-foreground">
                Earn <span className="font-bold text-primary">UGX 500</span> for each signup!
              </p>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20">
              <Users className="h-4 w-4 text-primary" />
              <div>
                <p className="text-lg font-bold text-foreground">{loading ? '-' : stats.signups}</p>
                <p className="text-[10px] text-muted-foreground">Signups</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success/10 border border-success/20">
              <Coins className="h-4 w-4 text-success" />
              <div>
                <p className="text-lg font-bold text-success">{loading ? '-' : formatUGX(stats.earned)}</p>
                <p className="text-[10px] text-muted-foreground">Earned</p>
              </div>
            </div>
          </div>

          {/* Milestone Progress */}
          {!loading && (() => {
            const nextMilestone = MILESTONES.find(m => m.count > stats.signups);
            const prevMilestone = MILESTONES.filter(m => m.count <= stats.signups).pop();
            const startCount = prevMilestone?.count || 0;
            const endCount = nextMilestone?.count || MILESTONES[MILESTONES.length - 1].count;
            const progress = nextMilestone 
              ? ((stats.signups - startCount) / (endCount - startCount)) * 100 
              : 100;
            
            return (
              <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-semibold text-foreground">
                      {nextMilestone ? `Next: ${nextMilestone.label}` : '🏆 All milestones achieved!'}
                    </span>
                  </div>
                  {nextMilestone && (
                    <span className="text-xs font-bold text-amber-600">
                      +{formatUGX(nextMilestone.bonus)}
                    </span>
                  )}
                </div>
                {nextMilestone && (
                  <>
                    <Progress 
                      value={progress} 
                      className="h-2 bg-amber-500/20" 
                    />
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-muted-foreground">
                        {stats.signups} / {nextMilestone.count} signups
                      </span>
                      <span className="text-[10px] text-amber-600 font-medium">
                        {nextMilestone.count - stats.signups} more to go!
                      </span>
                    </div>
                  </>
                )}
                {!nextMilestone && (
                  <div className="flex items-center gap-1 mt-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-3 w-3 fill-amber-500 text-amber-500" />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Link Section */}
          <div className="relative p-3 rounded-xl bg-background/80 border border-primary/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Link2 className="h-3 w-3" />
              <span>Your referral link</span>
            </div>
            <div className="flex gap-2">
              <Input 
                value={getShareLink()} 
                readOnly 
                className="h-10 text-xs font-mono bg-muted/50 border-primary/20" 
              />
              <Button 
                variant={copied ? "default" : "outline"} 
                size="icon" 
                onClick={handleCopyLink}
                className={`h-10 w-10 shrink-0 transition-all ${copied ? 'bg-success hover:bg-success/90' : 'border-primary/30 hover:bg-primary/10'}`}
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
              <Share2 className="h-4 w-4" />
              WhatsApp
            </Button>
            <Button 
              variant="outline"
              onClick={handleNativeShare}
              className="h-12 gap-2 border-primary/30 hover:bg-primary/10 touch-manipulation"
            >
              <Share2 className="h-4 w-4" />
              Share Link
            </Button>
          </div>

          {/* Info */}
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
            <Users className="h-4 w-4 text-primary shrink-0" />
            <p className="text-[11px] text-muted-foreground">
              Share with friends & family. When they sign up, you both earn UGX 500!
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
