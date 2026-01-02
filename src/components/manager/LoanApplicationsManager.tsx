import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FileText, Check, X, User, Banknote, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface LoanApplication {
  id: string;
  applicant_id: string;
  agent_id: string;
  amount: number;
  interest_rate: number;
  duration_days: number;
  total_repayment: number;
  purpose: string | null;
  status: string;
  created_at: string;
  applicant_name?: string;
  agent_name?: string;
  product_title?: string;
}

export function LoanApplicationsManager() {
  const [applications, setApplications] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [rejectReason, setRejectReason] = useState('');

  const fetchApplications = async () => {
    try {
      const { data, error } = await supabase
        .from('loan_applications')
        .select('*, loan_products(title)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch profile names
      const userIds = [...new Set((data || []).flatMap((a) => [a.applicant_id, a.agent_id]))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) || []);

      setApplications(
        (data || []).map((a) => ({
          ...a,
          applicant_name: profileMap.get(a.applicant_id) || 'Unknown',
          agent_name: profileMap.get(a.agent_id) || 'Unknown',
          product_title: a.loan_products?.title || 'Unknown Product',
        }))
      );
    } catch (error) {
      console.error('Error fetching applications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  const handleAction = async (applicationId: string, action: 'approve' | 'reject') => {
    setProcessing(applicationId);
    try {
      const { data, error } = await supabase.functions.invoke('approve-loan-application', {
        body: {
          applicationId,
          action,
          rejectedReason: action === 'reject' ? rejectReason : undefined,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(action === 'approve' ? 'Loan approved and disbursed!' : 'Application rejected');
      setRejectDialog({ open: false, id: null });
      setRejectReason('');
      fetchApplications();
    } catch (error: any) {
      console.error('Action error:', error);
      toast.error(error.message || `Failed to ${action} application`);
    } finally {
      setProcessing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Loan Applications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const pendingApplications = applications.filter((a) => a.status === 'pending');
  const processedApplications = applications.filter((a) => a.status !== 'pending');

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Loan Applications
            {pendingApplications.length > 0 && (
              <Badge variant="destructive">{pendingApplications.length} pending</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {pendingApplications.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Pending Approval</h3>
              {pendingApplications.map((app) => (
                <div key={app.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{app.product_title}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Applicant: {app.applicant_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Lender: {app.agent_name}
                      </p>
                    </div>
                    {getStatusBadge(app.status)}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-muted-foreground" />
                      <span>UGX {app.amount.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Interest:</span> {app.interest_rate}%
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{app.duration_days} days</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total:</span> UGX {app.total_repayment.toLocaleString()}
                    </div>
                  </div>

                  {app.purpose && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Purpose:</span> {app.purpose}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Applied: {format(new Date(app.created_at), 'PPp')}
                  </p>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleAction(app.id, 'approve')}
                      disabled={processing === app.id}
                      className="flex-1"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      {processing === app.id ? 'Processing...' : 'Approve & Disburse'}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setRejectDialog({ open: true, id: app.id })}
                      disabled={processing === app.id}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {processedApplications.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Processed Applications</h3>
              {processedApplications.slice(0, 10).map((app) => (
                <div key={app.id} className="border rounded-lg p-4 opacity-75">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{app.product_title}</p>
                      <p className="text-sm text-muted-foreground">
                        {app.applicant_name} • UGX {app.amount.toLocaleString()}
                      </p>
                    </div>
                    {getStatusBadge(app.status)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {applications.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No loan applications yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog({ open, id: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for rejection</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Provide a reason for rejection..."
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setRejectDialog({ open: false, id: null })}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => rejectDialog.id && handleAction(rejectDialog.id, 'reject')}
                disabled={processing !== null}
                className="flex-1"
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
