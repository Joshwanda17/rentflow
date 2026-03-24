import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Search, Link2, UserPlus, Check, X } from 'lucide-react';
import { toast } from 'sonner';

interface ProfileResult {
  id: string;
  full_name: string;
  phone: string;
  territory?: string;
}

export function AgentTenantConnector() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [agentSearch, setAgentSearch] = useState('');
  const [tenantSearch, setTenantSearch] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<ProfileResult | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<ProfileResult | null>(null);
  const [reason, setReason] = useState('');

  const { data: agentResults } = useQuery({
    queryKey: ['connector-agent-search', agentSearch],
    queryFn: async () => {
      if (agentSearch.length < 3) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, phone, territory')
        .or(`full_name.ilike.%${agentSearch}%,phone.ilike.%${agentSearch}%`)
        .limit(6);
      // Filter to only agents
      if (!data || data.length === 0) return [];
      const ids = data.map(p => p.id);
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('user_id', ids)
        .eq('role', 'agent')
        .eq('enabled', true);
      const agentIds = new Set((roles || []).map(r => r.user_id));
      return data.filter(p => agentIds.has(p.id)) as ProfileResult[];
    },
    enabled: agentSearch.length >= 3 && !selectedAgent,
    staleTime: 30000,
  });

  const { data: tenantResults } = useQuery({
    queryKey: ['connector-tenant-search', tenantSearch],
    queryFn: async () => {
      if (tenantSearch.length < 3) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, phone, territory')
        .or(`full_name.ilike.%${tenantSearch}%,phone.ilike.%${tenantSearch}%`)
        .limit(6);
      if (!data || data.length === 0) return [];
      const ids = data.map(p => p.id);
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('user_id', ids)
        .eq('role', 'tenant')
        .eq('enabled', true);
      const tenantIds = new Set((roles || []).map(r => r.user_id));
      return data.filter(p => tenantIds.has(p.id)) as ProfileResult[];
    },
    enabled: tenantSearch.length >= 3 && !selectedTenant,
    staleTime: 30000,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent || !selectedTenant || reason.length < 10) {
        throw new Error('Select both agent and tenant, and provide a reason (10+ chars)');
      }
      // Update tenant's referrer_id to the agent
      const { error } = await supabase
        .from('profiles')
        .update({ referrer_id: selectedAgent.id })
        .eq('id', selectedTenant.id);
      if (error) throw error;

      // Log the audit
      await supabase.from('audit_logs').insert({
        action_type: 'connect_tenant_to_agent',
        user_id: user?.id || '',
        record_id: selectedTenant.id,
        table_name: 'profiles',
        metadata: {
          agent_id: selectedAgent.id,
          agent_name: selectedAgent.full_name,
          tenant_id: selectedTenant.id,
          tenant_name: selectedTenant.full_name,
          reason,
        },
      });
    },
    onSuccess: () => {
      toast.success(`${selectedTenant?.full_name} connected to ${selectedAgent?.full_name}`);
      setSelectedAgent(null);
      setSelectedTenant(null);
      setAgentSearch('');
      setTenantSearch('');
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['connector-'] });
    },
    onError: (err: any) => toast.error(err.message || 'Failed to connect'),
  });

  const reset = () => {
    setSelectedAgent(null);
    setSelectedTenant(null);
    setAgentSearch('');
    setTenantSearch('');
    setReason('');
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <Link2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Connect Tenant to Agent</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Agent Search */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">1. Find Agent</label>
          {selectedAgent ? (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-primary/10 border border-primary/20">
              <UserPlus className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{selectedAgent.full_name}</p>
                <p className="text-xs text-muted-foreground">{selectedAgent.phone || 'No phone'}</p>
              </div>
              <button onClick={() => { setSelectedAgent(null); setAgentSearch(''); }} className="p-1 rounded hover:bg-muted">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                placeholder="Search agent name or phone..."
                className="pl-8 h-9 text-sm"
              />
              {agentResults && agentResults.length > 0 && (
                <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {agentResults.map(a => (
                    <button
                      key={a.id}
                      onClick={() => { setSelectedAgent(a); setAgentSearch(''); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                    >
                      <Badge variant="outline" className="text-[10px] shrink-0">Agent</Badge>
                      <span className="truncate font-medium">{a.full_name}</span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">{a.phone || ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tenant Search */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">2. Find Tenant</label>
          {selectedTenant ? (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-green-500/10 border border-green-500/20">
              <UserPlus className="h-4 w-4 text-green-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{selectedTenant.full_name}</p>
                <p className="text-xs text-muted-foreground">{selectedTenant.phone || 'No phone'}</p>
              </div>
              <button onClick={() => { setSelectedTenant(null); setTenantSearch(''); }} className="p-1 rounded hover:bg-muted">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                placeholder="Search tenant name or phone..."
                className="pl-8 h-9 text-sm"
              />
              {tenantResults && tenantResults.length > 0 && (
                <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {tenantResults.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedTenant(t); setTenantSearch(''); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                    >
                      <Badge variant="outline" className="text-[10px] shrink-0 border-green-500/30 text-green-600">Tenant</Badge>
                      <span className="truncate font-medium">{t.full_name}</span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">{t.phone || ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reason + Action */}
      {selectedAgent && selectedTenant && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-xs">
            <Check className="h-3.5 w-3.5 text-green-500" />
            <span>
              Connecting <strong>{selectedTenant.full_name}</strong> → <strong>{selectedAgent.full_name}</strong>
            </span>
          </div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for connection (min 10 characters)..."
            className="text-sm min-h-[60px]"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => connectMutation.mutate()}
              disabled={reason.length < 10 || connectMutation.isPending}
              className="flex-1"
            >
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              {connectMutation.isPending ? 'Connecting...' : 'Connect'}
            </Button>
            <Button size="sm" variant="outline" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
