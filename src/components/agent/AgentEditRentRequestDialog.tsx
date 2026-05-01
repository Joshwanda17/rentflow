import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { calculateRentRepayment, formatUGX } from '@/lib/rentCalculations';
import type { AgentRejectedRequest } from '@/hooks/useAgentRejectedRequests';

interface Props {
  request: AgentRejectedRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResubmitted: () => void;
}

export function AgentEditRentRequestDialog({ request, open, onOpenChange, onResubmitted }: Props) {
  const [rentAmount, setRentAmount] = useState('');
  const [duration, setDuration] = useState('30');
  const [numberOfPayments, setNumberOfPayments] = useState('4');
  const [waterMeter, setWaterMeter] = useState('');
  const [elecMeter, setElecMeter] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (request) {
      setRentAmount(String(request.rent_amount ?? ''));
      setDuration(String(request.duration_days ?? 30));
      setNumberOfPayments(String(request.number_of_payments ?? 4));
      setWaterMeter(request.tenant_water_meter ?? '');
      setElecMeter(request.tenant_electricity_meter ?? '');
      setNote('');
    }
  }, [request]);

  if (!request) return null;

  const rentNum = Number(rentAmount) || 0;
  const durNum = Number(duration) || 0;
  const calc = rentNum > 0 && durNum >= 7
    ? calculateRentRepayment(rentNum, durNum)
    : null;

  const submit = async () => {
    if (note.trim().length < 10) {
      toast.error('Resubmission note must be at least 10 characters');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('agent_resubmit_rent_request' as any, {
        p_request_id: request.id,
        p_patch: {
          rent_amount: rentNum,
          duration_days: durNum,
          number_of_payments: Number(numberOfPayments) || 4,
          tenant_water_meter: waterMeter.trim() || null,
          tenant_electricity_meter: elecMeter.trim() || null,
        },
        p_agent_note: note.trim(),
      });
      if (error) throw error;
      toast.success('Resubmitted for review');
      onOpenChange(false);
      onResubmitted();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to resubmit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" /> Edit & Resubmit Request
          </DialogTitle>
          <DialogDescription>
            Address the reviewer's comment, then resubmit. Returns to <strong>{request.stage_label}</strong> for fresh review.
          </DialogDescription>
        </DialogHeader>

        {request.rejected_reason && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-destructive mb-1">
              Reviewer comment ({request.stage_label})
            </p>
            <p className="text-foreground/90">{request.rejected_reason}</p>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rent">Rent amount (UGX)</Label>
            <Input id="rent" inputMode="numeric" value={rentAmount}
              onChange={(e) => setRentAmount(e.target.value.replace(/[^0-9]/g, ''))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dur">Duration (days)</Label>
              <Input id="dur" inputMode="numeric" min={7} max={120} value={duration}
                onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ''))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np">Payments</Label>
              <Input id="np" inputMode="numeric" value={numberOfPayments}
                onChange={(e) => setNumberOfPayments(e.target.value.replace(/[^0-9]/g, ''))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wm">Water meter</Label>
              <Input id="wm" value={waterMeter} onChange={(e) => setWaterMeter(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="em">Electricity meter</Label>
              <Input id="em" value={elecMeter} onChange={(e) => setElecMeter(e.target.value)} />
            </div>
          </div>

          {calc && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted p-2">
                <p className="text-[10px] text-muted-foreground">Total due</p>
                <p className="text-sm font-bold">{formatUGX(calc.totalRepayment)}</p>
              </div>
              <div className="rounded-lg bg-muted p-2">
                <p className="text-[10px] text-muted-foreground">Daily</p>
                <p className="text-sm font-bold">{formatUGX(calc.dailyRepayment)}</p>
              </div>
              <div className="rounded-lg bg-muted p-2">
                <p className="text-[10px] text-muted-foreground">Days</p>
                <p className="text-sm font-bold">{calc.durationDays}</p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="note">What changed? (min 10 characters)</Label>
            <Textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Explain what you corrected so the reviewer can re-check quickly…" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || note.trim().length < 10} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Resubmit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
