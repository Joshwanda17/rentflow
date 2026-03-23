import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, XCircle, Loader2, Home, Banknote } from 'lucide-react';

interface BonusApproval {
  id: string;
  listing_id: string;
  agent_id: string;
  amount: number;
  status: string;
  landlord_ops_approved_by: string | null;
  landlord_ops_approved_at: string | null;
  landlord_ops_notes: string | null;
  cfo_approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  // joined
  agent_name?: string;
  listing_title?: string;
}

interface Props {
  /** 'pending_cfo' for CFO dashboard, 'all' for landlord ops */
  filter?: 'pending_cfo' | 'all';
}

export function ListingBonusApprovalQueue({ filter = 'pending_cfo' }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});

  const { data: approvals, isLoading } = useQuery({
    queryKey: ['listing-bonus-approvals', filter],
    queryFn: async () => {
      let query = supabase
        .from('listing_bonus_approvals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filter === 'pending_cfo') {
        query = query.eq('status', 'pending_cfo');
      }

      const { data } = await query;
      if (!data?.length) return [];

      const agentIds = [...new Set(data.map(d => d.agent_id))];
      const listingIds = [...new Set(data.map(d => d.listing_id))];

      const [agentsRes, listingsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name').in('id', agentIds),
        supabase.from('house_listings').select('id, title').in('id', listingIds),
      ]);

      const agentMap = new Map((agentsRes.data || []).map(p => [p.id, p.full_name]));
      const listingMap = new Map((listingsRes.data || []).map(l => [l.id, l.title]));

      return data.map(d => ({
        ...d,
        agent_name: agentMap.get(d.agent_id) || 'Unknown',
        listing_title: listingMap.get(d.listing_id) || 'Unknown',
      })) as BonusApproval[];
    },
    staleTime: 15000,
  });

  const handleAction = async (approvalId: string, action: 'approve' | 'reject') => {
    setProcessingId(approvalId);
    try {
      const { error } = await supabase.functions.invoke('approve-listing-bonus', {
        body: {
          approval_id: approvalId,
          action,
          notes: action === 'reject' ? (rejectNotes[approvalId] || 'Rejected') : 'Approved',
        },
      });

      if (error) throw error;

      toast({
        title: action === 'approve' ? '✅ Bonus Approved & Paid' : '❌ Bonus Rejected',
        description: action === 'approve'
          ? 'UGX 5,000 credited to agent wallet as platform expense'
          : 'Agent has been notified',
      });
      queryClient.invalidateQueries({ queryKey: ['listing-bonus-approvals'] });
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const pending = (approvals || []).filter(a => a.status === 'pending_cfo');
  const processed = (approvals || []).filter(a => a.status !== 'pending_cfo');

  if (isLoading) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }

  if (filter === 'pending_cfo' && pending.length === 0) {
    return null; // Don't show if nothing pending
  }

  return (
    <Card className="border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20">
      <CardHeader className="pb-2 px-4 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Banknote className="h-4 w-4 text-amber-600" />
          Listing Bonus Approvals
          {pending.length > 0 && (
            <Badge className="bg-amber-500/20 text-amber-700 border-0 text-xs animate-pulse">
              {pending.length} pending
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {pending.length === 0 && filter !== 'pending_cfo' && processed.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No listing bonus approvals yet</p>
        )}

        {pending.map(approval => (
          <div key={approval.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="font-semibold text-sm truncate">{approval.listing_title}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Agent: <span className="font-medium text-foreground">{approval.agent_name}</span>
                </p>
                {approval.landlord_ops_notes && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 italic">
                    Landlord Ops: "{approval.landlord_ops_notes}"
                  </p>
                )}
              </div>
              <Badge className="bg-primary/10 text-primary border-0 font-bold shrink-0">
                UGX {approval.amount.toLocaleString()}
              </Badge>
            </div>

            {filter === 'pending_cfo' && (
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Rejection reason (optional)"
                  value={rejectNotes[approval.id] || ''}
                  onChange={e => setRejectNotes(prev => ({ ...prev, [approval.id]: e.target.value }))}
                  className="h-8 text-xs flex-1"
                />
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1 bg-green-600 hover:bg-green-700"
                  onClick={() => handleAction(approval.id, 'approve')}
                  disabled={processingId === approval.id}
                >
                  {processingId === approval.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Pay
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 text-xs gap-1"
                  onClick={() => handleAction(approval.id, 'reject')}
                  disabled={processingId === approval.id}
                >
                  <XCircle className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        ))}

        {/* Show processed history when viewing all */}
        {filter === 'all' && processed.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">History</p>
            {processed.slice(0, 20).map(a => (
              <div key={a.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  <Home className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{a.listing_title}</span>
                  <span className="text-muted-foreground">→ {a.agent_name}</span>
                </div>
                <Badge
                  className={`text-[9px] border-0 shrink-0 ${
                    a.status === 'paid' ? 'bg-green-500/20 text-green-700' :
                    a.status === 'rejected' ? 'bg-red-500/20 text-red-700' :
                    'bg-amber-500/20 text-amber-700'
                  }`}
                >
                  {a.status === 'paid' ? '✅ Paid' : a.status === 'rejected' ? '❌ Rejected' : '⏳ Pending'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
