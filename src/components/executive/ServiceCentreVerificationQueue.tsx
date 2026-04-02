import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { MapPin, CheckCircle, XCircle, Loader2, Building2, ExternalLink, Star, Phone } from 'lucide-react';
import { format } from 'date-fns';

interface EligibleAgent {
  id: string;
  full_name: string;
  phone: string;
  territory: string | null;
  landlord_count: number;
  lc1_count: number;
  has_submission: boolean;
}

export function ServiceCentreVerificationQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('eligible');

  // Fetch pending submissions
  const { data: setups, isLoading: setupsLoading } = useQuery({
    queryKey: ['service-centre-pending-setups'],
    queryFn: async () => {
      const { data } = await supabase
        .from('service_centre_setups' as any)
        .select('*')
        .in('status', ['pending'])
        .order('created_at', { ascending: true });
      return (data || []) as any[];
    },
    staleTime: 30000,
  });

  // Fetch eligible agents: those with landlord assignments AND LC1 chairpersons linked via rent_requests
  const { data: eligibleAgents, isLoading: eligibleLoading } = useQuery({
    queryKey: ['service-centre-eligible-agents'],
    queryFn: async () => {
      // 1. Get agents with landlord assignments
      const { data: assignments } = await supabase
        .from('agent_landlord_assignments')
        .select('agent_id');
      const agentLandlordMap: Record<string, number> = {};
      (assignments || []).forEach((a: any) => {
        agentLandlordMap[a.agent_id] = (agentLandlordMap[a.agent_id] || 0) + 1;
      });

      // 2. Get agents with LC1 chairpersons via rent_requests
      const { data: rentReqs } = await supabase
        .from('rent_requests')
        .select('agent_id, lc1_id')
        .not('agent_id', 'is', null)
        .not('lc1_id', 'is', null);
      const agentLc1Map: Record<string, Set<string>> = {};
      (rentReqs || []).forEach((r: any) => {
        if (r.agent_id && r.lc1_id) {
          if (!agentLc1Map[r.agent_id]) agentLc1Map[r.agent_id] = new Set();
          agentLc1Map[r.agent_id].add(r.lc1_id);
        }
      });

      // 3. Find agents who have BOTH landlords and LC1s
      const qualifiedIds = Object.keys(agentLandlordMap).filter(id => agentLc1Map[id]?.size > 0);
      if (qualifiedIds.length === 0) return [];

      // 4. Check which already have submissions
      const { data: existingSetups } = await supabase
        .from('service_centre_setups' as any)
        .select('agent_id')
        .in('agent_id', qualifiedIds);
      const submittedSet = new Set((existingSetups || []).map((s: any) => s.agent_id));

      // 5. Fetch profiles for qualified agents
      const BATCH = 50;
      const allProfiles: any[] = [];
      for (let i = 0; i < qualifiedIds.length; i += BATCH) {
        const { data } = await supabase.from('profiles')
          .select('id, full_name, phone, territory')
          .in('id', qualifiedIds.slice(i, i + BATCH));
        if (data) allProfiles.push(...data);
      }

      return allProfiles.map(p => ({
        id: p.id,
        full_name: p.full_name || 'Unknown',
        phone: p.phone || '—',
        territory: p.territory,
        landlord_count: agentLandlordMap[p.id] || 0,
        lc1_count: agentLc1Map[p.id]?.size || 0,
        has_submission: submittedSet.has(p.id),
      })) as EligibleAgent[];
    },
    staleTime: 60000,
  });

  const handleVerify = async (id: string) => {
    if (!user?.id) return;
    setProcessingId(id);
    try {
      const { error } = await supabase
        .from('service_centre_setups' as any)
        .update({
          status: 'verified',
          verified_by: user.id,
          verified_at: new Date().toISOString(),
        } as any)
        .eq('id', id);
      if (error) throw error;
      toast.success('Service Centre verified!');
      queryClient.invalidateQueries({ queryKey: ['service-centre-pending-setups'] });
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
        .from('service_centre_setups' as any)
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason.trim(),
        } as any)
        .eq('id', id);
      if (error) throw error;
      toast.success('Service Centre rejected.');
      setRejectingId(null);
      setRejectionReason('');
      queryClient.invalidateQueries({ queryKey: ['service-centre-pending-setups'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject');
    } finally {
      setProcessingId(null);
    }
  };

  const eligibleNotSubmitted = (eligibleAgents || []).filter(a => !a.has_submission);
  const eligibleSubmitted = (eligibleAgents || []).filter(a => a.has_submission);

  const isLoading = setupsLoading || eligibleLoading;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Building2 className="h-4 w-4 text-primary" />
          Service Centre Pipeline
          {(setups?.length || 0) + eligibleNotSubmitted.length > 0 && (
            <span className="ml-auto bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
              {(setups?.length || 0) + eligibleNotSubmitted.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-2 mb-3">
            <TabsTrigger value="eligible" className="text-xs gap-1">
              <Star className="h-3 w-3" />
              Eligible ({eligibleNotSubmitted.length})
            </TabsTrigger>
            <TabsTrigger
              value="pending"
              className="text-xs gap-1 relative data-[state=inactive]:animate-pulse data-[state=inactive]:bg-destructive/15 data-[state=inactive]:text-destructive"
            >
              <Loader2 className="h-3 w-3" />
              Pending ({setups?.length || 0})
              {(setups?.length || 0) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {setups?.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Eligible Agents Tab ── */}
          <TabsContent value="eligible">
            {isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : eligibleNotSubmitted.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No new eligible agents. Agents need landlords + LC1 chairpersons to qualify.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-2">
                  These agents have linked landlords & LC1 chairpersons — they qualify for a Service Centre. Notify them to submit their setup.
                </p>
                {eligibleNotSubmitted.map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{agent.full_name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />{agent.phone}
                        </span>
                        {agent.territory && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />{agent.territory}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 mt-1">
                        <span className="text-xs px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
                          {agent.landlord_count} Landlord{agent.landlord_count !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded-md bg-secondary text-secondary-foreground font-medium">
                          {agent.lc1_count} LC1{agent.lc1_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs px-2 py-1 rounded-full bg-accent text-accent-foreground font-semibold">
                        Awaiting Setup
                      </span>
                    </div>
                  </div>
                ))}
                {eligibleSubmitted.length > 0 && (
                  <p className="text-xs text-muted-foreground text-center pt-2 border-t border-border mt-3">
                    {eligibleSubmitted.length} eligible agent{eligibleSubmitted.length !== 1 ? 's have' : ' has'} already submitted.
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── Pending Verification Tab ── */}
          <TabsContent value="pending">
            {setupsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : !setups?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No pending service centre submissions.</p>
            ) : (
              <div className="space-y-4">
                {setups.map((s: any) => (
                  <div key={s.id} className="rounded-xl border border-border p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-foreground">{s.agent_name}</p>
                        <p className="text-xs text-muted-foreground">📱 {s.agent_phone}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(s.created_at), 'dd MMM yyyy HH:mm')}</p>
                      </div>
                      <a
                        href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                      >
                        <MapPin className="h-3 w-3" />
                        View on Map
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>

                    <img src={s.photo_url} alt="Service Centre" className="rounded-lg max-h-40 w-full object-cover border" />
                    <p className="text-xs text-muted-foreground">📍 {s.location_name || 'No description'}</p>
                    <p className="text-xs text-muted-foreground">🌐 {Number(s.latitude).toFixed(5)}, {Number(s.longitude).toFixed(5)}</p>

                    {rejectingId === s.id ? (
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
                            onClick={() => handleReject(s.id)}
                            disabled={processingId === s.id}
                            className="flex-1 gap-1"
                          >
                            {processingId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
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
                          onClick={() => handleVerify(s.id)}
                          disabled={processingId === s.id}
                          className="flex-1 gap-1"
                        >
                          {processingId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                          Verify ✅
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRejectingId(s.id)}
                          className="flex-1 gap-1"
                        >
                          <XCircle className="h-3 w-3" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
