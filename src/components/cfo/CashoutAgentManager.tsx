import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Banknote, UserPlus, Loader2, XCircle, Building2, Smartphone } from 'lucide-react';
import { UserSearchPicker } from './UserSearchPicker';

export function CashoutAgentManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [pickedAgent, setPickedAgent] = useState<any>(null);
  const [handlesCash, setHandlesCash] = useState(true);
  const [handlesBank, setHandlesBank] = useState(true);
  const [label, setLabel] = useState('');

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['cashout-agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cashout_agents')
        .select('*, profiles:agent_id(id, full_name, phone)')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!pickedAgent) throw new Error('Please select an agent');
      const { error } = await supabase.from('cashout_agents').insert({
        agent_id: pickedAgent.id,
        assigned_by: user!.id,
        handles_cash: handlesCash,
        handles_bank: handlesBank,
        label: label || 'Cash-Out Agent',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: '✅ Cash-Out Agent assigned' });
      qc.invalidateQueries({ queryKey: ['cashout-agents'] });
      setShowAssign(false);
      setPickedAgent(null);
      setLabel('');
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cashout_agents').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Agent removed from cash-out duty' });
      qc.invalidateQueries({ queryKey: ['cashout-agents'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Banknote className="h-5 w-5 text-primary" />
          Cash-Out Agents
        </h2>
        <Dialog open={showAssign} onOpenChange={v => { setShowAssign(v); if (!v) setPickedAgent(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><UserPlus className="h-4 w-4" /> Assign Agent</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm overflow-visible" onInteractOutside={e => e.preventDefault()} onPointerDownOutside={e => e.preventDefault()}>
            <DialogHeader><DialogTitle>Assign Cash-Out Agent</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">
              This agent will handle cash and/or bank withdrawal payouts at their location.
            </p>
            <div className="space-y-3">
              <UserSearchPicker
                label="Search Agent"
                placeholder="Search agent by name or phone..."
                selectedUser={pickedAgent}
                onSelect={setPickedAgent}
                roleFilter="agent"
              />
              <div>
                <Label>Label</Label>
                <Input placeholder="e.g. Kampala CBD Cash Point" value={label} onChange={e => setLabel(e.target.value)} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Handles Cash Payouts</Label>
                <Switch checked={handlesCash} onCheckedChange={setHandlesCash} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Handles Bank Payouts</Label>
                <Switch checked={handlesBank} onCheckedChange={setHandlesBank} />
              </div>
              <Button className="w-full" onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending || !pickedAgent}>
                {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Assign Cash-Out Agent
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : agents.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
          <Smartphone className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          No cash-out agents assigned. Assign agents to handle cash &amp; bank payouts.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {agents.map((a: any) => (
            <Card key={a.id} className="border-l-4 border-l-orange-500">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{a.profiles?.full_name || 'Agent'}</p>
                    <p className="text-xs text-muted-foreground">{a.profiles?.phone}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => deactivateMutation.mutate(a.id)}>
                    <XCircle className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{a.label}</p>
                <div className="flex gap-2">
                  {a.handles_cash && <Badge variant="outline" className="text-[10px] gap-1"><Banknote className="h-3 w-3" />Cash</Badge>}
                  {a.handles_bank && <Badge variant="outline" className="text-[10px] gap-1"><Building2 className="h-3 w-3" />Bank</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
