import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Phone, MessageCircle, User, ArrowLeft, MapPin, FileSearch, Pencil, Save, X, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { calculateRentRepayment } from '@/lib/rentCalculations';
import { Textarea } from '@/components/ui/textarea';

const statusColor = (s: string) => {
  const m: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    tenant_ops_approved: 'bg-blue-100 text-blue-700',
    agent_verified: 'bg-purple-100 text-purple-700',
    funded: 'bg-green-100 text-green-700',
    disbursed: 'bg-teal-100 text-teal-700',
    repaying: 'bg-purple-100 text-purple-700',
    fully_repaid: 'bg-emerald-100 text-emerald-700',
    defaulted: 'bg-destructive/10 text-destructive',
  };
  return m[s] || 'bg-muted';
};

interface TenantDetailPanelProps {
  tenantId: string;
  tenantName: string;
  onBack: () => void;
  onViewRegistration?: () => void;
}

export function TenantDetailPanel({ tenantId, tenantName, onBack, onViewRegistration }: TenantDetailPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Profile edit state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileEdit, setProfileEdit] = useState({ full_name: '', phone: '', city: '' });

  // Request edit state — keyed by request id
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [savingRequest, setSavingRequest] = useState(false);
  const [requestEdit, setRequestEdit] = useState({ rent_amount: '', duration_days: '', reason: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-detail', tenantId],
    queryFn: async () => {
      const [profileRes, requestsRes, walletRes, collectionsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, phone, city, created_at').eq('id', tenantId).maybeSingle(),
        supabase.from('rent_requests').select('id, status, rent_amount, amount_repaid, daily_repayment, duration_days, access_fee, request_fee, total_repayment, created_at, landlord_id, agent_id, assigned_agent_id').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
        supabase.from('wallet_transactions').select('id, amount, type, created_at, description').or(`sender_id.eq.${tenantId},recipient_id.eq.${tenantId}`).order('created_at', { ascending: false }).limit(10),
        supabase.from('agent_collections').select('id, amount, created_at, agent_id, payment_method').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
      ]);

      const agentIds = [...new Set((requestsRes.data || []).flatMap(r => [r.assigned_agent_id, r.agent_id]).filter(Boolean))] as string[];
      const agentRes = agentIds.length > 0
        ? await supabase.from('profiles').select('id, full_name, phone').in('id', agentIds)
        : { data: [] as { id: string; full_name: string; phone: string }[] };
      const agentMap = new Map((agentRes.data || []).map(a => [a.id, a]));

      const landlordIds = [...new Set((requestsRes.data || []).map(r => r.landlord_id).filter(Boolean))] as string[];
      const landlordRes = landlordIds.length > 0
        ? await supabase.from('landlords').select('id, name, phone').in('id', landlordIds)
        : { data: [] as { id: string; name: string; phone: string }[] };
      const landlordMap = new Map((landlordRes.data || []).map(l => [l.id, l]));

      return {
        profile: profileRes.data,
        requests: (requestsRes.data || []).map(r => {
          const effectiveAgentId = r.assigned_agent_id || r.agent_id;
          return {
            ...r,
            agent_name: (effectiveAgentId && agentMap.get(effectiveAgentId)?.full_name) || 'Not Assigned',
            landlord_name: landlordMap.get(r.landlord_id)?.name || '—',
          };
        }),
        walletTxns: walletRes.data || [],
        collections: collectionsRes.data || [],
      };
    },
  });

  const profile = data?.profile;
  const requests = data?.requests || [];
  const totalRent = requests.reduce((s, r) => s + Number(r.rent_amount || 0), 0);
  const totalRepaid = requests.reduce((s, r) => s + Number(r.amount_repaid || 0), 0);

  // --- Profile edit handlers ---
  const startEditProfile = () => {
    setProfileEdit({
      full_name: profile?.full_name || '',
      phone: profile?.phone || '',
      city: profile?.city || '',
    });
    setIsEditingProfile(true);
  };

  const cancelEditProfile = () => {
    setIsEditingProfile(false);
  };

  const saveProfile = async () => {
    if (!profileEdit.full_name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSavingProfile(true);
    try {
      const changes: Record<string, { from: string; to: string }> = {};
      if (profileEdit.full_name !== (profile?.full_name || '')) changes.full_name = { from: profile?.full_name || '', to: profileEdit.full_name };
      if (profileEdit.phone !== (profile?.phone || '')) changes.phone = { from: profile?.phone || '', to: profileEdit.phone };
      if (profileEdit.city !== (profile?.city || '')) changes.city = { from: profile?.city || '', to: profileEdit.city };

      if (Object.keys(changes).length === 0) {
        setIsEditingProfile(false);
        return;
      }

      const { error } = await supabase.from('profiles').update({
        full_name: profileEdit.full_name.trim(),
        phone: profileEdit.phone.trim(),
        city: profileEdit.city.trim() || null,
      }).eq('id', tenantId);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        action_type: 'tenant_profile_edit',
        user_id: user?.id || null,
        record_id: tenantId,
        table_name: 'profiles',
        metadata: { changes },
      });

      queryClient.invalidateQueries({ queryKey: ['tenant-detail', tenantId] });
      toast.success('Profile updated');
      setIsEditingProfile(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingProfile(false);
    }
  };

  // --- Request edit handlers ---
  const startEditRequest = (req: typeof requests[0]) => {
    setRequestEdit({
      rent_amount: String(req.rent_amount || 0),
      duration_days: String(req.duration_days || 0),
      reason: '',
    });
    setEditingRequestId(req.id);
  };

  const cancelEditRequest = () => {
    setEditingRequestId(null);
  };

  const saveRequest = async (reqId: string) => {
    const amount = Number(requestEdit.rent_amount);
    const days = Number(requestEdit.duration_days);
    const reason = requestEdit.reason.trim();
    if (!amount || amount <= 0) { toast.error('Rent amount must be positive'); return; }
    if (!days || days <= 0) { toast.error('Duration days must be positive'); return; }
    if (reason.length < 10) { toast.error('Reason must be at least 10 characters'); return; }

    setSavingRequest(true);
    try {
      const originalReq = requests.find(r => r.id === reqId);
      if (!originalReq) throw new Error('Request not found');

      // Recompute fees from rent_amount + duration_days using the canonical engine
      const calc = calculateRentRepayment(amount, days);
      const repaid = Number(originalReq.amount_repaid || 0);

      if (repaid > calc.totalRepayment) {
        toast.error(`Cannot lower below repaid amount (UGX ${repaid.toLocaleString()}). New total would be UGX ${calc.totalRepayment.toLocaleString()}.`);
        setSavingRequest(false);
        return;
      }

      const before = {
        rent_amount: Number(originalReq.rent_amount || 0),
        duration_days: Number(originalReq.duration_days || 0),
        access_fee: Number((originalReq as any).access_fee || 0),
        request_fee: Number((originalReq as any).request_fee || 0),
        total_repayment: Number((originalReq as any).total_repayment || 0),
        daily_repayment: Number(originalReq.daily_repayment || 0),
      };
      const after = {
        rent_amount: amount,
        duration_days: days,
        access_fee: calc.accessFee,
        request_fee: calc.requestFee,
        total_repayment: calc.totalRepayment,
        daily_repayment: calc.dailyRepayment,
      };

      const { error } = await supabase.from('rent_requests').update(after).eq('id', reqId);
      if (error) throw error;

      // Sync the active subscription charge (cron). Compute new end_date from created_at + new duration.
      const startDate = new Date(originalReq.created_at);
      const newEnd = new Date(startDate);
      newEnd.setDate(newEnd.getDate() + days);
      const { error: subErr } = await supabase
        .from('subscription_charges')
        .update({ charge_amount: calc.dailyRepayment, end_date: newEnd.toISOString().slice(0, 10) })
        .eq('rent_request_id', reqId)
        .in('status', ['active', 'pending']);
      if (subErr) console.warn('Subscription charge sync warning:', subErr);

      await supabase.from('audit_logs').insert({
        action_type: 'tenant_ops_rent_correction',
        user_id: user?.id || null,
        record_id: reqId,
        table_name: 'rent_requests',
        metadata: { tenant_id: tenantId, before, after, reason },
      });

      queryClient.invalidateQueries({ queryKey: ['tenant-detail', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['exec-tenant-ops'] });
      queryClient.invalidateQueries({ queryKey: ['coo-tenant-balances'] });
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('cfo-') });
      toast.success(`Rent corrected — daily charge updated to UGX ${calc.dailyRepayment.toLocaleString()}`);
      setEditingRequestId(null);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingRequest(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button variant="ghost" onClick={onBack} className="h-10 px-3 gap-2 text-sm font-semibold -ml-1">
        <ArrowLeft className="h-4 w-4" /> Back · {tenantName}
      </Button>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* Profile card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  {isEditingProfile ? (
                    <div className="space-y-2">
                      <Input placeholder="Full name" value={profileEdit.full_name} onChange={e => setProfileEdit(v => ({ ...v, full_name: e.target.value }))} className="h-8 text-sm" />
                      <Input placeholder="Phone" value={profileEdit.phone} onChange={e => setProfileEdit(v => ({ ...v, phone: e.target.value }))} className="h-8 text-sm" />
                      <Input placeholder="City" value={profileEdit.city} onChange={e => setProfileEdit(v => ({ ...v, city: e.target.value }))} className="h-8 text-sm" />
                    </div>
                  ) : (
                    <>
                      <p className="font-bold text-foreground">{profile?.full_name || tenantName}</p>
                      <p className="text-sm text-muted-foreground">{profile?.phone || '—'}</p>
                      {profile?.city && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" />{profile.city}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="flex gap-1.5">
                  {isEditingProfile ? (
                    <>
                      <Button variant="outline" size="icon" className="h-9 w-9" onClick={cancelEditProfile} disabled={savingProfile}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="icon" className="h-9 w-9" onClick={saveProfile} disabled={savingProfile}>
                        {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={startEditProfile}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {profile?.phone && (
                        <>
                          <Button variant="outline" size="icon" className="h-9 w-9" asChild>
                            <a href={`tel:${profile.phone}`}><Phone className="h-4 w-4" /></a>
                          </Button>
                          <Button variant="outline" size="icon" className="h-9 w-9" asChild>
                            <a href={`https://wa.me/${profile.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                              <MessageCircle className="h-4 w-4" />
                            </a>
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
              {onViewRegistration && !isEditingProfile && (
                <Button variant="soft" size="sm" className="mt-2 w-full gap-1.5 text-xs" onClick={onViewRegistration}>
                  <FileSearch className="h-3.5 w-3.5" /> View Registration Info
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-2">
            <Card><CardContent className="p-3 text-center">
              <p className="text-lg font-extrabold text-foreground">{requests.length}</p>
              <p className="text-[10px] text-muted-foreground">Requests</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-lg font-extrabold text-emerald-600">UGX {totalRepaid.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Total Repaid</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-lg font-extrabold text-amber-600">UGX {(totalRent - totalRepaid).toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Outstanding</p>
            </CardContent></Card>
          </div>

          {/* Rent requests */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rent Requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {requests.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">No requests</p>
              ) : (
                <div className="divide-y divide-border">
                  {requests.map((req) => {
                    const isEditing = editingRequestId === req.id;
                    return (
                      <div key={req.id} className="px-4 py-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', statusColor(req.status || ''))}>
                            {(req.status || '').replace(/_/g, ' ')}
                          </Badge>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(req.created_at), 'dd MMM yyyy')}
                            </span>
                            {!isEditing && (
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEditRequest(req)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {isEditing ? (
                          (() => {
                            const newAmount = Number(requestEdit.rent_amount) || 0;
                            const newDays = Number(requestEdit.duration_days) || 0;
                            const canPreview = newAmount > 0 && newDays > 0;
                            const preview = canPreview ? calculateRentRepayment(newAmount, newDays) : null;
                            const repaid = Number(req.amount_repaid || 0);
                            const newOutstanding = preview ? preview.totalRepayment - repaid : 0;
                            const reasonOk = requestEdit.reason.trim().length >= 10;
                            const outstandingOk = preview ? preview.totalRepayment >= repaid : false;
                            const canSave = canPreview && reasonOk && outstandingOk;
                            return (
                              <div className="space-y-2 pt-1">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-muted-foreground">Rent Amount (UGX)</label>
                                    <Input type="number" value={requestEdit.rent_amount} onChange={e => setRequestEdit(v => ({ ...v, rent_amount: e.target.value }))} className="h-8 text-sm" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-muted-foreground">Duration (days)</label>
                                    <Input type="number" value={requestEdit.duration_days} onChange={e => setRequestEdit(v => ({ ...v, duration_days: e.target.value }))} className="h-8 text-sm" />
                                  </div>
                                </div>
                                {preview && (
                                  <div className="rounded-md bg-muted/50 p-2 text-[11px] space-y-0.5">
                                    <div className="flex justify-between"><span className="text-muted-foreground">Access Fee</span><span>UGX {preview.accessFee.toLocaleString()}</span></div>
                                    <div className="flex justify-between"><span className="text-muted-foreground">Request Fee</span><span>UGX {preview.requestFee.toLocaleString()}</span></div>
                                    <div className="flex justify-between font-semibold"><span>New Total Repayment</span><span>UGX {preview.totalRepayment.toLocaleString()}</span></div>
                                    <div className="flex justify-between"><span className="text-muted-foreground">New Daily</span><span>UGX {preview.dailyRepayment.toLocaleString()}</span></div>
                                    <div className={cn('flex justify-between font-semibold pt-1 border-t border-border/40', !outstandingOk && 'text-destructive')}>
                                      <span>New Outstanding</span>
                                      <span>UGX {newOutstanding.toLocaleString()}</span>
                                    </div>
                                    {!outstandingOk && (
                                      <p className="text-destructive text-[10px]">New total is below already-repaid (UGX {repaid.toLocaleString()}).</p>
                                    )}
                                  </div>
                                )}
                                <div>
                                  <label className="text-[10px] text-muted-foreground">Reason for correction (min 10 chars)</label>
                                  <Textarea
                                    value={requestEdit.reason}
                                    onChange={e => setRequestEdit(v => ({ ...v, reason: e.target.value }))}
                                    rows={2}
                                    className="text-sm"
                                    placeholder="Explain why this rent is being corrected…"
                                  />
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={cancelEditRequest} disabled={savingRequest}>
                                    Cancel
                                  </Button>
                                  <Button size="sm" className="h-7 text-xs gap-1" onClick={() => saveRequest(req.id)} disabled={savingRequest || !canSave}>
                                    {savingRequest ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                    Save
                                  </Button>
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <>
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-semibold">UGX {Number(req.rent_amount || 0).toLocaleString()}</span>
                              <span className="text-muted-foreground">
                                Repaid: UGX {Number(req.amount_repaid || 0).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                              <span className="font-medium text-foreground/80">
                                Agent: <span className="font-normal text-muted-foreground">{req.agent_name}</span>
                              </span>
                              <span>Landlord: {req.landlord_name}</span>
                              {req.daily_repayment && <span>Daily: UGX {Number(req.daily_repayment).toLocaleString()}</span>}
                              {req.duration_days && <span>{req.duration_days}d</span>}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent collections */}
          {data?.collections && data.collections.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Recent Collections</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {data.collections.map((c) => (
                    <div key={c.id} className="px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">UGX {Number(c.amount).toLocaleString()}</p>
                        <p className="text-[11px] text-muted-foreground">{c.payment_method}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(c.created_at), 'dd MMM, HH:mm')}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
