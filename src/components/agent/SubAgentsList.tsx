import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  Calendar,
  X,
  Mail,
  UserMinus,
  Info,
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { hapticTap } from '@/lib/haptics';

interface SubAgent {
  sub_agent_id: string;
  created_at: string;
  status: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
  earnings: number;
  bonusEarnings: number;
  rentCommission: number;
  tenants_count: number;
  active_today: boolean;
}

interface SubAgentsListProps {
  onSummary?: (s: { count: number; totalTenants: number; totalEarnings: number }) => void;
  parentAgentName?: string;
}

export function SubAgentsList({ onSummary, parentAgentName }: SubAgentsListProps = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending_acceptance' | 'expired' | 'rejected' | 'released'>('verified');
  const [totalSubAgentEarnings, setTotalSubAgentEarnings] = useState(0);
  const [totalBonusEarnings, setTotalBonusEarnings] = useState(0);
  const [totalRentCommission, setTotalRentCommission] = useState(0);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<SubAgent | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);

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

      // Profiles — fetched via SECURITY DEFINER RPC so the parent agent can
      // resolve their sub-agents' names/phones (profiles RLS blocks direct
      // reads of other users, which previously showed everyone as "Unknown").
      const { data: profilesRaw } = await supabase.rpc('get_my_subagent_profiles');
      const finalIdSet = new Set(finalIds);
      const profiles = ((profilesRaw as Array<{ id: string; full_name: string; phone: string; avatar_url: string | null }>) || [])
        .filter((p) => finalIdSet.has(p.id))
        .map((p) => ({ id: p.id, full_name: p.full_name, phone: p.phone, avatar_url: p.avatar_url }));

      // Tenant counts + map each tenant back to the sub-agent who manages them.
      // (subagent_commission earnings store the TENANT id in source_user_id,
      // so we need this map to attribute commission to the right sub-agent.)
      const { data: rentReqRows } = await supabase
        .from('rent_requests')
        .select('agent_id, tenant_id, created_at')
        .in('agent_id', finalIds);

      const tenantsBySub: Record<string, number> = {};
      const lastActiveBySub: Record<string, string> = {};
      const tenantToSub: Record<string, string> = {};
      const todayStr = new Date().toISOString().slice(0, 10);
      (rentReqRows || []).forEach(r => {
        tenantsBySub[r.agent_id] = (tenantsBySub[r.agent_id] || 0) + 1;
        if (r.tenant_id) tenantToSub[r.tenant_id] = r.agent_id;
        if (
          !lastActiveBySub[r.agent_id] ||
          r.created_at > lastActiveBySub[r.agent_id]
        ) {
          lastActiveBySub[r.agent_id] = r.created_at;
        }
      });

      // All sub-agent override commission the parent earned. source_user_id is
      // the tenant id, so route each commission to its sub-agent via tenantToSub.
      let earningsQuery = supabase
        .from('agent_earnings')
        .select('amount, source_user_id, created_at')
        .eq('agent_id', user.id)
        .eq('earning_type', 'subagent_commission');

      if (dateFrom) {
        earningsQuery = earningsQuery.gte('created_at', `${dateFrom}T00:00:00Z`);
      }
      if (dateTo) {
        earningsQuery = earningsQuery.lte('created_at', `${dateTo}T23:59:59Z`);
      }

      const { data: earnings } = await earningsQuery;

      const earningsBySub: Record<string, number> = {};
      const bonusBySub: Record<string, number> = {};
      const rentBySub: Record<string, number> = {};
      let total = 0;
      let totalBonus = 0;
      let totalRent = 0;
      (earnings || []).forEach(e => {
        const subId = e.source_user_id ? tenantToSub[e.source_user_id] : undefined;
        if (!subId) return;
        const v = Number(e.amount) || 0;
        earningsBySub[subId] = (earningsBySub[subId] || 0) + v;
        rentBySub[subId] = (rentBySub[subId] || 0) + v;
        total += v;
        totalRent += v;
      });

      // Recruiter override bonuses (UGX 3,000 sub-agent house/landlord/LC1
      // verified, UGX 10,000 register-a-new-agent, etc.) are recorded in
      // recruiter_override_events and map directly to the sub-agent who
      // triggered them. These are the bulk of what a lead agent earns from
      // their sub-agents, so include them in the per-sub-agent + total figures.
      let overrideQuery = supabase
        .from('recruiter_override_events')
        .select('amount, sub_agent_id, created_at')
        .eq('recruiter_id', user.id)
        .eq('status', 'credited');

      if (dateFrom) {
        overrideQuery = overrideQuery.gte('created_at', `${dateFrom}T00:00:00Z`);
      }
      if (dateTo) {
        overrideQuery = overrideQuery.lte('created_at', `${dateTo}T23:59:59Z`);
      }

      const { data: overrides } = await overrideQuery;
      (overrides || []).forEach(o => {
        const subId = o.sub_agent_id as string | null;
        if (!subId) return;
        const v = Number(o.amount) || 0;
        earningsBySub[subId] = (earningsBySub[subId] || 0) + v;
        bonusBySub[subId] = (bonusBySub[subId] || 0) + v;
        total += v;
        totalBonus += v;
      });

      // 2% rent override. Since the April 2026 commission-engine rewrite, the
      // recruiter's rent override is written to commission_accrual_ledger
      // (commission_role = 'recruiter'), NOT agent_earnings.subagent_commission.
      // Without this the per-sub-agent 2% rent earnings show as zero. Each row
      // carries the tenant_id, so route it to its sub-agent via tenantToSub.
      let recruiterQuery = supabase
        .from('commission_accrual_ledger')
        .select('amount, tenant_id, earned_at')
        .eq('agent_id', user.id)
        .eq('commission_role', 'recruiter');

      if (dateFrom) {
        recruiterQuery = recruiterQuery.gte('earned_at', `${dateFrom}T00:00:00Z`);
      }
      if (dateTo) {
        recruiterQuery = recruiterQuery.lte('earned_at', `${dateTo}T23:59:59Z`);
      }

      const { data: recruiterCommissions } = await recruiterQuery;
      (recruiterCommissions || []).forEach(rc => {
        const subId = rc.tenant_id ? tenantToSub[rc.tenant_id] : undefined;
        if (!subId) return;
        const v = Number(rc.amount) || 0;
        earningsBySub[subId] = (earningsBySub[subId] || 0) + v;
        rentBySub[subId] = (rentBySub[subId] || 0) + v;
        total += v;
        totalRent += v;
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
          bonusEarnings: bonusBySub[id] || 0,
          rentCommission: rentBySub[id] || 0,
          tenants_count: tenantsBySub[id] || 0,
          active_today:
            (lastActiveBySub[id] || '').slice(0, 10) === todayStr,
        };
      });

      // Sort: accepted first, then pending, then others; then by tenant count desc
      enriched.sort((a, b) => {
        const score = (s: SubAgent) => {
          if (s.status === 'verified') return 3;
          if (s.status === 'pending_acceptance') return 2;
          if (s.status === 'rejected') return 1;
          return 0;
        };
        const scoreDiff = score(b) - score(a);
        if (scoreDiff !== 0) return scoreDiff;
        if (a.active_today !== b.active_today) return a.active_today ? -1 : 1;
        return (b.tenants_count || 0) - (a.tenants_count || 0);
      });

      setSubAgents(enriched);
      setTotalSubAgentEarnings(total);
      setTotalBonusEarnings(totalBonus);
      setTotalRentCommission(totalRent);
      onSummary?.({
        count: enriched.length,
        totalTenants: enriched.reduce((sum, s) => sum + (s.tenants_count || 0), 0),
        totalEarnings: total,
      });
    } catch (error) {
      console.error('Error fetching sub-agents:', error);
    } finally {
      setLoading(false);
    }
  }, [user, onSummary, dateFrom, dateTo]);

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

  const handleRefresh = async () => {
    if (refreshing) return;
    hapticTap();
    setRefreshing(true);
    // Guarantee a visible spin even when the fetch resolves instantly (iOS
    // taps otherwise give no feedback and feel like nothing happened).
    const minSpin = new Promise((r) => setTimeout(r, 600));
    try {
      await Promise.all([fetchSubAgents(), minSpin]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCall = (phone: string) => {
    if (phone && phone !== '—') window.location.href = `tel:${phone}`;
  };

  const handleResendInvite = async (subAgentId: string, name: string) => {
    setResendingId(subAgentId);
    const { data, error } = await invokeEdgeFunction<{ ok: boolean; smsSent: boolean; emailSent: boolean }>(
      'resend-subagent-invite',
      {
        body: { subAgentId, origin: window.location.origin },
        errorTitle: 'Resend failed',
        fallbackMessage: 'Could not resend the invitation.',
      },
    );
    setResendingId(null);
    if (error || !data?.ok) return;

    const parts: string[] = [];
    if (data.smsSent) parts.push('SMS');
    if (data.emailSent) parts.push('email');
    const via = parts.length > 0 ? ` via ${parts.join(' and ')}` : '';

    toast.success(`Invite re-sent to ${name}`, {
      description: `A new acceptance link was sent${via}.`,
    });
  };

  const handleReleaseSubAgent = async () => {
    if (!releaseTarget) return;
    const target = releaseTarget;
    setReleasingId(target.sub_agent_id);
    const { error } = await supabase.rpc('release_sub_agent', {
      p_sub_agent_id: target.sub_agent_id,
    });
    setReleasingId(null);
    if (error) {
      toast.error('Could not release sub-agent', { description: error.message });
      return;
    }
    setReleaseTarget(null);
    toast.success(`${target.full_name} released`, {
      description: 'They are no longer your sub-agent. Override commission and benefits have stopped.',
    });
    await fetchSubAgents();
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
      (!search ||
        s.full_name.toLowerCase().includes(search.toLowerCase()) ||
        s.phone.includes(search)) &&
      (statusFilter === 'all' || s.status === statusFilter),
  );

  const activeToday = subAgents.filter(s => s.active_today).length;
  const acceptedCount = subAgents.filter(s => s.status === 'verified').length;
  const pendingCount = subAgents.filter(s => s.status === 'pending_acceptance').length;
  const expiredCount = subAgents.filter(s => s.status === 'expired').length;

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
              type="button"
              size="icon"
              variant="ghost"
              className="h-10 w-10 touch-manipulation"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Refresh sub-agents"
            >
              <RefreshCw
                className={`h-4 w-4 pointer-events-none ${refreshing ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-success/10 p-3">
            <p className="text-[11px] text-muted-foreground">Accepted</p>
            <p className="font-bold text-success text-lg leading-none mt-1">
              {acceptedCount}
            </p>
          </div>
          <div className="rounded-xl bg-amber-500/10 p-3">
            <p className="text-[11px] text-muted-foreground">Pending</p>
            <p className="font-bold text-amber-600 text-lg leading-none mt-1">
              {pendingCount}
            </p>
          </div>
          <div className="rounded-xl bg-orange-500/10 p-3">
            <p className="text-[11px] text-muted-foreground">
              Your earnings
            </p>
            <p className="font-bold text-orange-600 text-base leading-none mt-1">
              {formatUGX(totalSubAgentEarnings)}
            </p>
            {(totalBonusEarnings > 0 || totalRentCommission > 0) && (
              <div className="mt-1.5 space-y-0.5">
                <p className="text-[9px] text-muted-foreground leading-tight">
                  Bonuses {formatUGX(totalBonusEarnings)}
                </p>
                <p className="text-[9px] text-muted-foreground leading-tight">
                  Rent 2% {formatUGX(totalRentCommission)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Expired-invite explainer — prevents the "my sub-agents keep
            disappearing" confusion. Expired = an invite that was never
            accepted; the person was never an active sub-agent and nothing
            was lost. They can be recovered with a single Resend. */}
        {expiredCount > 0 && (
          <button
            type="button"
            onClick={() => setStatusFilter('expired')}
            className="w-full text-left flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"
          >
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-700">
                {expiredCount} invite{expiredCount === 1 ? '' : 's'} expired before being accepted
              </p>
              <p className="text-[11px] text-amber-700/80 leading-snug mt-0.5">
                These were never active sub-agents — nothing was removed from your team.
                An invite expires if it isn't accepted within 7 days. Tap here to view them and Resend to recover.
              </p>
            </div>
          </button>
        )}

        {/* Date Range Filter */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">
              {dateFrom || dateTo
                ? `${dateFrom ? format(new Date(dateFrom), 'MMM d') : 'Start'} – ${dateTo ? format(new Date(dateTo), 'MMM d') : 'End'}`
                : 'All time'}
            </span>
            {(dateFrom || dateTo) && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 ml-auto"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-8 text-xs flex-1"
              placeholder="From"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-8 text-xs flex-1"
              placeholder="To"
            />
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

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'verified', label: 'Accepted' },
              { key: 'pending_acceptance', label: 'Pending' },
              { key: 'expired', label: 'Expired' },
              { key: 'rejected', label: 'Rejected' },
              { key: 'released', label: 'Released' },
            ] as { key: typeof statusFilter; label: string }[]
          ).map(chip => {
            const active = statusFilter === chip.key;
            return (
              <button
                key={chip.key}
                onClick={() => setStatusFilter(chip.key)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-muted/60 text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                {chip.label}
                <span className={`ml-1 text-[10px] ${active ? 'text-white/80' : 'text-muted-foreground'}`}>
                  {subAgents.filter(s => s.status === chip.key || chip.key === 'all').length}
                </span>
              </button>
            );
          })}
        </div>

        {/* List */}
        <div className="space-y-2">
          {filtered.map(sub => (
            <div
              key={sub.sub_agent_id}
              className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                sub.status === 'verified'
                  ? 'bg-success/5 border border-success/20 hover:bg-success/10'
                  : 'bg-muted/40 hover:bg-muted'
              }`}
            >
              <button
                onClick={() => navigate(`/sub-agents?id=${sub.sub_agent_id}`)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <div className={`relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  sub.status === 'verified'
                    ? 'bg-success/20 ring-2 ring-success/40'
                    : 'bg-orange-500/20'
                }`}>
                  <Users className={`h-5 w-5 ${
                    sub.status === 'verified' ? 'text-success' : 'text-orange-500'
                  }`} />
                  {sub.active_today && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-background" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {sub.full_name}
                  </p>
                  {parentAgentName && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      Reports to: {parentAgentName}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-[11px] text-muted-foreground truncate">
                      {sub.tenants_count} tenants
                    </p>
                    {sub.status === 'verified' && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                        <CheckCircle className="h-2.5 w-2.5" />
                        Accepted
                      </span>
                    )}
                    {sub.status === 'pending_acceptance' && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                        <Clock className="h-2.5 w-2.5" />
                        Invite pending
                      </span>
                    )}
                    {sub.status === 'expired' && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                        <Clock className="h-2.5 w-2.5" />
                        Invite expired
                      </span>
                    )}
                    {sub.status === 'rejected' && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                        <XCircle className="h-2.5 w-2.5" />
                        Rejected
                      </span>
                    )}
                    {sub.status === 'released' && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                        <UserMinus className="h-2.5 w-2.5" />
                        Released
                      </span>
                    )}
                  </div>
                </div>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                {(sub.status === 'pending_acceptance' || sub.status === 'expired') && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 text-xs px-2 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                    onClick={e => {
                      e.stopPropagation();
                      handleResendInvite(sub.sub_agent_id, sub.full_name);
                    }}
                    disabled={resendingId === sub.sub_agent_id}
                  >
                    {resendingId === sub.sub_agent_id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Mail className="h-3 w-3" />
                    )}
                    Resend
                  </Button>
                )}
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
                    you earned
                  </p>
                  {(sub.bonusEarnings > 0 || sub.rentCommission > 0) && (
                    <div className="mt-0.5 space-y-0.5">
                      {sub.bonusEarnings > 0 && (
                        <p className="text-[9px] text-muted-foreground leading-tight">
                          Bonus {formatUGX(sub.bonusEarnings)}
                        </p>
                      )}
                      {sub.rentCommission > 0 && (
                        <p className="text-[9px] text-muted-foreground leading-tight">
                          Rent 2% {formatUGX(sub.rentCommission)}
                        </p>
                      )}
                    </div>
                  )}
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

      <AlertDialog
        open={!!releaseTarget}
        onOpenChange={open => {
          if (!open && !releasingId) setReleaseTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release {releaseTarget?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer be your sub-agent. All parent benefits stop
              immediately — you will no longer earn the 2% override on their
              collections and they will leave your team. This does not remove
              their own agent account or their tenants.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!releasingId}>Keep sub-agent</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => {
                e.preventDefault();
                handleReleaseSubAgent();
              }}
              disabled={!!releasingId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {releasingId ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Releasing…
                </>
              ) : (
                'Release sub-agent'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default SubAgentsList;
