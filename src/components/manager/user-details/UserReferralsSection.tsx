import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  Calendar, 
  Coins, 
  CheckCircle, 
  Clock,
  RefreshCw,
  TrendingUp,
  UserPlus,
  ChevronRight
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import UserDetailsDialog from '../UserDetailsDialog';
import { hapticTap } from '@/lib/haptics';

interface Referral {
  id: string;
  referred_id: string;
  bonus_amount: number;
  credited: boolean;
  credited_at: string | null;
  created_at: string;
  profile?: {
    full_name: string;
    phone: string;
    email?: string;
    avatar_url: string | null;
  };
  roles?: string[];
}

interface UserReferralsSectionProps {
  userId: string;
}

interface SelectedUser {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  rent_discount_active: boolean;
  monthly_rent: number | null;
  roles: string[];
  average_rating: number | null;
  rating_count: number;
  verified?: boolean;
}

const roleColors: Record<string, { bg: string; text: string }> = {
  tenant: { bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400' },
  agent: { bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400' },
  supporter: { bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400' },
  landlord: { bg: 'bg-purple-500/15', text: 'text-purple-600 dark:text-purple-400' },
  manager: { bg: 'bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400' },
};

export default function UserReferralsSection({ userId }: UserReferralsSectionProps) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalEarned, setTotalEarned] = useState(0);
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);

  const fetchReferrals = async () => {
    try {
      // Fetch referrals where this user is the referrer
      const { data: referralsData, error } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!referralsData || referralsData.length === 0) {
        setReferrals([]);
        setTotalEarned(0);
        return;
      }

      // Fetch profiles for referred users
      const referredIds = referralsData.map(r => r.referred_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone, email, avatar_url, rent_discount_active, monthly_rent, verified')
        .in('id', referredIds);

      // Fetch roles for referred users
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', referredIds);

      // Map roles by user_id
      const rolesByUser: Record<string, string[]> = {};
      rolesData?.forEach(r => {
        if (!rolesByUser[r.user_id]) rolesByUser[r.user_id] = [];
        rolesByUser[r.user_id].push(r.role);
      });

      // Enrich referrals with profiles and roles
      const enrichedReferrals: Referral[] = referralsData.map(ref => ({
        ...ref,
        profile: profiles?.find(p => p.id === ref.referred_id),
        roles: rolesByUser[ref.referred_id] || []
      }));

      // Calculate total earned from credited referrals
      const earned = referralsData
        .filter(r => r.credited)
        .reduce((sum, r) => sum + (r.bonus_amount || 0), 0);

      setReferrals(enrichedReferrals);
      setTotalEarned(earned);
    } catch (error) {
      console.error('Error fetching referrals:', error);
      toast.error('Failed to load referrals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReferrals();
  }, [userId]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchReferrals();
  };

  const handleUserClick = (referral: Referral) => {
    hapticTap();
    if (!referral.profile) return;
    
    // Find the profile data for this referral
    const profile = referral.profile;
    
    // Build the selected user object
    setSelectedUser({
      id: referral.referred_id,
      full_name: profile.full_name || 'Unknown',
      email: profile.email || '',
      phone: profile.phone || '',
      avatar_url: profile.avatar_url,
      rent_discount_active: false,
      monthly_rent: null,
      roles: referral.roles || [],
      average_rating: null,
      rating_count: 0,
      verified: false
    });
    setUserDialogOpen(true);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const creditedCount = referrals.filter(r => r.credited).length;
  const pendingCount = referrals.filter(r => !r.credited).length;

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Users className="h-3 w-3" />
            Total Referrals
          </div>
          <p className="font-bold text-lg">{referrals.length}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <CheckCircle className="h-3 w-3 text-success" />
            Credited
          </div>
          <p className="font-bold text-lg text-success">{creditedCount}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Clock className="h-3 w-3 text-warning" />
            Pending
          </div>
          <p className="font-bold text-lg text-warning">{pendingCount}</p>
        </Card>
        <Card className="p-3 bg-success/10 border-success/30">
          <div className="flex items-center gap-2 text-success text-xs mb-1">
            <Coins className="h-3 w-3" />
            Total Earned
          </div>
          <p className="font-bold text-lg text-success">{formatUGX(totalEarned)}</p>
        </Card>
      </div>

      {/* Referrals List */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              People Referred ({referrals.length})
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {referrals.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground font-medium">No referrals yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                This user hasn't referred anyone
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {referrals.map((referral) => (
                <div
                  key={referral.id}
                  onClick={() => handleUserClick(referral)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer active:scale-[0.98] hover:shadow-md ${
                    referral.credited 
                      ? 'bg-success/5 border-success/20 hover:border-success/40' 
                      : 'bg-muted/30 border-muted hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar className="h-10 w-10 border-2 border-background">
                      <AvatarImage src={referral.profile?.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                        {referral.profile?.full_name 
                          ? getInitials(referral.profile.full_name)
                          : '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate text-primary">
                        {referral.profile?.full_name || 'Unknown User'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {referral.profile?.phone || 'No phone'}
                      </p>
                      {/* Roles */}
                      {referral.roles && referral.roles.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {referral.roles.map((role) => {
                            const colors = roleColors[role] || { bg: 'bg-muted', text: 'text-muted-foreground' };
                            return (
                              <Badge 
                                key={role} 
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 ${colors.bg} ${colors.text}`}
                              >
                                {role}
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {referral.credited ? (
                          <Badge className="bg-success/20 text-success text-xs gap-1">
                            <CheckCircle className="h-3 w-3" />
                            {formatUGX(referral.bonus_amount)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-warning/10 text-warning text-xs gap-1">
                            <Clock className="h-3 w-3" />
                            Pending
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(referral.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Details Dialog */}
      <UserDetailsDialog
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
        user={selectedUser}
        onRolesUpdated={fetchReferrals}
        onUserUpdated={fetchReferrals}
      />
    </div>
  );
}
