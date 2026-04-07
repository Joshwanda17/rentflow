import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import {
  Landmark, CheckCircle2, XCircle, Loader2,
  Phone, User2, Clock, Hash, AlertCircle, Upload, Camera, Banknote, MapPin
} from 'lucide-react';
import { toast } from 'sonner';

const statusColors: Record<string, string> = {
  pending_agent_ops: 'bg-amber-500/20 text-amber-700',
  agent_ops_approved: 'bg-primary/20 text-primary',
  agent_ops_rejected: 'bg-destructive/20 text-destructive',
  completed: 'bg-emerald-500/20 text-emerald-700',
};

const statusLabels: Record<string, string> = {
  pending_agent_ops: 'Pending Review',
  agent_ops_approved: 'Ready to Pay – Enter TID',
  agent_ops_rejected: 'Rejected',
  completed: 'Completed',
};

const providerColors: Record<string, string> = {
  MTN: 'bg-yellow-500/20 text-yellow-700',
  Airtel: 'bg-red-500/20 text-red-700',
  Bank: 'bg-blue-500/20 text-blue-700',
  Cash: 'bg-emerald-500/20 text-emerald-700',
};

export function FloatPayoutVerification() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verifyTid, setVerifyTid] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [receiptFiles, setReceiptFiles] = useState<Record<string, File[]>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ['finops-float-payout-verification'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_float_withdrawals')
        .select('*')
        .in('status', ['pending_agent_ops', 'agent_ops_approved'])
        .order('created_at', { ascending: true });
      if (error) throw error;

      const enriched = await Promise.all((data || []).map(async (p: any) => {
        const [{ data: agent }, { data: tenant }] = await Promise.all([
          supabase.from('profiles').select('full_name, phone').eq('id', p.agent_id).single(),
          supabase.from('profiles').select('full_name, phone').eq('id', p.tenant_id).single(),
        ]);
        return { ...p, agent, tenant };
      }));
      return enriched;
    },
    enabled: !!user,
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const pendingCount = payouts.filter((p: any) => p.status === 'pending_agent_ops').length;
  const readyToPayCount = payouts.filter((p: any) => p.status === 'agent_ops_approved').length;

  const handleFiles = (id: string, files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    setReceiptFiles(prev => {
      const existing = prev[id] || [];
      return { ...prev, [id]: [...existing, ...arr].slice(0, 3) };
    });
  };

  const removeFile = (id: string, idx: number) => {
    setReceiptFiles(prev => ({
      ...prev,
      [id]: (prev[id] || []).filter((_, i) => i !== idx),
    }));
  };

  const completeMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approve' | 'reject' | 'complete' }) => {
      const notes = reviewNotes[id] || '';
      const tid = verifyTid[id] || '';
      const files = receiptFiles[id] || [];

      if (action === 'reject' && notes.length < 10) throw new Error('Rejection reason required (min 10 chars)');
      if (action === 'complete' && !tid.trim()) throw new Error('Transaction ID (TID) is required');

      const payout = payouts.find((p: any) => p.id === id);
      if (!payout) throw new Error('Payout not found');

      if (action === 'approve') {
        const { error } = await supabase
          .from('agent_float_withdrawals')
          .update({
            status: 'agent_ops_approved',
            agent_ops_reviewed_by: user!.id,
            agent_ops_reviewed_at: new Date().toISOString(),
            agent_ops_notes: notes || null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', id);
        if (error) throw error;

      } else if (action === 'complete') {
        // Upload receipt photos from Financial Ops
        const photoUrls: string[] = [];
        for (const file of files) {
          const ext = file.name.split('.').pop() || 'jpg';
          const path = `landlord-float-payouts/${payout.rent_request_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: upErr } = await supabase.storage.from('receipts').upload(path, file);
          if (!upErr) {
            const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);
            photoUrls.push(urlData.publicUrl);
          }
        }

        const { error } = await supabase
          .from('agent_float_withdrawals')
          .update({
            status: 'completed',
            transaction_id: tid.trim(),
            receipt_photo_urls: photoUrls.length > 0 ? photoUrls : null,
            manager_reviewed_by: user!.id,
            manager_reviewed_at: new Date().toISOString(),
            manager_notes: notes || null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', id);
        if (error) throw error;

        // Trigger disbursement
        try {
          await supabase.functions.invoke('disburse-rent-to-landlord', {
            body: {
              rent_request_id: payout.rent_request_id,
              transaction_reference: tid.trim(),
              payout_method: payout.mobile_money_provider === 'Bank' ? 'bank_transfer' : 'mobile_money',
              notes: `Landlord float payout verified. TID: ${tid.trim()}. ${notes}`.trim(),
            },
          });
        } catch (disbErr) {
          console.warn('Disbursement finalization failed:', disbErr);
        }

        // 1% commission to agent (platform expense, NOT charged to user)
        const commissionAmount = Number(payout.amount) * 0.01;
        if (commissionAmount > 0) {
          const commissionGroupId = `float_commission_${id}_${Date.now()}`;
          await supabase.from('general_ledger').insert([
            {
              user_id: payout.agent_id,
              direction: 'cash_in',
              amount: commissionAmount,
              category: 'agent_commission',
              description: `1% commission on float payout of ${payout.amount} to ${payout.landlord_name}`,
              ledger_scope: 'wallet',
              source_table: 'agent_float_withdrawals',
              source_id: id,
              transaction_group_id: commissionGroupId,
              role_type: 'agent',
            },
            {
              user_id: payout.agent_id,
              direction: 'cash_out',
              amount: commissionAmount,
              category: 'marketing_expense',
              description: `Platform commission (1%) for float payout TID: ${tid.trim()}`,
              ledger_scope: 'platform',
              source_table: 'agent_float_withdrawals',
              source_id: id,
              transaction_group_id: commissionGroupId,
            },
          ]);
        }

        await supabase.from('audit_logs').insert({
          user_id: user!.id,
          action_type: 'float_payout_tid_verified',
          table_name: 'agent_float_withdrawals',
          record_id: id,
          metadata: {
            transaction_id: tid.trim(),
            amount: payout.amount,
            commission: commissionAmount,
            landlord_name: payout.landlord_name,
            agent_id: payout.agent_id,
            payment_mode: payout.mobile_money_provider,
            receipt_count: photoUrls.length,
            notes,
          },
        });

      } else if (action === 'reject') {
        // Use edge function for proper rejection with refund, notification & audit
        const { error: rejectErr } = await supabase.functions.invoke('reject-withdrawal', {
          body: {
            withdrawal_ids: [id],
            reason: notes,
            withdrawal_type: 'float',
          },
        });
        if (rejectErr) throw rejectErr;
      }
    },
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ['finops-float-payout-verification'] });
      const msg = action === 'complete' ? 'Payment completed & TID recorded!' : action === 'approve' ? 'Approved – ready for payment!' : 'Rejected & float refunded.';
      toast.success(msg);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-2 px-3 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
          <Landmark className="h-4 w-4 text-chart-4" />
          Landlord Float Withdrawals
          <div className="flex gap-1 ml-auto">
            {pendingCount > 0 && <Badge variant="destructive" className="text-[10px] h-5">{pendingCount} pending</Badge>}
            {readyToPayCount > 0 && <Badge className="text-[10px] h-5 bg-amber-500">{readyToPayCount} ready to pay</Badge>}
          </div>
        </CardTitle>
        <p className="text-xs text-muted-foreground">Verify agent-submitted TID & receipts for landlord payouts from their float</p>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No pending landlord float withdrawals</p>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {payouts.map((p: any) => {
                const expanded = expandedId === p.id;
                const needsPayment = p.status === 'agent_ops_approved';
                const files = receiptFiles[p.id] || [];

                return (
                  <Card key={p.id} className={`border ${needsPayment ? 'border-amber-500/50 bg-amber-500/5' : ''}`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between cursor-pointer gap-2" onClick={() => setExpandedId(expanded ? null : p.id)}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm truncate">{p.landlord_name}</p>
                            <Badge className={`text-[9px] h-4 ${providerColors[p.mobile_money_provider] || 'bg-muted'}`}>
                              {p.mobile_money_provider}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            Agent: {p.agent?.full_name || 'Unknown'} · Tenant: {p.tenant?.full_name || 'Unknown'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-sm">{formatUGX(p.amount)}</p>
                          <Badge className={`text-[10px] ${statusColors[p.status] || ''}`}>
                            {statusLabels[p.status] || p.status}
                          </Badge>
                        </div>
                      </div>

                      {expanded && (
                        <div className="space-y-3 pt-2 border-t">
                          {/* GPS Proximity — HIGH VISIBILITY */}
                          <div className={`p-3 rounded-lg border-2 ${
                            p.gps_distance_meters == null
                              ? 'bg-muted/50 border-muted'
                              : p.gps_match
                              ? 'bg-success/10 border-success/40'
                              : 'bg-destructive/10 border-destructive/40'
                          }`}>
                            <div className="flex items-center gap-2">
                              <MapPin className={`h-4 w-4 shrink-0 ${
                                p.gps_distance_meters == null ? 'text-muted-foreground' : p.gps_match ? 'text-success' : 'text-destructive'
                              }`} />
                              <div className="flex-1">
                                <p className={`text-xs font-bold ${
                                  p.gps_distance_meters == null ? 'text-muted-foreground' : p.gps_match ? 'text-success' : 'text-destructive'
                                }`}>
                                  {p.gps_distance_meters == null
                                    ? '⚠ No GPS Data — Property coordinates missing'
                                    : p.gps_match
                                    ? `✅ GPS Verified — Agent was ${p.gps_distance_meters}m from property (within 500m)`
                                    : `❌ GPS MISMATCH — Agent was ${p.gps_distance_meters}m from property (>500m threshold)`
                                  }
                                </p>
                                {p.agent_latitude && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    Agent: {p.agent_latitude?.toFixed(5)}, {p.agent_longitude?.toFixed(5)}
                                    {p.property_latitude && <> · Property: {p.property_latitude?.toFixed(5)}, {p.property_longitude?.toFixed(5)}</>}
                                    {p.agent_location_accuracy && <> · Accuracy: ±{Math.round(p.agent_location_accuracy)}m</>}
                                  </p>
                                )}
                              </div>
                            </div>
                            {!p.gps_match && p.gps_distance_meters != null && (
                              <p className="text-[10px] text-destructive font-medium mt-1 ml-6">
                                ⚠ Manual review required — agent may not have been at the property when paying
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                            <div className="flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" /> Landlord: {p.landlord_phone}</div>
                            <div className="flex items-center gap-1"><User2 className="h-3 w-3 shrink-0" /> Agent: {p.agent?.phone || 'N/A'}</div>
                            <div className="flex items-center gap-1"><Clock className="h-3 w-3 shrink-0" /> {format(new Date(p.created_at), 'dd MMM HH:mm')}</div>
                            <div className="flex items-center gap-1"><Hash className="h-3 w-3 shrink-0" /> Mode: {p.mobile_money_provider}</div>
                            {p.transaction_id && (
                              <div className="flex items-center gap-1 col-span-full">
                                <Hash className="h-3 w-3 shrink-0 text-chart-4" />
                                <span className="text-muted-foreground">Agent TID:</span>
                                <span className="font-mono font-bold">••••{p.transaction_id.slice(-2)}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1 col-span-full">
                              <Banknote className="h-3 w-3 shrink-0 text-chart-4" />
                              <span className="text-muted-foreground">Type:</span>
                              <Badge variant="outline" className="text-[9px] border-chart-4/40 text-chart-4">Landlord Float Withdrawal</Badge>
                            </div>
                          </div>

                          {/* Agent receipt photos */}
                          {(p.receipt_photo_urls?.length > 0) && (
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground mb-1">Agent Receipt Photos:</p>
                              <div className="flex gap-2 flex-wrap">
                                {p.receipt_photo_urls.map((url: string, i: number) => (
                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                    <img src={url} alt={`Receipt ${i + 1}`} className="h-16 w-16 object-cover rounded border hover:ring-2 ring-chart-4" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {p.notes && <p className="text-xs text-muted-foreground">Agent Notes: {p.notes}</p>}

                          {/* Pending: Approve or Reject */}
                          {p.status === 'pending_agent_ops' && (
                            <div className="space-y-2 pt-2 border-t">
                              <Textarea
                                placeholder="Review notes…"
                                value={reviewNotes[p.id] || ''}
                                onChange={e => setReviewNotes(prev => ({ ...prev, [p.id]: e.target.value }))}
                                className="h-14 text-sm"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" variant="destructive" className="flex-1 h-8 text-xs" disabled={completeMutation.isPending}
                                  onClick={() => completeMutation.mutate({ id: p.id, action: 'reject' })}>
                                  <XCircle className="h-3 w-3 mr-1" /> Reject
                                </Button>
                                <Button size="sm" className="flex-1 h-8 text-xs" disabled={completeMutation.isPending}
                                  onClick={() => completeMutation.mutate({ id: p.id, action: 'approve' })}>
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Approved: Pay landlord → Enter TID + Receipt */}
                          {p.status === 'agent_ops_approved' && (
                            <div className="space-y-3 pt-2 border-t">
                              <div className="p-3 rounded-lg bg-amber-500/10 border-2 border-amber-500/40">
                              <div className="flex items-center gap-2 mb-2">
                                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                                  <p className="text-sm font-bold text-amber-700">Verify Agent Payment</p>
                                </div>
                                <p className="text-xs text-muted-foreground mb-3">
                                  Agent paid <strong>{formatUGX(p.amount)}</strong> to <strong>{p.landlord_name}</strong> via <strong>{p.mobile_money_provider}</strong>.
                                  {p.transaction_id && <> Agent TID hint: <strong className="font-mono">••••{p.transaction_id.slice(-2)}</strong></>}
                                </p>
                                {(p.receipt_photo_urls?.length > 0) && (
                                  <div className="mb-3">
                                    <p className="text-[10px] font-bold text-muted-foreground mb-1">Agent Receipts:</p>
                                    <div className="flex gap-2 flex-wrap">
                                      {p.receipt_photo_urls.map((url: string, i: number) => (
                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                          <img src={url} alt={`Receipt ${i + 1}`} className="h-16 w-16 object-cover rounded border hover:ring-2 ring-chart-4" />
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <Label className="text-xs font-bold block mb-1">Confirm TID (re-enter to verify) *</Label>
                                <Input
                                  value={verifyTid[p.id] || ''}
                                  onChange={e => setVerifyTid(prev => ({ ...prev, [p.id]: e.target.value }))}
                                  placeholder={p.transaction_id ? `Hint: ••••${p.transaction_id.slice(-2)} — enter full TID to verify` : 'Enter verified TID'}
                                  className="font-mono text-base h-10 border-2 border-amber-500/30"
                                />
                              </div>

                              {/* Receipt upload */}
                              <div>
                                <Label className="text-xs font-bold mb-1 block flex items-center gap-1">
                                  <Camera className="h-3 w-3" /> Receipt Photos (optional)
                                </Label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  ref={el => { fileRefs.current[p.id] = el; }}
                                  onChange={e => handleFiles(p.id, e.target.files)}
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full text-xs"
                                  onClick={() => fileRefs.current[p.id]?.click()}
                                >
                                  <Upload className="h-3 w-3 mr-1" />
                                  Upload Receipt ({files.length}/3)
                                </Button>
                                {files.length > 0 && (
                                  <div className="flex gap-2 mt-2 flex-wrap">
                                    {files.map((f, i) => (
                                      <div key={i} className="relative">
                                        <img src={URL.createObjectURL(f)} alt={`Receipt ${i + 1}`} className="h-14 w-14 object-cover rounded border" />
                                        <button
                                          onClick={() => removeFile(p.id, i)}
                                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                                        >×</button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <Textarea
                                placeholder="Payment notes…"
                                value={reviewNotes[p.id] || ''}
                                onChange={e => setReviewNotes(prev => ({ ...prev, [p.id]: e.target.value }))}
                                className="h-12 text-sm"
                              />

                              <div className="flex gap-2">
                                <Button size="sm" variant="destructive" className="flex-1 h-9 text-xs" disabled={completeMutation.isPending}
                                  onClick={() => completeMutation.mutate({ id: p.id, action: 'reject' })}>
                                  <XCircle className="h-3 w-3 mr-1" /> Reject
                                </Button>
                                <Button size="sm" className="flex-1 h-9 text-xs bg-emerald-600 hover:bg-emerald-700" disabled={completeMutation.isPending || !(verifyTid[p.id] || '').trim()}
                                  onClick={() => completeMutation.mutate({ id: p.id, action: 'complete' })}>
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Complete Payment
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
