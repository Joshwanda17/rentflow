import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Plus, Users, MapPin, Coins, CreditCard, CalendarClock } from 'lucide-react';
import { formatUGX } from '@/lib/businessAdvanceCalculations';

const MAX_AGENTS = 5;
export const FORECAST_MULTIPLIER = 1.3;

export function ServiceCentreNewEntryDialog() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [agentSearch, setAgentSearch] = useState('');
  const [location, setLocation] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [paymentMode, setPaymentMode] = useState<'installments' | 'full_payment'>('installments');
  const [paidUpfront, setPaidUpfront] = useState('');
  const [durationValue, setDurationValue] = useState('1');
  const [durationUnit, setDurationUnit] = useState<'days' | 'months' | 'years'>('months');
  const [notes, setNotes] = useState('');

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(agentSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [agentSearch]);

  const { data: agents, isLoading: agentsLoading, isFetching: agentsFetching } = useQuery({
    queryKey: ['service-centre-entry-agents', debouncedSearch],
    enabled: open,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_all_agents' as any, {
        p_term: debouncedSearch,
        p_limit: 40,
      });
      if (error) throw error;
      return (data || []) as AgentRow[];
    },
  });

  const selectedRows = useMemo(
    () => (agents || []).filter((a) => selectedAgents.includes(a.id)),
    [agents, selectedAgents],
  );

  const unitPriceNum = Number(unitPrice) || 0;
  const forecast = Math.round(unitPriceNum * FORECAST_MULTIPLIER);

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_AGENTS) {
        toast.error(`You can assign at most ${MAX_AGENTS} agents.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const reset = () => {
    setSelectedAgents([]);
    setAgentSearch('');
    setLocation('');
    setUnitPrice('');
    setPaymentMode('installments');
    setPaidUpfront('');
    setDurationValue('1');
    setDurationUnit('months');
    setNotes('');
  };

  const handleSubmit = async () => {
    if (!selectedAgents.length) return toast.error('Assign at least one agent.');
    if (!location.trim()) return toast.error('Enter the stationed location.');
    if (unitPriceNum <= 0) return toast.error('Enter a valid unit price.');
    const upfront = Number(paidUpfront) || 0;
    if (upfront < 0) return toast.error('Paid upfront cannot be negative.');
    const duration = Number(durationValue) || 0;
    if (duration <= 0) return toast.error('Enter a valid duration.');

    setSaving(true);
    try {
      const { error } = await supabase.from('service_centre_entries').insert({
        assigned_agent_ids: selectedAgents,
        stationed_location: location.trim(),
        unit_price: unitPriceNum,
        forecast_amount: forecast,
        payment_mode: paymentMode,
        paid_upfront: paymentMode === 'full_payment' ? unitPriceNum : upfront,
        duration_value: duration,
        duration_unit: durationUnit,
        notes: notes.trim() || null,
        status: 'pending_coo',
        created_by: user?.id ?? null,
      } as any);
      if (error) throw error;
      toast.success('Service centre entry submitted — pending COO approval.');
      queryClient.invalidateQueries({ queryKey: ['service-centre-entries'] });
      reset();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        New Entry
      </Button>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Service Centre Entry</DialogTitle>
          <DialogDescription>
            Submission routes to Pending COO Approval → CEO Approval → Verified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* 1. Assigned agents */}
          <section className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> 1. Assign agents ({selectedAgents.length}/{MAX_AGENTS})
            </Label>
            <Input
              placeholder="Search agent by name or phone"
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
            />
            <div className="max-h-44 overflow-y-auto rounded-xl border border-border divide-y divide-border">
              {agentsLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : filteredAgents.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">No agents found.</p>
              ) : (
                filteredAgents.map((a) => {
                  const checked = selectedAgents.includes(a.id);
                  return (
                    <label key={a.id} className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50">
                      <Checkbox checked={checked} onCheckedChange={() => toggleAgent(a.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground truncate">{a.full_name}</span>
                        <span className="block text-xs text-muted-foreground">{a.phone || '—'}</span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </section>

          {/* 2. Stationed location */}
          <section className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> 2. Stationed location
            </Label>
            <Input
              placeholder="e.g. Kireka Trading Centre, Wakiso"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
            />
          </section>

          {/* 3. Unit price + forecast */}
          <section className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Coins className="h-3.5 w-3.5" /> 3. Unit price & forecast
            </Label>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Unit price (UGX)"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
            <div className="rounded-xl bg-muted/60 px-3 py-2">
              <p className="text-xs text-muted-foreground">30% Forecast (unit price × 1.30)</p>
              <p className="text-base font-bold text-foreground">{formatUGX(forecast)}</p>
            </div>
          </section>

          {/* 4. Payment */}
          <section className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5" /> 4. Payment
            </Label>
            <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as typeof paymentMode)}>
              <SelectTrigger><SelectValue placeholder="Select payment plan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="installments">Installments</SelectItem>
                <SelectItem value="full_payment">Full Payment</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Paid upfront (UGX)"
              value={paymentMode === 'full_payment' ? String(unitPriceNum || '') : paidUpfront}
              disabled={paymentMode === 'full_payment'}
              onChange={(e) => setPaidUpfront(e.target.value)}
            />
            {paymentMode === 'full_payment' && (
              <p className="text-xs text-muted-foreground">Full payment — upfront equals the unit price.</p>
            )}
          </section>

          {/* 5. Duration */}
          <section className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" /> 5. Duration
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="Duration"
                value={durationValue}
                onChange={(e) => setDurationValue(e.target.value)}
              />
              <Select value={durationUnit} onValueChange={(v) => setDurationUnit(v as typeof durationUnit)}>
                <SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="days">Days</SelectItem>
                  <SelectItem value="months">Months</SelectItem>
                  <SelectItem value="years">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              placeholder="Optional notes for COO / CEO review"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
            />
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-1">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Submit for COO Approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}