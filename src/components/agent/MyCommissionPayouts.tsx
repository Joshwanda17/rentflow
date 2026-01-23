import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { 
  Banknote, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ChevronDown, 
  ChevronUp,
  Phone,
  Receipt
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';

interface CommissionPayout {
  id: string;
  amount: number;
  mobile_money_number: string;
  mobile_money_provider: string;
  status: string;
  transaction_id: string | null;
  rejection_reason: string | null;
  requested_at: string;
  processed_at: string | null;
  processed_by: string | null;
  processor_name?: string;
}

export function MyCommissionPayouts() {
  const { user } = useAuth();
  const [payouts, setPayouts] = useState<CommissionPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (user) {
      fetchPayouts();
      
      // Subscribe to realtime updates
      const channel = supabase
        .channel('agent-payouts')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'agent_commission_payouts',
            filter: `agent_id=eq.${user.id}`
          },
          () => fetchPayouts()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.id]);

  const fetchPayouts = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('agent_commission_payouts')
        .select('*')
        .eq('agent_id', user.id)
        .order('requested_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Fetch processor names for approved payouts
      const payoutsWithNames = await Promise.all(
        (data || []).map(async (payout) => {
          if (payout.processed_by) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', payout.processed_by)
              .single();
            return { ...payout, processor_name: profile?.full_name };
          }
          return payout;
        })
      );

      setPayouts(payoutsWithNames);
    } catch (error) {
      console.error('Error fetching payouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-success/20 text-success border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  if (loading || payouts.length === 0) return null;

  const pendingCount = payouts.filter(p => p.status === 'pending').length;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <button
          onClick={() => {
            hapticTap();
            setExpanded(!expanded);
          }}
          className="w-full flex items-center justify-between"
        >
          <CardTitle className="text-base flex items-center gap-2">
            <Banknote className="h-4 w-4 text-success" />
            My Payout Requests
            {pendingCount > 0 && (
              <Badge variant="secondary" className="ml-2">{pendingCount} pending</Badge>
            )}
          </CardTitle>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </CardHeader>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="pt-2 space-y-3">
              {payouts.map((payout) => (
                <div
                  key={payout.id}
                  className="p-3 rounded-xl bg-muted/50 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-lg">{formatUGX(payout.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(payout.requested_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                    {getStatusBadge(payout.status)}
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    <span className={payout.mobile_money_provider === 'MTN' ? 'text-yellow-600' : 'text-red-600'}>
                      {payout.mobile_money_provider}
                    </span>
                    <span>{payout.mobile_money_number}</span>
                  </div>

                  {/* Show transaction ID for approved payouts */}
                  {payout.status === 'approved' && payout.transaction_id && (
                    <div className="p-2 rounded-lg bg-success/10 border border-success/20">
                      <div className="flex items-center gap-2 text-sm">
                        <Receipt className="h-4 w-4 text-success" />
                        <span className="font-mono font-semibold">{payout.transaction_id}</span>
                      </div>
                      {payout.processor_name && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Approved by {payout.processor_name} • {format(new Date(payout.processed_at!), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Show rejection reason */}
                  {payout.status === 'rejected' && payout.rejection_reason && (
                    <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                      <p className="text-xs text-destructive">{payout.rejection_reason}</p>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
