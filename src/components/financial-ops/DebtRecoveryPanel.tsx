import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, PauseCircle, PlayCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDynamic } from '@/lib/currencyFormat';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Progress } from '@/components/ui/progress';

interface DebtCase {
  id: string;
  withdrawal_request_id: string;
  user_id: string;
  original_amount: number;
  recovered_amount: number;
  remaining_amount: number;
  recovery_percentage: number;
  status: string;
  created_at: string;
  updated_at: string;
  user?: { full_name: string; phone: string };
}

type Tab = 'active' | 'completed';

export function DebtRecoveryPanel() {
  const [cases, setCases] = useState<DebtCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('active');
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from('debt_recovery_cases' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200) as any);

      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((c: any) => c.user_id))] as string[];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', userIds);
        const map = new Map((profiles || []).map(p => [p.id, p]));
        setCases(data.map((c: any) => ({
          ...c,
          user: map.get(c.user_id) || { full_name: 'Unknown', phone: '' },
        })));
      } else {
        setCases([]);
      }
    } catch (e) {
      console.error('Debt recovery fetch error:', e);
      toast.error('Failed to load debt recovery cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const togglePause = async (caseItem: DebtCase) => {
    const newStatus = caseItem.status === 'paused' ? 'active' : 'paused';
    setUpdating(caseItem.id);
    try {
      const { error } = await (supabase
        .from('debt_recovery_cases' as any)
        .update({ status: newStatus } as any)
        .eq('id', caseItem.id) as any);
      if (error) throw error;
      setCases(prev => prev.map(c => c.id === caseItem.id ? { ...c, status: newStatus } : c));
      toast.success(`Recovery ${newStatus === 'paused' ? 'paused' : 'resumed'}`);
    } catch {
      toast.error('Failed to update');
    } finally {
      setUpdating(null);
    }
  };

  const updatePercentage = async (caseId: string, pct: number) => {
    setUpdating(caseId);
    try {
      const { error } = await (supabase
        .from('debt_recovery_cases' as any)
        .update({ recovery_percentage: pct } as any)
        .eq('id', caseId) as any);
      if (error) throw error;
      setCases(prev => prev.map(c => c.id === caseId ? { ...c, recovery_percentage: pct } : c));
      toast.success(`Recovery percentage updated to ${pct}%`);
    } catch {
      toast.error('Failed to update percentage');
    } finally {
      setUpdating(null);
    }
  };

  const filtered = cases.filter(c =>
    tab === 'active' ? c.status !== 'completed' : c.status === 'completed'
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const activeCt = cases.filter(c => c.status !== 'completed').length;
  const completedCt = cases.filter(c => c.status === 'completed').length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            Debt Recovery Cases
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchCases}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-1 bg-muted/50 p-1 rounded-xl mt-2">
          <button
            onClick={() => setTab('active')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              tab === 'active' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Active
            {activeCt > 0 && <Badge variant="warning" size="sm" className="text-[10px] px-1.5">{activeCt}</Badge>}
          </button>
          <button
            onClick={() => setTab('completed')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              tab === 'completed' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Completed
            {completedCt > 0 && <Badge size="sm" className="text-[10px] px-1.5">{completedCt}</Badge>}
          </button>
        </div>
      </CardHeader>

      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {tab === 'active' ? 'No active debt recovery cases' : 'No completed cases'}
          </p>
        ) : (
          <div className="space-y-3">
            {filtered.map(c => {
              const pct = c.original_amount > 0 ? Math.round((c.recovered_amount / c.original_amount) * 100) : 0;
              return (
                <div key={c.id} className={`p-3 rounded-xl border space-y-2 ${
                  c.status === 'completed'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : c.status === 'paused'
                    ? 'border-muted bg-muted/30'
                    : 'border-orange-500/30 bg-orange-500/5'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold">{c.user?.full_name}</p>
                      <p className="text-xs text-muted-foreground">{c.user?.phone}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-black">{formatDynamic(c.original_amount)}</p>
                      <Badge
                        variant={c.status === 'completed' ? 'default' : c.status === 'paused' ? 'secondary' : 'warning'}
                        size="sm"
                      >
                        {c.status === 'completed' ? 'Recovered' : c.status === 'paused' ? 'Paused' : 'Active'}
                      </Badge>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Recovered: {formatDynamic(c.recovered_amount)}</span>
                      <span>Remaining: {formatDynamic(c.remaining_amount)}</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <p className="text-[10px] text-muted-foreground text-right">{pct}% recovered</p>
                  </div>

                  {/* Controls for active/paused */}
                  {c.status !== 'completed' && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">Rate:</span>
                        <Select
                          value={String(c.recovery_percentage)}
                          onValueChange={v => updatePercentage(c.id, Number(v))}
                          disabled={updating === c.id}
                        >
                          <SelectTrigger className="h-7 w-20 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10%</SelectItem>
                            <SelectItem value="20">20%</SelectItem>
                            <SelectItem value="30">30%</SelectItem>
                            <SelectItem value="50">50%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => togglePause(c)}
                        disabled={updating === c.id}
                      >
                        {c.status === 'paused' ? (
                          <><PlayCircle className="h-3 w-3 mr-1" /> Resume</>
                        ) : (
                          <><PauseCircle className="h-3 w-3 mr-1" /> Pause</>
                        )}
                      </Button>
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground">
                    Created {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
