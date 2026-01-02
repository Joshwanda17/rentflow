import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Coins, ArrowRight } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';

interface ReferralStatsCardProps {
  userId: string;
}

export function ReferralStatsCard({ userId }: ReferralStatsCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [referralCount, setReferralCount] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const fetchReferrals = async () => {
      const { data, error } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_id', userId);

      if (!error && data) {
        setReferralCount(data.length);
        setTotalEarned(data.reduce((sum, r) => sum + Number(r.bonus_amount), 0));
      }
      setLoading(false);
    };

    fetchReferrals();

    // Subscribe to real-time referral updates
    const channel = supabase
      .channel(`referrals-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'referrals',
          filter: `referrer_id=eq.${userId}`,
        },
        (payload) => {
          const newReferral = payload.new as { bonus_amount: number };
          setReferralCount((prev) => prev + 1);
          setTotalEarned((prev) => prev + Number(newReferral.bonus_amount));
          toast({
            title: '🎉 New Referral Bonus!',
            description: `You earned UGX ${newReferral.bonus_amount} for inviting a friend!`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, toast]);

  if (loading || (referralCount === 0 && totalEarned === 0)) {
    return null;
  }

  return (
    <button
      onClick={() => navigate('/benefits')}
      className="w-full text-left"
    >
      <Card className="elevated-card group hover:shadow-glow transition-all duration-300 border-primary/20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-success/5" />
        <CardContent className="pt-4 pb-4 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:scale-110 transition-transform duration-300">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">Referral Earnings</p>
                  <Badge variant="secondary" className="text-xs">
                    {referralCount} {referralCount === 1 ? 'friend' : 'friends'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Coins className="h-4 w-4 text-success" />
                  <p className="text-success font-bold">{formatUGX(totalEarned)}</p>
                  <span className="text-xs text-muted-foreground">earned</span>
                </div>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
