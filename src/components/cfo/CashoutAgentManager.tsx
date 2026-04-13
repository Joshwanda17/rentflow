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
import { Banknote, UserPlus, Loader2, XCircle, Building2, Smartphone, Eye, Phone, Mail, MapPin, CreditCard, Calendar, Shield } from 'lucide-react';
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
  const [viewAgent, setViewAgent] = useState<any>(null);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['cashout-agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cashout_agents')
        .select('*, profiles:agent_id(id, full_name, phone, email, city, country, territory, mobile_money_number, mobile_money_provider, national_id, agent_type, verified, is_frozen, frozen_reason, created_at, last_active_at)')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!pickedAgent) throw new Error('Please select an agent');
      const { error } = await supabase.from('cashout_agents').upsert({
        agent_id: pickedAgent.id,
        assigned_by: user!.id,
        handles_cash: handlesCash,
        handles_bank: handlesBank,
        label: label || 'Cash-Out Agent',
        is_active: true,
      }, { onConflict: 'agent_id' });
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

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

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
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setViewAgent(a)} title="View profile">
                      <Eye className="h-4 w-4 text-primary" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deactivateMutation.mutate(a.id)}>
                      <XCircle className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
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

      {/* Agent Profile Detail Dialog */}
      <Dialog open={!!viewAgent} onOpenChange={v => { if (!v) setViewAgent(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Agent Profile
            </DialogTitle>
          </DialogHeader>
          {viewAgent && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3 pb-3 border-b">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                  {(viewAgent.profiles?.full_name || 'A').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base truncate">{viewAgent.profiles?.full_name || 'Unknown'}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={viewAgent.profiles?.verified ? 'default' : 'secondary'} className="text-[10px]">
                      {viewAgent.profiles?.verified ? '✅ Verified' : '⏳ Unverified'}
                    </Badge>
                    {viewAgent.profiles?.is_frozen && (
                      <Badge variant="destructive" className="text-[10px]">🔒 Frozen</Badge>
                    )}
                    {viewAgent.profiles?.agent_type && (
                      <Badge variant="outline" className="text-[10px] capitalize">{viewAgent.profiles.agent_type}</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Assignment Info */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assignment</p>
                <p className="text-sm">{viewAgent.label}</p>
                <div className="flex gap-2">
                  {viewAgent.handles_cash && <Badge variant="outline" className="text-[10px] gap-1"><Banknote className="h-3 w-3" />Cash</Badge>}
                  {viewAgent.handles_bank && <Badge variant="outline" className="text-[10px] gap-1"><Building2 className="h-3 w-3" />Bank</Badge>}
                </div>
              </div>

              {/* Contact Details */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</p>
                <DetailRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={viewAgent.profiles?.phone} />
                <DetailRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={viewAgent.profiles?.email} />
                <DetailRow icon={<MapPin className="h-3.5 w-3.5" />} label="Location" value={[viewAgent.profiles?.city, viewAgent.profiles?.country].filter(Boolean).join(', ')} />
                {viewAgent.profiles?.territory && (
                  <DetailRow icon={<MapPin className="h-3.5 w-3.5" />} label="Territory" value={viewAgent.profiles.territory} />
                )}
              </div>

              {/* Financial Details */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Financial</p>
                <DetailRow icon={<CreditCard className="h-3.5 w-3.5" />} label="MoMo" value={viewAgent.profiles?.mobile_money_number ? `${viewAgent.profiles.mobile_money_provider || ''} ${viewAgent.profiles.mobile_money_number}`.trim() : null} />
                <DetailRow icon={<Shield className="h-3.5 w-3.5" />} label="National ID" value={viewAgent.profiles?.national_id} />
              </div>

              {/* Dates */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity</p>
                <DetailRow icon={<Calendar className="h-3.5 w-3.5" />} label="Joined" value={formatDate(viewAgent.profiles?.created_at)} />
                <DetailRow icon={<Calendar className="h-3.5 w-3.5" />} label="Last Active" value={formatDate(viewAgent.profiles?.last_active_at)} />
                <DetailRow icon={<Calendar className="h-3.5 w-3.5" />} label="Assigned" value={formatDate(viewAgent.created_at)} />
              </div>

              {viewAgent.profiles?.is_frozen && viewAgent.profiles?.frozen_reason && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs font-semibold text-destructive">Frozen Reason</p>
                  <p className="text-sm text-destructive/80">{viewAgent.profiles.frozen_reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground min-w-[80px]">{label}:</span>
      <span className="font-medium truncate">{value || '—'}</span>
    </div>
  );
}
