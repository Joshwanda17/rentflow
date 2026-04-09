import { useState, useCallback } from 'react';
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
import { CheckCircle2, XCircle, Clock, MapPin, User, UserCheck, Home, Banknote, ArrowRight, Loader2, Search, MessageCircle, Phone, Pencil, Check, X } from 'lucide-react';
import { calculateRentRepayment } from '@/lib/rentCalculations';
import { toast as sonnerToast } from 'sonner';
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
    approveLabel: 'Authorize & Fund Agent Float',
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

const formatWhatsApp = (phone: string): string => {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  if (clean.startsWith('0')) clean = '256' + clean.slice(1);
  if (!clean.startsWith('256')) clean = '256' + clean;
  return clean;
};

const WhatsAppButton = ({ phone, name, label }: { phone: string; name: string; label: string }) => {
  if (!phone) return null;
  const waNumber = formatWhatsApp(phone);
  return (
    <a
      href={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi ${name}, regarding a rent request on Welile.`)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 transition-colors"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.352 0-4.55-.764-6.326-2.057a.5.5 0 00-.395-.088l-3.088 1.035 1.035-3.088a.5.5 0 00-.088-.395A9.953 9.953 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/></svg>
      {label}
    </a>
  );
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
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const startEditing = useCallback((field: string, currentValue: any) => {
    setEditingField(field);
    setEditValue(String(currentValue ?? ''));
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingField(null);
    setEditValue('');
  }, []);

  const handleFieldSave = useCallback(async (field: string) => {
    if (!selectedRequest || !user) return;
    setSavingEdit(true);

    try {
      let updates: Record<string, any> = {};
      const isNumber = field !== 'house_category';
      const newVal = isNumber ? Number(editValue) : editValue;

      if (isNumber && (isNaN(newVal as number) || (newVal as number) <= 0)) {
        sonnerToast.error('Please enter a valid positive number');
        setSavingEdit(false);
        return;
      }

      if (field === 'rent_amount' || field === 'duration_days') {
        const rentAmt = field === 'rent_amount' ? (newVal as number) : selectedRequest.rent_amount;
        const durDays = field === 'duration_days' ? (newVal as number) : selectedRequest.duration_days;
        const calc = calculateRentRepayment(rentAmt, durDays);
        updates = {
          rent_amount: calc.rentAmount,
          duration_days: calc.durationDays,
          access_fee: calc.accessFee,
          request_fee: calc.requestFee,
          total_repayment: calc.totalRepayment,
          daily_repayment: calc.dailyRepayment,
        };
      } else {
        updates[field] = newVal;
      }

      const { error } = await supabase
        .from('rent_requests')
        .update(updates)
        .eq('id', selectedRequest.id);

      if (error) throw error;

      // Update local state
      setSelectedRequest((prev: any) => prev ? { ...prev, ...updates } : prev);
      queryClient.invalidateQueries({ queryKey: ['rent-pipeline'] });

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'inline_edit_rent_request',
        table_name: 'rent_requests',
        record_id: selectedRequest.id,
        metadata: { field, old_value: selectedRequest[field], new_value: newVal, updates },
      });

      sonnerToast.success(`${field.replace(/_/g, ' ')} updated`);
      cancelEditing();
    } catch (err: any) {
      sonnerToast.error('Update failed: ' + (err.message || 'Unknown error'));
    } finally {
      setSavingEdit(false);
    }
  }, [selectedRequest, user, editValue, queryClient, cancelEditing]);

  const InlineEditableField = ({ field, label, value, prefix, suffix, className }: {
    field: string; label: string; value: any; prefix?: string; suffix?: string; className?: string;
  }) => {
    const isEditing = editingField === field;
    const isText = field === 'house_category';

    if (isEditing) {
      return (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="flex items-center gap-1">
            <Input
              type={isText ? 'text' : 'number'}
              inputMode={isText ? 'text' : 'numeric'}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="h-7 text-sm px-2 flex-1"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleFieldSave(field);
                if (e.key === 'Escape') cancelEditing();
              }}
            />
            <Button
              size="icon-sm"
              variant="ghost"
              className="h-6 w-6 min-h-0 min-w-0 text-primary"
              onClick={() => handleFieldSave(field)}
              disabled={savingEdit}
            >
              {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="h-6 w-6 min-h-0 min-w-0 text-muted-foreground"
              onClick={cancelEditing}
              disabled={savingEdit}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-0.5 group cursor-pointer" onClick={() => startEditing(field, value)}>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center gap-1">
          <p className={className || 'font-semibold'}>
            {prefix}{typeof value === 'number' ? fmt(value) : value}{suffix}
          </p>
          <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    );
  };

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
      const landlordIds = [...new Set(data.map(r => r.landlord_id).filter(Boolean))];
      const lc1Ids = [...new Set(data.map(r => r.lc1_id).filter(Boolean))];

      const [profilesRes, landlordsRes, lc1Res] = await Promise.all([
        ids.size > 0
          ? supabase.from('profiles').select('id, full_name, phone, email').in('id', [...ids])
          : { data: [] },
        landlordIds.length > 0
          ? supabase.from('landlords').select('id, name, phone, mobile_money_number').in('id', landlordIds)
          : { data: [] },
        lc1Ids.length > 0
          ? supabase.from('lc1_chairpersons').select('id, name, phone, village').in('id', lc1Ids)
          : { data: [] },
      ]);

      const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p]));
      const landlordMap = new Map((landlordsRes.data || []).map(l => [l.id, l]));
      const lc1Map = new Map((lc1Res.data || []).map(l => [l.id, l]));

      return data.map(r => {
        const agentProfile = r.assigned_agent_id
          ? profileMap.get(r.assigned_agent_id)
          : r.agent_id
            ? profileMap.get(r.agent_id)
            : null;
        return {
          ...r,
          tenant_name: profileMap.get(r.tenant_id)?.full_name || 'Unknown',
          tenant_phone: profileMap.get(r.tenant_id)?.phone || '',
          agent_name: r.agent_id ? (profileMap.get(r.agent_id)?.full_name || 'Unassigned') : 'Unassigned',
          agent_phone: agentProfile?.phone || '',
          agent_email: agentProfile?.email || '',
          assigned_agent_name: r.assigned_agent_id ? (profileMap.get(r.assigned_agent_id)?.full_name || '') : '',
          landlord_name: landlordMap.get(r.landlord_id)?.name || 'Unknown',
          landlord_phone: landlordMap.get(r.landlord_id)?.phone || '',
          landlord_momo: landlordMap.get(r.landlord_id)?.mobile_money_number || landlordMap.get(r.landlord_id)?.phone || '',
          lc1_name: r.lc1_id ? (lc1Map.get(r.lc1_id)?.name || '') : '',
          lc1_phone: r.lc1_id ? (lc1Map.get(r.lc1_id)?.phone || '') : '',
          lc1_village: r.lc1_id ? (lc1Map.get(r.lc1_id)?.village || '') : '',
        };
      });
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
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

    // TID is mandatory for CFO approval (audit compliance)
    if (stage === 'coo_approved' && !payoutRef.trim()) {
      toast({ title: 'Transaction ID is required for audit compliance', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    try {
      // For CFO stage: let the edge function handle status + float atomically
      if (stage === 'coo_approved') {
        const { data: floatRes, error: floatErr } = await supabase.functions.invoke('fund-agent-landlord-float', {
          body: {
            rent_request_id: selectedRequest.id,
            notes: comment || null,
            transaction_reference: payoutRef.trim(),
            payout_method: payoutMethod || 'mobile_money',
          },
        });
        if (floatErr) throw new Error(floatErr.message || 'Failed to fund agent float');
        if (floatRes?.error) throw new Error(floatRes.error);
      } else {
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

        const { error } = await supabase
          .from('rent_requests')
          .update(updateData)
          .eq('id', selectedRequest.id);

        if (error) throw error;
      }

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
                      {/* WhatsApp quick contacts */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <WhatsAppButton phone={req.tenant_phone} name={req.tenant_name} label="Tenant" />
                        <WhatsAppButton phone={req.landlord_phone} name={req.landlord_name} label="Landlord" />
                        <WhatsAppButton phone={req.agent_phone} name={req.assigned_agent_name || req.agent_name} label="Agent" />
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
                {/* Quick Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); setSelectedRequest(req); }}
                    disabled={quickProcessingId === req.id}
                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                    title="Reject"
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={(e) => handleQuickApprove(req, e)}
                    disabled={quickProcessingId === req.id}
                    className="h-8 px-3 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {quickProcessingId === req.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Approve
                  </Button>
                </div>
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
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs text-muted-foreground">{selectedRequest.tenant_phone}</span>
                    <WhatsAppButton phone={selectedRequest.tenant_phone} name={selectedRequest.tenant_name} label="WhatsApp" />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Landlord</p>
                  <p className="font-semibold">{selectedRequest.landlord_name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs text-muted-foreground">{selectedRequest.landlord_phone}</span>
                    <WhatsAppButton phone={selectedRequest.landlord_phone} name={selectedRequest.landlord_name} label="WhatsApp" />
                  </div>
                </div>
                <div className="space-y-0.5 col-span-2">
                  <p className="text-xs text-muted-foreground">Assigned Agent</p>
                  <p className="font-semibold">{selectedRequest.assigned_agent_name || selectedRequest.agent_name || 'No Agent'}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">{selectedRequest.agent_phone}</span>
                    <WhatsAppButton phone={selectedRequest.agent_phone} name={selectedRequest.assigned_agent_name || selectedRequest.agent_name} label="WhatsApp" />
                  </div>
                  {selectedRequest.agent_email && (
                    <p className="text-xs text-muted-foreground mt-0.5">✉️ {selectedRequest.agent_email}</p>
                  )}
                </div>
                <InlineEditableField field="rent_amount" label="Rent Amount" value={selectedRequest.rent_amount} prefix="UGX " className="font-bold text-base" />
                <InlineEditableField field="duration_days" label="Duration" value={selectedRequest.duration_days} suffix=" days" />
                <InlineEditableField field="access_fee" label="Access Fee" value={selectedRequest.access_fee} prefix="UGX " />
                <InlineEditableField field="daily_repayment" label="Daily Repayment" value={selectedRequest.daily_repayment} prefix="UGX " className="font-bold text-base text-primary" />
                <InlineEditableField field="total_repayment" label="Total Repayment" value={selectedRequest.total_repayment} prefix="UGX " />
                {selectedRequest.house_category && (
                  <InlineEditableField field="house_category" label="House Category" value={selectedRequest.house_category} />
                )}
                {selectedRequest.request_city && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="font-semibold">{selectedRequest.request_city}</p>
                  </div>
                )}
              </div>

              {/* LC1 & GPS Details */}
              <div className="rounded-xl border border-border p-3 bg-muted/30 space-y-2">
                <h4 className="text-sm font-semibold">📍 Property Location & LC1</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selectedRequest.lc1_name && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">LC1 Chairperson</p>
                      <p className="font-semibold">{selectedRequest.lc1_name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-xs text-muted-foreground">{selectedRequest.lc1_phone}</span>
                        <WhatsAppButton phone={selectedRequest.lc1_phone} name={selectedRequest.lc1_name} label="WhatsApp" />
                      </div>
                    </div>
                  )}
                  {selectedRequest.lc1_village && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Village</p>
                      <p className="font-semibold">{selectedRequest.lc1_village}</p>
                    </div>
                  )}
                  {(selectedRequest.request_latitude && selectedRequest.request_longitude) && (
                    <div className="space-y-0.5 col-span-2">
                      <p className="text-xs text-muted-foreground">GPS Coordinates</p>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-xs">{Number(selectedRequest.request_latitude).toFixed(6)}, {Number(selectedRequest.request_longitude).toFixed(6)}</p>
                        <a
                          href={`https://www.google.com/maps?q=${selectedRequest.request_latitude},${selectedRequest.request_longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          <MapPin className="h-3 w-3" />
                          Open Map
                        </a>
                      </div>
                    </div>
                  )}
                  {!selectedRequest.lc1_name && !selectedRequest.request_latitude && (
                    <p className="text-xs text-muted-foreground col-span-2">No LC1 or GPS data captured for this request</p>
                  )}
                </div>
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
                <div className="space-y-3 rounded-xl border-2 border-primary/30 p-3 bg-primary/5">
                  <h4 className="text-sm font-bold flex items-center gap-2">💳 Payout Details</h4>
                  
                  {/* Landlord MoMo Info - Prominent */}
                  <div className="rounded-lg border border-border bg-background p-3 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Landlord Payment Info</p>
                    <p className="font-bold text-sm">{selectedRequest.landlord_name}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedRequest.landlord_momo && (
                        <span className="inline-flex items-center gap-1 text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded-md">
                          📱 MoMo: {selectedRequest.landlord_momo}
                        </span>
                      )}
                      {selectedRequest.landlord_phone && selectedRequest.landlord_phone !== selectedRequest.landlord_momo && (
                        <span className="inline-flex items-center gap-1 text-xs font-mono bg-muted px-2 py-1 rounded-md">
                          📞 {selectedRequest.landlord_phone}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Call or send MoMo directly to the landlord's number above, then enter the TID below.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Payout Method</label>
                    <Select value={payoutMethod} onValueChange={setPayoutMethod}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wallet">Wallet (Landlord has Rent Money)</SelectItem>
                        <SelectItem value="cash">Cash Payout (No Wallet)</SelectItem>
                        <SelectItem value="mobile_money">Mobile Money (Direct to Landlord)</SelectItem>
                        <SelectItem value="bank">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block">
                      {payoutMethod === 'mobile_money' ? 'MoMo Transaction ID (TID) *' :
                       payoutMethod === 'bank' ? 'Bank Reference *' :
                       payoutMethod === 'cash' ? 'Payment Voucher Number *' :
                       'Transaction Reference *'}
                    </label>
                    <Input
                      placeholder={
                        payoutMethod === 'mobile_money' ? 'Enter MoMo TID after sending' :
                        payoutMethod === 'bank' ? 'Enter bank transfer reference' :
                        payoutMethod === 'cash' ? 'Enter payment voucher number' :
                        'Enter transaction ID or reference'
                      }
                      value={payoutRef}
                      onChange={e => setPayoutRef(e.target.value)}
                      className="h-9 font-mono"
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
