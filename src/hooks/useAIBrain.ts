import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface AIRecommendation {
  id: string;
  recommendation_type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  target_user_id: string | null;
  title: string;
  description: string;
  reasoning: string | null;
  suggested_action: Record<string, any>;
  context_data: Record<string, any> | null;
  confidence_score: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'auto_executed' | 'expired';
  requires_approval: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  executed_at: string | null;
  execution_result: Record<string, any> | null;
  expires_at: string | null;
  created_at: string;
}

interface AIAnalysisSession {
  id: string;
  session_type: string;
  events_processed: number;
  recommendations_generated: number;
  auto_executed_actions: number;
  analysis_summary: Record<string, any> | null;
  model_used: string;
  duration_ms: number | null;
  status: string;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

interface AIBrainStats {
  pendingRecommendations: number;
  approvedToday: number;
  autoExecutedToday: number;
  criticalPending: number;
  lastSessionAt: string | null;
}

export function useAIBrain() {
  const { user, roles } = useAuth();
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [sessions, setSessions] = useState<AIAnalysisSession[]>([]);
  const [stats, setStats] = useState<AIBrainStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggeringAI, setTriggeringAI] = useState(false);
  const isManager = roles.includes('manager');

  const fetchRecommendations = useCallback(async (statusFilter?: 'pending' | 'approved' | 'rejected' | 'auto_executed' | 'expired') => {
    if (!isManager) return;

    let query = supabase
      .from('ai_recommendations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;

    if (!error && data) {
      setRecommendations(data as AIRecommendation[]);
    }
  }, [isManager]);

  const fetchSessions = useCallback(async () => {
    if (!isManager) return;

    const { data, error } = await supabase
      .from('ai_analysis_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      setSessions(data as AIAnalysisSession[]);
    }
  }, [isManager]);

  const fetchStats = useCallback(async () => {
    if (!isManager) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const [
      { count: pendingCount },
      { count: approvedToday },
      { count: autoExecutedToday },
      { count: criticalPending },
      { data: lastSession },
    ] = await Promise.all([
      supabase
        .from('ai_recommendations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('ai_recommendations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')
        .gte('reviewed_at', todayISO),
      supabase
        .from('ai_recommendations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'auto_executed')
        .gte('executed_at', todayISO),
      supabase
        .from('ai_recommendations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('priority', 'critical'),
      supabase
        .from('ai_analysis_sessions')
        .select('completed_at')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1),
    ]);

    setStats({
      pendingRecommendations: pendingCount || 0,
      approvedToday: approvedToday || 0,
      autoExecutedToday: autoExecutedToday || 0,
      criticalPending: criticalPending || 0,
      lastSessionAt: lastSession?.[0]?.completed_at || null,
    });
  }, [isManager]);

  const approveRecommendation = useCallback(async (recommendationId: string, notes?: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    const { data: rec, error: fetchError } = await supabase
      .from('ai_recommendations')
      .select('*')
      .eq('id', recommendationId)
      .single();

    if (fetchError || !rec) {
      return { error: fetchError || new Error('Recommendation not found') };
    }

    // Execute the action
    const action = rec.suggested_action as Record<string, any>;
    let executionResult: Record<string, any> = { success: true };

    try {
      switch (action.action_type) {
        case 'send_notification':
          await supabase.from('notifications').insert({
            user_id: rec.target_user_id,
            title: action.notification_title,
            message: action.notification_message,
            type: 'ai_generated',
            metadata: { ai_recommendation_id: recommendationId }
          });
          executionResult.action = 'notification_sent';
          break;

        case 'adjust_risk_score':
          if (action.risk_change && rec.target_user_id) {
            await supabase.rpc('update_user_risk_score', {
              p_user_id: rec.target_user_id,
              p_score_change: action.risk_change,
              p_reason: `Manager approved AI recommendation: ${rec.reasoning}`,
            });
            executionResult.action = 'risk_score_adjusted';
          }
          break;

        case 'flag_account':
          await supabase.from('account_flags').insert({
            user_id: rec.target_user_id,
            flag_type: 'ai_flagged',
            severity: rec.priority === 'critical' ? 'critical' : 'high',
            reason: rec.reasoning || rec.description,
            metadata: { ai_recommendation_id: recommendationId }
          });
          executionResult.action = 'account_flagged';
          break;

        default:
          executionResult.action = 'logged_only';
      }
    } catch (execError: unknown) {
      executionResult = { 
        success: false, 
        error: execError instanceof Error ? execError.message : 'Execution failed' 
      };
    }

    const { error } = await supabase
      .from('ai_recommendations')
      .update({
        status: 'approved',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_notes: notes || null,
        executed_at: new Date().toISOString(),
        execution_result: executionResult,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recommendationId);

    if (!error) {
      await Promise.all([fetchRecommendations('pending'), fetchStats()]);
      toast.success('Recommendation approved and executed');
    }

    return { error };
  }, [user, fetchRecommendations, fetchStats]);

  const rejectRecommendation = useCallback(async (recommendationId: string, notes: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    const { error } = await supabase
      .from('ai_recommendations')
      .update({
        status: 'rejected',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recommendationId);

    if (!error) {
      await Promise.all([fetchRecommendations('pending'), fetchStats()]);
      toast.success('Recommendation rejected');
    }

    return { error };
  }, [user, fetchRecommendations, fetchStats]);

  const triggerAIAnalysis = useCallback(async () => {
    setTriggeringAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-brain');
      
      if (error) {
        toast.error('Failed to trigger AI analysis');
        return { error };
      }

      toast.success(`AI analysis complete: ${data.recommendationsGenerated} recommendations generated`);
      await Promise.all([fetchRecommendations(), fetchSessions(), fetchStats()]);
      return { data };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(errorMessage);
      return { error: err };
    } finally {
      setTriggeringAI(false);
    }
  }, [fetchRecommendations, fetchSessions, fetchStats]);

  useEffect(() => {
    if (isManager) {
      setLoading(true);
      Promise.all([
        fetchRecommendations('pending'),
        fetchSessions(),
        fetchStats(),
      ]).finally(() => setLoading(false));

      // Subscribe to real-time updates
      const channel = supabase
        .channel('ai-recommendations-changes')
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'ai_recommendations' 
        }, () => {
          fetchRecommendations('pending');
          fetchStats();
        })
        .subscribe();

      return () => {
        channel.unsubscribe();
      };
    } else {
      setLoading(false);
    }
  }, [isManager, fetchRecommendations, fetchSessions, fetchStats]);

  return {
    recommendations,
    sessions,
    stats,
    loading,
    isManager,
    triggeringAI,
    fetchRecommendations,
    fetchSessions,
    fetchStats,
    approveRecommendation,
    rejectRecommendation,
    triggerAIAnalysis,
  };
}
