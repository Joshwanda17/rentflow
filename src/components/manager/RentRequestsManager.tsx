import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import { 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2, 
  User,
  Building,
  Calendar,
  Banknote,
  AlertTriangle,
  Filter
} from 'lucide-react';
import { format, addDays, isBefore, startOfDay } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface RentRequest {
  id: string;
  rent_amount: number;
  total_repayment: number;
  access_fee: number;
  request_fee: number;
  duration_days: number;
  daily_repayment: number;
  status: string | null;
  created_at: string;
  disbursed_at: string | null;
  funded_at: string | null;
  tenant_id: string;
  landlord_id: string;
  approval_comment: string | null;
  rejected_reason: string | null;
  approved_by: string | null;
  tenant?: { full_name: string; phone: string };
  landlord?: { name: string; property_address: string };
  missedDays?: number;
  paidAmount?: number;
}

export function RentRequestsManager() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<RentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; requestId: string | null }>({ open: false, requestId: null });
  const [approveDialog, setApproveDialog] = useState<{ open: boolean; requestId: string | null }>({ open: false, requestId: null });
  const [rejectReason, setRejectReason] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  const [showDelinquentOnly, setShowDelinquentOnly] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    
    const { data: requestsData, error } = await supabase
      .from('rent_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Fetch tenant profiles
    const tenantIds = [...new Set((requestsData || []).map(r => r.tenant_id))];
    const { data: profiles } = tenantIds.length > 0
      ? await supabase.from('profiles').select('id, full_name, phone').in('id', tenantIds)
      : { data: [] };

    // Fetch landlords
    const landlordIds = [...new Set((requestsData || []).map(r => r.landlord_id))];
    const { data: landlords } = landlordIds.length > 0
      ? await supabase.from('landlords').select('id, name, property_address').in('id', landlordIds)
      : { data: [] };

    // Fetch all repayments to calculate missed days
    const requestIds = (requestsData || []).map(r => r.id);
    const { data: repayments } = requestIds.length > 0
      ? await supabase.from('repayments').select('*').in('rent_request_id', requestIds)
      : { data: [] };

    // Calculate missed days for each request
    const today = startOfDay(new Date());
    
    const requestsWithDetails = (requestsData || []).map(r => {
      const requestRepayments = (repayments || []).filter(p => p.rent_request_id === r.id);
      const paidAmount = requestRepayments.reduce((sum, p) => sum + p.amount, 0);
      
      let missedDays = 0;
      
      // Only calculate missed days for active requests (funded or disbursed)
      if (r.status === 'funded' || r.status === 'disbursed') {
        const startDate = startOfDay(new Date(r.disbursed_at || r.funded_at || r.created_at));
        
        // Group payments by date
        const paymentsByDate: Record<string, number> = {};
        requestRepayments.forEach(p => {
          const dateKey = format(new Date(p.payment_date), 'yyyy-MM-dd');
          paymentsByDate[dateKey] = (paymentsByDate[dateKey] || 0) + p.amount;
        });
        
        // Count missed days
        for (let day = 1; day <= r.duration_days; day++) {
          const date = addDays(startDate, day - 1);
          if (isBefore(date, today)) {
            const dateKey = format(date, 'yyyy-MM-dd');
            const paidForDay = paymentsByDate[dateKey] || 0;
            if (paidForDay < r.daily_repayment) {
              missedDays++;
            }
          }
        }
      }
      
      return {
        ...r,
        tenant: profiles?.find(p => p.id === r.tenant_id),
        landlord: landlords?.find(l => l.id === r.landlord_id),
        missedDays,
        paidAmount
      };
    });

    setRequests(requestsWithDetails);
    setLoading(false);
  };

  const handleApprove = async () => {
    if (!approveDialog.requestId) return;
    setProcessing(approveDialog.requestId);
    
    const { error } = await supabase.functions.invoke('approve-rent-request', {
      body: { 
        rent_request_id: approveDialog.requestId,
        approval_comment: approvalComment || null
      }
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Request Approved', description: 'Rent request has been approved for funding' });
      setApproveDialog({ open: false, requestId: null });
      setApprovalComment('');
      fetchRequests();
    }
    setProcessing(null);
  };

  const openApproveDialog = (requestId: string) => {
    setApproveDialog({ open: true, requestId });
    setApprovalComment('');
  };

  const handleReject = async () => {
    if (!rejectDialog.requestId) return;
    if (!rejectReason.trim()) {
      toast({ title: 'Error', description: 'Please provide a reason for rejection', variant: 'destructive' });
      return;
    }
    setProcessing(rejectDialog.requestId);

    const { error } = await supabase
      .from('rent_requests')
      .update({ 
        status: 'rejected',
        rejected_reason: rejectReason
      })
      .eq('id', rejectDialog.requestId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Request Rejected', description: 'Rent request has been rejected' });
      setRejectDialog({ open: false, requestId: null });
      setRejectReason('');
      fetchRequests();
    }
    setProcessing(null);
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1"><CheckCircle className="h-3 w-3" />Approved</Badge>;
      case 'funded':
        return <Badge variant="outline" className="bg-success/10 text-success border-success/30 gap-1"><Banknote className="h-3 w-3" />Funded</Badge>;
      case 'disbursed':
        return <Badge variant="outline" className="bg-chart-5/10 text-chart-5 border-chart-5/30 gap-1"><CheckCircle className="h-3 w-3" />Disbursed</Badge>;
      case 'completed':
        return <Badge className="bg-success text-success-foreground gap-1"><CheckCircle className="h-3 w-3" />Completed</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const delinquentRequests = requests.filter(r => (r.missedDays || 0) > 0);
  const activeRequests = requests.filter(r => r.status === 'funded' || r.status === 'disbursed');
  
  // Apply delinquent filter
  const filteredOtherRequests = showDelinquentOnly 
    ? requests.filter(r => r.status !== 'pending' && (r.missedDays || 0) > 0)
    : requests.filter(r => r.status !== 'pending');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-warning" />
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-xl font-bold text-warning">{pendingRequests.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-success" />
              <div>
                <p className="text-sm text-muted-foreground">Funded</p>
                <p className="text-xl font-bold text-success">{requests.filter(r => ['funded', 'disbursed', 'completed'].includes(r.status || '')).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Banknote className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Total Facilitated</p>
                <p className="text-lg font-bold text-primary">{formatUGX(requests.filter(r => ['funded', 'disbursed', 'completed'].includes(r.status || '')).reduce((sum, r) => sum + r.rent_amount, 0))}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all ${showDelinquentOnly ? 'ring-2 ring-destructive' : ''}`} onClick={() => setShowDelinquentOnly(!showDelinquentOnly)}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-sm text-muted-foreground">Delinquent</p>
                <p className="text-xl font-bold text-destructive">{delinquentRequests.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Total Requests</p>
                <p className="text-xl font-bold">{requests.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delinquent Filter Toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="delinquent-filter" className="text-sm font-medium cursor-pointer">
            Show only delinquent accounts (missed payments)
          </Label>
        </div>
        <Switch
          id="delinquent-filter"
          checked={showDelinquentOnly}
          onCheckedChange={setShowDelinquentOnly}
        />
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-warning" />
            Pending Requests ({pendingRequests.length})
          </h3>
          <div className="space-y-3">
            {pendingRequests.map((request) => (
              <Card key={request.id} className="border-warning/30">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold">{request.tenant?.full_name || 'Unknown Tenant'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Building className="h-3 w-3" />
                          <span>{request.landlord?.name || 'Unknown'} - {request.landlord?.property_address || 'N/A'}</span>
                        </div>
                      </div>
                      {getStatusBadge(request.status)}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <p className="text-muted-foreground text-xs">Rent Amount</p>
                        <p className="font-bold">{formatUGX(request.rent_amount)}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <p className="text-muted-foreground text-xs">Access Fee</p>
                        <p className="font-bold">{formatUGX(request.access_fee)}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <p className="text-muted-foreground text-xs">Registration Fee</p>
                        <p className="font-bold">{formatUGX(request.request_fee)}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <p className="text-muted-foreground text-xs">Duration</p>
                        <p className="font-bold">{request.duration_days} days</p>
                      </div>
                      <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                        <p className="text-muted-foreground text-xs">Total Repayment</p>
                        <p className="font-bold text-primary">{formatUGX(request.total_repayment)}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-success/10 border border-success/20">
                        <p className="text-muted-foreground text-xs">Daily Payment</p>
                        <p className="font-bold text-success">{formatUGX(request.daily_repayment)}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="default"
                          variant="outline"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setRejectDialog({ open: true, requestId: request.id });
                          }}
                          disabled={processing === request.id}
                          className="text-destructive border-destructive/30 hover:bg-destructive/10 min-h-[44px] touch-manipulation"
                          type="button"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                        <Button
                          size="default"
                          variant="success"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openApproveDialog(request.id);
                          }}
                          disabled={processing === request.id}
                          className="min-h-[44px] touch-manipulation"
                          type="button"
                        >
                          {processing === request.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-1" />
                          )}
                          Approve
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Other Requests */}
      <div className="space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          {showDelinquentOnly ? (
            <>
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Delinquent Accounts ({filteredOtherRequests.length})
            </>
          ) : (
            <>All Requests ({filteredOtherRequests.length})</>
          )}
        </h3>
        <div className="space-y-3">
          {filteredOtherRequests.map((request) => (
            <Card key={request.id} className={request.missedDays && request.missedDays > 0 ? 'border-destructive/30' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{request.tenant?.full_name || 'Unknown'}</span>
                      {getStatusBadge(request.status)}
                      {request.missedDays && request.missedDays > 0 && (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {request.missedDays} missed
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{formatUGX(request.rent_amount)}</span>
                      <span>{request.duration_days} days</span>
                      <span>{format(new Date(request.created_at), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredOtherRequests.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              {showDelinquentOnly ? 'No delinquent accounts found' : 'No processed requests yet'}
            </p>
          )}
        </div>
      </div>

      {/* Approve Dialog */}
      <Dialog open={approveDialog.open} onOpenChange={(open) => setApproveDialog({ open, requestId: open ? approveDialog.requestId : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Request</DialogTitle>
            <DialogDescription>
              Add an optional comment for this approval.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Comment (optional)"
            value={approvalComment}
            onChange={(e) => setApprovalComment(e.target.value)}
          />
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setApproveDialog({ open: false, requestId: null })}
              className="min-h-[44px]"
              type="button"
            >
              Cancel
            </Button>
            <Button 
              variant="success"
              onClick={(e) => {
                e.preventDefault();
                handleApprove();
              }} 
              disabled={processing !== null}
              className="min-h-[44px]"
              type="button"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
              Approve Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog({ open, requestId: open ? rejectDialog.requestId : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejection.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection (required)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setRejectDialog({ open: false, requestId: null })}
              className="min-h-[44px]"
              type="button"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={(e) => {
                e.preventDefault();
                handleReject();
              }} 
              disabled={processing !== null || !rejectReason.trim()}
              className="min-h-[44px]"
              type="button"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
