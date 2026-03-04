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
import { WithdrawalStepTracker } from './WithdrawalStepTracker';

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
  manager_approved_at: string | null;
  cfo_approved_at: string | null;
  coo_approved_at: string | null;
}

export function UserWithdrawalRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

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
        .select('*, manager_approved_at, cfo_approved_at, coo_approved_at')
        .eq('user_id', user.id)
        .or(`status.neq.pending,created_at.gte.${twelveHoursAgo}`)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRequests((data as any[]) || []);
    } catch (error) {
      console.error('Error fetching withdrawal requests:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRequests();
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
      case 'manager_approved':
        return {
          icon: Clock,
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/30',
          label: 'CFO Review',
          pulse: true,
        };
      case 'cfo_approved':
        return {
          icon: Clock,
          color: 'text-purple-500',
          bgColor: 'bg-purple-500/10',
          borderColor: 'border-purple-500/30',
          label: 'COO Review',
          pulse: true,
        };
      case 'approved':
        return {
          icon: CheckCircle,
          color: 'text-emerald-500',
          bgColor: 'bg-emerald-500/10',
          borderColor: 'border-emerald-500/30',
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

  const pendingCount = requests.filter(r => ['pending', 'manager_approved', 'cfo_approved'].includes(r.status)).length;
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
                {pendingCount} in progress
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
            const isCardExpanded = expandedCardId === request.id;
            const showTracker = request.status !== 'rejected';

            return (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`rounded-xl border ${statusConfig.borderColor} ${
                  ['pending', 'manager_approved', 'cfo_approved'].includes(request.status)
                    ? 'bg-amber-500/5' 
                    : 'bg-muted/30'
                } cursor-pointer active:scale-[0.99] transition-transform`}
                onClick={() => setExpandedCardId(isCardExpanded ? null : request.id)}
              >
                <div className="p-3">
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
                    <div className="flex flex-col items-end gap-1">
                      <Badge 
                        variant="outline"
                        className={`text-xs gap-1 ${statusConfig.bgColor} ${statusConfig.color} ${statusConfig.borderColor} ${
                          statusConfig.pulse ? 'animate-pulse' : ''
                        }`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig.label}
                      </Badge>
                      {showTracker && (
                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isCardExpanded ? 'rotate-180' : ''}`} />
                      )}
                    </div>
                  </div>
                </div>
                
                {request.status === 'rejected' && request.rejection_reason && (
                  <div className="mx-3 mb-3 p-2 bg-destructive/10 rounded-lg">
                    <p className="text-xs text-destructive">
                      <strong>Reason:</strong> {request.rejection_reason}
                    </p>
                  </div>
                )}
                
                {request.status === 'approved' && request.processed_at && !isCardExpanded && (
                  <div className="mx-3 mb-3 p-2 bg-emerald-500/10 rounded-lg space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600">
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

                {/* Expandable Step Tracker */}
                <AnimatePresence>
                  {isCardExpanded && showTracker && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 pt-1 border-t border-border/50">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Approval Progress
                        </p>
                        <WithdrawalStepTracker
                          status={request.status}
                          createdAt={request.created_at}
                          managerApprovedAt={request.manager_approved_at}
                          cfoApprovedAt={request.cfo_approved_at}
                          cooApprovedAt={request.coo_approved_at}
                          processedAt={request.processed_at}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
