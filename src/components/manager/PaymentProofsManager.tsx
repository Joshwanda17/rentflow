import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  CheckCircle2, 
  XCircle, 
  Search, 
  Eye, 
  RefreshCw,
  Building,
  User,
  Phone,
  Calendar,
  CreditCard,
  Receipt,
  Wallet,
  TrendingUp,
  Loader2,
  ImageIcon,
  CheckCheck,
  Clock,
  AlertCircle
} from 'lucide-react';
import { formatUGX, calculateSupporterReward } from '@/lib/rentCalculations';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface PaymentProof {
  id: string;
  rent_request_id: string;
  landlord_id: string;
  supporter_id: string;
  amount: number;
  payment_method: string;
  transaction_id: string;
  proof_image_url: string | null;
  status: string | null;
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  reward_credited: boolean | null;
  reward_credited_at: string | null;
  payment_date: string;
  created_at: string;
  supporter?: {
    id: string;
    full_name: string;
    phone: string;
  };
  landlord?: {
    id: string;
    name: string;
    phone: string;
  };
  rent_request?: {
    id: string;
    tenant_id: string;
    tenant?: {
      full_name: string;
    };
  };
}

export default function PaymentProofsManager() {
  const { user } = useAuth();
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'verified' | 'rejected'>('all');
  const [selectedProof, setSelectedProof] = useState<PaymentProof | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchProofs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('landlord_payment_proofs')
        .select(`
          *,
          supporter:profiles!landlord_payment_proofs_supporter_id_fkey(id, full_name, phone),
          landlord:landlords!landlord_payment_proofs_landlord_id_fkey(id, name, phone),
          rent_request:rent_requests!landlord_payment_proofs_rent_request_id_fkey(
            id,
            tenant_id,
            tenant:profiles!rent_requests_tenant_id_fkey(full_name)
          )
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setProofs((data as unknown as PaymentProof[]) || []);
    } catch (error: any) {
      toast.error('Failed to fetch payment proofs');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProofs();
  }, [statusFilter]);

  const handleVerify = async (proof: PaymentProof) => {
    if (!user) return;
    setProcessing(true);

    try {
      const reward = calculateSupporterReward(proof.amount);
      const now = new Date();
      const nextRoiDueDate = new Date(now);
      nextRoiDueDate.setDate(nextRoiDueDate.getDate() + 30);

      // Update proof status and set next ROI due date
      const { error: updateError } = await supabase
        .from('landlord_payment_proofs')
        .update({
          status: 'verified',
          verified_at: now.toISOString(),
          verified_by: user.id,
          reward_credited: false, // Will be set true by cron job
          next_roi_due_date: nextRoiDueDate.toISOString(),
          total_roi_paid: 0,
          roi_payments_count: 0
        })
        .eq('id', proof.id);

      if (updateError) throw updateError;

      // Send success notification to supporter
      await supabase.from('notifications').insert({
        user_id: proof.supporter_id,
        title: '✅ Payment Verified!',
        message: `Your payment of ${formatUGX(proof.amount)} to the landlord has been verified. You'll start earning ${formatUGX(reward)} (15% ROI) monthly in 30 days.`,
        type: 'success',
        metadata: {
          payment_proof_id: proof.id,
          amount: proof.amount,
          monthly_reward: reward,
          first_roi_date: nextRoiDueDate.toISOString()
        }
      });

      toast.success('Payment verified - ROI will be credited in 30 days');
      fetchProofs();
      setDetailsOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to verify payment');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!user || !selectedProof || !rejectReason.trim()) return;
    setProcessing(true);

    try {
      // Update proof status
      const { error } = await supabase
        .from('landlord_payment_proofs')
        .update({
          status: 'rejected',
          rejection_reason: rejectReason,
          verified_at: new Date().toISOString(),
          verified_by: user.id
        })
        .eq('id', selectedProof.id);

      if (error) throw error;

      // Notify supporter
      await supabase.from('notifications').insert({
        user_id: selectedProof.supporter_id,
        title: '❌ Payment Proof Rejected',
        message: `Your payment proof was rejected: ${rejectReason}. Please resubmit with valid proof.`,
        type: 'warning',
        metadata: {
          payment_proof_id: selectedProof.id,
          rejection_reason: rejectReason
        }
      });

      toast.success('Payment proof rejected');
      setRejectDialogOpen(false);
      setRejectReason('');
      fetchProofs();
      setDetailsOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to reject payment');
    } finally {
      setProcessing(false);
    }
  };

  const filteredProofs = proofs.filter(proof => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      proof.supporter?.full_name?.toLowerCase().includes(searchLower) ||
      proof.landlord?.name?.toLowerCase().includes(searchLower) ||
      proof.transaction_id.toLowerCase().includes(searchLower)
    );
  });

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'verified':
        return <Badge className="bg-success/20 text-success border-0">Verified</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">Pending</Badge>;
    }
  };

  const getPaymentMethodBadge = (method: string) => {
    if (method === 'mtn') {
      return <Badge className="bg-yellow-500/20 text-yellow-600 border-0">MTN MoMo</Badge>;
    }
    return <Badge className="bg-red-500/20 text-red-600 border-0">Airtel Money</Badge>;
  };

  const stats = {
    pending: proofs.filter(p => p.status === 'pending' || !p.status).length,
    verified: proofs.filter(p => p.status === 'verified').length,
    rejected: proofs.filter(p => p.status === 'rejected').length,
    totalAmount: proofs.filter(p => p.status === 'verified').reduce((sum, p) => sum + p.amount, 0)
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Payment Proofs
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchProofs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          <div className="p-2 rounded-lg bg-warning/10 text-center">
            <p className="text-lg font-bold text-warning">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
          <div className="p-2 rounded-lg bg-success/10 text-center">
            <p className="text-lg font-bold text-success">{stats.verified}</p>
            <p className="text-xs text-muted-foreground">Verified</p>
          </div>
          <div className="p-2 rounded-lg bg-destructive/10 text-center">
            <p className="text-lg font-bold text-destructive">{stats.rejected}</p>
            <p className="text-xs text-muted-foreground">Rejected</p>
          </div>
          <div className="p-2 rounded-lg bg-primary/10 text-center">
            <p className="text-sm font-bold text-primary">{formatUGX(stats.totalAmount)}</p>
            <p className="text-xs text-muted-foreground">Verified</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or transaction ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1">
            {(['all', 'pending', 'verified', 'rejected'] as const).map(status => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className="capitalize"
              >
                {status}
              </Button>
            ))}
          </div>
        </div>

        {/* Proofs List */}
        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : filteredProofs.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground">No payment proofs found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProofs.map(proof => (
                <Card 
                  key={proof.id} 
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => {
                    setSelectedProof(proof);
                    setDetailsOpen(true);
                  }}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium truncate">{proof.supporter?.full_name || 'Unknown'}</p>
                          {getStatusBadge(proof.status)}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Building className="h-3 w-3" />
                          <span className="truncate">→ {proof.landlord?.name || 'Unknown'}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          {getPaymentMethodBadge(proof.payment_method)}
                          <span className="font-mono text-muted-foreground">{proof.transaction_id}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-primary">{formatUGX(proof.amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(proof.created_at), { addSuffix: true })}
                        </p>
                        {proof.status === 'pending' && (
                          <div className="flex gap-1 mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-success border-success/30 hover:bg-success/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleVerify(proof);
                              }}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProof(proof);
                                setRejectDialogOpen(true);
                              }}
                            >
                              <XCircle className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Proof Details</DialogTitle>
          </DialogHeader>
          
          {selectedProof && (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                {getStatusBadge(selectedProof.status)}
              </div>

              {/* Amount */}
              <Card className="border-0 bg-primary/5">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Amount Paid</p>
                  <p className="text-3xl font-black text-primary">{formatUGX(selectedProof.amount)}</p>
                  <div className="flex items-center justify-center gap-1 mt-2 text-success text-sm">
                    <TrendingUp className="h-4 w-4" />
                    <span>ROI: {formatUGX(calculateSupporterReward(selectedProof.amount))}/month</span>
                  </div>
                </CardContent>
              </Card>

              {/* Supporter Info */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Supporter</p>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{selectedProof.supporter?.full_name}</p>
                    <p className="text-xs text-muted-foreground">{selectedProof.supporter?.phone}</p>
                  </div>
                </div>
              </div>

              {/* Landlord Info */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Landlord</p>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{selectedProof.landlord?.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedProof.landlord?.phone}</p>
                  </div>
                </div>
              </div>

              {/* Payment Details */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Payment Method</p>
                  {getPaymentMethodBadge(selectedProof.payment_method)}
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Transaction ID</p>
                  <p className="font-mono font-medium">{selectedProof.transaction_id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Payment Date</p>
                  <p className="font-medium">{format(new Date(selectedProof.payment_date), 'MMM d, yyyy')}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Submitted</p>
                  <p className="font-medium">{format(new Date(selectedProof.created_at), 'MMM d, yyyy HH:mm')}</p>
                </div>
              </div>

              {/* Proof Image */}
              {selectedProof.proof_image_url && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Payment Screenshot</p>
                  <img
                    src={selectedProof.proof_image_url}
                    alt="Payment proof"
                    className="w-full h-40 object-cover rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setImagePreview(selectedProof.proof_image_url)}
                  />
                </div>
              )}

              {/* Rejection Reason */}
              {selectedProof.status === 'rejected' && selectedProof.rejection_reason && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <div className="flex items-center gap-2 text-destructive mb-1">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-medium text-sm">Rejection Reason</span>
                  </div>
                  <p className="text-sm">{selectedProof.rejection_reason}</p>
                </div>
              )}

              {/* ROI Credited Info */}
              {selectedProof.status === 'verified' && selectedProof.reward_credited && (
                <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                  <div className="flex items-center gap-2 text-success mb-1">
                    <CheckCheck className="h-4 w-4" />
                    <span className="font-medium text-sm">ROI Reward Scheduled</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatUGX(calculateSupporterReward(selectedProof.amount))} will be credited monthly starting 30 days from {format(new Date(selectedProof.payment_date), 'MMM d, yyyy')}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              {(selectedProof.status === 'pending' || !selectedProof.status) && (
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={() => setRejectDialogOpen(true)}
                    disabled={processing}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    className="flex-1 bg-success hover:bg-success/90"
                    onClick={() => handleVerify(selectedProof)}
                    disabled={processing}
                  >
                    {processing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Verify & Credit ROI
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!imagePreview} onOpenChange={() => setImagePreview(null)}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Payment proof full"
              className="w-full h-auto max-h-[80vh] object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Payment Proof</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for rejecting this payment proof. The supporter will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Enter rejection reason..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="min-h-[100px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectReason('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={!rejectReason.trim() || processing}
              className="bg-destructive hover:bg-destructive/90"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reject Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
