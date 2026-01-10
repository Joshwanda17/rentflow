import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Medal, Award, TrendingUp, Users, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LeaderboardEntry {
  agent_id: string;
  full_name: string;
  avatar_url: string | null;
  total_registrations: number;
  activated_count: number;
  conversion_rate: number;
  rank: number;
}

export function AgentLeaderboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<LeaderboardEntry | null>(null);

  useEffect(() => {
    fetchLeaderboard();
  }, [user]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      // Get all agent invites grouped by agent
      const { data: invites, error } = await supabase
        .from('supporter_invites')
        .select('created_by, status, role')
        .in('role', ['tenant', 'landlord']);

      if (error) throw error;

      // Aggregate by agent
      const agentStats = new Map<string, { total: number; activated: number }>();
      
      (invites || []).forEach(invite => {
        const current = agentStats.get(invite.created_by) || { total: 0, activated: 0 };
        current.total += 1;
        if (invite.status === 'activated') {
          current.activated += 1;
        }
        agentStats.set(invite.created_by, current);
      });

      // Get unique agent IDs
      const agentIds = Array.from(agentStats.keys());
      
      if (agentIds.length === 0) {
        setLeaderboard([]);
        setLoading(false);
        return;
      }

      // Fetch agent profiles
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', agentIds);

      if (profileError) throw profileError;

      // Build leaderboard entries
      const entries: LeaderboardEntry[] = (profiles || [])
        .map(profile => {
          const stats = agentStats.get(profile.id) || { total: 0, activated: 0 };
          return {
            agent_id: profile.id,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
            total_registrations: stats.total,
            activated_count: stats.activated,
            conversion_rate: stats.total > 0 
              ? Math.round((stats.activated / stats.total) * 100) 
              : 0,
            rank: 0,
          };
        })
        .sort((a, b) => b.total_registrations - a.total_registrations)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

      // Get top 10
      const top10 = entries.slice(0, 10);
      setLeaderboard(top10);

      // Find current user's rank
      if (user) {
        const userEntry = entries.find(e => e.agent_id === user.id);
        setCurrentUserRank(userEntry || null);
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-slate-400" />;
      case 3:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>;
    }
  };

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-500/20 to-amber-500/10 border-yellow-500/30';
      case 2:
        return 'bg-gradient-to-r from-slate-400/20 to-slate-300/10 border-slate-400/30';
      case 3:
        return 'bg-gradient-to-r from-amber-600/20 to-orange-500/10 border-amber-600/30';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Top Agents Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Top Agents Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No registrations yet</p>
            <p className="text-xs mt-1">Be the first to register users!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          Top Agents Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {leaderboard.map((entry) => (
          <div
            key={entry.agent_id}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border transition-all",
              getRankStyle(entry.rank),
              entry.agent_id === user?.id && "ring-2 ring-primary/50"
            )}
          >
            <div className="flex items-center justify-center w-6">
              {getRankIcon(entry.rank)}
            </div>
            
            <Avatar className="h-9 w-9">
              <AvatarImage src={entry.avatar_url || undefined} />
              <AvatarFallback className="text-xs bg-primary/10">
                {entry.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm truncate">
                  {entry.full_name}
                </p>
                {entry.agent_id === user?.id && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">You</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {entry.total_registrations} registered
                </span>
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {entry.conversion_rate}%
                </span>
              </div>
            </div>

            <div className="text-right">
              <p className="text-lg font-bold text-primary">{entry.total_registrations}</p>
              <p className="text-xs text-muted-foreground">{entry.activated_count} active</p>
            </div>
          </div>
        ))}

        {/* Show current user if not in top 10 */}
        {currentUserRank && currentUserRank.rank > 10 && (
          <>
            <div className="flex items-center justify-center py-2">
              <span className="text-xs text-muted-foreground">• • •</span>
            </div>
            <div
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border ring-2 ring-primary/50 bg-primary/5"
              )}
            >
              <div className="flex items-center justify-center w-6">
                <span className="text-sm font-bold text-muted-foreground">{currentUserRank.rank}</span>
              </div>
              
              <Avatar className="h-9 w-9">
                <AvatarImage src={currentUserRank.avatar_url || undefined} />
                <AvatarFallback className="text-xs bg-primary/10">
                  {currentUserRank.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">
                    {currentUserRank.full_name}
                  </p>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">You</Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {currentUserRank.total_registrations} registered
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {currentUserRank.conversion_rate}%
                  </span>
                </div>
              </div>

              <div className="text-right">
                <p className="text-lg font-bold text-primary">{currentUserRank.total_registrations}</p>
                <p className="text-xs text-muted-foreground">{currentUserRank.activated_count} active</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default AgentLeaderboard;
