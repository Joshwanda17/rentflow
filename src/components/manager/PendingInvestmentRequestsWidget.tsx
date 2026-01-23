import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { playSuccessSound } from '@/lib/notificationSound';
import { motion, AnimatePresence } from 'framer-motion';
import { HandCoins, ChevronRight, Sparkles, TrendingUp } from 'lucide-react';

interface PendingRequest {
  id: string;
  amount: number;
  supporter_name: string | null;
  status: string;
  created_at: string;
}

export function PendingInvestmentRequestsWidget() {
  const navigate = useNavigate();
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasNewRequest, setHasNewRequest] = useState(false);

  const fetchPendingRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('manager_investment_requests')
        .select('id, amount, supporter_name, status, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setPendingRequests(data || []);
    } catch (error) {
      console.error('Error fetching pending requests:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingRequests();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('pending-investment-requests-widget')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'manager_investment_requests',
        },
        (payload) => {
          // New request came in
          const newRequest = payload.new as PendingRequest;
          if (newRequest.status === 'pending') {
            setPendingRequests(prev => [newRequest, ...prev].slice(0, 5));
            setHasNewRequest(true);
            playSuccessSound();
            hapticSuccess();
            // Reset animation after 3 seconds
            setTimeout(() => setHasNewRequest(false), 3000);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'manager_investment_requests',
        },
        () => {
          // Refetch when any request is updated (completed/rejected)
          fetchPendingRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const totalPendingAmount = pendingRequests.reduce((sum, r) => sum + r.amount, 0);
  const pendingCount = pendingRequests.length;

  const handleClick = () => {
    hapticTap();
    navigate('/manager-access?tab=investments');
  };

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-4">
          <div className="h-16 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (pendingCount === 0) {
    return null; // Don't show widget if no pending requests
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <Card 
        className={`cursor-pointer transition-all hover:shadow-lg border-2 overflow-hidden ${
          hasNewRequest 
            ? 'border-success ring-2 ring-success/30 animate-pulse' 
            : 'border-warning/50 hover:border-warning'
        }`}
        onClick={handleClick}
      >
        {/* Animated top bar for new requests */}
        <AnimatePresence>
          {hasNewRequest && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 4 }}
              exit={{ height: 0 }}
              className="bg-gradient-to-r from-success via-primary to-success"
            />
          )}
        </AnimatePresence>

        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            {/* Left: Icon and Info */}
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${
                hasNewRequest 
                  ? 'bg-success/20' 
                  : 'bg-warning/20'
              }`}>
                <HandCoins className={`h-6 w-6 ${
                  hasNewRequest ? 'text-success' : 'text-warning'
                }`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-foreground">Investment Requests</p>
                  <Badge 
                    className={`${
                      hasNewRequest 
                        ? 'bg-success text-success-foreground animate-bounce' 
                        : 'bg-warning text-warning-foreground'
                    }`}
                  >
                    {pendingCount} pending
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatUGX(totalPendingAmount)} waiting to invest
                </p>
              </div>
            </div>

            {/* Right: Arrow */}
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Preview of latest requests */}
          {pendingRequests.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex items-center gap-2 flex-wrap">
                {pendingRequests.slice(0, 3).map((request, index) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Badge 
                      variant="outline" 
                      className="text-xs bg-background"
                    >
                      {request.supporter_name?.split(' ')[0] || 'Supporter'}: {formatUGX(request.amount)}
                    </Badge>
                  </motion.div>
                ))}
                {pendingRequests.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{pendingRequests.length - 3} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Estimated ROI */}
          <div className="mt-3 flex items-center gap-2 text-xs text-success">
            <TrendingUp className="h-3 w-3" />
            <span>Potential platform earnings: {formatUGX(totalPendingAmount * 0.15)}/mo</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
