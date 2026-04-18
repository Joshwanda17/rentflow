import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX, projectOutstanding } from '@/lib/businessAdvanceCalculations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Loader2, Clock, Briefcase, MapPin, Banknote, UserCheck } from 'lucide-react';
import { AssignNearbyAgentDialog } from './AssignNearbyAgentDialog';
import { BusinessAdvanceEconomicsCard, BusinessAdvancePortfolioPanel } from './BusinessAdvanceEconomics';

type Stage = 'agent_ops' | 'tenant_ops' | 'landlord_ops' | 'coo' | 'cfo';

interface BusinessAdvanceQueueProps {
  stage: Stage;
}

const STAGE_CONFIG: Record<Stage, {
  filterStatus: string;
  nextStatus: string | null;
  reviewerCol: string;
  reviewedAtCol: string;
  notesCol: string;
  title: string;
  ctaLabel: string;
}> = {
  agent_ops: {
    filterStatus: 'pending',
    nextStatus: 'agent_ops_approved',
    reviewerCol: 'agent_ops_reviewed_by',
    reviewedAtCol: 'agent_ops_reviewed_at',
    notesCol: 'agent_ops_notes',
    title: 'Business Advance Requests',
    ctaLabel: 'Approve',
  },
  tenant_ops: {
    filterStatus: 'agent_ops_approved',
    nextStatus: 'tenant_ops_approved',
    reviewerCol: 'tenant_ops_reviewed_by',
    reviewedAtCol: 'tenant_ops_reviewed_at',
    notesCol: 'tenant_ops_notes',
    title: 'Business Advance Requests',
    ctaLabel: 'Approve',
  },
  landlord_ops: {
    filterStatus: 'tenant_ops_approved',
    nextStatus: 'landlord_ops_approved',
    reviewerCol: 'landlord_ops_reviewed_by',
    reviewedAtCol: 'landlord_ops_reviewed_at',
    notesCol: 'landlord_ops_notes',
    title: 'Business Advance — Verify Location',
    ctaLabel: 'Approve',
  },
  coo: {
    filterStatus: 'landlord_ops_approved',
    nextStatus: 'coo_approved',
    reviewerCol: 'coo_approved_by',
    reviewedAtCol: 'coo_approved_at',
    notesCol: 'coo_notes',
    title: 'Business Advance Approvals',
    ctaLabel: 'Approve',
  },
  cfo: {
    filterStatus: 'coo_approved',
    nextStatus: null, // disbursement uses edge function
    reviewerCol: 'cfo_disbursed_by',
    reviewedAtCol: 'cfo_disbursed_at',
    notesCol: 'cfo_notes',
    title: 'Business Advance Disbursements',
    ctaLabel: 'Disburse to wallet',
  },
};

