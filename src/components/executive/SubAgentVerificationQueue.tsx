import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { UsersRound, CheckCircle, XCircle, Loader2, Phone, Calendar, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface SubAgentRecord {
  id: string;
  parent_agent_id: string;
  sub_agent_id: string;
  source: string;
  status: string;
  created_at: string;
  verified_at: string | null;
  rejection_reason: string | null;
  parent_name: string;
  parent_phone: string;
  sub_name: string;
  sub_phone: string;
}

export function SubAgentVerificationQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('pending');

  const { data: records, isLoading } = useQuery({
    queryKey: ['subagent-verification-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_subagents' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as any[];
      if (rows.length === 0) return [];

      const allIds = [...new Set(rows.flatMap(r => [r.parent_agent_id, r.sub_agent_id]))];
      const BATCH = 50;
      const profiles: Record<string, any> = {};
      for (let i = 0; i < allIds.length; i += BATCH) {
        const { data: batch } = await supabase.from('profiles')
          .select('id, full_name, phone')
          .in('id', allIds.slice(i, i + BATCH));
        (batch || []).forEach(p => { profiles[p.id] = p; });
      }

      return rows.map(r => ({
        ...r,
        parent_name: profiles[r.parent_agent_id]?.full_name || 'Unknown',
        parent_phone: profiles[r.parent_agent_id]?.phone || '—',
        sub_name: profiles[r.sub_agent_id]?.full_name || 'Unknown',
        sub_phone: profiles[r.sub_agent_id]?.phone || '—',
      })) as SubAgentRecord[];
    },
    staleTime: 30000,
  });

  const pending = (records || []).filter(r => r.status === 'pending');
  const verified = (records || []).filter(r => r.status === 'verified');

  const handleVerify = async (id: string) => {
    if (!user?.id) return;
    setProcessingId(id);
    try {
      const { error } = await supabase
        .from('agent_subagents' as any)
        .update({
          status: 'verified',
          verified_by: user.id,
          verified_at: new Date().toISOString(),
        } as any)
        .eq('id', id);
      if (error) throw error;
      toast.success('Sub-agent verified! Commission credited to parent agent.');
      queryClient.invalidateQueries({ queryKey: ['subagent-verification-queue'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectionReason.trim() || rejectionReason.trim().length < 10) {
      toast.error('Please provide a reason (at least 10 characters).');
      return;
    }
    setProcessingId(id);
    try {
      const { error } = await supabase
        .from('agent_subagents' as any)
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason.trim(),
        } as any)
        .eq('id', id);
      if (error) throw error;
      toast.success('Sub-agent registration rejected.');
      setRejectingId(null);
      setRejectionReason('');
      queryClient.invalidateQueries({ queryKey: ['subagent-verification-queue'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject');
    } finally {
      setProcessingId(null);
    }
  };

  const renderCard = (r: SubAgentRecord, showActions: boolean) => (
    <div key={r.id} className="rounded-xl border border-border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">
            {r.sub_name}
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" />{r.sub_phone}
          </p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium shrink-0">
          {r.source}
        </span>
      </div>

      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>Parent: <span className="font-medium text-foreground">{r.parent_name}</span> ({r.parent_phone})</p>
        <p className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {format(new Date(r.created_at), 'dd MMM yyyy HH:mm')}
        </p>
        {r.verified_at && (
          <p className="flex items-center gap-1 text-success">
            <CheckCircle className="h-3 w-3" />
            Verified {format(new Date(r.verified_at), 'dd MMM yyyy')}
          </p>
        )}
        {r.rejection_reason && (
          <p className="text-destructive">Reason: {r.rejection_reason}</p>
        )}
      </div>

      {showActions && (
        rejectingId === r.id ? (
          <div className="space-y-2">
            <Input
              placeholder="Reason for rejection (min 10 chars)"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              maxLength={500}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleReject(r.id)}
                disabled={processingId === r.id}
                className="flex-1 gap-1"
              >
                {processingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                Confirm Reject
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectionReason(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => handleVerify(r.id)}
              disabled={processingId === r.id}
              className="flex-1 gap-1"
            >
              {processingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
              Verify ✅
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRejectingId(r.id)}
              className="flex-1 gap-1"
            >
              <XCircle className="h-3 w-3" />
              Reject
            </Button>
          </div>
        )
      )}
    </div>
  );

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <UsersRound className="h-4 w-4 text-orange-500" />
          Sub-Agent Verification
          {pending.length > 0 && (
            <span className="ml-auto bg-destructive/10 text-destructive text-xs font-bold px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-2 mb-3">
            <TabsTrigger
              value="pending"
              className="text-xs gap-1 relative data-[state=inactive]:animate-pulse data-[state=inactive]:bg-destructive/15 data-[state=inactive]:text-destructive"
            >
              <Clock className="h-3 w-3" />
              Pending ({pending.length})
              {pending.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {pending.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="verified" className="text-xs gap-1">
              <CheckCircle className="h-3 w-3" />
              Verified ({verified.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            {isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : pending.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No pending sub-agent registrations.</p>
            ) : (
              <div className="space-y-3">{pending.map(r => renderCard(r, true))}</div>
            )}
          </TabsContent>

          <TabsContent value="verified">
            {isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : verified.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No verified sub-agents yet.</p>
            ) : (
              <div className="space-y-3">{verified.map(r => renderCard(r, false))}</div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
