import { useState } from 'react';
import { format, addDays } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Check, X, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
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

interface ScheduleItem {
  id: string;
  payment_number: number;
  due_date: string;
  amount: number;
  status: string;
}

interface RepaymentScheduleViewProps {
  rentRequestId: string;
  schedule: ScheduleItem[];
  scheduleStatus: string;
  totalAmount: number;
  numberOfPayments: number;
  canAcceptReject?: boolean;
  onStatusChange?: () => void;
}

export default function RepaymentScheduleView({
  rentRequestId,
  schedule,
  scheduleStatus,
  totalAmount,
  numberOfPayments,
  canAcceptReject = false,
  onStatusChange,
}: RepaymentScheduleViewProps) {
  const [loading, setLoading] = useState(false);
  const [showAcceptDialog, setShowAcceptDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const { toast } = useToast();

  const handleAccept = async () => {
    setLoading(true);
    const { error } = await supabase
      .from('rent_requests')
      .update({ schedule_status: 'accepted' })
      .eq('id', rentRequestId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Schedule Accepted', description: 'You have accepted the repayment schedule.' });
      onStatusChange?.();
    }
    setLoading(false);
    setShowAcceptDialog(false);
  };

  const handleReject = async () => {
    setLoading(true);
    const { error } = await supabase
      .from('rent_requests')
      .update({ schedule_status: 'rejected' })
      .eq('id', rentRequestId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Schedule Rejected', description: 'You have rejected the repayment schedule.' });
      onStatusChange?.();
    }
    setLoading(false);
    setShowRejectDialog(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500/20 text-green-600 border-green-500/30"><Check className="h-3 w-3 mr-1" /> Paid</Badge>;
      case 'missed':
        return <Badge className="bg-red-500/20 text-red-600 border-red-500/30"><X className="h-3 w-3 mr-1" /> Missed</Badge>;
      case 'pending':
      default:
        return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
    }
  };

  const getScheduleStatusBadge = () => {
    switch (scheduleStatus) {
      case 'accepted':
        return <Badge className="bg-green-500/20 text-green-600 border-green-500/30">Accepted</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/20 text-red-600 border-red-500/30">Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">Pending Acceptance</Badge>;
    }
  };

  return (
    <>
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5 text-primary" />
              Repayment Schedule
            </CardTitle>
            {getScheduleStatusBadge()}
          </div>
          <CardDescription>
            {numberOfPayments} payment{numberOfPayments > 1 ? 's' : ''} totaling {formatUGX(totalAmount)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Schedule Items */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {schedule.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                    {item.payment_number}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{format(new Date(item.due_date), 'MMM d, yyyy')}</p>
                    <p className="text-xs text-muted-foreground">Payment #{item.payment_number}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono font-medium text-sm">{formatUGX(item.amount)}</p>
                  {getStatusBadge(item.status)}
                </div>
              </div>
            ))}
          </div>

          {/* Accept/Reject Buttons for Tenant */}
          {canAcceptReject && scheduleStatus === 'pending_acceptance' && (
            <div className="flex gap-3 pt-3 border-t border-border">
              <Button
                variant="outline"
                className="flex-1 border-red-500/50 text-red-600 hover:bg-red-500/10"
                onClick={() => setShowRejectDialog(true)}
                disabled={loading}
              >
                <X className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button
                className="flex-1"
                onClick={() => setShowAcceptDialog(true)}
                disabled={loading}
              >
                <Check className="h-4 w-4 mr-2" />
                Accept Schedule
              </Button>
            </div>
          )}

          {scheduleStatus === 'pending_acceptance' && !canAcceptReject && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-700">
              <AlertCircle className="h-4 w-4" />
              <p className="text-sm">Awaiting tenant acceptance</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Accept Confirmation Dialog */}
      <AlertDialog open={showAcceptDialog} onOpenChange={setShowAcceptDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept Repayment Schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              By accepting, you agree to make {numberOfPayments} payment{numberOfPayments > 1 ? 's' : ''} as scheduled.
              Total amount: {formatUGX(totalAmount)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAccept} disabled={loading}>
              {loading ? 'Processing...' : 'Accept'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Confirmation Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Repayment Schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject this schedule? You may need to discuss alternative terms.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleReject} 
              disabled={loading}
              className="bg-red-600 hover:bg-red-700"
            >
              {loading ? 'Processing...' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