export function BusinessAdvanceQueue({ stage }: BusinessAdvanceQueueProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const config = STAGE_CONFIG[stage];
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assignDialogFor, setAssignDialogFor] = useState<any>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['business-advance-queue', stage],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_advances')
        .select('*, tenant:profiles!business_advances_tenant_id_fkey(full_name, phone), agent:profiles!business_advances_agent_id_fkey(full_name, phone)')
        .eq('status', config.filterStatus as any)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      if (!user?.id) throw new Error('Not authenticated');

      // CFO disbursement uses the edge function
      if (stage === 'cfo' && approve) {
        const { error } = await supabase.functions.invoke('disburse-business-advance', {
          body: { advance_id: id, notes: notes[id] || null },
        });
        if (error) throw error;
        return;
      }

      const updateData: any = {};
      if (approve) {
        if (!config.nextStatus) throw new Error('Invalid stage');
        updateData.status = config.nextStatus;
        updateData[config.reviewerCol] = user.id;
        updateData[config.reviewedAtCol] = new Date().toISOString();
        if (notes[id]) updateData[config.notesCol] = notes[id];
      } else {
        updateData.status = 'rejected';
        updateData.rejection_reason = notes[id] || `Rejected at ${stage.replace('_', ' ')} stage`;
        updateData[config.reviewerCol] = user.id;
        updateData[config.reviewedAtCol] = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('business_advances')
        .update(updateData)
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Action blocked — your role may not have permission, or the request has already moved on.');
    },
    onSuccess: (_, { approve }) => {
      toast.success(approve ? (stage === 'cfo' ? 'Disbursed to tenant wallet' : 'Approved') : 'Rejected');
      qc.invalidateQueries({ queryKey: ['business-advance-queue'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No business advance requests pending at this stage</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {stage === 'cfo' && <BusinessAdvancePortfolioPanel />}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" />{config.title}</h3>
        <Badge variant="secondary" className="text-xs">{requests.length} pending</Badge>
      </div>
      {requests.map((req: any) => {
        const tenant = req.tenant;
        const agent = req.agent;
        const isExpanded = expandedId === req.id;
        const principal = Number(req.principal);
        const outstanding = Number(req.outstanding_balance);

        return (
          <Card key={req.id} className="overflow-hidden">
            <CardContent className="p-4">
              <button onClick={() => setExpandedId(isExpanded ? null : req.id)} className="w-full text-left">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Briefcase className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{req.business_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {tenant?.full_name || 'Tenant'} • {req.business_type}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold text-primary">{formatUGX(principal)}</p>
                    <p className="text-[10px] text-muted-foreground">{format(new Date(req.created_at), 'MMM d')}</p>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-muted/50 text-xs">
                    <div>
                      <span className="text-muted-foreground">Tenant</span><br />
                      <span className="font-bold">{tenant?.full_name || '—'}</span><br />
                      <span className="text-[10px] text-muted-foreground">{tenant?.phone || ''}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Agent</span><br />
                      <span className="font-bold">{agent?.full_name || '—'}</span><br />
                      <span className="text-[10px] text-muted-foreground">{agent?.phone || ''}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Principal</span><br />
                      <span className="font-bold">{formatUGX(principal)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Outstanding</span><br />
                      <span className="font-bold text-amber-600">{formatUGX(outstanding)}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">30-day projection @ 1%/day</span><br />
                      <span className="font-bold text-red-500">{formatUGX(projectOutstanding(outstanding, 30))}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-muted/30">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Business location
                    </p>
                    <p className="text-sm">{req.business_address}{req.business_city ? `, ${req.business_city}` : ''}</p>
                    {req.business_latitude && (
                      <a
                        className="text-xs text-primary underline mt-1 inline-block"
                        href={`https://maps.google.com/?q=${req.business_latitude},${req.business_longitude}`}
                        target="_blank" rel="noreferrer"
                      >
                        Open in Maps ({Number(req.business_latitude).toFixed(4)}, {Number(req.business_longitude).toFixed(4)})
                      </a>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-muted/30">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Reason</p>
                    <p className="text-sm">{req.reason}</p>
                  </div>

                  {req.monthly_revenue && (
                    <div className="grid grid-cols-2 gap-2 text-xs p-3 rounded-xl bg-muted/30">
                      <div><span className="text-muted-foreground">Monthly revenue</span><br />{formatUGX(Number(req.monthly_revenue))}</div>
                      <div><span className="text-muted-foreground">Years in business</span><br />{req.years_in_business || '—'}</div>
                    </div>
                  )}

                  {stage === 'cfo' && (
                    <BusinessAdvanceEconomicsCard principal={principal} outstanding={outstanding} />
                  )}

                  {stage === 'agent_ops' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAssignDialogFor(req)}
                      className="w-full gap-1.5 border-primary/40"
                    >
                      <UserCheck className="h-4 w-4 text-primary" />
                      Dispatch nearby agent to verify landlord
                    </Button>
                  )}

                  <Textarea
                    placeholder="Notes (optional)..."
                    value={notes[req.id] || ''}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
                    rows={2}
                    className="text-sm"
                  />

                  <div className="flex gap-2">
                    <Button
                      onClick={() => approveMutation.mutate({ id: req.id, approve: true })}
                      disabled={approveMutation.isPending}
                      className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {stage === 'cfo' ? <Banknote className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      {config.ctaLabel}
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
      {assignDialogFor && (
        <AssignNearbyAgentDialog
          open={!!assignDialogFor}
          onOpenChange={(o) => !o && setAssignDialogFor(null)}
          advance={assignDialogFor}
        />
      )}
    </div>
  );
}
