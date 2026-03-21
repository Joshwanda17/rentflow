import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RentPipelineTracker } from './RentPipelineTracker';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, XCircle, Clock, MapPin, User, UserCheck, Home, Banknote, ArrowRight, Loader2, Search, MessageCircle, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { AgentProximitySelector } from './AgentProximitySelector';

export type PipelineStage =
  | 'pending'
  | 'tenant_ops_approved'
  | 'agent_verified'
  | 'landlord_ops_approved'
  | 'coo_approved';

interface PipelineConfig {
  stage: PipelineStage;
  title: string;
  approveLabel: string;
  nextStatus: string;
  reviewerColumn: string;
  reviewerAtColumn: string;
  showAgentSelector?: boolean;
  showPayoutFields?: boolean;
}

const STAGE_CONFIG: Record<PipelineStage, PipelineConfig> = {
  pending: {
    stage: 'pending',
    title: '🔍 Pending Review',
    approveLabel: 'Approve & Forward to Agent Ops',
    nextStatus: 'tenant_ops_approved',
    reviewerColumn: 'tenant_ops_reviewed_by',
    reviewerAtColumn: 'tenant_ops_reviewed_at',
    showAgentSelector: true,
  },
  tenant_ops_approved: {
    stage: 'tenant_ops_approved',
    title: '🕵️ Agent Verification',
    approveLabel: 'Verify & Forward to Landlord Ops',
    nextStatus: 'agent_verified',
    reviewerColumn: 'agent_verified_by',
    reviewerAtColumn: 'agent_verified_at',
  },
  agent_verified: {
    stage: 'agent_verified',
    title: '🏠 Landlord Review',
    approveLabel: 'Approve & Forward to COO',
    nextStatus: 'landlord_ops_approved',
    reviewerColumn: 'landlord_ops_reviewed_by',
    reviewerAtColumn: 'landlord_ops_reviewed_at',
  },
  landlord_ops_approved: {
    stage: 'landlord_ops_approved',
    title: '📋 COO Operational Sign-off',
    approveLabel: 'Approve & Forward to CFO',
    nextStatus: 'coo_approved',
    reviewerColumn: 'coo_reviewed_by',
    reviewerAtColumn: 'coo_reviewed_at',
  },
  coo_approved: {
    stage: 'coo_approved',
    title: '💰 CFO Payout Authorization',
    approveLabel: 'Authorize Payout',
    nextStatus: 'funded',
    reviewerColumn: 'cfo_reviewed_by',
    reviewerAtColumn: 'cfo_reviewed_at',
    showPayoutFields: true,
  },
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  tenant_ops_approved: 'bg-blue-100 text-blue-700',
  agent_verified: 'bg-purple-100 text-purple-700',
  landlord_ops_approved: 'bg-indigo-100 text-indigo-700',
  coo_approved: 'bg-emerald-100 text-emerald-700',
  funded: 'bg-green-100 text-green-700',
  disbursed: 'bg-teal-100 text-teal-700',
  rejected: 'bg-destructive/10 text-destructive',
};

interface RentPipelineQueueProps {
  stage: PipelineStage;
}

