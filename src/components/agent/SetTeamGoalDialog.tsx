import { useState, useEffect, forwardRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Target, Users, Coins, Loader2, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, startOfMonth, addMonths } from 'date-fns';
import { formatUGX } from '@/lib/rentCalculations';

interface SetTeamGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  existingGoal?: {
    id: string;
    goal_month: string;
    target_registrations: number;
    target_earnings: number;
    notes: string | null;
  } | null;
  selectedMonth?: Date;
}

export function SetTeamGoalDialog({
  open,
  onOpenChange,
  onSuccess,
  existingGoal,
  selectedMonth = new Date(),
}: SetTeamGoalDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [goalMonth, setGoalMonth] = useState(format(startOfMonth(selectedMonth), 'yyyy-MM'));
  const [targetRegistrations, setTargetRegistrations] = useState('');
  const [targetEarnings, setTargetEarnings] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (existingGoal) {
      setGoalMonth(existingGoal.goal_month);
      setTargetRegistrations(existingGoal.target_registrations.toString());
      setTargetEarnings(existingGoal.target_earnings.toString());
      setNotes(existingGoal.notes || '');
    } else {
      setGoalMonth(format(startOfMonth(selectedMonth), 'yyyy-MM'));
      setTargetRegistrations('');
      setTargetEarnings('');
      setNotes('');
    }
  }, [existingGoal, selectedMonth, open]);

  const handleSubmit = async () => {
    if (!user) return;

    const regTarget = parseInt(targetRegistrations) || 0;
    const earningsTarget = parseFloat(targetEarnings) || 0;

    if (regTarget === 0 && earningsTarget === 0) {
      toast({
        title: 'Set at least one target',
        description: 'Please set a registration or earnings target',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const goalData = {
        agent_id: user.id,
        goal_month: goalMonth + '-01', // Store as date
        target_registrations: regTarget,
        target_earnings: earningsTarget,
        notes: notes.trim() || null,
      };

      if (existingGoal) {
        // subagent_team_goals table removed - feature not active
        toast({ title: 'Team goals feature is not currently active', variant: 'destructive' as const });
      } else {
        toast({ title: 'Team goals feature is not currently active', variant: 'destructive' as const });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving goal:', error);
      toast({
        title: 'Failed to save goal',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Generate month options (current month + next 3 months)
  const monthOptions = Array.from({ length: 4 }, (_, i) => {
    const date = addMonths(new Date(), i);
    return {
      value: format(startOfMonth(date), 'yyyy-MM'),
      label: format(date, 'MMMM yyyy'),
    };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent stable className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            {existingGoal ? 'Edit Team Goal' : 'Set Team Goal'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Month Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Goal Month
            </Label>
            <select
              value={goalMonth}
              onChange={(e) => setGoalMonth(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={!!existingGoal}
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Registration Target */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4 text-orange-500" />
              Sub-Agent Registration Target
            </Label>
            <Input
              type="number"
              min="0"
              placeholder="e.g., 5"
              value={targetRegistrations}
              onChange={(e) => setTargetRegistrations(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Number of new sub-agents to recruit this month
            </p>
          </div>

          {/* Earnings Target */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-success" />
              Earnings Target (UGX)
            </Label>
            <Input
              type="number"
              min="0"
              step="1000"
              placeholder="e.g., 50000"
              value={targetEarnings}
              onChange={(e) => setTargetEarnings(e.target.value)}
            />
            {targetEarnings && (
              <p className="text-xs text-muted-foreground">
                Target: {formatUGX(parseFloat(targetEarnings) || 0)}
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Add any notes about this goal..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Target className="h-4 w-4" />
            )}
            {existingGoal ? 'Update Goal' : 'Set Goal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
