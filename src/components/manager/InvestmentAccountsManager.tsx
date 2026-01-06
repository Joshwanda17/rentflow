import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { 
  CheckCircle, XCircle, Clock, Wallet, User, 
  Search, RefreshCw, TrendingUp, AlertCircle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface InvestmentAccountWithUser {
  id: string;
  user_id: string;
  name: string;
  color: string;
  balance: number;
  status: string;
  created_at: string;
  approved_at: string | null;
  rejection_reason: string | null;
  user_name?: string;
  user_email?: string;
  user_phone?: string;
}

export function InvestmentAccountsManager() {
  const [accounts, setAccounts] = useState<InvestmentAccountWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<InvestmentAccountWithUser | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    
    const { data: accountsData, error } = await supabase
      .from('investment_accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Fetch user profiles for each account
    const userIds = [...new Set((accountsData || []).map(a => a.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .in('id', userIds);

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    const enrichedAccounts = (accountsData || []).map(acc => ({
      ...acc,
      user_name: profileMap.get(acc.user_id)?.full_name || 'Unknown',
      user_email: profileMap.get(acc.user_id)?.email || '',
      user_phone: profileMap.get(acc.user_id)?.phone || '',
    }));

    setAccounts(enrichedAccounts);
    setLoading(false);
  };

  const handleApprove = async (account: InvestmentAccountWithUser) => {
    setProcessing(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('investment_accounts')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user?.id
      })
      .eq('id', account.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // Send notification to supporter
      await supabase.from('notifications').insert({
        user_id: account.user_id,
        title: '✅ Account Approved!',
        message: `Your investment account "${account.name}" has been approved. You can now start investing!`,
        type: 'success',
        metadata: { account_id: account.id }
      });

      toast({ title: 'Account Approved', description: `${account.name} has been approved` });
      fetchAccounts();
    }
    
    setProcessing(false);
  };

  const handleReject = async () => {
    if (!selectedAccount || !rejectReason.trim()) return;
    
    setProcessing(true);
    
    const { error } = await supabase
      .from('investment_accounts')
      .update({
        status: 'rejected',
        rejection_reason: rejectReason.trim()
      })
      .eq('id', selectedAccount.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // Send notification to supporter
      await supabase.from('notifications').insert({
        user_id: selectedAccount.user_id,
        title: '❌ Account Rejected',
        message: `Your investment account "${selectedAccount.name}" was rejected. Reason: ${rejectReason.trim()}`,
        type: 'warning',
        metadata: { account_id: selectedAccount.id, reason: rejectReason.trim() }
      });

      toast({ title: 'Account Rejected' });
      setRejectDialogOpen(false);
      setSelectedAccount(null);
      setRejectReason('');
      fetchAccounts();
    }
    
    setProcessing(false);
  };

  const openRejectDialog = (account: InvestmentAccountWithUser) => {
    setSelectedAccount(account);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const filteredAccounts = accounts.filter(acc => 
    acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    acc.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    acc.user_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingCount = accounts.filter(a => a.status === 'pending').length;
  const approvedCount = accounts.filter(a => a.status === 'approved').length;

  const colorBadgeClasses: Record<string, string> = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    pink: 'bg-pink-500',
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 mx-auto mb-2 text-warning" />
            <p className="text-2xl font-bold text-warning">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-5 w-5 mx-auto mb-2 text-success" />
            <p className="text-2xl font-bold text-success">{approvedCount}</p>
            <p className="text-xs text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold text-primary">{accounts.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Refresh */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search accounts or supporters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" size="icon" onClick={fetchAccounts} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Accounts List */}
      <div className="space-y-3">
        {filteredAccounts.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No investment accounts found</p>
          </Card>
        ) : (
          filteredAccounts.map((account) => (
            <Card 
              key={account.id} 
              className={`overflow-hidden ${
                account.status === 'pending' ? 'border-warning/50 bg-warning/5' : 
                account.status === 'rejected' ? 'border-destructive/30 bg-destructive/5' :
                'border-success/30 bg-success/5'
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-3 h-3 rounded-full mt-1.5 ${colorBadgeClasses[account.color] || 'bg-gray-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold">{account.name}</h4>
                        <Badge 
                          variant="outline" 
                          className={
                            account.status === 'pending' ? 'bg-warning/20 text-warning border-warning/30' :
                            account.status === 'rejected' ? 'bg-destructive/20 text-destructive border-destructive/30' :
                            'bg-success/20 text-success border-success/30'
                          }
                        >
                          {account.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                          {account.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                          {account.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                          {account.status.charAt(0).toUpperCase() + account.status.slice(1)}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span className="truncate">{account.user_name}</span>
                        <span className="hidden sm:inline">• {account.user_phone}</span>
                      </div>
                      
                      <p className="text-xs text-muted-foreground mt-1">
                        Created: {format(new Date(account.created_at), 'MMM d, yyyy')}
                      </p>
                      
                      {account.rejection_reason && (
                        <div className="mt-2 p-2 bg-destructive/10 rounded-lg flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                          <p className="text-xs text-destructive">{account.rejection_reason}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {account.status === 'pending' && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openRejectDialog(account)}
                        className="text-destructive hover:text-destructive"
                        disabled={processing}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(account)}
                        className="bg-success hover:bg-success/90"
                        disabled={processing}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Investment Account</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              You are rejecting <strong>{selectedAccount?.name}</strong> created by{' '}
              <strong>{selectedAccount?.user_name}</strong>
            </p>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason for rejection</label>
              <Textarea
                placeholder="Please provide a reason for rejecting this account..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject}
              disabled={!rejectReason.trim() || processing}
            >
              {processing ? 'Rejecting...' : 'Reject Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}