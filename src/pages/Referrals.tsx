import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserSnapshot } from '@/hooks/useUserSnapshot';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  Users, 
  Coins, 
  Calendar, 
  Share2, 
  Copy, 
  CheckCircle2,
  Gift,
  TrendingUp
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { ReferralLeaderboard } from '@/components/ReferralLeaderboard';
import { RewardHistoryBadges } from '@/components/RewardHistoryBadges';
import { motion } from 'framer-motion';
import { ReferralsSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { getPublicOrigin } from '@/lib/getPublicOrigin';

export default function Referrals() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { snapshot, loading, refresh } = useUserSnapshot(user?.id);
  const [copied, setCopied] = useState(false);

  const referrals = snapshot.referrals || [];
  const referralLink = user ? `${getPublicOrigin()}/join?r=${user.id}` : '';

  const copyReferralLink = async () => {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast({
      title: 'Link Copied!',
      description: 'Share this link with friends to earn rewards.',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const shareReferralLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Welile',
          text: 'Join Welile and we both earn rewards!',
          url: referralLink,
        });
      } catch (err) {
        copyReferralLink();
      }
    } else {
      copyReferralLink();
    }
  };

  const totalSignupBonus = referrals.reduce((sum: number, r: any) => sum + Number(r.bonus_amount), 0);
  const totalFirstTxBonus = referrals
    .filter((r: any) => r.first_transaction_bonus_credited)
    .reduce((sum: number, r: any) => sum + Number(r.first_transaction_bonus_amount || 0), 0);
  const totalEarned = totalSignupBonus + totalFirstTxBonus;
  
  const pendingFirstTxBonus = referrals
    .filter((r: any) => !r.first_transaction_bonus_credited)
    .length * 200;

  if (loading) {
    return <ReferralsSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 glass-card border-b border-border/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">My Referrals</h1>
              <p className="text-sm text-muted-foreground">Track your referral earnings</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="text-center">
              <CardContent className="pt-4 pb-3">
                <Users className="h-6 w-6 mx-auto text-primary mb-2" />
                <p className="text-2xl font-bold">{snapshot.referralCount || referrals.length}</p>
                <p className="text-xs text-muted-foreground">Friends</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="text-center">
              <CardContent className="pt-4 pb-3">
                <Coins className="h-6 w-6 mx-auto text-success mb-2" />
                <p className="text-2xl font-bold text-success">{formatUGX(totalEarned).replace('UGX ', '')}</p>
                <p className="text-xs text-muted-foreground">Earned</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="text-center">
              <CardContent className="pt-4 pb-3">
                <TrendingUp className="h-6 w-6 mx-auto text-warning mb-2" />
                <p className="text-2xl font-bold text-warning">{formatUGX(pendingFirstTxBonus).replace('UGX ', '')}</p>
                <p className="text-xs text-muted-foreground">Potential</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Share Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Gift className="h-5 w-5 text-primary" />
                Invite Friends & Earn
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-center gap-4 p-3 bg-muted/30 rounded-lg">
                <div className="text-center">
                  <p className="text-lg font-bold text-primary">UGX 100</p>
                  <p className="text-xs text-muted-foreground">On signup</p>
                </div>
                <span className="text-xl text-muted-foreground">+</span>
                <div className="text-center">
                  <p className="text-lg font-bold text-success">UGX 200</p>
                  <p className="text-xs text-muted-foreground">1st transaction</p>
                </div>
                <span className="text-xl text-muted-foreground">=</span>
                <div className="text-center">
                  <p className="text-lg font-bold text-warning">UGX 300</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <div className="flex-1 bg-muted/50 rounded-lg px-3 py-2 text-sm truncate font-mono">
                  {referralLink}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyReferralLink}
                  className="shrink-0"
                >
                  {copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              <Button onClick={shareReferralLink} className="w-full gap-2">
                <Share2 className="h-4 w-4" />
                Share Your Link
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Monthly Achievement Badges */}
        <RewardHistoryBadges />

        {/* Leaderboard */}
        <ReferralLeaderboard limit={5} />

        {/* Referral History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="h-5 w-5 text-primary" />
                Referral History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {referrals.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">No referrals yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Share your link to start earning!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {referrals.map((referral: any, index: number) => (
                    <motion.div
                      key={referral.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {referral.referred_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {referral.referred_phone || '—'}
                          {referral.referred_city ? ` • ${referral.referred_city}` : ''}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(referral.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>

                      <div className="text-right space-y-1">
                        <p className="font-bold text-success text-sm">
                          +{formatUGX(Number(referral.bonus_amount))}
                        </p>
                        {referral.first_transaction_bonus_credited && (
                          <p className="text-[10px] text-success">
                            +{formatUGX(Number(referral.first_transaction_bonus_amount || 0))} tx
                          </p>
                        )}
                        <Badge 
                          variant={referral.credited ? 'default' : 'secondary'}
                          className="text-[10px]"
                        >
                          {referral.credited ? 'Credited ✓' : 'Pending'}
                        </Badge>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
