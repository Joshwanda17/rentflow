import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { UserSearchPicker } from '@/components/cfo/UserSearchPicker';
import { Link2, Loader2, Unlink, UserCog } from 'lucide-react';
import { format } from 'date-fns';

interface PickedUser {
  id: string;
  full_name: string;
  phone: string;
}

interface AssignmentRow {
  id: string;
  lead_user_id: string;
  agent_id: string;
  reason: string;
  attached_at: string;
}

const MIN_REASON = 10;

/**
 * Attach a proxy agent to a lead partner growth record.
 * Both people are chosen with the existing staff user search picker
 * (the same searchable directory used elsewhere on this dashboard).
 */
export function PartnerLeadAssignments() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [lead, setLead] = useState<PickedUser | null>(null);
  const [agent, setAgent] = useState<PickedUser | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [detaching, setDetaching] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['partner-lead-assignments', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_lead_assignments')
        .select('id, lead_user_id, agent_id, reason, attached_at')
        .is('detached_at', null)
        .order('attached_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AssignmentRow[];
    },
  });

  const personIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      set.add(r.lead_user_id);
      set.add(r.agent_id);
    }
    return [...set];
  }, [rows]);

  const { data: nameMap = {} } = useQuery({
    queryKey: ['partner-lead-assignments', 'names', personIds],
    enabled: personIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', personIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of data ?? []) map[p.id] = p.full_name ?? p.id;
      return map;
    },
  });

  const { data: consentMap = {} } = useQuery({
    queryKey: ['proxy-agreement-consents', 'current-month', personIds],
    enabled: personIds.length > 0,
    queryFn: async () => {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);

      const { data, error } = await supabase
        .from('proxy_agreement_consents')
        .select('agent_user_id, accepted_at, proxy_agreement_versions(version_code)')
        .in('agent_user_id', personIds)
        .gte('period_month', start.toISOString())
        .lt('period_month', end.toISOString())
        .order('accepted_at', { ascending: false });
      if (error) throw error;

      const map: Record<string, { accepted_at: string; version_code: string }> = {};
      for (const c of data ?? []) {
        const agentId = c.agent_user_id;
        if (!map[agentId]) {
          const version = (c.proxy_agreement_versions as { version_code?: string } | null)?.version_code ?? '';
          map[agentId] = { accepted_at: c.accepted_at, version_code: version };
        }
      }
      return map;
    },
  });

  const reasonOk = reason.trim().length >= MIN_REASON;
  const canSubmit = !!lead && !!agent && reasonOk && !submitting;

  const handleSubmit = async () => {
    if (!lead || !agent) return;
    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error('Not signed in');

      const { error } = await supabase.from('partner_lead_assignments').insert({
        lead_user_id: lead.id,
        agent_id: agent.id,
        reason: reason.trim(),
        attached_by: uid,
      });

      if (error) {
        toast({
          title:
            error.code === '23505' || error.code === '23P01' || /duplicate|unique/i.test(error.message)
              ? 'That agent already has an active lead'
              : 'Attach failed',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      toast({ title: 'Agent attached', description: `${agent.full_name} → ${lead.full_name}` });
      setLead(null);
      setAgent(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['partner-lead-assignments'] });
    } catch (e) {
      toast({
        title: 'Attach failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDetach = async (id: string) => {
    setDetaching(id);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error('Not signed in');

      const { error } = await supabase
        .from('partner_lead_assignments')
        .update({ detached_at: new Date().toISOString(), detached_by: uid })
        .eq('id', id);
      if (error) {
        toast({ title: 'Detach failed', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Detached' });
      qc.invalidateQueries({ queryKey: ['partner-lead-assignments'] });
    } catch (e) {
      toast({
        title: 'Detach failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setDetaching(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCog className="h-4 w-4 text-primary" />
          Lead partner growth — proxy agent attachments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <UserSearchPicker
            label="Lead partner"
            placeholder="Search lead by name or phone..."
            selectedUser={lead}
            onSelect={setLead}
          />
          <UserSearchPicker
            label="Proxy agent"
            placeholder="Search agent by name or phone..."
            selectedUser={agent}
            onSelect={setAgent}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lead-attach-reason">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="lead-attach-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this agent being attached to this lead? (minimum 10 characters)"
            rows={3}
          />
          <p className={`text-xs ${reasonOk ? 'text-muted-foreground' : 'text-destructive'}`}>
            {reason.trim().length}/{MIN_REASON} characters
          </p>
        </div>

        <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Attach agent to lead
        </Button>

        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Active attachments</h4>
            <Badge variant="secondary">{rows.length}</Badge>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading attachments...
            </div>
          ) : rows.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No active attachments.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium">
                      {nameMap[r.lead_user_id] ?? r.lead_user_id}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      Agent: {nameMap[r.agent_id] ?? r.agent_id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Attached {format(new Date(r.attached_at), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={detaching === r.id}
                    onClick={() => handleDetach(r.id)}
                  >
                    {detaching === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Unlink className="h-3.5 w-3.5" />
                    )}
                    Detach
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default PartnerLeadAssignments;