export function RentPipelineQueue({ stage }: RentPipelineQueueProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const config = STAGE_CONFIG[stage];

  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [comment, setComment] = useState('');
  const [assignedAgentId, setAssignedAgentId] = useState<string | null>(null);
  const [payoutRef, setPayoutRef] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('wallet');
  const [processing, setProcessing] = useState(false);
  const [quickProcessingId, setQuickProcessingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Quick approve directly from list — no dialog needed
  const handleQuickApprove = async (req: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || quickProcessingId) return;
    // CFO stage needs payout ref, Tenant Ops may need agent — use dialog
    if (config.showPayoutFields || config.showAgentSelector) {
      setSelectedRequest(req);
      return;
    }
    setQuickProcessingId(req.id);
    try {
      const updateData: any = {
        status: config.nextStatus,
        [config.reviewerColumn]: user.id,
        [config.reviewerAtColumn]: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (stage === 'agent_verified') {
        try {
          await supabase.functions.invoke('credit-landlord-verification-bonus', {
            body: { rent_request_id: req.id },
          });
        } catch (bonusErr) {
          console.warn('Landlord verification bonus failed:', bonusErr);
        }
      }

      const { error } = await supabase
        .from('rent_requests')
        .update(updateData)
        .eq('id', req.id);
      if (error) throw error;

      toast({ title: '✅ Approved', description: `${req.tenant_name} → ${config.nextStatus.replace(/_/g, ' ')}` });
      queryClient.invalidateQueries({ queryKey: ['rent-pipeline'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setQuickProcessingId(null);
    }
  };

  const { data: requests, isLoading } = useQuery({
    queryKey: ['rent-pipeline', stage],
    queryFn: async () => {
      const { data } = await supabase
        .from('rent_requests')
        .select('id, tenant_id, agent_id, landlord_id, lc1_id, rent_amount, duration_days, access_fee, request_fee, total_repayment, daily_repayment, status, created_at, house_category, request_city, request_latitude, request_longitude, assigned_agent_id, payout_method, payout_transaction_reference, approval_comment')
        .eq('status', stage)
        .order('created_at', { ascending: true })
        .limit(100);

      if (!data || data.length === 0) return [];

      // Resolve names
      const ids = new Set<string>();
      data.forEach(r => {
        if (r.tenant_id) ids.add(r.tenant_id);
        if (r.agent_id) ids.add(r.agent_id);
        if (r.assigned_agent_id) ids.add(r.assigned_agent_id);
      });
      const landlordIds = [...new Set(data.map(r => r.landlord_id))];

      const [profilesRes, landlordsRes] = await Promise.all([
        ids.size > 0
          ? supabase.from('profiles').select('id, full_name, phone').in('id', [...ids])
          : { data: [] },
        landlordIds.length > 0
          ? supabase.from('landlords').select('id, name, phone').in('id', landlordIds)
          : { data: [] },
      ]);

      const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p]));
      const landlordMap = new Map((landlordsRes.data || []).map(l => [l.id, l]));

      return data.map(r => ({
        ...r,
        tenant_name: profileMap.get(r.tenant_id)?.full_name || 'Unknown',
        tenant_phone: profileMap.get(r.tenant_id)?.phone || '',
        agent_name: r.agent_id ? (profileMap.get(r.agent_id)?.full_name || 'Unassigned') : 'Unassigned',
        assigned_agent_name: r.assigned_agent_id ? (profileMap.get(r.assigned_agent_id)?.full_name || '') : '',
        landlord_name: landlordMap.get(r.landlord_id)?.name || 'Unknown',
        landlord_phone: landlordMap.get(r.landlord_id)?.phone || '',
      }));
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const rows = requests || [];
  const filtered = search
    ? rows.filter(r =>
        r.tenant_name.toLowerCase().includes(search.toLowerCase()) ||
        r.landlord_name.toLowerCase().includes(search.toLowerCase()) ||
        r.agent_name.toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  const handleApprove = async () => {
    if (!selectedRequest || !user) return;
    if (config.showAgentSelector && !assignedAgentId && !selectedRequest.agent_id) {
      toast({ title: 'Please assign an agent', variant: 'destructive' });
      return;
    }
    if (config.showPayoutFields && !payoutRef.trim()) {
      toast({ title: 'Transaction reference is required', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    try {
      const updateData: any = {
        status: config.nextStatus,
        [config.reviewerColumn]: user.id,
        [config.reviewerAtColumn]: new Date().toISOString(),
        approval_comment: comment || null,
        updated_at: new Date().toISOString(),
      };

      if (config.showAgentSelector && assignedAgentId) {
        updateData.assigned_agent_id = assignedAgentId;
      }

      if (config.showPayoutFields) {
        updateData.payout_transaction_reference = payoutRef.trim();
        updateData.payout_method = payoutMethod;
        updateData.funded_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('rent_requests')
        .update(updateData)
        .eq('id', selectedRequest.id);

      if (error) throw error;

      // Trigger landlord verification bonus when Landlord Ops approves
      if (stage === 'agent_verified') {
        try {
          await supabase.functions.invoke('credit-landlord-verification-bonus', {
            body: { rent_request_id: selectedRequest.id },
          });
        } catch (bonusErr) {
          console.warn('Landlord verification bonus failed:', bonusErr);
        }
      }

      // Trigger disbursement when CFO authorizes payout
      if (stage === 'coo_approved') {
        try {
          await supabase.functions.invoke('disburse-rent-to-landlord', {
            body: {
              rent_request_id: selectedRequest.id,
              transaction_reference: payoutRef.trim(),
              payout_method: payoutMethod,
              notes: comment || null,
            },
          });
        } catch (disbErr) {
          console.warn('Disbursement function failed:', disbErr);
        }
      }

      toast({ title: `Request approved and forwarded` });
      setSelectedRequest(null);
      setComment('');
      setAssignedAgentId(null);
      setPayoutRef('');
      queryClient.invalidateQueries({ queryKey: ['rent-pipeline'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !user || !comment.trim()) {
      toast({ title: 'Rejection reason is required', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('rent_requests')
        .update({
          status: 'rejected',
          rejected_reason: comment.trim(),
          [config.reviewerColumn]: user.id,
          [config.reviewerAtColumn]: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedRequest.id);

      if (error) throw error;
      toast({ title: 'Request rejected' });
      setSelectedRequest(null);
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['rent-pipeline'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const fmt = (n: number) => Number(n || 0).toLocaleString();

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-bold">{config.title}</CardTitle>
          <Badge variant="secondary" className="text-xs font-bold">
            {rows.length} pending
          </Badge>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tenant, landlord, agent..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No requests at this stage
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(req => (
              <div
                key={req.id}
                className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors flex items-center gap-2"
              >
                <button
                  onClick={() => setSelectedRequest(req)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-semibold text-sm truncate">{req.tenant_name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Home className="h-3 w-3" />
                          {req.landlord_name}
                        </span>
                        <span className="flex items-center gap-1 text-primary">
                          <UserCheck className="h-3 w-3" />
                          {req.assigned_agent_name || req.agent_name || 'No Agent'}
                        </span>
                        {req.request_city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {req.request_city}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm">UGX {fmt(req.rent_amount)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(req.created_at), 'dd MMM yy')}
                      </p>
                    </div>
                  </div>
                </button>
                {/* Quick Approve Button */}
                <Button
                  size="sm"
                  onClick={(e) => handleQuickApprove(req, e)}
                  disabled={quickProcessingId === req.id}
                  className="shrink-0 h-8 px-3 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {quickProcessingId === req.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Approve
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Review Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => { setSelectedRequest(null); setComment(''); setAssignedAgentId(null); setPayoutRef(''); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Review Rent Request</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              {/* Request Details */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Tenant</p>
                  <p className="font-semibold">{selectedRequest.tenant_name}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Landlord</p>
                  <p className="font-semibold">{selectedRequest.landlord_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedRequest.landlord_phone}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Rent Amount</p>
                  <p className="font-bold text-base">UGX {fmt(selectedRequest.rent_amount)}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Duration</p>
                  <p className="font-semibold">{selectedRequest.duration_days} days</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Access Fee</p>
                  <p className="font-semibold">UGX {fmt(selectedRequest.access_fee)}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Total Repayment</p>
                  <p className="font-semibold">UGX {fmt(selectedRequest.total_repayment)}</p>
                </div>
                {selectedRequest.house_category && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">House Category</p>
                    <p className="font-semibold">{selectedRequest.house_category}</p>
                  </div>
                )}
                {selectedRequest.request_city && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="font-semibold">{selectedRequest.request_city}</p>
                  </div>
                )}
              </div>

              {/* Pipeline Status + Agent Benefits */}
              <RentPipelineTracker
                currentStatus={selectedRequest.status}
                rentAmount={selectedRequest.rent_amount}
                showAgentBenefits={true}
              />

              {/* Agent Proximity Selector - only for Tenant Ops */}
              {config.showAgentSelector && (
                <AgentProximitySelector
                  latitude={selectedRequest.request_latitude}
                  longitude={selectedRequest.request_longitude}
                  currentAgentId={selectedRequest.agent_id}
                  onSelect={setAssignedAgentId}
                  selectedAgentId={assignedAgentId}
                />
              )}

              {/* Payout Fields - only for CFO */}
              {config.showPayoutFields && (
                <div className="space-y-3 rounded-xl border border-border p-3 bg-muted/30">
                  <h4 className="text-sm font-semibold">💳 Payout Details</h4>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Payout Method</label>
                    <Select value={payoutMethod} onValueChange={setPayoutMethod}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wallet">Wallet (Landlord has Rent Money)</SelectItem>
                        <SelectItem value="cash">Cash Payout (No Wallet)</SelectItem>
                        <SelectItem value="mobile_money">Mobile Money</SelectItem>
                        <SelectItem value="bank">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Transaction Reference *</label>
                    <Input
                      placeholder="Enter transaction ID or reference"
                      value={payoutRef}
                      onChange={e => setPayoutRef(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
              )}

              {/* Comment */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {stage === 'coo_approved' ? 'Notes' : 'Review Comment'}
                </label>
                <Textarea
                  placeholder="Add your review notes..."
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={2}
                />
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleReject}
                  disabled={processing || !comment.trim()}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={processing}
                  className="gap-1"
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {config.approveLabel}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
