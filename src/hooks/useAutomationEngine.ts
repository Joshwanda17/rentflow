import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface SystemEvent {
  id: string;
  event_type: string;
  user_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  metadata: Record<string, any>;
  processed: boolean;
  processed_at: string | null;
  created_at: string;
}

interface AutomationAction {
  id: string;
  action_type: string;
  triggered_by_event_id: string | null;
  target_user_id: string | null;
  rule_name: string;
  action_details: Record<string, any>;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

interface UserRiskScore {
  id: string;
  user_id: string;
  risk_score: number;
  risk_level: string;
  consecutive_on_time_payments: number;
  consecutive_missed_payments: number;
  total_missed_payments: number;
  total_on_time_payments: number;
  last_payment_date: string | null;
  last_risk_update: string;
  notes: string | null;
}

interface AccountFlag {
  id: string;
  user_id: string;
  flag_type: string;
  severity: string;
  reason: string;
  metadata: Record<string, any>;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
}

interface AutomationStats {
  totalEvents: number;
  processedEvents: number;
  pendingEvents: number;
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  highRiskUsers: number;
  flaggedAccounts: number;
}

export function useAutomationEngine() {
  const { user, roles } = useAuth();
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [riskScores, setRiskScores] = useState<UserRiskScore[]>([]);
  const [flags, setFlags] = useState<AccountFlag[]>([]);
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const isManager = roles.includes('manager');

  const fetchStats = useCallback(async () => {
    if (!isManager) return;

    // Fetch event stats
    const { count: totalEvents } = await supabase
      .from('system_events')
      .select('*', { count: 'exact', head: true });

    const { count: processedEvents } = await supabase
      .from('system_events')
      .select('*', { count: 'exact', head: true })
      .eq('processed', true);

    const { count: pendingEvents } = await supabase
      .from('system_events')
      .select('*', { count: 'exact', head: true })
      .eq('processed', false);

    // Fetch action stats
    const { count: totalActions } = await supabase
      .from('automation_actions')
      .select('*', { count: 'exact', head: true });

    const { count: successfulActions } = await supabase
      .from('automation_actions')
      .select('*', { count: 'exact', head: true })
      .eq('success', true);

    const { count: failedActions } = await supabase
      .from('automation_actions')
      .select('*', { count: 'exact', head: true })
      .eq('success', false);

    // Fetch risk stats
    const { count: highRiskUsers } = await supabase
      .from('user_risk_scores')
      .select('*', { count: 'exact', head: true })
      .gte('risk_score', 60);

    // Fetch flag stats
    const { count: flaggedAccounts } = await supabase
      .from('account_flags')
      .select('*', { count: 'exact', head: true })
      .eq('resolved', false);

    setStats({
      totalEvents: totalEvents || 0,
      processedEvents: processedEvents || 0,
      pendingEvents: pendingEvents || 0,
      totalActions: totalActions || 0,
      successfulActions: successfulActions || 0,
      failedActions: failedActions || 0,
      highRiskUsers: highRiskUsers || 0,
      flaggedAccounts: flaggedAccounts || 0,
    });
  }, [isManager]);

  const fetchRecentEvents = useCallback(async (limit = 50) => {
    if (!isManager) return;

    const { data, error } = await supabase
      .from('system_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data) {
      setEvents(data as SystemEvent[]);
    }
  }, [isManager]);

  const fetchRecentActions = useCallback(async (limit = 50) => {
    if (!isManager) return;

    const { data, error } = await supabase
      .from('automation_actions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data) {
      setActions(data as AutomationAction[]);
    }
  }, [isManager]);

  const fetchRiskScores = useCallback(async () => {
    if (!isManager) return;

    const { data, error } = await supabase
      .from('user_risk_scores')
      .select('*')
      .order('risk_score', { ascending: false })
      .limit(100);

    if (!error && data) {
      setRiskScores(data as UserRiskScore[]);
    }
  }, [isManager]);

  const fetchActiveFlags = useCallback(async () => {
    if (!isManager) return;

    const { data, error } = await supabase
      .from('account_flags')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setFlags(data as AccountFlag[]);
    }
  }, [isManager]);

  const resolveFlag = useCallback(async (flagId: string, resolutionNotes: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    const { error } = await supabase
      .from('account_flags')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
        resolution_notes: resolutionNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', flagId);

    if (!error) {
      await fetchActiveFlags();
    }

    return { error };
  }, [user, fetchActiveFlags]);

  const triggerEngine = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('automation-engine');
    if (!error) {
      await Promise.all([
        fetchStats(),
        fetchRecentEvents(),
        fetchRecentActions(),
        fetchActiveFlags(),
      ]);
    }
    return { data, error };
  }, [fetchStats, fetchRecentEvents, fetchRecentActions, fetchActiveFlags]);

  const getUserRiskScore = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('user_risk_scores')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    return { data: data as UserRiskScore | null, error };
  }, []);

  const getUserFlags = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('account_flags')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    return { data: data as AccountFlag[] | null, error };
  }, []);

  useEffect(() => {
    if (isManager) {
      setLoading(true);
      Promise.all([
        fetchStats(),
        fetchRecentEvents(),
        fetchRecentActions(),
        fetchRiskScores(),
        fetchActiveFlags(),
      ]).finally(() => setLoading(false));

      // Subscribe to real-time updates
      const eventsChannel = supabase
        .channel('system-events-changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_events' }, () => {
          fetchStats();
          fetchRecentEvents();
        })
        .subscribe();

      const flagsChannel = supabase
        .channel('account-flags-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'account_flags' }, () => {
          fetchActiveFlags();
          fetchStats();
        })
        .subscribe();

      return () => {
        eventsChannel.unsubscribe();
        flagsChannel.unsubscribe();
      };
    } else {
      setLoading(false);
    }
  }, [isManager, fetchStats, fetchRecentEvents, fetchRecentActions, fetchRiskScores, fetchActiveFlags]);

  return {
    events,
    actions,
    riskScores,
    flags,
    stats,
    loading,
    isManager,
    fetchStats,
    fetchRecentEvents,
    fetchRecentActions,
    fetchRiskScores,
    fetchActiveFlags,
    resolveFlag,
    triggerEngine,
    getUserRiskScore,
    getUserFlags,
  };
}
