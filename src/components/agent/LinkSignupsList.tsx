import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/UserAvatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Link2, Users, RefreshCw, Gift, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { playSuccessSound } from '@/lib/notificationSound';
import { hapticSuccess } from '@/lib/haptics';

interface LinkSignup {
  id: string;
  referred_id: string;
  bonus_amount: number;
  credited: boolean;
  credited_at: string | null;
  created_at: string;
  profile?: {
    full_name: string;
    phone: string;
    avatar_url: string | null;
  };
  roles?: string[];
}

export function LinkSignupsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [signups, setSignups] = useState<LinkSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalEarned, setTotalEarned] = useState(0);
  const knownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      fetchSignups();

      // Subscribe to real-time referral inserts
      const channel = supabase
        .channel('agent-link-signups')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'referrals',
            filter: `referrer_id=eq.${user.id}`,
          },
          async (payload) => {
            const newReferral = payload.new as {
              id: string;
              referred_id: string;
              bonus_amount: number;
              credited: boolean;
              credited_at: string | null;
              created_at: string;
            };

            // Skip if we already know about this referral
            if (knownIdsRef.current.has(newReferral.id)) return;
            knownIdsRef.current.add(newReferral.id);

            // Fetch the new user's profile
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, full_name, phone, avatar_url')
              .eq('id', newReferral.referred_id)
              .single();

            // Fetch their roles
            const { data: roles } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', newReferral.referred_id);

            const enrichedSignup: LinkSignup = {
              ...newReferral,
              profile: profile || undefined,
              roles: roles?.map(r => r.role) || [],
            };

            // Add to the top of the list
            setSignups(prev => [enrichedSignup, ...prev]);

            // Play sound and haptic feedback
            playSuccessSound();
            hapticSuccess();

            // Show toast notification
            toast.success('🎉 New signup via your link!', {
              description: `${profile?.full_name || 'Someone'} just signed up using your referral link!`,
              duration: 5000,
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchSignups = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch referrals where this agent is the referrer
      const { data: referrals, error } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!referrals || referrals.length === 0) {
        setSignups([]);
        setTotalEarned(0);
        knownIdsRef.current = new Set();
        setLoading(false);
        return;
      }

      // Initialize known IDs to prevent duplicate notifications
      knownIdsRef.current = new Set(referrals.map(r => r.id));

      // Fetch profiles for referred users
      const referredIds = referrals.map(r => r.referred_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone, avatar_url')
        .in('id', referredIds);

      // Fetch roles for referred users
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', referredIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const rolesMap = new Map<string, string[]>();
      roles?.forEach(r => {
        const existing = rolesMap.get(r.user_id) || [];
        rolesMap.set(r.user_id, [...existing, r.role]);
      });

      const enrichedSignups: LinkSignup[] = referrals.map(r => ({
        ...r,
        profile: profileMap.get(r.referred_id),
        roles: rolesMap.get(r.referred_id) || [],
      }));

      setSignups(enrichedSignups);
      setTotalEarned(
        referrals
          .filter(r => r.credited)
          .reduce((sum, r) => sum + Number(r.bonus_amount), 0)
      );
    } catch (error) {
      console.error('Error fetching signups:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'tenant': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'landlord': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'agent': return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
      case 'supporter': return 'bg-green-500/10 text-green-600 border-green-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (signups.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-violet-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/20">
                <Link2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Link Signups
                  <Badge variant="secondary" className="text-xs">
                    {signups.length}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Users who joined via your link
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-success/10 text-success border-success/20">
                <Gift className="h-3 w-3 mr-1" />
                {formatUGX(totalEarned)}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchSignups}
                className="h-8 w-8"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {signups.slice(0, 5).map((signup, index) => (
            <motion.div
              key={signup.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border"
            >
              <div className="flex items-center gap-3">
                <UserAvatar
                  fullName={signup.profile?.full_name || 'User'}
                  avatarUrl={signup.profile?.avatar_url}
                  size="sm"
                />
                <div>
                  <p className="font-medium text-sm">
                    {signup.profile?.full_name || 'Unknown User'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(signup.created_at), { addSuffix: true })}
                    </p>
                    {signup.roles && signup.roles.length > 0 && (
                      <div className="flex gap-1">
                        {signup.roles.slice(0, 2).map(role => (
                          <Badge
                            key={role}
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${getRoleBadgeColor(role)}`}
                          >
                            {role}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                {signup.credited ? (
                  <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30">
                    +{formatUGX(signup.bonus_amount)}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">
                    Pending
                  </Badge>
                )}
              </div>
            </motion.div>
          ))}

          {signups.length > 5 && (
            <Button
              variant="ghost"
              className="w-full h-10 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => navigate('/referrals')}
            >
              View all {signups.length} signups
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
