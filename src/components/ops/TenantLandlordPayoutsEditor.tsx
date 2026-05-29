import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Home, Pencil, Loader2, History, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const fmtUGX = (n: number) => `UGX ${Math.round(Number(n) || 0).toLocaleString()}`;

interface Props {
  tenantId: string;
  canEdit: boolean;
}

/**
 * Tenant Ops surface for editing the amount the agent recorded paying the
 * landlord. Edits apply immediately, are recorded in `landlord_payment_edits`,
 * and flag the responsible agent to agree (or dispute) in-app.
 */
export function TenantLandlordPayoutsEditor({ tenantId, canEdit }: Props) {
  const qc = useQueryClient();

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ['drilldown-tenant-landlord-payouts', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_landlord_payouts')
        .select('id, landlord_name, landlord_phone, amount, status, created_at, agent_id, rent_request_id')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ['drilldown-tenant-payment-edits', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('landlord_payment_edits')
        .select('id, edit_type, old_amount, new_amount, reason, edited_by_name, created_at, agent_response, agent_responded_at, agent_dispute_note, landlord_name')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(15);
      return data ?? [];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['drilldown-tenant-landlord-payouts', tenantId] });
    qc.invalidateQueries({ queryKey: ['drilldown-tenant-payment-edits', tenantId] });
  };

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Home className="h-4 w-4 text-primary" /> Landlord payments (agent-recorded)
      </div>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
      ) : payouts.length === 0 ? (
        <p className="text-xs text-muted-foreground">No landlord payments recorded for this tenant.</p>
      ) : (
        <div className="space-y-2">
          {payouts.map((p: any) => (
            <PayoutRow key={p.id} payout={p} canEdit={canEdit} onSaved={refresh} />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="pt-1 border-t border-border/60 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Edit history
          </div>
          <ul className="space-y-2">
            {history.map((h: any) => (
              <li key={h.id} className="text-[11px] rounded-lg border border-border/60 p-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {h.edit_type === 'rent_amount' ? 'Rent amount' : `Landlord payout${h.landlord_name ? ` · ${h.landlord_name}` : ''}`}
                  </span>
                  <ResponseBadge response={h.agent_response} />
                </div>
                <div className="text-muted-foreground">
                  <span className="line-through">{fmtUGX(h.old_amount)}</span>
                  {' → '}
                  <span className="font-semibold text-foreground">{fmtUGX(h.new_amount)}</span>
                </div>
                <div className="text-muted-foreground">Reason: {h.reason}</div>
                {h.agent_dispute_note && (
                  <div className="text-destructive">Agent dispute: {h.agent_dispute_note}</div>
                )}
                <div className="text-muted-foreground/80">
                  By {h.edited_by_name || 'Ops'} · {format(new Date(h.created_at), 'MMM dd, HH:mm')}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function ResponseBadge({ response }: { response: string | null }) {
  if (response === 'agreed') {
    return <Badge variant="outline" className="text-[9px] gap-1 border-emerald-500/40 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Agreed</Badge>;
  }
  if (response === 'disputed') {
    return <Badge variant="outline" className="text-[9px] gap-1 border-destructive/40 text-destructive"><AlertTriangle className="h-3 w-3" /> Disputed</Badge>;
  }
  return <Badge variant="outline" className="text-[9px] gap-1 text-amber-600 border-amber-500/40"><Clock className="h-3 w-3" /> Awaiting agent</Badge>;
}

function PayoutRow({ payout, canEdit, onSaved }: { payout: any; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(payout.amount ?? ''));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const cancel = () => {
    setEditing(false);
    setAmount(String(payout.amount ?? ''));
    setReason('');
  };

  const save = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (reason.trim().length < 10) {
      toast.error('Reason must be at least 10 characters');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('ops_record_payment_edit', {
        p_edit_type: 'landlord_payout',
        p_target_id: payout.id,
        p_new_amount: amt,
        p_reason: reason.trim(),
      } as any);
      if (error) throw error;
      toast.success('Amount updated — agent notified to agree');
      cancel();
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{payout.landlord_name || 'Landlord'}</p>
          <p className="text-[11px] text-muted-foreground font-mono">{payout.landlord_phone || '—'}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold">{fmtUGX(payout.amount)}</p>
          <Badge variant="outline" className="text-[9px]">{payout.status}</Badge>
        </div>
      </div>

      {!editing ? (
        canEdit && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" /> Edit amount
          </Button>
        )
      ) : (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">New amount (UGX)</Label>
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reason (min 10 chars)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="text-sm"
              placeholder="Why is the landlord amount being changed?"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            The new amount applies immediately and the agent is notified in-app to agree or dispute.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={saving} className="h-7 px-3 text-xs">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save & notify agent'}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel} disabled={saving} className="h-7 px-3 text-xs">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}