import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Target, Plus, X, Save, Loader2 } from 'lucide-react';
import {
  MISSION_DASHBOARDS,
  buildMonthOptions,
  monthKey,
  monthLabel,
  missionDashboardLabel,
} from '@/lib/dashboardMissions';
import { MissionBanner } from '@/components/mission/MissionBanner';

export function MissionGoalsEditor() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const monthOptions = buildMonthOptions();

  const [dashboardRole, setDashboardRole] = useState<string>(MISSION_DASHBOARDS[0].key);
  const [period, setPeriod] = useState<string>(monthKey());
  const [mission, setMission] = useState('');
  const [goals, setGoals] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);

  // Load existing mission for the selected dashboard + month
  const { data: existing, isFetching } = useQuery({
    queryKey: ['mission-editor', dashboardRole, period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_missions')
        .select('*')
        .eq('dashboard_role', dashboardRole)
        .eq('period_month', period)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 0,
  });

  useEffect(() => {
    if (existing) {
      setMission(existing.mission || '');
      const g = Array.isArray(existing.goals) ? (existing.goals as unknown[]).filter((x) => typeof x === 'string') as string[] : [];
      setGoals(g.length ? g : ['']);
    } else {
      setMission('');
      setGoals(['']);
    }
  }, [existing, dashboardRole, period]);

  const setGoal = (i: number, v: string) => setGoals((p) => p.map((g, idx) => (idx === i ? v : g)));
  const addGoal = () => setGoals((p) => [...p, '']);
  const removeGoal = (i: number) => setGoals((p) => (p.length === 1 ? [''] : p.filter((_, idx) => idx !== i)));

  const handleSave = async () => {
    const cleanGoals = goals.map((g) => g.trim()).filter(Boolean);
    if (!mission.trim() && cleanGoals.length === 0) {
      toast.error('Write a mission statement or at least one goal.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('dashboard_missions')
        .upsert(
          {
            dashboard_role: dashboardRole,
            period_month: period,
            mission: mission.trim() || null,
            goals: cleanGoals,
            is_active: true,
            created_by: user?.id ?? null,
          },
          { onConflict: 'dashboard_role,period_month' },
        );
      if (error) throw error;
      toast.success(`Mission published for ${missionDashboardLabel(dashboardRole)} — ${monthLabel(period)}`);
      queryClient.invalidateQueries({ queryKey: ['mission-editor'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-mission'] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save mission');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Monthly Mission & Goals
          </CardTitle>
          <CardDescription>
            Write the mission and goals for each dashboard, each month. They appear prominently at
            the top of that dashboard for every operator and executive. Use “Company-wide” to set a
            default mission shown anywhere a specific one isn’t set.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Dashboard</Label>
              <Select value={dashboardRole} onValueChange={setDashboardRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MISSION_DASHBOARDS.map((d) => (
                    <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Month</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Mission statement</Label>
            <Textarea
              value={mission}
              onChange={(e) => setMission(e.target.value)}
              placeholder="e.g. This month we relentlessly grow verified tenant placements while protecting solvency."
              className="min-h-[90px]"
              disabled={isFetching}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Goals</Label>
              <Button type="button" size="sm" variant="outline" onClick={addGoal} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Add goal
              </Button>
            </div>
            {goals.map((g, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={g}
                  onChange={(e) => setGoal(i, e.target.value)}
                  placeholder={`Goal ${i + 1}`}
                  disabled={isFetching}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground"
                  onClick={() => removeGoal(i)}
                  aria-label="Remove goal"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button onClick={handleSave} disabled={saving || isFetching} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {existing ? 'Update mission' : 'Publish mission'}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Live preview</p>
        {(mission.trim() || goals.some((g) => g.trim())) ? (
          <section className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 sm:p-5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
                <Target className="h-3 w-3" /> Mission this month
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">{monthLabel(period)}</span>
            </div>
            {mission.trim() && (
              <p className="mt-3 text-sm sm:text-base font-semibold leading-relaxed text-foreground">{mission}</p>
            )}
            {goals.some((g) => g.trim()) && (
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {goals.filter((g) => g.trim()).map((g, i) => (
                  <li key={i} className="text-xs sm:text-sm text-foreground/90">• {g}</li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <MissionBanner dashboardRole={dashboardRole} />
        )}
      </div>
    </div>
  );
}