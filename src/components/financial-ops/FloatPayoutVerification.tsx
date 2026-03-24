import { useState } from 'react';
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
  Landmark, MapPin, Image, CheckCircle2, XCircle, Loader2,
  Phone, User2, ExternalLink, Clock, Navigation, Hash, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const statusColors: Record<string, string> = {
  pending_agent_ops: 'bg-amber-500/20 text-amber-700',
  agent_ops_approved: 'bg-primary/20 text-primary',
  agent_ops_rejected: 'bg-destructive/20 text-destructive',
  completed: 'bg-emerald-500/20 text-emerald-700',
};

const statusLabels: Record<string, string> = {
  pending_agent_ops: 'Pending Review',
  agent_ops_approved: 'Ops Approved – Needs TID Verify',
  agent_ops_rejected: 'Rejected',
  completed: 'Completed',
};

export function FloatPayoutVerification() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verifyTid, setVerifyTid] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  // Fetch float withdrawals needing TID verification (agent_ops_approved or pending)
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
    refetchInterval: 30000,
  });

  const pendingCount = payouts.filter((p: any) => p.status === 'pending_agent_ops').length;
  const approvedCount = payouts.filter((p: any) => p.status === 'agent_ops_approved').length;

  const completeMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approve' | 'reject' | 'complete' }) => {
      const notes = reviewNotes[id] || '';
      const tid = verifyTid[id] || '';

      if (action === 'reject' && notes.length < 10) throw new Error('Rejection reason required (min 10 chars)');
      if (action === 'complete' && !tid.trim()) throw new Error('Transaction ID (TID) is required to complete verification');

      const payout = payouts.find((p: any) => p.id === id);
      if (!payout) throw new Error('Payout not found');

      if (action === 'approve') {
        // Agent Ops approval (moves from pending_agent_ops → agent_ops_approved)
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
        // Final verification with TID — mark as completed and trigger disbursement
        const { error } = await supabase
          .from('agent_float_withdrawals')
          .update({
            status: 'completed',
            transaction_id: tid.trim(),
            manager_reviewed_by: user!.id,
            manager_reviewed_at: new Date().toISOString(),
            manager_notes: notes || null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', id);
        if (error) throw error;

        // Now trigger the actual disbursement edge function to finalize ledger entries
        try {
          await supabase.functions.invoke('disburse-rent-to-landlord', {
            body: {
              rent_request_id: payout.rent_request_id,
              transaction_reference: tid.trim(),
              payout_method: payout.mobile_money_provider === 'MTN' ? 'mobile_money' : 'mobile_money',
              notes: `Agent float payout verified. TID: ${tid.trim()}. ${notes}`.trim(),
            },
          });
        } catch (disbErr) {
          console.warn('Disbursement finalization failed:', disbErr);
        }

        // Audit log
        await supabase.from('audit_logs').insert({
          user_id: user!.id,
          action_type: 'float_payout_tid_verified',
          table_name: 'agent_float_withdrawals',
          record_id: id,
          metadata: {
            transaction_id: tid.trim(),
            amount: payout.amount,
            landlord_name: payout.landlord_name,
            agent_id: payout.agent_id,
            notes,
          },
        });
      } else if (action === 'reject') {
        const { error } = await supabase
          .from('agent_float_withdrawals')
          .update({
            status: 'agent_ops_rejected',
            agent_ops_reviewed_by: user!.id,
            agent_ops_reviewed_at: new Date().toISOString(),
            agent_ops_notes: notes || null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', id);
        if (error) throw error;

        // Refund float balance
        const { data: floatData } = await supabase
          .from('agent_landlord_float')
          .select('balance, total_paid_out')
          .eq('agent_id', payout.agent_id)
          .single();
        if (floatData) {
          await supabase
            .from('agent_landlord_float')
            .update({
              balance: floatData.balance + payout.amount,
              total_paid_out: floatData.total_paid_out - payout.amount,
              updated_at: new Date().toISOString(),
            } as any)
            .eq('agent_id', payout.agent_id);
        }
      }
    },
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ['finops-float-payout-verification'] });
      const msg = action === 'complete' ? 'TID verified & disbursement finalized!' : action === 'approve' ? 'Payout approved!' : 'Payout rejected & float refunded.';
      toast.success(msg);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-2 px-3 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
          <Landmark className="h-4 w-4 text-chart-4" />
          Landlord Float Payouts
          <div className="flex gap-1 ml-auto">
            {pendingCount > 0 && <Badge variant="destructive" className="text-[10px] h-5">{pendingCount} pending</Badge>}
            {approvedCount > 0 && <Badge className="text-[10px] h-5 bg-amber-500">{approvedCount} needs TID</Badge>}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No pending float payout verifications</p>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {payouts.map((p: any) => {
                const expanded = expandedId === p.id;
                const agentToLandlordDist = p.agent_latitude && p.landlord_latitude
                  ? Math.round(haversineDistance(p.agent_latitude, p.agent_longitude, p.landlord_latitude, p.landlord_longitude))
                  : null;
                const needsTid = p.status === 'agent_ops_approved';

                return (
                  <Card key={p.id} className={`border ${needsTid ? 'border-amber-500/50 bg-amber-500/5' : ''}`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start sm:items-center justify-between cursor-pointer gap-2" onClick={() => setExpandedId(expanded ? null : p.id)}>
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">{p.landlord_name}</p>
                          <p className="text-xs text-muted-foreground truncate">Agent: {p.agent?.full_name || 'Unknown'}</p>
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
                          {/* Contact Details */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                            <div className="flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" /> Landlord: {p.landlord_phone}</div>
                            <div className="flex items-center gap-1"><User2 className="h-3 w-3 shrink-0" /> Tenant: {p.tenant?.full_name}</div>
                            <div className="flex items-center gap-1"><Clock className="h-3 w-3 shrink-0" /> {format(new Date(p.created_at), 'dd MMM HH:mm')}</div>
                            <div className="flex items-center gap-1"><Hash className="h-3 w-3 shrink-0" /> Provider: {p.mobile_money_provider}</div>
                            {p.transaction_id && (
                              <div className="flex items-center gap-1 col-span-full">
                                <span className="text-muted-foreground">Agent TID:</span>
                                <span className="font-mono font-bold">{p.transaction_id}</span>
                              </div>
                            )}
                          </div>

                          {/* GPS Analysis */}
                          <div className="p-2 rounded-lg bg-muted/50 space-y-1">
                            <p className="text-xs font-bold flex items-center gap-1"><Navigation className="h-3 w-3" /> GPS Analysis</p>
                            <div className="grid grid-cols-1 gap-1 text-[11px]">
                              {p.agent_latitude && (
                                <div className="flex items-center justify-between">
                                  <span>Agent GPS:</span>
                                  <a href={`https://www.google.com/maps?q=${p.agent_latitude},${p.agent_longitude}`} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-0.5 hover:underline">
                                    {Number(p.agent_latitude).toFixed(5)}, {Number(p.agent_longitude).toFixed(5)}
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                </div>
                              )}
                              {p.landlord_latitude && (
                                <div className="flex items-center justify-between">
                                  <span>Landlord GPS:</span>
                                  <a href={`https://www.google.com/maps?q=${p.landlord_latitude},${p.landlord_longitude}`} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-0.5 hover:underline">
                                    {Number(p.landlord_latitude).toFixed(5)}, {Number(p.landlord_longitude).toFixed(5)}
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                </div>
                              )}
                              {p.gps_distance_meters !== null && (
                                <div className="flex items-center justify-between">
                                  <span>Landlord ↔ Property:</span>
                                  <Badge variant={p.gps_match ? 'default' : 'destructive'} className="text-[10px]">
                                    {p.gps_distance_meters}m {p.gps_match ? '✓ Match' : '✗ Too far'}
                                  </Badge>
                                </div>
                              )}
                              {agentToLandlordDist !== null && (
                                <div className="flex items-center justify-between">
                                  <span>Agent ↔ Landlord:</span>
                                  <span className="font-mono text-[10px]">{agentToLandlordDist}m</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Receipt Photos */}
                          {p.receipt_photo_urls?.length > 0 && (
                            <div>
                              <p className="text-xs font-bold mb-1 flex items-center gap-1"><Image className="h-3 w-3" /> Receipts</p>
                              <div className="flex gap-2 flex-wrap">
                                {p.receipt_photo_urls.map((url: string, i: number) => (
                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                    <img src={url} alt={`Receipt ${i + 1}`} className="h-16 w-16 sm:h-20 sm:w-20 object-cover rounded border hover:opacity-80" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {p.notes && <p className="text-xs text-muted-foreground">Agent Notes: {p.notes}</p>}

                          {/* Actions */}
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

                          {p.status === 'agent_ops_approved' && (
                            <div className="space-y-3 pt-2 border-t">
                              <div className="p-3 rounded-lg bg-amber-500/10 border-2 border-amber-500/40">
                                <div className="flex items-center gap-2 mb-2">
                                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                                  <p className="text-sm font-bold text-amber-700">⚠️ Verify TID & Receipt</p>
                                </div>
                                <p className="text-xs text-muted-foreground mb-2">
                                  Verify the agent's transaction ID matches the MoMo payment and the landlord receipt is legitimate before finalizing.
                                </p>
                                <Label className="text-xs font-bold block mb-1">Verified Transaction ID (TID) *</Label>
                                <Input
                                  value={verifyTid[p.id] || ''}
                                  onChange={e => setVerifyTid(prev => ({ ...prev, [p.id]: e.target.value }))}
                                  placeholder="Enter verified TID from MoMo statement"
                                  className="font-mono text-base h-10 border-2 border-amber-500/30"
                                />
                                {p.transaction_id && (
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    Agent submitted TID: <span className="font-mono font-bold">{p.transaction_id}</span>
                                  </p>
                                )}
                              </div>
                              <Textarea
                                placeholder="Verification notes (optional)…"
                                value={reviewNotes[p.id] || ''}
                                onChange={e => setReviewNotes(prev => ({ ...prev, [p.id]: e.target.value }))}
                                className="h-14 text-sm"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" variant="destructive" className="flex-1 h-8 text-xs" disabled={completeMutation.isPending}
                                  onClick={() => completeMutation.mutate({ id: p.id, action: 'reject' })}>
                                  <XCircle className="h-3 w-3 mr-1" /> Reject
                                </Button>
                                <Button size="sm" className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700" disabled={completeMutation.isPending || !(verifyTid[p.id] || '').trim()}
                                  onClick={() => completeMutation.mutate({ id: p.id, action: 'complete' })}>
                                  {completeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                                  Verify & Complete
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
