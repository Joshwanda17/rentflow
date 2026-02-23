import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Clock, CheckCircle2, XCircle, Wallet, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface DepositRequest {
  id: string;
  agent_id: string;
  amount: number;
  status: string;
  created_at: string;
  rejection_reason?: string;
  agent_name?: string;
  notes?: string;
}

export function UserDepositRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<DepositRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const fetchRequests = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('deposit_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (data && data.length > 0) {
        const agentIds = [...new Set(data.map(d => d.agent_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', agentIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

        const enrichedRequests = data.map(d => ({
          ...d,
          agent_name: profileMap.get(d.agent_id) || 'Agent',
        }));

        setRequests(enrichedRequests);
      } else {
        setRequests([]);
      }
    } catch (error) {
      console.error('Error fetching deposit requests:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    // Realtime removed — deposit_requests not in realtime whitelist
  }, [user]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span><Badge variant="default" className="bg-success/10 text-success border-success/20">Approved</Badge></span>;
      case 'rejected':
        return <span><Badge variant="destructive">Rejected</Badge></span>;
      default:
        return <span><Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Pending</Badge></span>;
    }
  };

  if (loading) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled
        className="w-full justify-between text-muted-foreground"
      >
        <span className="flex items-center gap-2">
          <Wallet className="h-4 w-4" />
          Loading deposit requests...
        </span>
      </Button>
    );
  }

  if (requests.length === 0) {
    return null;
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between hover:bg-muted/50"
        >
          <span className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Deposit Requests</span>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 text-xs">
                {pendingCount}
              </Badge>
            )}
          </span>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2">
          <CardContent className="p-3 space-y-2">
            <AnimatePresence mode="popLayout">
              {requests.map((request) => (
                <motion.div
                  key={request.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  className="p-3 rounded-lg border bg-card/50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(request.status)}
                      <div>
                        <p className="font-medium text-sm">
                          {formatCurrency(request.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          via {request.agent_name}
                        </p>
                        {request.notes && (
                          <p className="text-xs text-muted-foreground italic">
                            "{request.notes}"
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(request.status)}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(request.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {request.status === 'rejected' && request.rejection_reason && (
                    <p className="text-xs text-destructive mt-2 bg-destructive/10 p-2 rounded">
                      Reason: {request.rejection_reason}
                    </p>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}