import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Handshake, UserPlus, Loader2, XCircle, Phone, Smartphone } from 'lucide-react';

export function ProxyAgentManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [agentPhone, setAgentPhone] = useState('');
  const [beneficiaryPhone, setBeneficiaryPhone] = useState('');
  const [beneficiaryRole, setBeneficiaryRole] = useState('landlord');
  const [reason, setReason] = useState('No smartphone access');

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['proxy-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proxy_agent_assignments')
        .select('*, agent:agent_id(full_name, phone), beneficiary:beneficiary_id(full_name, phone)')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const lookupPhone = async (phone: string) => {
        const cleaned = phone.replace(/\D/g, '');
        const last9 = cleaned.slice(-9);
        if (last9.length < 9) throw new Error('Invalid phone');
        const { data } = await supabase.from('profiles').select('id, full_name').ilike('phone', `%${last9}`).limit(1);
        if (!data?.length) throw new Error(`User with phone ${phone} not found`);
        return data[0];
      };

      const agent = await lookupPhone(agentPhone);
      const beneficiary = await lookupPhone(beneficiaryPhone);

      const { error } = await supabase.from('proxy_agent_assignments').insert({
        agent_id: agent.id,
        beneficiary_id: beneficiary.id,
        beneficiary_role: beneficiaryRole,
        assigned_by: user!.id,
        reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: '✅ Proxy agent linked' });
      qc.invalidateQueries({ queryKey: ['proxy-assignments'] });
      setShowAssign(false);
      setAgentPhone('');
      setBeneficiaryPhone('');
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('proxy_agent_assignments').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Proxy assignment deactivated' });
      qc.invalidateQueries({ queryKey: ['proxy-assignments'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Handshake className="h-5 w-5 text-primary" />
          Proxy Agents
        </h2>
        <Dialog open={showAssign} onOpenChange={setShowAssign}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><UserPlus className="h-4 w-4" /> Link Agent</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Link Proxy Agent</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">
              Assign an agent to act on behalf of a landlord or partner who doesn't have smartphone access.
            </p>
            <div className="space-y-3">
              <div>
                <Label>Agent Phone</Label>
                <Input placeholder="0771234567" value={agentPhone} onChange={e => setAgentPhone(e.target.value)} />
              </div>
              <div>
                <Label>Beneficiary Phone (landlord/partner)</Label>
                <Input placeholder="0781234567" value={beneficiaryPhone} onChange={e => setBeneficiaryPhone(e.target.value)} />
              </div>
              <div>
                <Label>Beneficiary Role</Label>
                <Select value={beneficiaryRole} onValueChange={setBeneficiaryRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="landlord">🏠 Landlord</SelectItem>
                    <SelectItem value="supporter">💼 Partner/Funder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason</Label>
                <Input value={reason} onChange={e => setReason(e.target.value)} />
              </div>
              <Button className="w-full" onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending || !agentPhone || !beneficiaryPhone}>
                {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Link Proxy
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : assignments.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
          <Smartphone className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          No proxy agents assigned. Link agents for landlords/partners without smartphones.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {assignments.map((a: any) => (
            <Card key={a.id}>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{a.agent?.full_name || 'Agent'}</p>
                    <span className="text-xs text-muted-foreground">→</span>
                    <p className="text-sm">{a.beneficiary?.full_name || 'Beneficiary'}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">
                      {a.beneficiary_role === 'landlord' ? '🏠 Landlord' : '💼 Partner'}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{a.reason}</span>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => deactivateMutation.mutate(a.id)}>
                  <XCircle className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
