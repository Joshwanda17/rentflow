import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Home,
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  Hammer,
  CreditCard,
  Eye,
  Banknote,
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface Withdrawal {
  id: string;
  subscription_id: string;
  tenant_id: string;
  amount: number;
  purpose: string;
  purpose_details: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  disbursed_at: string | null;
  created_at: string;
  tenant?: {
    full_name: string;
    phone: string;
  };
  subscription?: {
    total_savings: number;
    months_enrolled: number;
  };
}

const purposeLabels: Record<string, { label: string; icon: typeof Home }> = {
  buying_land: { label: 'Buying Land', icon: MapPin },
  buying_home: { label: 'Buying Home', icon: Home },
  building_house: { label: 'Building House', icon: Hammer },
  mortgage_down_payment: { label: 'Mortgage Down Payment', icon: CreditCard },
  other_after_24_months: { label: 'Other (24+ months)', icon: Clock },
};

export function WelileHomesWithdrawalsManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  // Fetch withdrawals
  const { data: withdrawals = [], isLoading } = useQuery({
    queryKey: ['welile-homes-withdrawals-manager'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('welile_homes_withdrawals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch tenant profiles and subscriptions
      const tenantIds = [...new Set(data.map((w) => w.tenant_id))];
      const subscriptionIds = [...new Set(data.map((w) => w.subscription_id))];

      const [tenantProfiles, subscriptions] = await Promise.all([
        supabase.from('profiles').select('id, full_name, phone').in('id', tenantIds),
        supabase.from('welile_homes_subscriptions').select('id, total_savings, months_enrolled').in('id', subscriptionIds),
      ]);

      return data.map((w) => ({
        ...w,
        tenant: tenantProfiles.data?.find((p) => p.id === w.tenant_id),
        subscription: subscriptions.data?.find((s) => s.id === w.subscription_id),
      })) as Withdrawal[];
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (withdrawal: Withdrawal) => {
      const { error } = await supabase
        .from('welile_homes_withdrawals')
        .update({
          status: 'approved',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', withdrawal.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['welile-homes-withdrawals-manager'] });
      queryClient.invalidateQueries({ queryKey: ['welile-homes-subscriptions'] });
      toast.success('Withdrawal approved successfully');
      setSelectedWithdrawal(null);
    },
    onError: (error) => {
      toast.error('Failed to approve: ' + error.message);
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ withdrawal, reason }: { withdrawal: Withdrawal; reason: string }) => {
      const { error } = await supabase
        .from('welile_homes_withdrawals')
        .update({
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', withdrawal.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['welile-homes-withdrawals-manager'] });
      toast.success('Withdrawal rejected');
      setSelectedWithdrawal(null);
      setShowRejectDialog(false);
      setRejectionReason('');
    },
    onError: (error) => {
      toast.error('Failed to reject: ' + error.message);
    },
  });

  // Mark as disbursed mutation
  const disburseMutation = useMutation({
    mutationFn: async (withdrawal: Withdrawal) => {
      const { error } = await supabase
        .from('welile_homes_withdrawals')
        .update({
          status: 'disbursed',
          disbursed_at: new Date().toISOString(),
        })
        .eq('id', withdrawal.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['welile-homes-withdrawals-manager'] });
      toast.success('Marked as disbursed');
    },
    onError: (error) => {
      toast.error('Failed to update: ' + error.message);
    },
  });

  const filteredWithdrawals = withdrawals.filter((w) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      w.tenant?.full_name?.toLowerCase().includes(query) ||
      w.tenant?.phone?.toLowerCase().includes(query) ||
      w.purpose.toLowerCase().includes(query)
    );
  });

  const stats = {
    pending: withdrawals.filter((w) => w.status === 'pending').length,
    approved: withdrawals.filter((w) => w.status === 'approved').length,
    disbursed: withdrawals.filter((w) => w.status === 'disbursed').length,
    totalRequested: withdrawals.filter((w) => w.status === 'pending').reduce((sum, w) => sum + w.amount, 0),
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-700">Pending</Badge>;
      case 'approved':
        return <Badge className="bg-emerald-100 text-emerald-700">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'disbursed':
        return <Badge className="bg-blue-100 text-blue-700">Disbursed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPurposeIcon = (purpose: string) => {
    const PurposeIcon = purposeLabels[purpose]?.icon || Home;
    return <PurposeIcon className="h-4 w-4" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-lg font-bold">{stats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <div>
                <p className="text-xs text-muted-foreground">Approved</p>
                <p className="text-lg font-bold">{stats.approved}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xs text-muted-foreground">Disbursed</p>
                <p className="text-lg font-bold">{stats.disbursed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-purple-600" />
              <div>
                <p className="text-xs text-muted-foreground">Pending Amount</p>
                <p className="text-lg font-bold">{formatUGX(stats.totalRequested)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by tenant name or purpose..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Banknote className="h-5 w-5 text-purple-600" />
            Withdrawal Requests
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWithdrawals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No withdrawal requests found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredWithdrawals.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{w.tenant?.full_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{w.tenant?.phone}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{formatUGX(w.amount)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getPurposeIcon(w.purpose)}
                          <span className="text-sm">{purposeLabels[w.purpose]?.label || w.purpose}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(w.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(w.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setSelectedWithdrawal(w)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {w.status === 'pending' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                                onClick={() => approveMutation.mutate(w)}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => {
                                  setSelectedWithdrawal(w);
                                  setShowRejectDialog(true);
                                }}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {w.status === 'approved' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => disburseMutation.mutate(w)}
                              disabled={disburseMutation.isPending}
                            >
                              Mark Disbursed
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* View Details Dialog */}
      <Dialog open={!!selectedWithdrawal && !showRejectDialog} onOpenChange={() => setSelectedWithdrawal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Withdrawal Request Details</DialogTitle>
          </DialogHeader>
          {selectedWithdrawal && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Tenant</p>
                  <p className="font-medium">{selectedWithdrawal.tenant?.full_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{selectedWithdrawal.tenant?.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-medium text-lg">{formatUGX(selectedWithdrawal.amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Savings</p>
                  <p className="font-medium">{formatUGX(selectedWithdrawal.subscription?.total_savings || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Purpose</p>
                  <div className="flex items-center gap-2">
                    {getPurposeIcon(selectedWithdrawal.purpose)}
                    <span className="font-medium">{purposeLabels[selectedWithdrawal.purpose]?.label}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Months Enrolled</p>
                  <p className="font-medium">{selectedWithdrawal.subscription?.months_enrolled || 0} months</p>
                </div>
              </div>
              {selectedWithdrawal.purpose_details && (
                <div>
                  <p className="text-sm text-muted-foreground">Additional Details</p>
                  <p className="text-sm mt-1">{selectedWithdrawal.purpose_details}</p>
                </div>
              )}
              {selectedWithdrawal.rejection_reason && (
                <div className="p-3 bg-destructive/10 rounded-lg">
                  <p className="text-sm text-destructive font-medium">Rejection Reason</p>
                  <p className="text-sm mt-1">{selectedWithdrawal.rejection_reason}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                {getStatusBadge(selectedWithdrawal.status)}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedWithdrawal(null)}>
              Close
            </Button>
            {selectedWithdrawal?.status === 'pending' && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => setShowRejectDialog(true)}
                >
                  Reject
                </Button>
                <Button
                  onClick={() => approveMutation.mutate(selectedWithdrawal)}
                  disabled={approveMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {approveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Withdrawal Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Please provide a reason for rejection:
              </p>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter rejection reason..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedWithdrawal && rejectionReason) {
                  rejectMutation.mutate({ withdrawal: selectedWithdrawal, reason: rejectionReason });
                }
              }}
              disabled={!rejectionReason || rejectMutation.isPending}
            >
              {rejectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
