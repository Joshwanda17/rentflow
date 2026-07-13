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
import { format, startOfWeek, addWeeks, endOfWeek } from 'date-fns';
import { formatUGX } from '@/lib/rentCalculations';

interface SetTeamGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  existingGoal?: {
    id: string;
    goal_week: string;
    target_registrations: number;
    target_earnings: number;
    notes: string | null;
  } | null;
  selectedWeek?: Date;
}

export function SetTeamGoalDialog({
  open,
  onOpenChange,
  onSuccess,
  existingGoal,
  selectedWeek = new Date(),
}: SetTeamGoalDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [goalWeek, setGoalWeek] = useState(
    format(startOfWeek(selectedWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  );
  const [targetRegistrations, setTargetRegistrations] = useState('');
  const [targetEarnings, setTargetEarnings] = useState('');
  const [notes, setNotes] = useState('');

  // Stable week key so a fresh `new Date()` reference on each parent render
  // does not re-trigger this effect and wipe the user's typing ("blink").
  const selectedWeekKey = format(startOfWeek(selectedWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd');

  useEffect(() => {
    // Only (re)initialize the form when the dialog opens.
    if (!open) return;
    if (existingGoal) {
      setGoalWeek(existingGoal.goal_week);
      setTargetRegistrations(existingGoal.target_registrations.toString());
      setTargetEarnings(existingGoal.target_earnings.toString());
      setNotes(existingGoal.notes || '');
    } else {
      setGoalWeek(selectedWeekKey);
      setTargetRegistrations('');
      setTargetEarnings('');
      setNotes('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingGoal?.id, selectedWeekKey, open]);

  const handleSubmit = async () => {
    if (!user) return;

    const regTarget = parseInt(targetRegistrations) || 0;
    const earningsTarget = parseFloat(targetEarnings) || 0;

    if (targetRegistrations.trim() === '' || regTarget <= 0) {
      toast({
        title: 'Registration target required',
        description: 'Enter how many sub-agents you plan to recruit this week (at least 1).',
        variant: 'destructive',
      });
      return;
    }

    if (targetEarnings.trim() === '' || earningsTarget <= 0) {
      toast({
        title: 'Earnings target required',
        description: 'Enter the earnings target (UGX) you are aiming for this week.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const goalData = {
        agent_id: user.id,
        goal_week: goalWeek,
        target_registrations: regTarget,
        target_earnings: earningsTarget,
        notes: notes.trim() || null,
      };

      const { error } = await supabase
        .from('agent_team_goals')
        .upsert(goalData, { onConflict: 'agent_id,goal_week' });

      if (error) throw error;

      toast({
        title: existingGoal ? 'Weekly goal updated' : 'Weekly goal set',
        description: 'Your team target for this week is saved.',
      });

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

  // Generate week options (current week + next 3 weeks)
  const weekOptions = Array.from({ length: 4 }, (_, i) => {
    const start = startOfWeek(addWeeks(new Date(), i), { weekStartsOn: 1 });
    const end = endOfWeek(start, { weekStartsOn: 1 });
    return {
      value: format(start, 'yyyy-MM-dd'),
      label: `${i === 0 ? 'This week' : i === 1 ? 'Next week' : format(start, 'MMM d')} · ${format(start, 'MMM d')} – ${format(end, 'MMM d')}`,
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
              Goal Week
            </Label>
            <select
              value={goalWeek}
              onChange={(e) => setGoalWeek(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={!!existingGoal}
            >
              {weekOptions.map((option) => (
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
              <span className="text-destructive">*</span>
            </Label>
            <Input
              type="number"
              min="1"
              placeholder="e.g., 5"
              value={targetRegistrations}
              onChange={(e) => setTargetRegistrations(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Number of new sub-agents to recruit this week
            </p>
          </div>

          {/* Earnings Target */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-success" />
              Earnings Target (UGX)
              <span className="text-destructive">*</span>
            </Label>
            <Input
              type="number"
              min="1"
              step="1000"
              placeholder="e.g., 50000"
              value={targetEarnings}
              onChange={(e) => setTargetEarnings(e.target.value)}
              required
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
