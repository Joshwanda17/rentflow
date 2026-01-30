import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, ChevronRight } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

export function MyReferralsCount() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [referralCount, setReferralCount] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchReferralStats = async () => {
      try {
        // Get accurate count from referrals table
        const { data, error } = await supabase
          .from('referrals')
          .select('id, bonus_amount, credited')
          .eq('referrer_id', user.id);

        if (!error && data) {
          setReferralCount(data.length);
          // Only count credited bonuses
          const earned = data
            .filter(r => r.credited)
            .reduce((sum, r) => sum + (r.bonus_amount || 500), 0);
          setTotalEarned(earned);
        }
      } catch (e) {
        console.error('[MyReferralsCount] Error:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchReferralStats();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`my-referrals-count-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'referrals',
          filter: `referrer_id=eq.${user.id}`,
        },
        (payload) => {
          const newRef = payload.new as { bonus_amount: number; credited: boolean };
          setReferralCount(prev => prev + 1);
          if (newRef.credited) {
            setTotalEarned(prev => prev + (newRef.bonus_amount || 500));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'referrals',
          filter: `referrer_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as { bonus_amount: number; credited: boolean };
          const old = payload.old as { credited: boolean };
          // If just credited, add to earned
          if (updated.credited && !old.credited) {
            setTotalEarned(prev => prev + (updated.bonus_amount || 500));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      onClick={() => navigate('/referrals')}
      className="w-full justify-between h-auto py-3 px-4 bg-primary/5 hover:bg-primary/10 rounded-xl border border-primary/20"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/15">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div className="text-left">
          <p className="text-sm font-semibold text-foreground">My Referrals</p>
          <p className="text-xs text-muted-foreground">
            {totalEarned > 0 ? `Earned ${formatUGX(totalEarned)}` : 'Invite friends to earn'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge 
          variant="secondary" 
          className="bg-primary/20 text-primary font-bold text-sm px-2.5"
        >
          {referralCount}
        </Badge>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Button>
  );
}
