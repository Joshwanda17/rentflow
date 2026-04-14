import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useShortLink } from '@/hooks/useShortLink';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Copy, Check, Share2, Link2, Gift, Users, Coins, Trophy, Star, CheckCircle, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatUGX } from '@/lib/rentCalculations';
import { Progress } from '@/components/ui/progress';
import { useProfile } from '@/hooks/useProfile';
import { ShareableMilestoneCard } from './ShareableMilestoneCard';

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
  const { profile } = useProfile();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState({ signups: 0, earned: 0 });
  const [loading, setLoading] = useState(true);
  const [showMilestones, setShowMilestones] = useState(false);
  const [shareMilestone, setShareMilestone] = useState<typeof MILESTONES[0] | null>(null);

  const { shortUrl, isLoading: linkLoading } = useShortLink({
    targetPath: '/auth',
    targetParams: { ref: user?.id || '' },
    enabled: !!user,
  });

  useEffect(() => {
    // Referral DB calls stubbed for performance
    setLoading(false);
  }, [user]);

  const getShareLink = () => shortUrl;

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

          {/* Milestone History */}
          {!loading && (
            <div className="rounded-xl border border-muted overflow-hidden">
              <button
                onClick={() => setShowMilestones(!showMilestones)}
                className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-semibold">Milestone Rewards</span>
                  <span className="text-[10px] text-muted-foreground">
                    ({MILESTONES.filter(m => m.count <= stats.signups).length}/{MILESTONES.length} earned)
                  </span>
                </div>
                {showMilestones ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              
              <AnimatePresence>
                {showMilestones && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="p-2 space-y-1.5 bg-background/50">
                      {MILESTONES.map((milestone, index) => {
                        const isEarned = stats.signups >= milestone.count;
                        const isNext = !isEarned && (index === 0 || stats.signups >= MILESTONES[index - 1].count);
                        
                        return (
                          <button
                            key={milestone.count}
                            onClick={() => isEarned && setShareMilestone(milestone)}
                            disabled={!isEarned}
                            className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-all ${
                              isEarned 
                                ? 'bg-success/10 border border-success/20 hover:bg-success/20 cursor-pointer' 
                                : isNext
                                  ? 'bg-amber-500/10 border border-amber-500/20 cursor-default'
                                  : 'bg-muted/30 border border-transparent opacity-60 cursor-default'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              {isEarned ? (
                                <div className="p-1 rounded-full bg-success/20">
                                  <CheckCircle className="h-3.5 w-3.5 text-success" />
                                </div>
                              ) : isNext ? (
                                <div className="p-1 rounded-full bg-amber-500/20">
                                  <Star className="h-3.5 w-3.5 text-amber-500" />
                                </div>
                              ) : (
                                <div className="p-1 rounded-full bg-muted">
                                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                              )}
                              <div className="text-left">
                                <p className={`text-xs font-semibold ${isEarned ? 'text-success' : isNext ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                  {milestone.label}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {milestone.count} signups
                                </p>
                              </div>
                            </div>
                            <div className="text-right flex items-center gap-2">
                              <div>
                                <p className={`text-xs font-bold ${isEarned ? 'text-success' : isNext ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                  {isEarned ? '✓ ' : ''}+{formatUGX(milestone.bonus)}
                                </p>
                                {isEarned && (
                                  <p className="text-[9px] text-success">Tap to share</p>
                                )}
                                {isNext && (
                                  <p className="text-[9px] text-amber-600">{milestone.count - stats.signups} more</p>
                                )}
                              </div>
                              {isEarned && (
                                <Share2 className="h-3.5 w-3.5 text-success" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                      
                      {/* Total Milestone Earnings */}
                      {MILESTONES.filter(m => m.count <= stats.signups).length > 0 && (
                        <div className="flex items-center justify-between p-2.5 mt-2 rounded-lg bg-gradient-to-r from-success/10 to-primary/10 border border-success/20">
                          <span className="text-xs font-semibold text-foreground">Total Milestone Bonus</span>
                          <span className="text-sm font-bold text-success">
                            {formatUGX(MILESTONES.filter(m => m.count <= stats.signups).reduce((sum, m) => sum + m.bonus, 0))}
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

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

      {/* Shareable Milestone Card Dialog */}
      {shareMilestone && (
        <ShareableMilestoneCard
          milestone={shareMilestone}
          userName={profile?.full_name || 'Agent'}
          totalSignups={stats.signups}
          totalEarned={stats.earned + MILESTONES.filter(m => m.count <= stats.signups).reduce((sum, m) => sum + m.bonus, 0)}
          open={!!shareMilestone}
          onOpenChange={(open) => !open && setShareMilestone(null)}
        />
      )}
    </motion.div>
  );
}
