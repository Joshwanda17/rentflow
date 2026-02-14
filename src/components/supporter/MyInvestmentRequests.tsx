import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatUGX } from '@/lib/rentCalculations';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  HandCoins,
  TrendingUp,
  ChevronRight,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { hapticTap } from '@/lib/haptics';

interface InvestmentRequest {
  id: string;
  amount: number;
  status: string;
  manager_notes: string | null;
  investment_account_id: string | null;
  created_at: string;
  processed_at: string | null;
}

export function MyInvestmentRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<InvestmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRequests = async () => {
    if (!user) return;
    
    try {
      // manager_investment_requests table removed - stub
      setRequests([]);
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    // Realtime removed — manager_investment_requests not in realtime whitelist
  }, [user]);

  const handleRefresh = () => {
    hapticTap();
    setRefreshing(true);
    fetchRequests();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-success/20 text-success border-0">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-destructive/20 text-destructive border-0">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="bg-primary/20 text-primary border-0">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      default:
        return (
          <Badge className="bg-warning/20 text-warning border-0">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const getStatusMessage = (request: InvestmentRequest) => {
    switch (request.status) {
      case 'completed':
        return 'Your investment account is ready! You\'ll start earning 15% monthly ROI.';
      case 'rejected':
        return request.manager_notes || 'Request could not be processed. Please contact support.';
      case 'processing':
        return 'A manager is setting up your investment account...';
      default:
        return 'Waiting for a manager to process your request.';
    }
  };

  // Calculate summary stats
  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const completedCount = requests.filter(r => r.status === 'completed').length;
  const totalInvested = requests
    .filter(r => r.status === 'completed')
    .reduce((sum, r) => sum + r.amount, 0);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (requests.length === 0) {
    return null; // Don't show anything if no requests
  }

  return (
    <Card className="border-0 bg-gradient-to-br from-primary/5 to-success/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-primary" />
            My Investment Requests
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8 w-8"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Stats */}
        {(pendingCount > 0 || completedCount > 0) && (
          <div className="grid grid-cols-2 gap-3">
            {pendingCount > 0 && (
              <div className="p-3 rounded-xl bg-warning/10 border border-warning/20">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-warning" />
                  <span className="text-xs text-muted-foreground">Pending</span>
                </div>
                <p className="text-xl font-bold text-foreground mt-1">{pendingCount}</p>
              </div>
            )}
            {completedCount > 0 && (
              <div className="p-3 rounded-xl bg-success/10 border border-success/20">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <span className="text-xs text-muted-foreground">Invested</span>
                </div>
                <p className="text-xl font-bold text-success mt-1">{formatUGX(totalInvested)}</p>
              </div>
            )}
          </div>
        )}

        {/* Requests List */}
        <div className="space-y-3">
          <AnimatePresence>
            {requests.slice(0, 5).map((request, index) => (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={`border overflow-hidden ${
                  request.status === 'completed' 
                    ? 'border-success/30 bg-success/5' 
                    : request.status === 'pending'
                      ? 'border-warning/30 bg-warning/5'
                      : request.status === 'rejected'
                        ? 'border-destructive/30 bg-destructive/5'
                        : ''
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xl font-black text-foreground">
                            {formatUGX(request.amount)}
                          </p>
                          {getStatusBadge(request.status)}
                        </div>
                        
                        <p className="text-sm text-muted-foreground">
                          {getStatusMessage(request)}
                        </p>
                        
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                        </p>
                      </div>

                      {request.status === 'completed' && (
                        <div className="shrink-0 text-right">
                          <p className="text-xs text-muted-foreground">Monthly ROI</p>
                          <p className="text-lg font-bold text-success">
                            +{formatUGX(request.amount * 0.15)}
                          </p>
                        </div>
                      )}
                    </div>

                    {request.status === 'completed' && request.investment_account_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          hapticTap();
                          window.location.href = '/investment-portfolio';
                        }}
                        className="w-full mt-3 h-10 text-primary"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        View My Account
                        <ChevronRight className="h-4 w-4 ml-auto" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {requests.length > 5 && (
          <p className="text-xs text-center text-muted-foreground">
            Showing 5 of {requests.length} requests
          </p>
        )}
      </CardContent>
    </Card>
  );
}
