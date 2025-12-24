import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Users, FileText, CheckCircle, XCircle, Clock, Banknote, Send, Receipt, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { formatUGX, AGENT_APPROVAL_BONUS } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';
import RoleSwitcher from '@/components/RoleSwitcher';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import AppBreadcrumb from '@/components/AppBreadcrumb';
import WelileLogo from '@/components/WelileLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WalletCard } from '@/components/wallet/WalletCard';
import MobileBottomNav from '@/components/MobileBottomNav';

interface ManagerDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

interface RentRequest {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  landlord_id: string;
  supporter_id: string | null;
  rent_amount: number;
  duration_days: number;
  access_fee: number;
  request_fee: number;
  total_repayment: number;
  status: string;
  created_at: string;
  landlords?: { id: string; name: string; phone: string };
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  user_roles: { role: string }[];
}

interface PlatformTransaction {
  id: string;
  rent_request_id: string | null;
  user_id: string | null;
  transaction_type: string;
  amount: number;
  direction: string;
  description: string | null;
  created_at: string;
}

export default function ManagerDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: ManagerDashboardProps) {
  const [requests, setRequests] = useState<RentRequest[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [transactions, setTransactions] = useState<PlatformTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const [requestsResult, usersResult, transactionsResult] = await Promise.all([
      supabase
        .from('rent_requests')
        .select(`
          id, tenant_id, agent_id, landlord_id, supporter_id, rent_amount, duration_days, 
          access_fee, request_fee, total_repayment, status, created_at,
          landlords (id, name, phone)
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, full_name, email, phone')
        .order('created_at', { ascending: false }),
      supabase
        .from('platform_transactions')
        .select('*')
        .order('created_at', { ascending: false })
    ]);
    
    const requestsData = requestsResult.data;
    const usersData = usersResult.data;
    
    // Fetch roles separately
    const userIds = usersData?.map(u => u.id) || [];
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds);
    
    const usersWithRoles = usersData?.map(u => ({
      ...u,
      user_roles: rolesData?.filter(r => r.user_id === u.id).map(r => ({ role: r.role })) || []
    })) || [];
    
    setRequests(requestsData || []);
    setUsers(usersWithRoles);
    setTransactions(transactionsResult.data || []);
    setLoading(false);
  };

  const handleApprove = async (requestId: string, agentId: string | null) => {
    const { error } = await supabase
      .from('rent_requests')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    // Pay agent approval bonus if there's an agent
    if (agentId) {
      await supabase.from('platform_transactions').insert({
        rent_request_id: requestId,
        user_id: agentId,
        transaction_type: 'agent_approval_bonus',
        amount: AGENT_APPROVAL_BONUS,
        direction: 'out',
        description: 'Agent approval bonus'
      });
    }

    toast({ title: 'Request Approved', description: 'The rent request has been approved' });
    fetchData();
  };

  const handleReject = async (requestId: string) => {
    const { error } = await supabase
      .from('rent_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Request Rejected', description: 'The rent request has been rejected' });
    fetchData();
  };

  const handleDisburse = async (request: RentRequest) => {
    // Update request status to disbursed
    const { error: updateError } = await supabase
      .from('rent_requests')
      .update({
        status: 'disbursed',
        disbursed_at: new Date().toISOString()
      })
      .eq('id', request.id);

    if (updateError) {
      toast({ title: 'Error', description: updateError.message, variant: 'destructive' });
      return;
    }

    // Create landlord payout transaction
    // Note: We need to find landlord's user account or use a system record
    await supabase.from('platform_transactions').insert({
      rent_request_id: request.id,
      user_id: request.landlord_id, // Using landlord_id from rent_requests
      transaction_type: 'landlord_payout',
      amount: Number(request.rent_amount),
      direction: 'out',
      description: `Rent payout for request`
    });

    // Record platform revenue (access fee + request fee)
    await supabase.from('platform_transactions').insert({
      rent_request_id: request.id,
      user_id: null,
      transaction_type: 'platform_fee',
      amount: Number(request.access_fee) + Number(request.request_fee),
      direction: 'in',
      description: 'Platform fees from rent facilitation'
    });

    toast({ 
      title: 'Disbursement Complete', 
      description: `${formatUGX(Number(request.rent_amount))} has been marked as paid to landlord`
    });
    fetchData();
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const approvedRequests = requests.filter(r => r.status === 'approved');
  const fundedRequests = requests.filter(r => r.status === 'funded');
  const disbursedRequests = requests.filter(r => ['disbursed', 'completed'].includes(r.status));
  
  const totalFacilitated = [...fundedRequests, ...disbursedRequests].reduce((sum, r) => sum + Number(r.rent_amount), 0);
  const totalPlatformRevenue = requests
    .filter(r => ['funded', 'disbursed', 'completed'].includes(r.status))
    .reduce((sum, r) => sum + Number(r.access_fee) + Number(r.request_fee), 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-warning/20 text-warning';
      case 'approved': return 'bg-primary/20 text-primary';
      case 'funded': return 'bg-success/20 text-success';
      case 'disbursed': return 'bg-success/20 text-success';
      case 'completed': return 'bg-muted text-muted-foreground';
      case 'rejected': return 'bg-destructive/20 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      tenant: 'bg-primary/20 text-primary',
      agent: 'bg-warning/20 text-warning',
      supporter: 'bg-success/20 text-success',
      landlord: 'bg-chart-5/20 text-chart-5',
      manager: 'bg-destructive/20 text-destructive'
    };
    return colors[role] || 'bg-muted text-muted-foreground';
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <WelileLogo showText={false} />
            <RoleSwitcher
              currentRole={currentRole} 
              availableRoles={availableRoles} 
              onRoleChange={onRoleChange} 
            />
          </div>
          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />
            {addRoleComponent}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
          <div className="md:hidden">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <AppBreadcrumb />
        
        {/* Wallet */}
        <WalletCard />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <Card className="glass-card">
            <CardContent className="p-4 md:pt-6">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-2 md:p-3 rounded-lg bg-warning/10">
                  <Clock className="h-4 w-4 md:h-5 md:w-5 text-warning" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs md:text-sm text-muted-foreground">Pending</p>
                  <p className="text-lg md:text-xl font-mono font-semibold">{pendingRequests.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-4 md:pt-6">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-2 md:p-3 rounded-lg bg-primary/10">
                  <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs md:text-sm text-muted-foreground">Approved</p>
                  <p className="text-lg md:text-xl font-mono font-semibold">{approvedRequests.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-4 md:pt-6">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-2 md:p-3 rounded-lg bg-success/10">
                  <Banknote className="h-4 w-4 md:h-5 md:w-5 text-success" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs md:text-sm text-muted-foreground">Facilitated</p>
                  <p className="text-base md:text-xl font-mono font-semibold truncate">{formatUGX(totalFacilitated)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-4 md:pt-6">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-2 md:p-3 rounded-lg bg-chart-5/10">
                  <Users className="h-4 w-4 md:h-5 md:w-5 text-chart-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs md:text-sm text-muted-foreground">Revenue</p>
                  <p className="text-base md:text-xl font-mono font-semibold truncate">{formatUGX(totalPlatformRevenue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="pending" className="space-y-4">
          <div className="overflow-x-auto -mx-4 px-4">
            <TabsList className="bg-secondary w-max min-w-full md:w-auto">
              <TabsTrigger value="pending" className="text-xs md:text-sm">
                Pending ({pendingRequests.length})
              </TabsTrigger>
              <TabsTrigger value="funded" className="text-xs md:text-sm">
                Funded ({fundedRequests.length})
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs md:text-sm">All</TabsTrigger>
              <TabsTrigger value="transactions" className="text-xs md:text-sm">
                <Receipt className="h-4 w-4 mr-1 hidden md:inline" />
                Payments
              </TabsTrigger>
              <TabsTrigger value="users" className="text-xs md:text-sm">Users</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="pending">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Pending Approval
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : pendingRequests.length === 0 ? (
                  <p className="text-muted-foreground">No pending requests</p>
                ) : (
                  <div className="space-y-4">
                    {pendingRequests.map((request) => (
                      <div 
                        key={request.id} 
                        className="p-4 rounded-lg bg-secondary/50 space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-lg">{formatUGX(Number(request.rent_amount))}</p>
                            <p className="text-sm text-muted-foreground">
                              {request.duration_days} days • Daily: {formatUGX(Number(request.total_repayment) / request.duration_days)}
                            </p>
                            {request.landlords && (
                              <p className="text-sm text-muted-foreground">
                                Landlord: {request.landlords.name} ({request.landlords.phone})
                              </p>
                            )}
                          </div>
                          <Badge className={getStatusColor(request.status)}>
                            {request.status}
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => handleApprove(request.id, request.agent_id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => handleReject(request.id)}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="funded">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Banknote className="h-5 w-5" />
                  Ready for Disbursement
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : fundedRequests.length === 0 ? (
                  <p className="text-muted-foreground">No funded requests awaiting disbursement</p>
                ) : (
                  <div className="space-y-4">
                    {fundedRequests.map((request) => (
                      <div 
                        key={request.id} 
                        className="p-4 rounded-lg bg-secondary/50 space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-lg">{formatUGX(Number(request.rent_amount))}</p>
                            <p className="text-sm text-muted-foreground">
                              {request.duration_days} days • Daily: {formatUGX(Number(request.total_repayment) / request.duration_days)}
                            </p>
                            {request.landlords && (
                              <p className="text-sm text-muted-foreground">
                                Landlord: {request.landlords.name} ({request.landlords.phone})
                              </p>
                            )}
                            <p className="text-xs text-success mt-1">
                              Funded by supporter • Ready to disburse to landlord
                            </p>
                          </div>
                          <Badge className={getStatusColor(request.status)}>
                            {request.status}
                          </Badge>
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() => handleDisburse(request)}
                          className="bg-success hover:bg-success/90"
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Disburse to Landlord
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">All Rent Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {requests.map((request) => (
                    <div 
                      key={request.id} 
                      className="flex items-center justify-between p-4 rounded-lg bg-secondary/50"
                    >
                      <div>
                        <p className="font-medium">{formatUGX(Number(request.rent_amount))}</p>
                        <p className="text-sm text-muted-foreground">
                          {request.duration_days} days • {new Date(request.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge className={getStatusColor(request.status)}>
                        {request.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Payment History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : transactions.length === 0 ? (
                  <p className="text-muted-foreground">No transactions recorded yet</p>
                ) : (
                  <div className="space-y-3">
                    {transactions.map((tx) => (
                      <div 
                        key={tx.id} 
                        className="flex items-center gap-4 p-4 rounded-lg bg-secondary/50"
                      >
                        <div className={`p-2 rounded-lg ${tx.direction === 'in' ? 'bg-success/10' : 'bg-destructive/10'}`}>
                          {tx.direction === 'in' ? (
                            <ArrowDownLeft className="h-4 w-4 text-success" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 text-destructive" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium capitalize">{tx.transaction_type.replace(/_/g, ' ')}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {tx.description || 'No description'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`font-mono font-semibold ${tx.direction === 'in' ? 'text-success' : 'text-destructive'}`}>
                            {tx.direction === 'in' ? '+' : '-'}{formatUGX(Number(tx.amount))}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {tx.direction === 'in' ? 'Inflow' : 'Outflow'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Platform Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {users.map((u) => (
                    <div 
                      key={u.id} 
                      className="flex items-center justify-between p-4 rounded-lg bg-secondary/50"
                    >
                      <div>
                        <p className="font-medium">{u.full_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {u.email} • {u.phone}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {u.user_roles.map((r, i) => (
                          <Badge key={i} className={getRoleBadge(r.role)}>
                            {r.role}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </div>
  );
}
