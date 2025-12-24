import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, Users, Coins, Link2, Copy, Check } from 'lucide-react';
import { formatUGX, AGENT_APPROVAL_BONUS } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';
import RoleSwitcher from '@/components/RoleSwitcher';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import AppBreadcrumb from '@/components/AppBreadcrumb';
import WelileLogo from '@/components/WelileLogo';

interface AgentDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

interface RentRequest {
  id: string;
  rent_amount: number;
  status: string;
  created_at: string;
}

export default function AgentDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: AgentDashboardProps) {
  const [rentRequests, setRentRequests] = useState<RentRequest[]>([]);
  const [transactions, setTransactions] = useState<{ amount: number; transaction_type: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const referralLink = `${window.location.origin}/auth?ref=${user.id}`;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const { data: requests } = await supabase
      .from('rent_requests')
      .select('id, rent_amount, status, created_at')
      .eq('agent_id', user.id)
      .order('created_at', { ascending: false });
    
    const { data: txns } = await supabase
      .from('platform_transactions')
      .select('amount, transaction_type')
      .eq('user_id', user.id)
      .in('transaction_type', ['agent_approval_bonus', 'agent_commission']);
    
    setRentRequests(requests || []);
    setTransactions(txns || []);
    setLoading(false);
  };

  const copyReferralLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast({
      title: 'Link Copied!',
      description: 'Share this link with potential tenants'
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const approvedCount = rentRequests.filter(r => r.status !== 'pending' && r.status !== 'rejected').length;
  const totalEarnings = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
  const approvalBonuses = transactions.filter(t => t.transaction_type === 'agent_approval_bonus').length * AGENT_APPROVAL_BONUS;
  const commissions = totalEarnings - approvalBonuses;

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

  return (
    <div className="min-h-screen bg-background">
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
          <div className="flex items-center gap-2">
            {addRoleComponent}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <AppBreadcrumb />
        {/* Referral Link */}
        <Card className="glass-card glow-primary">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Your Referral Link
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Share this link with tenants. You earn UGX 5,000 for each approved request + 5% of all repayments.
            </p>
            <div className="flex gap-2">
              <code className="flex-1 p-3 bg-secondary rounded-lg text-sm truncate">
                {referralLink}
              </code>
              <Button onClick={copyReferralLink} variant="outline">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tenants Registered</p>
                  <p className="text-xl font-mono font-semibold">{rentRequests.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-success/10">
                  <Check className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Approved Requests</p>
                  <p className="text-xl font-mono font-semibold">{approvedCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-warning/10">
                  <Coins className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Earnings</p>
                  <p className="text-xl font-mono font-semibold text-success">
                    {formatUGX(totalEarnings)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Earnings Breakdown */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Earnings Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-secondary/50">
                <p className="text-sm text-muted-foreground">Approval Bonuses</p>
                <p className="text-lg font-mono font-semibold">{formatUGX(approvalBonuses)}</p>
                <p className="text-xs text-muted-foreground">{approvedCount} × UGX 5,000</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/50">
                <p className="text-sm text-muted-foreground">Repayment Commissions</p>
                <p className="text-lg font-mono font-semibold">{formatUGX(commissions)}</p>
                <p className="text-xs text-muted-foreground">5% of tenant repayments</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Registered Tenants */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Registered Tenants</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : rentRequests.length === 0 ? (
              <p className="text-muted-foreground">
                No tenants registered yet. Share your referral link to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {rentRequests.map((request) => (
                  <div 
                    key={request.id} 
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary/50"
                  >
                    <div>
                      <p className="font-medium">{formatUGX(Number(request.rent_amount))}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(request.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className={getStatusColor(request.status)}>
                      {request.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
