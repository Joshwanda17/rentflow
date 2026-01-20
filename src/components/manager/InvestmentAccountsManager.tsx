import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { useConfetti } from '@/components/Confetti';
import { 
  CheckCircle, XCircle, Clock, Wallet, User, 
  Search, RefreshCw, TrendingUp, AlertCircle, Sparkles, Loader2, Edit2, Plus,
  MessageCircle, Copy, History
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CreateInvestmentAccountDialog } from './CreateInvestmentAccountDialog';
import { InvestmentEditHistoryDialog } from './InvestmentEditHistoryDialog';

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

const colorOptions = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'green', label: 'Green', class: 'bg-green-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-500' },
];

const APP_URL = 'https://welile2.lovable.app';

export function InvestmentAccountsManager() {
  const [accounts, setAccounts] = useState<InvestmentAccountWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<InvestmentAccountWithUser | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processingInterest, setProcessingInterest] = useState(false);
  const { toast } = useToast();
  const { fireSuccess } = useConfetti();

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

  const openEditDialog = (account: InvestmentAccountWithUser) => {
    setSelectedAccount(account);
    setEditName(account.name);
    setEditColor(account.color);
    setEditDialogOpen(true);
  };

  const handleApproveWithEdit = async () => {
    if (!selectedAccount) return;
    
    setProcessing(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    const oldValues = {
      name: selectedAccount.name,
      color: selectedAccount.color,
      status: selectedAccount.status
    };
    
    const newValues = {
      name: editName.trim() || selectedAccount.name,
      color: editColor || selectedAccount.color,
      status: 'approved'
    };
    
    // Update account with edited values and approve
    const { error } = await supabase
      .from('investment_accounts')
      .update({
        name: newValues.name,
        color: newValues.color,
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user?.id
      })
      .eq('id', selectedAccount.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // Log to audit_logs with manager info
      await supabase.from('audit_logs').insert({
        record_id: selectedAccount.id,
        table_name: 'investment_accounts',
        action_type: 'approve',
        performed_by: user?.id,
        old_values: oldValues,
        new_values: newValues,
        reason: 'Account approved with edits'
      });

      // Send notification to supporter
      await supabase.from('notifications').insert({
        user_id: selectedAccount.user_id,
        title: '✅ Account Approved!',
        message: `Your investment account "${newValues.name}" has been approved. You can now start investing!`,
        type: 'success',
        metadata: { account_id: selectedAccount.id }
      });

      // 🎉 Fire confetti celebration!
      fireSuccess();

      toast({ title: '🎉 Account Approved!', description: `${newValues.name} has been approved` });
      setEditDialogOpen(false);
      setSelectedAccount(null);
      fetchAccounts();
    }
    
    setProcessing(false);
  };

  const handleQuickApprove = async (account: InvestmentAccountWithUser) => {
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
      // Log to audit_logs
      await supabase.from('audit_logs').insert({
        record_id: account.id,
        table_name: 'investment_accounts',
        action_type: 'approve',
        performed_by: user?.id,
        old_values: { status: account.status },
        new_values: { status: 'approved' },
        reason: 'Quick approval'
      });

      // Send notification to supporter
      await supabase.from('notifications').insert({
        user_id: account.user_id,
        title: '✅ Account Approved!',
        message: `Your investment account "${account.name}" has been approved. You can now start investing!`,
        type: 'success',
        metadata: { account_id: account.id }
      });

      // 🎉 Fire confetti celebration!
      fireSuccess();

      toast({ title: '🎉 Account Approved!', description: `${account.name} has been approved` });
      fetchAccounts();
    }
    
    setProcessing(false);
  };

  const handleReject = async () => {
    if (!selectedAccount || !rejectReason.trim()) return;
    
    setProcessing(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    
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
      // Log to audit_logs
      await supabase.from('audit_logs').insert({
        record_id: selectedAccount.id,
        table_name: 'investment_accounts',
        action_type: 'reject',
        performed_by: user?.id,
        old_values: { status: selectedAccount.status },
        new_values: { status: 'rejected', rejection_reason: rejectReason.trim() },
        reason: rejectReason.trim()
      });

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

  const openHistoryDialog = (account: InvestmentAccountWithUser) => {
    setSelectedAccount(account);
    setHistoryDialogOpen(true);
  };

  const handleProcessInterest = async () => {
    setProcessingInterest(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-investment-interest');
      
      if (error) {
        toast({ 
          title: 'Error', 
          description: error.message, 
          variant: 'destructive' 
        });
        return;
      }

      toast({ 
        title: '💰 Interest Processed!', 
        description: `${data.processed} accounts received interest. ${data.skipped} already paid this month.` 
      });
    } catch (err) {
      toast({ 
        title: 'Error', 
        description: 'Failed to process interest', 
        variant: 'destructive' 
      });
    } finally {
      setProcessingInterest(false);
    }
  };

  const generateActivationLink = (accountId: string) => {
    return `${APP_URL}/dashboard?activate_account=${accountId}`;
  };

  const handleShareWhatsApp = (account: InvestmentAccountWithUser) => {
    const activationLink = generateActivationLink(account.id);
    const message = `🎉 *Welile Investment Account Created!*\n\nHello ${account.user_name},\n\nYour investment account "${account.name}" has been created!\n\n👉 Click here to activate: ${activationLink}\n\nStart investing and earn 15% monthly interest! 💰`;
    
    let phone = (account.user_phone || '').replace(/\D/g, '');
    if (phone.startsWith('0')) {
      phone = '256' + phone.slice(1);
    } else if (!phone.startsWith('256')) {
      phone = '256' + phone;
    }
    
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleCopyActivationLink = async (account: InvestmentAccountWithUser) => {
    const activationLink = generateActivationLink(account.id);
    try {
      await navigator.clipboard.writeText(activationLink);
      toast({ title: '✅ Link Copied!', description: 'Activation link copied to clipboard' });
    } catch {
      toast({ title: 'Copy failed', description: 'Please copy the link manually', variant: 'destructive' });
    }
  };

  const openShareDialog = (account: InvestmentAccountWithUser) => {
    setSelectedAccount(account);
    setShareDialogOpen(true);
  };

  const filteredAccounts = accounts.filter(acc => 
    acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    acc.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    acc.user_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingCount = accounts.filter(a => a.status === 'pending' || a.status === 'pending_activation').length;
  const approvedCount = accounts.filter(a => a.status === 'approved').length;
  const totalBalance = accounts
    .filter(a => a.status === 'approved')
    .reduce((sum, a) => sum + Number(a.balance), 0);

  const colorBadgeClasses: Record<string, string> = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    pink: 'bg-pink-500',
  };

  return (
    <div className="space-y-4">
      {/* Process Interest Button */}
      <Card className="border-success/30 bg-gradient-to-r from-success/10 to-emerald-500/10">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-success/20">
                <Sparkles className="h-5 w-5 text-success" />
              </div>
              <div>
                <h4 className="font-bold">Monthly Interest (15%)</h4>
                <p className="text-xs text-muted-foreground">
                  Credit interest to all approved accounts • Total: {formatUGX(totalBalance)}
                </p>
              </div>
            </div>
            <Button 
              onClick={handleProcessInterest}
              disabled={processingInterest || approvedCount === 0}
              className="bg-success hover:bg-success/90 gap-2"
            >
              {processingInterest ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4" />
                  Process Interest
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

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
            <Wallet className="h-5 w-5 mx-auto mb-2 text-primary" />
            <p className="text-lg font-bold text-primary">{formatUGX(totalBalance)}</p>
            <p className="text-xs text-muted-foreground">Total Balance</p>
          </CardContent>
        </Card>
      </div>

      {/* Search, Create & Refresh */}
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
        <Button 
          onClick={() => setCreateDialogOpen(true)} 
          className="gap-1.5 shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Create</span>
        </Button>
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
                account.status === 'pending' || account.status === 'pending_activation' ? 'border-warning/50 bg-warning/5' : 
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
                            account.status === 'pending' || account.status === 'pending_activation' ? 'bg-warning/20 text-warning border-warning/30' :
                            account.status === 'rejected' ? 'bg-destructive/20 text-destructive border-destructive/30' :
                            'bg-success/20 text-success border-success/30'
                          }
                        >
                          {(account.status === 'pending' || account.status === 'pending_activation') && <Clock className="h-3 w-3 mr-1" />}
                          {account.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                          {account.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                          {account.status === 'pending_activation' ? 'Awaiting Activation' : 
                           account.status.charAt(0).toUpperCase() + account.status.slice(1)}
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
                  
                  {/* Share buttons for pending_activation accounts */}
                  {account.status === 'pending_activation' && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyActivationLink(account)}
                        className="gap-1"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleShareWhatsApp(account)}
                        className="bg-[#25D366] hover:bg-[#128C7E] text-white gap-1"
                      >
                        <MessageCircle className="h-4 w-4" />
                        <span className="hidden sm:inline">Share</span>
                      </Button>
                    </div>
                  )}
                  
                  {account.status === 'pending' && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openHistoryDialog(account)}
                        title="View edit history"
                      >
                        <History className="h-4 w-4" />
                      </Button>
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
                        variant="outline"
                        onClick={() => openEditDialog(account)}
                        disabled={processing}
                      >
                        <Edit2 className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleQuickApprove(account)}
                        className="bg-success hover:bg-success/90"
                        disabled={processing}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  )}

                  {/* History button for approved accounts */}
                  {account.status === 'approved' && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openHistoryDialog(account)}
                        title="View edit history"
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit & Approve Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5" />
              Edit & Approve Account
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Edit the account details before approving for{' '}
              <strong>{selectedAccount?.user_name}</strong>
            </p>
            
            <div className="space-y-2">
              <Label htmlFor="edit-name">Account Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Investment account name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-color">Account Color</Label>
              <Select value={editColor} onValueChange={setEditColor}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a color" />
                </SelectTrigger>
                <SelectContent>
                  {colorOptions.map((color) => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${color.class}`} />
                        {color.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleApproveWithEdit}
              disabled={processing}
              className="bg-success hover:bg-success/90 gap-2"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Save & Approve
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Create Investment Account Dialog */}
      <CreateInvestmentAccountDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={fetchAccounts}
      />

      {/* Edit History Dialog */}
      <InvestmentEditHistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        accountId={selectedAccount?.id || null}
        accountName={selectedAccount?.name || ''}
      />
    </div>
  );
}
