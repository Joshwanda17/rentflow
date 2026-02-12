import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Users, Wallet, TrendingUp, ArrowDownLeft, ArrowUpRight, Gift, Percent, Calendar, CheckCircle, Clock, XCircle, MapPin, Car } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface AgentDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    wallet_balance: number;
    agent_type?: string | null;
  } | null;
  onAgentUpdated?: () => void;
}

interface Earning {
  id: string;
  amount: number;
  earning_type: string;
  description: string | null;
  created_at: string;
}

interface Deposit {
  id: string;
  amount: number;
  user_id: string;
  created_at: string;
  deposit_type: string;
  user_name?: string;
}

interface Withdrawal {
  id: string;
  amount: number;
  user_id: string;
  created_at: string;
  user_name?: string;
}

interface RentRequest {
  id: string;
  rent_amount: number;
  status: string;
  created_at: string;
  tenant_name?: string;
}

export function AgentDetailsDialog({ open, onOpenChange, agent, onAgentUpdated }: AgentDetailsDialogProps) {
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [rentRequests, setRentRequests] = useState<RentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentType, setAgentType] = useState<string>(agent?.agent_type || '');
  const [savingType, setSavingType] = useState(false);

  // Update local state when agent changes
  useEffect(() => {
    setAgentType(agent?.agent_type || '');
  }, [agent?.agent_type]);

  const handleAgentTypeChange = async (value: string) => {
    if (!agent || !value) return;
    
    setSavingType(true);
    const { error } = await supabase
      .from('profiles')
      .update({ agent_type: value })
      .eq('id', agent.id);
    
    setSavingType(false);
    
    if (error) {
      toast.error('Failed to update agent type');
      return;
    }
    
    setAgentType(value);
    toast.success(`Agent labeled as ${value === 'signage' ? 'Signage Location' : 'Mobile Agent'}`);
    onAgentUpdated?.();
  };

  useEffect(() => {
    if (open && agent) {
      fetchAgentData();
    }
  }, [open, agent]);

  const fetchAgentData = async () => {
    if (!agent) return;
    setLoading(true);

    const [earningsRes, depositsRes, withdrawalsRes, requestsRes] = await Promise.all([
      supabase
        .from('agent_earnings')
        .select('*')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('wallet_deposits')
        .select('*')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false }),
      // wallet_withdrawals table removed - return empty
      { data: [], error: null } as any,
      supabase
        .from('rent_requests')
        .select('id, rent_amount, status, created_at, tenant_id')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })
    ]);

    setEarnings(earningsRes.data || []);
    
    // Get user names for deposits
    const depositUserIds = [...new Set((depositsRes.data || []).map(d => d.user_id))];
    const withdrawalUserIds = [...new Set((withdrawalsRes.data || []).map(w => w.user_id))];
    const tenantIds = [...new Set((requestsRes.data || []).map(r => r.tenant_id))];
    
    const allUserIds = [...new Set([...depositUserIds, ...withdrawalUserIds, ...tenantIds])];
    
    let profiles: Record<string, string> = {};
    if (allUserIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', allUserIds as string[]);
      
      profiles = (profilesData || []).reduce((acc, p) => {
        acc[p.id] = p.full_name;
        return acc;
      }, {} as Record<string, string>);
    }

    setDeposits((depositsRes.data || []).map(d => ({
      ...d,
      user_name: profiles[d.user_id] || 'Unknown'
    })));

    setWithdrawals((withdrawalsRes.data || []).map(w => ({
      ...w,
      user_name: profiles[w.user_id] || 'Unknown'
    })));

    setRentRequests((requestsRes.data || []).map(r => ({
      ...r,
      tenant_name: profiles[r.tenant_id] || 'Unknown'
    })));

    setLoading(false);
  };

  const totalEarnings = earnings.reduce((sum, e) => sum + Number(e.amount), 0);
  const commissionTotal = earnings.filter(e => e.earning_type === 'commission').reduce((sum, e) => sum + Number(e.amount), 0);
  const bonusTotal = earnings.filter(e => e.earning_type === 'approval_bonus').reduce((sum, e) => sum + Number(e.amount), 0);
  const totalDeposits = deposits.reduce((sum, d) => sum + Number(d.amount), 0);
  const totalWithdrawals = withdrawals.reduce((sum, w) => sum + Number(w.amount), 0);
  const approvedRequests = rentRequests.filter(r => !['pending', 'rejected'].includes(r.status)).length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge className="bg-warning/20 text-warning"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved': return <Badge className="bg-primary/20 text-primary"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'funded': return <Badge className="bg-success/20 text-success"><CheckCircle className="h-3 w-3 mr-1" />Funded</Badge>;
      case 'disbursed': return <Badge className="bg-success/20 text-success"><CheckCircle className="h-3 w-3 mr-1" />Disbursed</Badge>;
      case 'completed': return <Badge className="bg-muted text-muted-foreground"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'rejected': return <Badge className="bg-destructive/20 text-destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Agent Performance
          </DialogTitle>
          <DialogDescription>
            {agent?.full_name} • {agent?.phone}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading agent data...</div>
        ) : (
          <div className="space-y-4">
            {/* Agent Type Toggle */}
            <div className="p-3 rounded-lg bg-secondary/50 border">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Agent Type</p>
              <ToggleGroup 
                type="single" 
                value={agentType} 
                onValueChange={handleAgentTypeChange}
                className="justify-start"
                disabled={savingType}
              >
                <ToggleGroupItem 
                  value="signage" 
                  className="flex items-center gap-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  <MapPin className="h-4 w-4" />
                  <span>Signage Location</span>
                </ToggleGroupItem>
                <ToggleGroupItem 
                  value="mobile" 
                  className="flex items-center gap-2 data-[state=on]:bg-warning data-[state=on]:text-warning-foreground"
                >
                  <Car className="h-4 w-4" />
                  <span>Mobile Agent</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Performance Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-3 text-center">
                  <Users className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-xs text-muted-foreground">Tenants</p>
                  <p className="font-mono font-bold">{rentRequests.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <CheckCircle className="h-4 w-4 mx-auto mb-1 text-success" />
                  <p className="text-xs text-muted-foreground">Approved</p>
                  <p className="font-mono font-bold text-success">{approvedRequests}</p>
                </CardContent>
              </Card>
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-3 text-center">
                  <Wallet className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-xs text-muted-foreground">Wallet Balance</p>
                  <p className="font-mono font-bold text-primary">{formatUGX(Number(agent?.wallet_balance || 0))}</p>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="earnings" className="space-y-3">
              <TabsList className="w-full">
                <TabsTrigger value="earnings" className="flex-1 text-xs">Earnings ({earnings.length})</TabsTrigger>
                <TabsTrigger value="deposits" className="flex-1 text-xs">Deposits ({deposits.length})</TabsTrigger>
                <TabsTrigger value="withdrawals" className="flex-1 text-xs">Withdrawals ({withdrawals.length})</TabsTrigger>
                <TabsTrigger value="tenants" className="flex-1 text-xs">Tenants ({rentRequests.length})</TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[250px]">
                <TabsContent value="earnings" className="mt-0">
                  {earnings.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No earnings yet</p>
                  ) : (
                    <div className="space-y-2">
                      {earnings.map(earning => (
                        <div key={earning.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                          <div className={`p-2 rounded-lg ${earning.earning_type === 'commission' ? 'bg-success/10' : 'bg-warning/10'}`}>
                            {earning.earning_type === 'commission' ? (
                              <Percent className="h-4 w-4 text-success" />
                            ) : (
                              <Gift className="h-4 w-4 text-warning" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm capitalize">{earning.earning_type.replace(/_/g, ' ')}</p>
                            <p className="text-xs text-muted-foreground truncate">{earning.description}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono font-semibold text-success">+{formatUGX(Number(earning.amount))}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(earning.created_at), 'MMM d, h:mm a')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="deposits" className="mt-0">
                  {deposits.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No deposits facilitated</p>
                  ) : (
                    <div className="space-y-2">
                      {deposits.map(deposit => (
                        <div key={deposit.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                          <div className="p-2 rounded-lg bg-success/10">
                            <ArrowDownLeft className="h-4 w-4 text-success" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{deposit.user_name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{deposit.deposit_type.replace(/_/g, ' ')}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono font-semibold">{formatUGX(Number(deposit.amount))}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(deposit.created_at), 'MMM d, h:mm a')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="withdrawals" className="mt-0">
                  {withdrawals.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No withdrawals facilitated</p>
                  ) : (
                    <div className="space-y-2">
                      {withdrawals.map(withdrawal => (
                        <div key={withdrawal.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                          <div className="p-2 rounded-lg bg-destructive/10">
                            <ArrowUpRight className="h-4 w-4 text-destructive" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{withdrawal.user_name}</p>
                            <p className="text-xs text-muted-foreground">Cash withdrawal</p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono font-semibold">{formatUGX(Number(withdrawal.amount))}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(withdrawal.created_at), 'MMM d, h:mm a')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="tenants" className="mt-0">
                  {rentRequests.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No tenants registered</p>
                  ) : (
                    <div className="space-y-2">
                      {rentRequests.map(request => (
                        <div key={request.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <Users className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{request.tenant_name}</p>
                            <p className="text-xs text-muted-foreground">{formatUGX(Number(request.rent_amount))}</p>
                          </div>
                          <div className="text-right">
                            {getStatusBadge(request.status)}
                            <p className="text-xs text-muted-foreground mt-1">{format(new Date(request.created_at), 'MMM d, yyyy')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>

            {/* Volume Summary */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Deposits Facilitated</p>
                <p className="font-mono font-semibold text-success">{formatUGX(totalDeposits)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Withdrawals Facilitated</p>
                <p className="font-mono font-semibold text-destructive">{formatUGX(totalWithdrawals)}</p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
