import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { ShieldQuestion, CheckCircle2, XCircle, Phone, Loader2, UserCircle } from 'lucide-react';
import { notifyVerificationResolved } from '@/lib/landlordVerificationNotify';

interface VerificationRequest {
  id: string;
  landlord_id: string;
  landlord_name: string | null;
  landlord_phone: string | null;
  requested_by: string;
  agent_name: string | null;
  agent_phone: string | null;
  note: string | null;
  created_at: string;
}

interface Props {
  onResolved?: () => void;
}

/**
 * Agent-initiated landlord verification requests.
 * Shown very prominently on the Landlord Ops dashboard so operators can
 * verify (or reject with a comment) a landlord an agent flagged while trying
 * to post a rent request.
 */
export function AgentVerificationRequestsPanel({ onResolved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('landlord_verification_requests')
      .select('id, landlord_id, landlord_name, landlord_phone, requested_by, agent_name, agent_phone, note, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (!error) setRequests((data ?? []) as VerificationRequest[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('landlord-verification-requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'landlord_verification_requests' },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const handleVerify = async (req: VerificationRequest) => {
    if (!user) return;
    setBusyId(req.id);
    try {
      const { error: llErr } = await supabase
        .from('landlords')
        .update({ verified: true, verified_at: new Date().toISOString(), verified_by: user.id })
        .eq('id', req.landlord_id);
      if (llErr) throw llErr;
      const { error: reqErr } = await supabase
        .from('landlord_verification_requests')
        .update({ status: 'verified', resolved_by: user.id, resolved_at: new Date().toISOString() })
        .eq('id', req.id);
      if (reqErr) throw reqErr;
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'landlord_verified',
        table_name: 'landlords',
        record_id: req.landlord_id,
        metadata: {
          landlord_name: req.landlord_name,
          reason: `Verified from agent request (${req.agent_name || 'agent'})`,
          verified_by: 'landlord_ops',
        },
      });
      toast({ title: '✅ Landlord verified', description: `${req.landlord_name || 'Landlord'} is now verified.` });
      setRequests(prev => prev.filter(r => r.id !== req.id));
      void notifyVerificationResolved({
        status: 'verified',
        agentId: req.requested_by,
        landlordId: req.landlord_id,
        landlordName: req.landlord_name,
        landlordPhone: req.landlord_phone,
        requestId: req.id,
      });
      onResolved?.();
    } catch (err: any) {
      toast({ title: 'Verify failed', description: err?.message || 'Could not verify landlord', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (req: VerificationRequest) => {
    if (!user) return;
    const comment = rejectComment.trim();
    if (comment.length < 10) {
      toast({ title: 'Add a comment', description: 'Please give at least 10 characters explaining the rejection.', variant: 'destructive' });
      return;
    }
    setBusyId(req.id);
    try {
      const { error } = await supabase
        .from('landlord_verification_requests')
        .update({ status: 'rejected', reject_comment: comment, resolved_by: user.id, resolved_at: new Date().toISOString() })
        .eq('id', req.id);
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'landlord_verification_rejected',
        table_name: 'landlords',
        record_id: req.landlord_id,
        metadata: { landlord_name: req.landlord_name, reason: comment, rejected_by: 'landlord_ops' },
      });
      toast({ title: 'Request rejected', description: `${req.landlord_name || 'Landlord'} was rejected with a comment.` });
      setRequests(prev => prev.filter(r => r.id !== req.id));
      setRejectingId(null);
      setRejectComment('');
      void notifyVerificationResolved({
        status: 'rejected',
        agentId: req.requested_by,
        landlordId: req.landlord_id,
        landlordName: req.landlord_name,
        landlordPhone: req.landlord_phone,
        comment,
        requestId: req.id,
      });
      onResolved?.();
    } catch (err: any) {
      toast({ title: 'Reject failed', description: err?.message || 'Could not reject request', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  if (loading || requests.length === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-amber-500/50 bg-amber-50/60 dark:bg-amber-500/5 p-4 space-y-3 shadow-sm">
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-xl bg-amber-500/15">
          <ShieldQuestion className="h-[18px] w-[18px] text-amber-600 shrink-0" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-tight flex items-center gap-2">
            Agents requesting landlord verification
            <Badge className="bg-amber-600 text-white hover:bg-amber-600">{requests.length}</Badge>
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            An agent tried to post a rent request but the landlord is registered &amp; not yet verified.
          </p>
        </div>
      </div>

      <ul className="space-y-2.5">
        {requests.map(req => (
          <li key={req.id} className="rounded-xl border border-amber-500/40 bg-background p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm text-foreground truncate">
                  {req.landlord_name || 'Unnamed landlord'}
                </p>
                {req.landlord_phone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <Phone className="h-3 w-3 shrink-0" /> {req.landlord_phone}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1 truncate">
                  <UserCircle className="h-3.5 w-3.5 shrink-0" />
                  Requested by <span className="font-medium text-foreground">{req.agent_name || 'Agent'}</span>
                  {req.agent_phone ? ` · ${req.agent_phone}` : ''}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 border-amber-500/40 text-amber-700 text-[10px]">
                Pending
              </Badge>
            </div>

            {rejectingId === req.id ? (
              <div className="space-y-2">
                <Textarea
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  placeholder="Add a comment explaining why this landlord is rejected (min 10 characters)…"
                  className="min-h-[64px] text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    disabled={busyId === req.id}
                    onClick={() => handleReject(req)}
                  >
                    {busyId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
                    Confirm reject
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1"
                    disabled={busyId === req.id}
                    onClick={() => { setRejectingId(null); setRejectComment(''); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={busyId === req.id}
                  onClick={() => handleVerify(req)}
                >
                  {busyId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                  Verify landlord
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-rose-500/40 text-rose-700 hover:bg-rose-50"
                  disabled={busyId === req.id}
                  onClick={() => { setRejectingId(req.id); setRejectComment(''); }}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Reject
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
