import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ArrowDownToLine, 
  Clock, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  Loader2,
  Smartphone,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { hapticSuccess } from '@/lib/haptics';

interface WithdrawalRequest {
  id: string;
  amount: number;
  status: string;
  mobile_money_number: string | null;
  mobile_money_provider: string | null;
  transaction_id: string | null;
  created_at: string;
  rejection_reason: string | null;
  processed_at: string | null;
}

export function UserWithdrawalRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const fetchRequests = useCallback(async () => {
    if (!user) return;

    try {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user.id)
        .or(`status.neq.pending,created_at.gte.${twelveHoursAgo}`)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching withdrawal requests:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRequests();
    // Auto-refresh every 60s so pending requests older than 12h disappear automatically
    const interval = setInterval(fetchRequests, 60_000);
    return () => clearInterval(interval);
  }, [user, fetchRequests]);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          color: 'text-amber-500',
          bgColor: 'bg-amber-500/10',
          borderColor: 'border-amber-500/30',
          label: 'Pending',
          pulse: true,
        };
      case 'approved':
        return {
          icon: CheckCircle,
          color: 'text-success',
          bgColor: 'bg-success/10',
          borderColor: 'border-success/30',
          label: 'Approved',
          pulse: false,
        };
      case 'rejected':
        return {
          icon: XCircle,
          color: 'text-destructive',
          bgColor: 'bg-destructive/10',
          borderColor: 'border-destructive/30',
          label: 'Rejected',
          pulse: false,
        };
      default:
        return {
          icon: Clock,
          color: 'text-muted-foreground',
          bgColor: 'bg-muted',
          borderColor: 'border-border',
          label: status,
          pulse: false,
        };
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const displayedRequests = expanded ? requests : requests.slice(0, 3);

  if (loading) {
    return (
      <Card className="mt-4">
        <CardContent className="p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-primary" />
            My Withdrawals
            {pendingCount > 0 && (
              <Badge variant="secondary" className="text-xs animate-pulse">
                {pendingCount} pending
              </Badge>
            )}
          </CardTitle>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            onClick={fetchRequests}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <AnimatePresence mode="popLayout">
          {displayedRequests.map((request, index) => {
            const statusConfig = getStatusConfig(request.status);
            const StatusIcon = statusConfig.icon;

            return (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`p-3 rounded-xl border ${statusConfig.borderColor} ${
                  request.status === 'pending' 
                    ? 'bg-amber-500/5' 
                    : 'bg-muted/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${statusConfig.bgColor}`}>
                      <StatusIcon className={`h-4 w-4 ${statusConfig.color}`} />
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-base">
                        {formatCurrency(request.amount)}
                      </p>
                      {request.mobile_money_number && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Smartphone className="h-3 w-3" />
                          <span className={`uppercase font-medium ${
                            request.mobile_money_provider === 'mtn' 
                              ? 'text-yellow-600' 
                              : 'text-red-500'
                          }`}>
                            {request.mobile_money_provider || 'MoMo'}
                          </span>
                          <span>•</span>
                          <span>{request.mobile_money_number}</span>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <Badge 
                    variant="outline"
                    className={`text-xs gap-1 ${statusConfig.bgColor} ${statusConfig.color} ${statusConfig.borderColor} ${
                      statusConfig.pulse ? 'animate-pulse' : ''
                    }`}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {statusConfig.label}
                  </Badge>
                </div>
                
                {request.status === 'rejected' && request.rejection_reason && (
                  <div className="mt-2 p-2 bg-destructive/10 rounded-lg">
                    <p className="text-xs text-destructive">
                      <strong>Reason:</strong> {request.rejection_reason}
                    </p>
                  </div>
                )}
                
                {request.status === 'approved' && request.processed_at && (
                  <div className="mt-2 p-2 bg-success/10 rounded-lg space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-success">
                      <CheckCircle className="h-3 w-3" />
                      <span>
                        Sent {format(new Date(request.processed_at), 'MMM d • h:mm a')}
                      </span>
                    </div>
                    {request.transaction_id && (
                      <p className="text-xs text-muted-foreground font-mono">
                        Txn ID: {request.transaction_id}
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {requests.length > 3 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-10 text-muted-foreground touch-manipulation"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-2" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-2" />
                Show {requests.length - 3} more
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
