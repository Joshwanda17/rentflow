import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Gift, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { ShareSupporterLink } from './ShareSupporterLink';

interface SupporterReferral {
  id: string;
  referred_id: string;
  bonus_amount: number;
  bonus_credited: boolean;
  bonus_credited_at: string | null;
  first_investment_at: string | null;
  created_at: string;
  referred_name?: string;
}

interface SupporterReferralStatsProps {
  userId: string;
}

export function SupporterReferralStats({ userId }: SupporterReferralStatsProps) {
  const [referrals, setReferrals] = useState<SupporterReferral[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReferrals();
  }, [userId]);

  const fetchReferrals = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from('supporter_referrals')
      .select('*')
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching referrals:', error);
      setLoading(false);
      return;
    }

    // Fetch referred user names
    if (data && data.length > 0) {
      const referredIds = data.map(r => r.referred_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', referredIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

      const enrichedReferrals = data.map(r => ({
        ...r,
        referred_name: profileMap.get(r.referred_id) || 'Unknown',
      }));

      setReferrals(enrichedReferrals);
    } else {
      setReferrals([]);
    }

    setLoading(false);
  };

  const totalReferrals = referrals.length;
  const pendingReferrals = referrals.filter(r => !r.first_investment_at).length;
  const completedReferrals = referrals.filter(r => r.bonus_credited).length;
  const totalEarned = referrals
    .filter(r => r.bonus_credited)
    .reduce((sum, r) => sum + Number(r.bonus_amount), 0);
  const pendingEarnings = referrals
    .filter(r => r.first_investment_at && !r.bonus_credited)
    .reduce((sum, r) => sum + Number(r.bonus_amount), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="space-y-4"
    >
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary/10 via-background to-violet-500/10 backdrop-blur-xl shadow-xl">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-2xl" />
        
        <CardHeader className="relative pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/20">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Supporter Referrals</CardTitle>
                <p className="text-xs text-muted-foreground">Earn 5,000 UGX per referral</p>
              </div>
            </div>
            <ShareSupporterLink variant="default" size="sm" className="bg-primary hover:bg-primary/90" />
          </div>
        </CardHeader>
        
        <CardContent className="relative space-y-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-muted/50 text-center">
              <p className="text-2xl font-black text-foreground">{totalReferrals}</p>
              <p className="text-xs text-muted-foreground">Total Invites</p>
            </div>
            <div className="p-3 rounded-xl bg-warning/10 text-center">
              <p className="text-2xl font-black text-warning">{pendingReferrals}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="p-3 rounded-xl bg-success/10 text-center">
              <p className="text-2xl font-black text-success">{completedReferrals}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div className="p-3 rounded-xl bg-primary/10 text-center">
              <p className="text-lg font-black text-primary">{formatUGX(totalEarned)}</p>
              <p className="text-xs text-muted-foreground">Earned</p>
            </div>
          </div>

          {/* Referrals List */}
          {loading ? (
            <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
          ) : referrals.length === 0 ? (
            <div className="p-6 text-center bg-muted/30 rounded-xl">
              <Gift className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No referrals yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Share your link and earn when friends invest!
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {referrals.slice(0, 5).map((referral, index) => (
                <motion.div
                  key={referral.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      referral.bonus_credited 
                        ? 'bg-success/20' 
                        : referral.first_investment_at 
                          ? 'bg-primary/20' 
                          : 'bg-warning/20'
                    }`}>
                      {referral.bonus_credited ? (
                        <CheckCircle className="h-4 w-4 text-success" />
                      ) : referral.first_investment_at ? (
                        <TrendingUp className="h-4 w-4 text-primary" />
                      ) : (
                        <Clock className="h-4 w-4 text-warning" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{referral.referred_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Joined {format(new Date(referral.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {referral.bonus_credited ? (
                      <>
                        <p className="text-sm font-bold text-success">+{formatUGX(referral.bonus_amount)}</p>
                        <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30">
                          Earned
                        </Badge>
                      </>
                    ) : referral.first_investment_at ? (
                      <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                        Processing
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">
                        Awaiting Investment
                      </Badge>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
