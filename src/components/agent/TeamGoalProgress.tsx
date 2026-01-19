import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Target, Users, Coins, Edit, Plus, TrendingUp, Calendar } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';

interface TeamGoal {
  id: string;
  goal_month: string;
  target_registrations: number;
  target_earnings: number;
  notes: string | null;
}

interface TeamGoalProgressProps {
  goal: TeamGoal | null;
  currentRegistrations: number;
  currentEarnings: number;
  onSetGoal: () => void;
  onEditGoal: () => void;
}

export function TeamGoalProgress({
  goal,
  currentRegistrations,
  currentEarnings,
  onSetGoal,
  onEditGoal,
}: TeamGoalProgressProps) {
  if (!goal) {
    return (
      <Card className="border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="p-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Target className="h-7 w-7 text-primary" />
          </div>
          <h3 className="font-bold text-base mb-2">Set Your Team Goal</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Set monthly targets for sub-agent registrations and earnings to track your team's progress
          </p>
          <Button onClick={onSetGoal} className="gap-2">
            <Plus className="h-4 w-4" />
            Set Monthly Goal
          </Button>
        </CardContent>
      </Card>
    );
  }

  const regProgress = goal.target_registrations > 0 
    ? Math.min((currentRegistrations / goal.target_registrations) * 100, 100)
    : 0;
  
  const earningsProgress = goal.target_earnings > 0
    ? Math.min((currentEarnings / goal.target_earnings) * 100, 100)
    : 0;

  const overallProgress = Math.round(
    (regProgress + earningsProgress) / 
    ((goal.target_registrations > 0 ? 1 : 0) + (goal.target_earnings > 0 ? 1 : 0) || 1)
  );

  const goalMonth = format(new Date(goal.goal_month), 'MMMM yyyy');
  const isComplete = regProgress >= 100 && earningsProgress >= 100;

  return (
    <Card className={isComplete ? 'border-success/50 bg-success/5' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className={`h-5 w-5 ${isComplete ? 'text-success' : 'text-primary'}`} />
            Team Goal
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 font-normal">
              <Calendar className="h-3 w-3" />
              {goalMonth}
            </Badge>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEditGoal}>
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-bold">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-3" />
          {isComplete && (
            <div className="flex items-center gap-2 text-success text-sm">
              <TrendingUp className="h-4 w-4" />
              <span className="font-medium">Goal achieved! 🎉</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Registration Progress */}
          {goal.target_registrations > 0 && (
            <div className="space-y-2 p-3 rounded-xl bg-orange-500/10">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-orange-500" />
                <span className="text-xs font-medium">Registrations</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold">{currentRegistrations}</span>
                <span className="text-muted-foreground text-sm">/ {goal.target_registrations}</span>
              </div>
              <Progress value={regProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {regProgress >= 100 ? '✅ Complete' : `${Math.round(regProgress)}% done`}
              </p>
            </div>
          )}

          {/* Earnings Progress */}
          {goal.target_earnings > 0 && (
            <div className="space-y-2 p-3 rounded-xl bg-success/10">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-success" />
                <span className="text-xs font-medium">Earnings</span>
              </div>
              <div>
                <p className="text-lg font-bold">{formatUGX(currentEarnings)}</p>
                <p className="text-xs text-muted-foreground">of {formatUGX(goal.target_earnings)}</p>
              </div>
              <Progress value={earningsProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {earningsProgress >= 100 ? '✅ Complete' : `${Math.round(earningsProgress)}% done`}
              </p>
            </div>
          )}
        </div>

        {goal.notes && (
          <div className="p-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
            📝 {goal.notes}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
