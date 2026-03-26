import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserSearchPicker } from '@/components/cfo/UserSearchPicker';
import { Link2, Loader2, User } from 'lucide-react';

interface SelectedUser {
  id: string;
  full_name: string;
  phone: string;
}

export function TenantAgentLinker() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedTenant, setSelectedTenant] = useState<SelectedUser | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<SelectedUser | null>(null);

  // Fetch active rent requests for selected tenant
  const { data: tenantRequests, isLoading: loadingRequests } = useQuery({
    queryKey: ['tenant-rent-requests', selectedTenant?.id],
    enabled: !!selectedTenant,
    queryFn: async () => {
      const { data } = await supabase
        .from('rent_requests')
        .select('id, status, rent_amount, amount_repaid, total_repayment, daily_repayment, agent_id, created_at')
        .eq('tenant_id', selectedTenant!.id)
        .in('status', ['pending', 'funded', 'disbursed', 'repaying', 'approved', 'tenant_ops_approved', 'agent_verified', 'landlord_ops_approved', 'coo_approved'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (!data || data.length === 0) return [];

      // Fetch agent names
      const agentIds = [...new Set(data.map(r => r.agent_id).filter(Boolean))];
      let agentMap = new Map<string, string>();
      if (agentIds.length > 0) {
        const { data: agents } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', agentIds);
        if (agents) agents.forEach(a => agentMap.set(a.id, a.full_name || '—'));
      }

      return data.map(r => ({
        ...r,
        agent_name: r.agent_id ? agentMap.get(r.agent_id) || '—' : 'No agent',
        outstanding: Number(r.total_repayment || 0) - Number(r.amount_repaid || 0),
      }));
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (rentRequestId: string) => {
      if (!selectedAgent) throw new Error('Select an agent first');
      const { error } = await supabase
        .from('rent_requests')
        .update({ agent_id: selectedAgent.id })
        .eq('id', rentRequestId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: '✅ Agent linked', description: `${selectedAgent?.full_name} is now responsible for ${selectedTenant?.full_name}` });
      qc.invalidateQueries({ queryKey: ['tenant-rent-requests', selectedTenant?.id] });
      qc.invalidateQueries({ queryKey: ['exec-tenant-ops'] });
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Link Agent to Tenant
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <UserSearchPicker
            label="Search Tenant"
            placeholder="Tenant name or phone..."
            selectedUser={selectedTenant}
            onSelect={(u) => { setSelectedTenant(u); }}
            roleFilter="tenant"
          />

          <UserSearchPicker
            label="Search Agent"
            placeholder="Agent name or phone..."
            selectedUser={selectedAgent}
            onSelect={setSelectedAgent}
            roleFilter="agent"
          />
        </CardContent>
      </Card>

      {/* Show tenant's active rent requests */}
      {selectedTenant && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground px-1">
            {selectedTenant.full_name}'s Active Requests
          </p>

          {loadingRequests && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingRequests && (!tenantRequests || tenantRequests.length === 0) && (
            <Card className="border-dashed">
              <CardContent className="p-4 text-center text-sm text-muted-foreground">
                No active rent requests found
              </CardContent>
            </Card>
          )}

          {tenantRequests?.map((rr) => (
            <Card key={rr.id} className="border">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px]">
                    {rr.status.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {rr.id.slice(0, 8)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">Rent:</span>{' '}
                    <span className="font-semibold">UGX {Number(rr.rent_amount).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Due:</span>{' '}
                    <span className="font-bold text-destructive">UGX {rr.outstanding.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Daily:</span>{' '}
                    <span className="font-medium">UGX {Number(rr.daily_repayment || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Repaid:</span>{' '}
                    <span className="font-medium text-emerald-600">UGX {Number(rr.amount_repaid || 0).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t">
                  <div className="flex items-center gap-1.5 text-xs">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Agent:</span>
                    <span className="font-medium">{rr.agent_name}</span>
                  </div>
                  {selectedAgent && (
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs gap-1"
                      disabled={linkMutation.isPending}
                      onClick={() => linkMutation.mutate(rr.id)}
                    >
                      {linkMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Link2 className="h-3 w-3" />
                      )}
                      Link {selectedAgent.full_name.split(' ')[0]}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
