import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { 
  XCircle, 
  Phone,
  User,
  Loader2,
  Search,
  Calendar,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { hapticTap } from '@/lib/haptics';

interface RejectedPayout {
  id: string;
  agent_id: string;
  amount: number;
  mobile_money_number: string;
  mobile_money_provider: string;
  rejection_reason: string | null;
  processed_at: string;
  requested_at: string;
  agent_name?: string;
  agent_phone?: string;
}

export function RejectedPayoutsHistory() {
  const [payouts, setPayouts] = useState<RejectedPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayout, setSelectedPayout] = useState<RejectedPayout | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchRejectedPayouts();

    const channel = supabase
      .channel('rejected-payouts-history')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_commission_payouts'
        },
        () => fetchRejectedPayouts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchRejectedPayouts = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_commission_payouts')
        .select('*')
        .eq('status', 'rejected')
        .order('processed_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const payoutsWithAgents = await Promise.all(
        (data || []).map(async (payout) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, phone')
            .eq('id', payout.agent_id)
            .single();
          return {
            ...payout,
            agent_name: profile?.full_name,
            agent_phone: profile?.phone
          };
        })
      );

      setPayouts(payoutsWithAgents);
    } catch (error) {
      console.error('Error fetching rejected payouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPayouts = payouts.filter(payout => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      payout.agent_name?.toLowerCase().includes(query) ||
      payout.agent_phone?.includes(query) ||
      payout.mobile_money_number?.includes(query) ||
      payout.rejection_reason?.toLowerCase().includes(query)
    );
  });

  const totalRejected = payouts.reduce((sum, p) => sum + p.amount, 0);
  const displayPayouts = expanded ? filteredPayouts : filteredPayouts.slice(0, 5);

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (payouts.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Rejected Payouts
              <Badge variant="destructive" className="ml-2">{payouts.length}</Badge>
            </CardTitle>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total Rejected</p>
              <p className="font-bold text-destructive">{formatUGX(totalRejected)}</p>
            </div>
          </div>
          
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
        </CardHeader>
        
        <CardContent className="space-y-2">
          {displayPayouts.length === 0 ? (
            <p className="text-center text-muted-foreground py-4 text-sm">
              No matching records found
            </p>
          ) : (
            displayPayouts.map((payout) => (
              <button
                key={payout.id}
                type="button"
                onClick={() => {
                  hapticTap();
                  setSelectedPayout(payout);
                  setDetailsOpen(true);
                }}
                className="w-full p-3 rounded-xl bg-background border border-border/50 hover:border-destructive/50 transition-all text-left active:scale-[0.99]"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-destructive/10">
                    <User className="h-4 w-4 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{payout.agent_name || 'Agent'}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={`font-medium ${payout.mobile_money_provider === 'MTN' ? 'text-yellow-600' : 'text-red-600'}`}>
                        {payout.mobile_money_provider}
                      </span>
                      <span>{payout.mobile_money_number}</span>
                    </div>
                    {payout.rejection_reason && (
                      <p className="text-xs text-destructive mt-1 truncate">
                        Reason: {payout.rejection_reason}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-destructive">{formatUGX(payout.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(payout.processed_at), 'MMM d')}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}

          {filteredPayouts.length > 5 && (
            <Button
              variant="ghost"
              onClick={() => {
                hapticTap();
                setExpanded(!expanded);
              }}
              className="w-full h-10 text-muted-foreground hover:text-foreground"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Show All ({filteredPayouts.length - 5} more)
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Rejected Payout Details
            </DialogTitle>
          </DialogHeader>

          {selectedPayout && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-full bg-destructive/10">
                    <User className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">{selectedPayout.agent_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedPayout.agent_phone}</p>
                  </div>
                </div>
              </div>

              <div className="text-center py-3">
                <p className="text-3xl font-bold text-destructive">{formatUGX(selectedPayout.amount)}</p>
                <Badge variant="destructive" className="mt-2">
                  <XCircle className="h-3 w-3 mr-1" />
                  Rejected
                </Badge>
              </div>

              <div className="space-y-3">
                {selectedPayout.rejection_reason && (
                  <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-destructive">Rejection Reason</p>
                        <p className="text-sm mt-1">{selectedPayout.rejection_reason}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Mobile Money
                  </span>
                  <span className={`font-medium ${selectedPayout.mobile_money_provider === 'MTN' ? 'text-yellow-600' : 'text-red-600'}`}>
                    {selectedPayout.mobile_money_provider} {selectedPayout.mobile_money_number}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Requested
                  </span>
                  <span className="text-sm">{format(new Date(selectedPayout.requested_at), 'MMM d, yyyy h:mm a')}</span>
                </div>

                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    Rejected
                  </span>
                  <span className="text-sm font-medium text-destructive">
                    {format(new Date(selectedPayout.processed_at), 'MMM d, yyyy h:mm a')}
                  </span>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => setDetailsOpen(false)}
                className="w-full h-12"
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
