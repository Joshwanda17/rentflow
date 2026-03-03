import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  calculateAccessFee,
  calculateRegistrationFee,
  calculateTotalPayable,
  calculateDailyPayment,
  calculateCompoundProjection,
  formatUGX,
  REPAYMENT_PERIODS,
} from '@/lib/agentAdvanceCalculations';
import { useAuth } from '@/hooks/useAuth';

interface IssueAdvanceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  preselectedAgentId?: string;
}

export default function IssueAdvanceSheet({ open, onOpenChange, onSuccess, preselectedAgentId }: IssueAdvanceSheetProps) {
  const { user } = useAuth();
  const [agentId, setAgentId] = useState(preselectedAgentId || '');
  const [amount, setAmount] = useState('');
  const [cycleDays, setCycleDays] = useState<number>(30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');
  const [agentPopoverOpen, setAgentPopoverOpen] = useState(false);

  // Fetch agents: join user_roles with profiles via a single query approach
  const { data: agents = [] } = useQuery({
    queryKey: ['agents-for-advance', agentSearch],
    queryFn: async () => {
      // First get agent user_ids
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'agent');
      if (roleError) throw roleError;
      const agentIds = roleData?.map((r: any) => r.user_id) || [];
      if (agentIds.length === 0) return [];

      let query = supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', agentIds);

      if (agentSearch.trim().length >= 2) {
        query = query.or(`full_name.ilike.%${agentSearch.trim()}%,phone.ilike.%${agentSearch.trim()}%`);
      }

      const { data, error } = await query.limit(50).order('full_name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: existingAdvance } = useQuery({
    queryKey: ['existing-advance', agentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_advances')
        .select('*')
        .eq('agent_id', agentId)
        .eq('status', 'active')
        .maybeSingle();
      return data;
    },
    enabled: !!agentId && open,
  });

  const parsedAmount = Number(amount) || 0;
  const isTopUp = !!existingAdvance;
  const selectedAgent = agents.find((a: any) => a.id === agentId);

  const regFee = useMemo(() => calculateRegistrationFee(parsedAmount), [parsedAmount]);
  const accessFee = useMemo(() => calculateAccessFee(parsedAmount, cycleDays), [parsedAmount, cycleDays]);
  const totalPayable = useMemo(() => calculateTotalPayable(parsedAmount, cycleDays), [parsedAmount, cycleDays]);
  const dailyPayment = useMemo(() => calculateDailyPayment(parsedAmount, cycleDays), [parsedAmount, cycleDays]);
  const projection = useMemo(() => parsedAmount > 0 ? calculateCompoundProjection(parsedAmount, cycleDays).slice(0, 5) : [], [parsedAmount, cycleDays]);

  const handleSubmit = async () => {
    if (!agentId || parsedAmount <= 0 || !user) {
      toast.error('Please select an agent and enter a valid amount');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isTopUp && existingAdvance) {
        const { error: topupError } = await supabase.from('agent_advance_topups').insert({
          advance_id: existingAdvance.id,
          amount: parsedAmount,
          topped_up_by: user.id,
        });
        if (topupError) throw topupError;

        const { error: updateError } = await supabase
          .from('agent_advances')
          .update({
            principal: Number(existingAdvance.principal) + parsedAmount,
            outstanding_balance: Number(existingAdvance.outstanding_balance) + parsedAmount,
            registration_fee: Number(existingAdvance.registration_fee || 0) + regFee,
          })
          .eq('id', existingAdvance.id);
        if (updateError) throw updateError;

        toast.success(`Top-up of ${formatUGX(parsedAmount)} added successfully`);
      } else {
        const { error } = await supabase.from('agent_advances').insert({
          agent_id: agentId,
          principal: parsedAmount,
          outstanding_balance: parsedAmount,
          daily_rate: 0.33,
          cycle_days: cycleDays,
          registration_fee: regFee,
          issued_by: user.id,
          expires_at: new Date(Date.now() + cycleDays * 24 * 60 * 60 * 1000).toISOString(),
        });
        if (error) throw error;

        toast.success(`Advance of ${formatUGX(parsedAmount)} issued successfully`);
      }

      setAmount('');
      setCycleDays(30);
      setAgentId(preselectedAgentId || '');
      setAgentSearch('');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Failed to process advance');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isTopUp ? '💰 Top-Up Active Advance' : '💰 Issue Agent Advance'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          {/* Agent Selector with Search */}
          {!preselectedAgentId && (
            <div className="space-y-2">
              <Label>Select Agent</Label>
              <Popover open={agentPopoverOpen} onOpenChange={setAgentPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={agentPopoverOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedAgent
                      ? `${selectedAgent.full_name} (${selectedAgent.phone})`
                      : 'Search agent by name or phone...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Type name or phone..."
                      value={agentSearch}
                      onValueChange={setAgentSearch}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {agentSearch.length < 2 ? 'Type at least 2 characters to search...' : 'No agents found.'}
                      </CommandEmpty>
                      <CommandGroup>
                        {agents.map((a: any) => (
                          <CommandItem
                            key={a.id}
                            value={a.id}
                            onSelect={() => {
                              setAgentId(a.id);
                              setAgentPopoverOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", agentId === a.id ? "opacity-100" : "opacity-0")} />
                            <div>
                              <p className="font-medium">{a.full_name}</p>
                              <p className="text-xs text-muted-foreground">{a.phone}</p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {isTopUp && existingAdvance && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-amber-600 border-amber-500/30">Active Advance</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Current outstanding: <strong>{formatUGX(existingAdvance.outstanding_balance)}</strong>.
                  New amount will be merged into the existing advance.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            <Label>Advance Amount (UGX)</Label>
            <Input
              type="number"
              placeholder="e.g. 500000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-lg font-bold"
            />
          </div>

          <div className="space-y-2">
            <Label>Repayment Period</Label>
            <Select value={String(cycleDays)} onValueChange={(v) => setCycleDays(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPAYMENT_PERIODS.map((d) => (
                  <SelectItem key={d} value={String(d)}>{d} days</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {parsedAmount > 0 && (
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">{cycleDays}-Day Advance Breakdown</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Principal</p>
                    <p className="font-bold">{formatUGX(parsedAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Access Fee (33%/mo)</p>
                    <p className="font-bold text-amber-600">{formatUGX(accessFee)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Registration Fee</p>
                    <p className="font-bold text-purple-600">{formatUGX(regFee)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Total Payable</p>
                    <p className="font-bold text-red-600">{formatUGX(totalPayable)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] text-muted-foreground uppercase">Daily Payment</p>
                    <p className="font-bold text-green-600 text-lg">{formatUGX(dailyPayment)}</p>
                  </div>
                </div>

                <div className="mt-2">
                  <p className="text-[10px] text-muted-foreground mb-1">First 5 days compounding preview:</p>
                  <div className="space-y-1">
                    {projection.map((p) => (
                      <div key={p.day} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Day {p.day}</span>
                        <span className="text-amber-600">+{formatUGX(p.interestAccrued)}</span>
                        <span className="font-medium">{formatUGX(p.closingBalance)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!agentId || parsedAmount <= 0 || isSubmitting}
            className="w-full"
            size="lg"
          >
            {isSubmitting ? 'Processing...' : isTopUp ? `Confirm Top-Up ${formatUGX(parsedAmount)}` : `Issue Advance ${formatUGX(parsedAmount)}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
