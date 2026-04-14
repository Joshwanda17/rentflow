import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { UsersRound, CheckCircle, XCircle, Loader2, Phone, Calendar, Clock, Search } from 'lucide-react';
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
  const [search, setSearch] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<SubAgentRecord | null>(null);

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

  const q = search.toLowerCase().trim();
  const filtered = (records || []).filter(r =>
    !q || r.sub_name.toLowerCase().includes(q) || r.parent_name.toLowerCase().includes(q) || r.sub_phone.includes(q) || r.parent_phone.includes(q)
  );
  const pending = filtered.filter(r => r.status === 'pending');
  const verified = filtered.filter(r => r.status === 'verified');

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
    <div key={r.id} className="rounded-xl border border-border p-3 space-y-2 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setSelectedRecord(r)}>
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
        <div onClick={e => e.stopPropagation()}>
          {rejectingId === r.id ? (
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
          )}
        </div>
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
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
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

      {/* Detail Sheet */}
      <Sheet open={!!selectedRecord} onOpenChange={(open) => { if (!open) setSelectedRecord(null); }}>
        <SheetContent side="bottom" className="h-[75vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-primary" />
              Sub-Agent Details
            </SheetTitle>
          </SheetHeader>
          {selectedRecord && (
            <div className="space-y-4 mt-4 overflow-y-auto max-h-[calc(75vh-80px)] pb-6">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                  selectedRecord.status === 'verified' ? 'bg-emerald-100 text-emerald-700' :
                  selectedRecord.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {selectedRecord.status.charAt(0).toUpperCase() + selectedRecord.status.slice(1)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Source: <span className="font-medium text-foreground">{selectedRecord.source}</span>
                </span>
              </div>

              {/* Sub-Agent Info */}
              <Card>
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Sub-Agent</p>
                  <p className="font-semibold text-base">{selectedRecord.sub_name}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{selectedRecord.sub_phone}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Parent Agent Info */}
              <Card>
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Parent Agent</p>
                  <p className="font-semibold">{selectedRecord.parent_name}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{selectedRecord.parent_phone}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Timeline */}
              <Card>
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Timeline</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Registered:</span>
                      <span className="font-medium">{format(new Date(selectedRecord.created_at), 'dd MMM yyyy HH:mm')}</span>
                    </div>
                    {selectedRecord.verified_at && (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-muted-foreground">Verified:</span>
                        <span className="font-medium text-emerald-600">{format(new Date(selectedRecord.verified_at), 'dd MMM yyyy HH:mm')}</span>
                      </div>
                    )}
                    {selectedRecord.rejection_reason && (
                      <div className="mt-2 p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                        <p className="text-xs font-medium text-destructive">Rejection Reason</p>
                        <p className="text-sm mt-0.5">{selectedRecord.rejection_reason}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}
