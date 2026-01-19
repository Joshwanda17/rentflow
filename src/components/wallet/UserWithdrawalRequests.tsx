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
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';

interface WithdrawalRequest {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  rejection_reason: string | null;
  processed_at: string | null;
}

export function UserWithdrawalRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);

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
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user.id)
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

    // Subscribe to real-time updates for this user
    if (user) {
      const channel = supabase
        .channel(`user_withdrawals_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'withdrawal_requests',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            fetchRequests();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, fetchRequests]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="outline" className="gap-1 bg-warning/10 text-warning border-warning/30">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case 'approved':
        return (
          <Badge variant="outline" className="gap-1 bg-success/10 text-success border-success/30">
            <CheckCircle className="h-3 w-3" />
            Approved
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="outline" className="gap-1 bg-destructive/10 text-destructive border-destructive/30">
            <XCircle className="h-3 w-3" />
            Rejected
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

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
            My Withdrawal Requests
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
        <AnimatePresence>
          {requests.map((request) => (
            <motion.div
              key={request.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-3 rounded-xl bg-muted/30 border border-border/50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-lg">{formatCurrency(request.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                  </p>
                </div>
                {getStatusBadge(request.status)}
              </div>
              
              {request.status === 'rejected' && request.rejection_reason && (
                <div className="mt-2 p-2 bg-destructive/10 rounded-lg">
                  <p className="text-xs text-destructive">
                    <strong>Reason:</strong> {request.rejection_reason}
                  </p>
                </div>
              )}
              
              {request.status === 'approved' && request.processed_at && (
                <p className="text-xs text-success mt-1">
                  Processed {formatDistanceToNow(new Date(request.processed_at), { addSuffix: true })}
                </p>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}