import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Users, Send, Wallet, RefreshCw, Eye } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';
import { AgentDetailsDialog } from './AgentDetailsDialog';

interface Agent {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  wallet_balance: number;
}

export function AgentFloatManager() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    setLoading(true);
    
    // Get all users with agent role
    const { data: agentRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'agent');

    if (rolesError) {
      console.error('Error fetching agent roles:', rolesError);
      setLoading(false);
      return;
    }

    const agentIds = agentRoles?.map(r => r.user_id) || [];
    
    if (agentIds.length === 0) {
      setAgents([]);
      setLoading(false);
      return;
    }

    // Fetch agent profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .in('id', agentIds);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      setLoading(false);
      return;
    }

    // Fetch wallet balances for each agent
    const { data: wallets, error: walletsError } = await supabase
      .from('wallets')
      .select('user_id, balance')
      .in('user_id', agentIds);

    if (walletsError) {
      console.error('Error fetching wallets:', walletsError);
    }

    // Combine data
    const agentsWithWallets = (profiles || []).map(profile => ({
      ...profile,
      wallet_balance: wallets?.find(w => w.user_id === profile.id)?.balance || 0
    }));

    setAgents(agentsWithWallets);
    setLoading(false);
  };

  const handleTransferClick = (agent: Agent) => {
    setSelectedAgent(agent);
    setAmount('');
    setTransferOpen(true);
  };

  const handleViewDetails = (agent: Agent) => {
    setSelectedAgent(agent);
    setDetailsOpen(true);
  };

  const handleTransfer = async () => {
    if (!selectedAgent || !amount || parseFloat(amount) <= 0) {
      toast({ title: 'Error', description: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }

    setProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke('assign-agent-float', {
        body: {
          agent_id: selectedAgent.id,
          amount: parseFloat(amount),
          description: `Float assignment to ${selectedAgent.full_name} for landlord delivery`
        }
      });

      if (error) {
        const { extractFromErrorObject } = await import('@/lib/extractEdgeFunctionError');
        const msg = await extractFromErrorObject(error, 'Float transfer failed');
        throw new Error(msg);
      }

      toast({ 
        title: 'Float Transferred', 
        description: `${formatUGX(parseFloat(amount))} transferred to ${selectedAgent.full_name}` 
      });

      setTransferOpen(false);
      setSelectedAgent(null);
      setAmount('');
      fetchAgents();
    } catch (error: any) {
      console.error('Transfer error:', error);
      toast({ 
        title: 'Transfer Failed', 
        description: error.message || 'Could not complete the transfer', 
        variant: 'destructive' 
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Agent Float Management
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={fetchAgents}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading agents...</p>
          ) : agents.length === 0 ? (
            <p className="text-muted-foreground">No agents registered yet</p>
          ) : (
            <div className="space-y-3">
              {agents.map((agent) => (
                <div 
                  key={agent.id} 
                  className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg bg-secondary/50 gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{agent.full_name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {agent.email} • {agent.phone}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                      <Badge variant="outline" className="font-mono">
                        {formatUGX(Number(agent.wallet_balance))}
                      </Badge>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleViewDetails(agent)}
                      className="whitespace-nowrap"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Details
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => handleTransferClick(agent)}
                      className="whitespace-nowrap"
                    >
                      <Send className="h-4 w-4 mr-1" />
                      Send Float
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Transfer Float
            </DialogTitle>
            <DialogDescription>
              Send float to {selectedAgent?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-secondary/50">
              <p className="text-sm text-muted-foreground">Sending to:</p>
              <p className="font-medium">{selectedAgent?.full_name}</p>
              <p className="text-sm text-muted-foreground">{selectedAgent?.phone}</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (UGX)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
              />
              {amount && parseFloat(amount) > 0 && (
                <p className="text-sm text-muted-foreground">
                  You will send: {formatUGX(parseFloat(amount))}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setTransferOpen(false)}
                disabled={processing}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleTransfer}
                disabled={processing || !amount || parseFloat(amount) <= 0}
              >
                {processing ? 'Processing...' : 'Transfer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AgentDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        agent={selectedAgent}
      />
    </>
  );
}
