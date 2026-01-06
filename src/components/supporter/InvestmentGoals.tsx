import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Target, Plus, Edit2, Trophy, TrendingUp, 
  Calendar, CheckCircle2, Clock, Flame
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { SetGoalDialog } from './SetGoalDialog';

export interface InvestmentGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  createdAt: string;
  color: string;
}

interface InvestmentGoalsProps {
  goals: InvestmentGoal[];
  onAddGoal: (goal: Omit<InvestmentGoal, 'id' | 'currentAmount' | 'createdAt'>) => void;
  onUpdateGoal: (id: string, updates: Partial<InvestmentGoal>) => void;
  onDeleteGoal: (id: string) => void;
  totalEarnings: number;
  monthlyEarnings: number;
}

export function InvestmentGoals({ 
  goals, 
  onAddGoal, 
  onUpdateGoal,
  onDeleteGoal,
  totalEarnings,
  monthlyEarnings 
}: InvestmentGoalsProps) {
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<InvestmentGoal | null>(null);

  const getProgressPercent = (goal: InvestmentGoal) => {
    return Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
  };

  const getDaysRemaining = (deadline: string) => {
    const now = new Date();
    const end = new Date(deadline);
    const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getGoalStatus = (goal: InvestmentGoal) => {
    const progress = getProgressPercent(goal);
    const daysRemaining = getDaysRemaining(goal.deadline);
    
    if (progress >= 100) return { label: 'Completed', color: 'success', icon: CheckCircle2 };
    if (daysRemaining < 0) return { label: 'Expired', color: 'destructive', icon: Clock };
    if (daysRemaining <= 7) return { label: 'Ending Soon', color: 'warning', icon: Flame };
    return { label: 'In Progress', color: 'secondary', icon: TrendingUp };
  };

  const colorClasses: Record<string, { bg: string; border: string; icon: string }> = {
    blue: { bg: 'from-blue-500/10 to-blue-600/5', border: 'border-blue-500/30', icon: 'text-blue-500' },
    green: { bg: 'from-green-500/10 to-green-600/5', border: 'border-green-500/30', icon: 'text-green-500' },
    purple: { bg: 'from-purple-500/10 to-purple-600/5', border: 'border-purple-500/30', icon: 'text-purple-500' },
    orange: { bg: 'from-orange-500/10 to-orange-600/5', border: 'border-orange-500/30', icon: 'text-orange-500' },
    pink: { bg: 'from-pink-500/10 to-pink-600/5', border: 'border-pink-500/30', icon: 'text-pink-500' },
  };

  // Calculate projected earnings based on current monthly rate
  const projectedMonthlyEarnings = monthlyEarnings;

  return (
    <>
      <Card className="elevated-card overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold">Investment Goals</CardTitle>
                <p className="text-xs text-muted-foreground">Track your earning targets</p>
              </div>
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setShowAddGoal(true)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Set Goal
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Monthly Earnings Summary */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-success/10 to-success/5 border border-success/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-success" />
                <span className="text-sm font-medium">Monthly Earnings Rate</span>
              </div>
              <Badge variant="outline" className="text-success border-success/50">
                15% ROI
              </Badge>
            </div>
            <p className="text-2xl font-bold text-success">{formatUGX(projectedMonthlyEarnings)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Total earned: {formatUGX(totalEarnings)}
            </p>
          </div>

          {/* Goals List */}
          {goals.length === 0 ? (
            <div className="text-center py-8">
              <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-4">
                <Trophy className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-muted-foreground font-medium">No goals set yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Set a monthly earning target to stay motivated
              </p>
              <Button 
                size="sm" 
                className="mt-4"
                onClick={() => setShowAddGoal(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Create First Goal
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {goals.map((goal) => {
                const progress = getProgressPercent(goal);
                const daysRemaining = getDaysRemaining(goal.deadline);
                const status = getGoalStatus(goal);
                const StatusIcon = status.icon;
                const colors = colorClasses[goal.color] || colorClasses.blue;

                return (
                  <div
                    key={goal.id}
                    className={`p-4 rounded-xl bg-gradient-to-br ${colors.bg} border ${colors.border} transition-all duration-200 hover:shadow-md`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Target className={`h-4 w-4 ${colors.icon}`} />
                        <h4 className="font-semibold text-foreground">{goal.name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={status.color as any} 
                          className="text-[10px] px-2 py-0.5 gap-1"
                        >
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setEditingGoal(goal)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {/* Target vs Current */}
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Current</p>
                          <p className="text-lg font-bold">{formatUGX(goal.currentAmount)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground mb-0.5">Target</p>
                          <p className="text-lg font-bold text-muted-foreground">
                            {formatUGX(goal.targetAmount)}
                          </p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1.5">
                        <Progress value={progress} className="h-2" />
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">
                            {progress.toFixed(0)}% Complete
                          </span>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {daysRemaining > 0 ? (
                              <span>{daysRemaining} days left</span>
                            ) : daysRemaining === 0 ? (
                              <span className="text-warning">Due today</span>
                            ) : (
                              <span className="text-destructive">
                                {Math.abs(daysRemaining)} days overdue
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Remaining Amount */}
                      {progress < 100 && (
                        <p className="text-xs text-muted-foreground">
                          Need <span className="font-medium text-foreground">
                            {formatUGX(goal.targetAmount - goal.currentAmount)}
                          </span> more to reach your goal
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <SetGoalDialog
        open={showAddGoal}
        onOpenChange={setShowAddGoal}
        onSave={(goal) => {
          onAddGoal(goal);
          setShowAddGoal(false);
        }}
      />

      {editingGoal && (
        <SetGoalDialog
          open={!!editingGoal}
          onOpenChange={(open) => !open && setEditingGoal(null)}
          goal={editingGoal}
          onSave={(updates) => {
            onUpdateGoal(editingGoal.id, updates);
            setEditingGoal(null);
          }}
          onDelete={() => {
            onDeleteGoal(editingGoal.id);
            setEditingGoal(null);
          }}
        />
      )}
    </>
  );
}
