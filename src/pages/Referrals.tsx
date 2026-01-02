import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import { motion } from 'framer-motion';

interface Referral {
  id: string;
  referred_id: string;
  bonus_amount: number;
  credited: boolean;
  credited_at: string | null;
  created_at: string;
  referred_user?: {
    full_name: string;
    avatar_url: string | null;
  };
}

export default function Referrals() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const referralLink = user ? `${window.location.origin}/auth?ref=${user.id}` : '';

  useEffect(() => {
    if (!user) return;

    const fetchReferrals = async () => {
      const { data, error } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        // Fetch referred user profiles
        const referredIds = data.map(r => r.referred_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', referredIds);

        const referralsWithUsers = data.map(referral => ({
          ...referral,
          referred_user: profiles?.find(p => p.id === referral.referred_id)
        }));

        setReferrals(referralsWithUsers);
      }
      setLoading(false);
    };

    fetchReferrals();

    // Subscribe to new referrals
    const channel = supabase
      .channel(`referrals-page-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'referrals',
          filter: `referrer_id=eq.${user.id}`,
        },
        async (payload) => {
          const newReferral = payload.new as Referral;
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .eq('id', newReferral.referred_id)
            .single();

          setReferrals(prev => [{
            ...newReferral,
            referred_user: profile || undefined
          }, ...prev]);

          toast({
            title: '🎉 New Referral!',
            description: `${profile?.full_name || 'Someone'} joined through your link!`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, toast]);

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

  const totalEarned = referrals.reduce((sum, r) => sum + Number(r.bonus_amount), 0);
  const pendingEarnings = referrals
    .filter(r => !r.credited)
    .reduce((sum, r) => sum + Number(r.bonus_amount), 0);

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
                <p className="text-2xl font-bold">{referrals.length}</p>
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
                <p className="text-2xl font-bold text-warning">{formatUGX(pendingEarnings).replace('UGX ', '')}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
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
              <p className="text-sm text-muted-foreground">
                Share your unique link and earn <span className="font-bold text-success">UGX 100</span> for every friend who joins!
              </p>
              
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
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-5 w-16" />
                    </div>
                  ))}
                </div>
              ) : referrals.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">No referrals yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Share your link to start earning!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {referrals.map((referral, index) => (
                    <motion.div
                      key={referral.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                        <span className="text-lg font-bold text-primary">
                          {referral.referred_user?.full_name?.charAt(0) || '?'}
                        </span>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {referral.referred_user?.full_name || 'Unknown User'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(referral.created_at), 'MMM d, yyyy • h:mm a')}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-bold text-success">
                          +{formatUGX(referral.bonus_amount)}
                        </p>
                        <Badge 
                          variant={referral.credited ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {referral.credited ? 'Credited' : 'Pending'}
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
