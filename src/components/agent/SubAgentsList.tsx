import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Users,
  TrendingUp,
  Loader2,
  ChevronRight,
  BarChart3,
  CheckCircle,
  Clock,
  XCircle,
  Phone,
  RefreshCw,
  Search,
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface SubAgent {
  sub_agent_id: string;
  created_at: string;
  status: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
  earnings: number;
  tenants_count: number;
  active_today: boolean;
}

export function SubAgentsList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [totalSubAgentEarnings, setTotalSubAgentEarnings] = useState(0);

  const fetchSubAgents = useCallback(async () => {
    if (!user) return;
    try {
      // Pull from both agent_subagents and referrals/profiles to make sure
      // every sub-agent the agent registered (legacy + new) shows up.
      const [{ data: subRows }, { data: refRows }] = await Promise.all([
        supabase
          .from('agent_subagents')
          .select('sub_agent_id, status, created_at')
          .eq('parent_agent_id', user.id),
        supabase
          .from('referrals')
          .select('referred_id, created_at')
          .eq('referrer_id', user.id),
      ]);

      const map = new Map<
        string,
        { status: string; created_at: string }
      >();
      (subRows || []).forEach(r =>
        map.set(r.sub_agent_id, { status: r.status, created_at: r.created_at }),
      );
      (refRows || []).forEach(r => {
        if (!map.has(r.referred_id)) {
          map.set(r.referred_id, { status: 'verified', created_at: r.created_at });
        }
      });

      const ids = [...map.keys()];
      if (ids.length === 0) {
        setSubAgents([]);
        setTotalSubAgentEarnings(0);
        return;
      }

      // Restrict to users actually holding the agent role
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'agent')
        .in('user_id', ids);
      const agentIds = new Set((roleRows || []).map(r => r.user_id));
      const finalIds = ids.filter(id => agentIds.has(id));

      if (finalIds.length === 0) {
        setSubAgents([]);
        setTotalSubAgentEarnings(0);
        return;
      }

      // Profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone, avatar_url')
        .in('id', finalIds);

      // All earnings the parent earned from these sub-agents (single query)
      const { data: earnings } = await supabase
        .from('agent_earnings')
        .select('amount, source_user_id')
        .eq('agent_id', user.id)
        .eq('earning_type', 'subagent_commission')
        .in('source_user_id', finalIds);

      const earningsBySub: Record<string, number> = {};
      let total = 0;
      (earnings || []).forEach(e => {
        const v = Number(e.amount) || 0;
        earningsBySub[e.source_user_id] =
          (earningsBySub[e.source_user_id] || 0) + v;
        total += v;
      });

      // Tenant counts (single query, group client-side)
      const { data: rentReqRows } = await supabase
        .from('rent_requests')
        .select('agent_id, created_at')
        .in('agent_id', finalIds);

      const tenantsBySub: Record<string, number> = {};
      const lastActiveBySub: Record<string, string> = {};
      const todayStr = new Date().toISOString().slice(0, 10);
      (rentReqRows || []).forEach(r => {
        tenantsBySub[r.agent_id] = (tenantsBySub[r.agent_id] || 0) + 1;
        if (
          !lastActiveBySub[r.agent_id] ||
          r.created_at > lastActiveBySub[r.agent_id]
        ) {
          lastActiveBySub[r.agent_id] = r.created_at;
        }
      });

      const enriched: SubAgent[] = finalIds.map(id => {
        const meta = map.get(id)!;
        const profile = profiles?.find(p => p.id === id);
        return {
          sub_agent_id: id,
          created_at: meta.created_at,
          status: meta.status,
          full_name: profile?.full_name || 'Unknown',
          phone: profile?.phone || '—',
          avatar_url: profile?.avatar_url ?? null,
          earnings: earningsBySub[id] || 0,
          tenants_count: tenantsBySub[id] || 0,
          active_today:
            (lastActiveBySub[id] || '').slice(0, 10) === todayStr,
        };
      });

      // Sort: active today first, then by tenant count desc
      enriched.sort((a, b) => {
        if (a.active_today !== b.active_today) return a.active_today ? -1 : 1;
        return (b.tenants_count || 0) - (a.tenants_count || 0);
      });

      setSubAgents(enriched);
      setTotalSubAgentEarnings(total);
    } catch (error) {
      console.error('Error fetching sub-agents:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchSubAgents();

    // Realtime: instantly pick up new sub-agents the moment they're registered.
    const channel = supabase
      .channel(`subagents-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_subagents',
          filter: `parent_agent_id=eq.${user.id}`,
        },
        () => fetchSubAgents(),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'referrals',
          filter: `referrer_id=eq.${user.id}`,
        },
        () => fetchSubAgents(),
      )
      .subscribe();

    // Refetch when the tab becomes visible (returning from registration flow)
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchSubAgents();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, fetchSubAgents]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSubAgents();
  };

  const handleCall = (phone: string) => {
    if (phone && phone !== '—') window.location.href = `tel:${phone}`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (subAgents.length === 0) return null;

  const filtered = subAgents.filter(
    s =>
      !search ||
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.phone.includes(search),
  );

  const activeToday = subAgents.filter(s => s.active_today).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-orange-500" />
            My Sub-Agents
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="bg-orange-500/10 text-orange-600 border-orange-500/30"
            >
              {subAgents.length}
            </Badge>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-success/10 p-3">
            <p className="text-[11px] text-muted-foreground">Active today</p>
            <p className="font-bold text-success text-lg leading-none mt-1">
              {activeToday}
              <span className="text-xs text-muted-foreground font-normal">
                {' '}
                / {subAgents.length}
              </span>
            </p>
          </div>
          <div className="rounded-xl bg-orange-500/10 p-3">
            <p className="text-[11px] text-muted-foreground">
              Your sub-agent earnings
            </p>
            <p className="font-bold text-orange-600 text-base leading-none mt-1">
              {formatUGX(totalSubAgentEarnings)}
            </p>
          </div>
        </div>

        {/* Search */}
        {subAgents.length > 4 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search sub-agents…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
        )}

        {/* List */}
        <div className="space-y-2">
          {filtered.map(sub => (
            <div
              key={sub.sub_agent_id}
              className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted transition-colors"
            >
              <button
                onClick={() => navigate(`/sub-agents?id=${sub.sub_agent_id}`)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <div className="relative w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-orange-500" />
                  {sub.active_today && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-background" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {sub.full_name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-[11px] text-muted-foreground truncate">
                      {sub.tenants_count} tenants
                    </p>
                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                      <CheckCircle className="h-2.5 w-2.5" />
                      Active
                    </span>
                    {sub.status === 'rejected' && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                        <XCircle className="h-2.5 w-2.5" />
                        Rejected
                      </span>
                    )}
                  </div>
                </div>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={e => {
                    e.stopPropagation();
                    handleCall(sub.phone);
                  }}
                  title={`Call ${sub.phone}`}
                >
                  <Phone className="h-3.5 w-3.5 text-primary" />
                </Button>
                <div className="text-right min-w-[78px]">
                  <p className="font-bold text-sm text-orange-600 flex items-center justify-end gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {formatUGX(sub.earnings)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    your 1%
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No sub-agents match "{search}"
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          className="w-full gap-2 text-orange-600 hover:text-orange-700 hover:bg-orange-500/10"
          onClick={() => navigate('/sub-agents')}
        >
          <BarChart3 className="h-4 w-4" />
          View Full Team Analytics
        </Button>
      </CardContent>
    </Card>
  );
}

export default SubAgentsList;
