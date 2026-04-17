import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/agentAdvanceCalculations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Loader2, Clock, Banknote, Calendar, User } from 'lucide-react';
import { cn } from '@/lib/utils';

type ApprovalStage = 'agent_ops' | 'tenant_ops' | 'landlord_ops' | 'coo';

interface AdvanceRequestsQueueProps {
  stage: ApprovalStage;
}

const STAGE_CONFIG: Record<ApprovalStage, { filterStatus: string; nextStatus: string; reviewerCol: string; reviewedAtCol: string; notesCol: string; title: string }> = {
  agent_ops: { filterStatus: 'pending', nextStatus: 'agent_ops_approved', reviewerCol: 'reviewed_by_agent_ops', reviewedAtCol: 'agent_ops_reviewed_at', notesCol: 'agent_ops_notes', title: 'Agent Advance Requests' },
  tenant_ops: { filterStatus: 'agent_ops_approved', nextStatus: 'tenant_ops_approved', reviewerCol: 'reviewed_by_tenant_ops', reviewedAtCol: 'tenant_ops_reviewed_at', notesCol: 'tenant_ops_notes', title: 'Agent Advance Requests' },
  landlord_ops: { filterStatus: 'tenant_ops_approved', nextStatus: 'landlord_ops_approved', reviewerCol: 'reviewed_by_landlord_ops', reviewedAtCol: 'landlord_ops_reviewed_at', notesCol: 'landlord_ops_notes', title: 'Agent Advance Requests' },
  coo: { filterStatus: 'landlord_ops_approved', nextStatus: 'coo_approved', reviewerCol: 'approved_by_coo', reviewedAtCol: 'coo_approved_at', notesCol: 'coo_notes', title: 'Agent Advance Approvals' },
};

export function AdvanceRequestsQueue({ stage }: AdvanceRequestsQueueProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const config = STAGE_CONFIG[stage];
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['advance-requests-queue', stage],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_advance_requests')
        .select('*, profiles!agent_advance_requests_agent_id_fkey(full_name, phone)')
        .eq('status', config.filterStatus)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const updateData: any = {};
      if (approve) {
        updateData.status = config.nextStatus;
        updateData[config.reviewerCol] = user.id;
        updateData[config.reviewedAtCol] = new Date().toISOString();
        if (notes[id]) updateData[config.notesCol] = notes[id];
      } else {
        updateData.status = 'rejected';
        updateData.rejection_reason = notes[id] || 'Rejected at ' + stage.replace('_', ' ') + ' stage';
        updateData[config.reviewerCol] = user.id;
        updateData[config.reviewedAtCol] = new Date().toISOString();
      }
      const { data, error } = await supabase
        .from('agent_advance_requests')
        .update(updateData)
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error('Approval blocked — your role may not have permission, or the request has already moved to a later stage.');
      }
    },
    onSuccess: (_, { approve }) => {
      toast.success(approve ? 'Request approved' : 'Request rejected');
      queryClient.invalidateQueries({ queryKey: ['advance-requests-queue'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No advance requests pending at this stage</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">{config.title}</h3>
        <Badge variant="secondary" className="text-xs">{requests.length} pending</Badge>
      </div>
      {requests.map((req: any) => {
        const profile = req.profiles;
        const isExpanded = expandedId === req.id;
        return (
          <Card key={req.id} className="overflow-hidden">
            <CardContent className="p-4">
              {/* Header */}
              <button onClick={() => setExpandedId(isExpanded ? null : req.id)} className="w-full text-left">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{profile?.full_name || 'Agent'}</p>
                    <p className="text-[10px] text-muted-foreground">{profile?.phone || ''} • {format(new Date(req.created_at), 'MMM d, yyyy')}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold text-primary">{formatUGX(Number(req.principal))}</p>
                    <p className="text-[10px] text-muted-foreground">{req.cycle_days} days</p>
                  </div>
                </div>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-muted/50 text-xs">
                    <div><span className="text-muted-foreground">Access Fee</span><br /><span className="font-bold">{formatUGX(Number(req.access_fee))}</span></div>
                    <div><span className="text-muted-foreground">Reg Fee</span><br /><span className="font-bold">{formatUGX(Number(req.registration_fee))}</span></div>
                    <div><span className="text-muted-foreground">Total Payable</span><br /><span className="font-bold text-primary">{formatUGX(Number(req.total_payable))}</span></div>
                    <div><span className="text-muted-foreground">Daily Deduction</span><br /><span className="font-bold text-red-500">{formatUGX(Number(req.daily_payment))}/d</span></div>
                  </div>

                  <div className="p-3 rounded-xl bg-muted/30">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Reason</p>
                    <p className="text-sm">{req.reason}</p>
                  </div>

                  <Textarea
                    placeholder="Notes (optional)..."
                    value={notes[req.id] || ''}
                    onChange={e => setNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                    rows={2}
                    className="text-sm"
                  />

                  <div className="flex gap-2">
                    <Button
                      onClick={() => approveMutation.mutate({ id: req.id, approve: true })}
                      disabled={approveMutation.isPending}
                      className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Approve
                    </Button>
                    <Button
                      onClick={() => approveMutation.mutate({ id: req.id, approve: false })}
                      disabled={approveMutation.isPending}
                      variant="destructive"
                      className="flex-1 gap-1.5"
                    >
                      <XCircle className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
