import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Handshake, UserPlus, Loader2, Smartphone, ShieldCheck, Pencil, Trash2, Users, UserCheck, Building, Search } from 'lucide-react';
import { UserSearchPicker } from './UserSearchPicker';
import { format } from 'date-fns';

export function ProxyAgentManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [pickedAgent, setPickedAgent] = useState<any>(null);
  const [pickedBeneficiary, setPickedBeneficiary] = useState<any>(null);
  const [beneficiaryRole, setBeneficiaryRole] = useState('landlord');
  const [reason, setReason] = useState('No smartphone access');
  const [isManagedAccount, setIsManagedAccount] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);

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

  const filteredAssignments = useMemo(() => {
    if (!searchTerm.trim()) return assignments;
    const q = searchTerm.toLowerCase();
    return assignments.filter((a: any) =>
      a.agent?.full_name?.toLowerCase().includes(q) ||
      a.agent?.phone?.toLowerCase().includes(q) ||
      a.beneficiary?.full_name?.toLowerCase().includes(q) ||
      a.beneficiary?.phone?.toLowerCase().includes(q) ||
      a.reason?.toLowerCase().includes(q)
    );
  }, [assignments, searchTerm]);

  const uniqueAgents = new Set(assignments.map((a: any) => a.agent_id)).size;
  const uniquePartners = new Set(assignments.map((a: any) => a.beneficiary_id)).size;
  const managedCount = assignments.filter((a: any) => a.is_managed_account).length;

  const resetForm = () => {
    setPickedAgent(null);
    setPickedBeneficiary(null);
    setBeneficiaryRole('landlord');
    setReason('No smartphone access');
    setIsManagedAccount(false);
    setEditingAssignment(null);
  };

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!pickedAgent) throw new Error('Please select an agent');
      if (!pickedBeneficiary) throw new Error('Please select a beneficiary');
      const { error } = await supabase.from('proxy_agent_assignments').insert({
        agent_id: pickedAgent.id,
        beneficiary_id: pickedBeneficiary.id,
        beneficiary_role: beneficiaryRole,
        assigned_by: user!.id,
        reason,
        is_managed_account: isManagedAccount,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: '✅ Proxy agent linked' });
      qc.invalidateQueries({ queryKey: ['proxy-assignments'] });
      setShowAssign(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editingAssignment) throw new Error('No assignment selected');
      const { error } = await supabase.from('proxy_agent_assignments').update({
        beneficiary_role: beneficiaryRole,
        reason,
        is_managed_account: isManagedAccount,
      }).eq('id', editingAssignment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: '✅ Assignment updated' });
      qc.invalidateQueries({ queryKey: ['proxy-assignments'] });
      setShowAssign(false);
      resetForm();
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

  const openEdit = (a: any) => {
    setEditingAssignment(a);
    setBeneficiaryRole(a.beneficiary_role || 'landlord');
    setReason(a.reason || '');
    setIsManagedAccount(a.is_managed_account || false);
    setShowAssign(true);
  };

  const handleDelete = (a: any) => {
    if (window.confirm(`Deactivate proxy link: ${a.agent?.full_name} → ${a.beneficiary?.full_name}?`)) {
      deactivateMutation.mutate(a.id);
    }
  };

  const kpis = [
    { label: 'Total Assignments', value: assignments.length, icon: Handshake, color: 'text-primary' },
    { label: 'Unique Agents', value: uniqueAgents, icon: Users, color: 'text-blue-500' },
    { label: 'Partners Assigned', value: uniquePartners, icon: UserCheck, color: 'text-green-500' },
    { label: 'Managed Accounts', value: managedCount, icon: Building, color: 'text-amber-500' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Handshake className="h-5 w-5 text-primary" />
          Proxy Agents
        </h2>
        <Dialog open={showAssign} onOpenChange={v => { setShowAssign(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><UserPlus className="h-4 w-4" /> Link Agent</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{editingAssignment ? 'Edit Proxy Assignment' : 'Link Proxy Agent'}</DialogTitle>
            </DialogHeader>
            {!editingAssignment && (
              <p className="text-xs text-muted-foreground">
                Assign an agent to act on behalf of a landlord or partner who doesn't have smartphone access.
              </p>
            )}
            <div className="space-y-3">
              {editingAssignment ? (
                <div className="space-y-1 rounded-lg border border-border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Agent</p>
                  <p className="text-sm font-medium">{editingAssignment.agent?.full_name}</p>
                  <p className="text-xs text-muted-foreground mt-2">Beneficiary</p>
                  <p className="text-sm font-medium">{editingAssignment.beneficiary?.full_name}</p>
                </div>
              ) : (
                <>
                  <UserSearchPicker label="Search Agent" placeholder="Search agent by name or phone..." selectedUser={pickedAgent} onSelect={setPickedAgent} roleFilter="agent" />
                  <UserSearchPicker label="Search Beneficiary (landlord/partner)" placeholder="Search beneficiary by name or phone..." selectedUser={pickedBeneficiary} onSelect={setPickedBeneficiary} />
                </>
              )}
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
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    Managed Account
                  </Label>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Payouts go to agent's wallet instead of the partner's.
                  </p>
                </div>
                <Switch checked={isManagedAccount} onCheckedChange={setIsManagedAccount} />
              </div>
              <div>
                <Label>Reason</Label>
                <Input value={reason} onChange={e => setReason(e.target.value)} />
              </div>
              <Button
                className="w-full"
                onClick={() => editingAssignment ? editMutation.mutate() : assignMutation.mutate()}
                disabled={(editingAssignment ? editMutation.isPending : assignMutation.isPending) || (!editingAssignment && (!pickedAgent || !pickedBeneficiary))}
              >
                {(editingAssignment ? editMutation.isPending : assignMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingAssignment ? 'Update Assignment' : 'Link Proxy'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-3 flex items-center gap-3">
              <k.icon className={`h-8 w-8 ${k.color} shrink-0`} />
              <div>
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-[11px] text-muted-foreground leading-tight">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      {assignments.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agent, partner, phone..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : assignments.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
          <Smartphone className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          No proxy agents assigned. Link agents for landlords/partners without smartphones.
        </CardContent></Card>
      ) : filteredAssignments.length === 0 ? (
        <Card><CardContent className="py-6 text-center text-muted-foreground text-sm">
          No results for "{searchTerm}"
        </CardContent></Card>
      ) : (
        <Card>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Partner / Beneficiary</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Managed</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssignments.map((a: any, idx: number) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{a.agent?.full_name || '—'}</p>
                      <p className="text-[11px] text-muted-foreground">{a.agent?.phone || ''}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{a.beneficiary?.full_name || '—'}</p>
                      <p className="text-[11px] text-muted-foreground">{a.beneficiary?.phone || ''}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {a.beneficiary_role === 'landlord' ? '🏠 Landlord' : '💼 Partner'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {a.is_managed_account ? (
                        <Badge className="text-[10px] gap-0.5 bg-primary/10 text-primary border-primary/20">
                          <ShieldCheck className="h-2.5 w-2.5" /> Yes
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{a.reason || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {a.created_at ? format(new Date(a.created_at), 'dd MMM yyyy') : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(a)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
