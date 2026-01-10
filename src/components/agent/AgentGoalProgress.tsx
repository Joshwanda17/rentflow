import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Target, Trophy, Flame, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { motion } from 'framer-motion';

export function AgentGoalProgress() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [goalData, setGoalData] = useState<{
    hasGoal: boolean;
    target: number;
    current: number;
    percentage: number;
  }>({ hasGoal: false, target: 0, current: 0, percentage: 0 });

  const currentMonth = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());

  useEffect(() => {
    if (user) {
      fetchGoalProgress();
    }
  }, [user]);

  const fetchGoalProgress = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch current month's goal
      const { data: goal } = await supabase
        .from('agent_goals')
        .select('target_registrations')
        .eq('agent_id', user.id)
        .eq('goal_month', format(currentMonth, 'yyyy-MM-dd'))
        .single();

      // Fetch this month's registrations
      const { count } = await supabase
        .from('supporter_invites')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', user.id)
        .in('role', ['tenant', 'landlord'])
        .gte('created_at', currentMonth.toISOString())
        .lte('created_at', monthEnd.toISOString());

      const current = count || 0;
      const target = goal?.target_registrations || 0;
      const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;

      setGoalData({
        hasGoal: !!goal,
        target,
        current,
        percentage,
      });
    } catch (error) {
      console.error('Error fetching goal progress:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-20 w-full rounded-xl" />;
  }

  if (!goalData.hasGoal) {
    return (
      <Card 
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => navigate('/agent-registrations')}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Target className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">Set a Monthly Goal</p>
                <p className="text-xs text-muted-foreground">Track your registration progress</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isGoalMet = goalData.current >= goalData.target;
  const remaining = goalData.target - goalData.current;

  return (
    <Card 
      className={`cursor-pointer hover:bg-muted/50 transition-colors overflow-hidden ${isGoalMet ? 'ring-2 ring-success' : ''}`}
      onClick={() => navigate('/agent-registrations')}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${isGoalMet ? 'bg-success/20' : 'bg-primary/10'}`}>
              {isGoalMet ? (
                <Trophy className="h-4 w-4 text-success" />
              ) : goalData.percentage >= 75 ? (
                <Flame className="h-4 w-4 text-warning" />
              ) : (
                <Target className="h-4 w-4 text-primary" />
              )}
            </div>
            <span className="font-medium text-sm">{format(currentMonth, 'MMMM')} Goal</span>
          </div>
          
          {isGoalMet ? (
            <Badge className="bg-success/10 text-success border-success/20 text-xs">
              Achieved!
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">
              {remaining} more
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-bold">
              {goalData.current} / {goalData.target}
            </span>
          </div>
          
          <div className="relative">
            <Progress 
              value={goalData.percentage} 
              className={`h-2 ${isGoalMet ? '[&>div]:bg-success' : ''}`} 
            />
            {isGoalMet && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="absolute -right-0.5 -top-0.5"
              >
                <div className="w-3 h-3 bg-success rounded-full flex items-center justify-center">
                  <span className="text-[8px]">✓</span>
                </div>
              </motion.div>
            )}
          </div>
          
          <p className="text-xs text-muted-foreground">
            {Math.round(goalData.percentage)}% complete
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default AgentGoalProgress;
