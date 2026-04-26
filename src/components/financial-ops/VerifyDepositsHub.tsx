import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck, Wallet, User, Filter, X } from 'lucide-react';
import { TidVerification } from './TidVerification';
import { FieldDepositVerificationQueue } from './FieldDepositVerificationQueue';
import { supabase } from '@/integrations/supabase/client';
import type { DepositChannel } from '@/lib/fieldDepositBatches';
import { cn } from '@/lib/utils';

/**
 * One place to verify every deposit that reaches the platform — whether it
 * came from a tenant/funder topping up their own wallet (TID-based) or from
 * a field agent depositing collected cash to a merchant code.
 *
 * Per CFO mandate: Financial Ops should never have to remember which queue
 * to open. A single button on the dashboard lands here, and the two tabs
 * surface the live pending counts so the team can drain whichever queue is
 * fuller first.
 */
export function VerifyDepositsHub() {
  const [tab, setTab] = useState<'user' | 'field'>('user');
  const [counts, setCounts] = useState<{ user: number; field: number }>({ user: 0, field: 0 });
  // Hub-level filters — apply across both tabs so the operator can scope the
  // queue to a single channel (e.g. only MTN) and an amount window before
  // verifying. Channels are limited to MTN, Airtel and Bank as requested;
  // cash-merchant batches are still visible until explicitly filtered out.
  const [channelFilters, setChannelFilters] = useState<DepositChannel[]>([]);
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');

  const toggleChannel = (c: DepositChannel) =>
    setChannelFilters((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  const clearFilters = () => {
    setChannelFilters([]);
    setMinAmount('');
    setMaxAmount('');
  };

  const minNum = minAmount ? Number(minAmount) : undefined;
  const maxNum = maxAmount ? Number(maxAmount) : undefined;
  const filtersActive =
    channelFilters.length > 0 ||
    (typeof minNum === 'number' && !Number.isNaN(minNum)) ||
    (typeof maxNum === 'number' && !Number.isNaN(maxNum));

  const CHANNEL_CHIPS: { value: DepositChannel; label: string }[] = [
    { value: 'mtn', label: 'MTN MoMo' },
    { value: 'airtel', label: 'Airtel Money' },
    { value: 'bank', label: 'Bank' },
  ];

  // Lightweight pending counts so each tab shows a live badge.
  // Sequential awaits to keep PostgREST type unions cheap.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const userRes = await supabase
        .from('deposit_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      const fieldRes = await supabase
        .from('field_deposit_batches')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_finops_verification');
      if (cancelled) return;
      setCounts({
        user: userRes.count ?? 0,
        field: fieldRes.count ?? 0,
      });
    };
    load();
    const id = setInterval(load, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Verify Deposits
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          One queue for every kind of money coming in — tenant top-ups, funder
          deposits, and agent cash batches. Approved deposits credit the right
          wallet and post to the ledger automatically.
        </p>
      </div>

      {/* Filter bar — channel chips + amount window. Kept inline (no popover)
          so operators can see at a glance what's narrowing the queue. */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            Filter pending deposits
          </div>
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] gap-1"
              onClick={clearFilters}
            >
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Channel
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {CHANNEL_CHIPS.map((c) => {
              const active = channelFilters.includes(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => toggleChannel(c.value)}
                  className={cn(
                    'h-7 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30',
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="finops-min-amount" className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Min amount (UGX)
            </Label>
            <Input
              id="finops-min-amount"
              type="number"
              inputMode="numeric"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="e.g. 50,000"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="finops-max-amount" className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Max amount (UGX)
            </Label>
            <Input
              id="finops-max-amount"
              type="number"
              inputMode="numeric"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="e.g. 1,000,000"
              className="h-8 text-sm"
            />
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'user' | 'field')}>
        <TabsList className="grid grid-cols-2 w-full h-auto p-1">
          <TabsTrigger value="user" className="flex flex-col items-center gap-1 py-2.5">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="font-semibold text-sm">User Deposits</span>
              {counts.user > 0 && (
                <Badge className="h-5 min-w-5 px-1.5 text-[10px] bg-primary text-primary-foreground hover:bg-primary">
                  {counts.user}
                </Badge>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground font-normal">
              Tenant &amp; funder top-ups
            </span>
          </TabsTrigger>
          <TabsTrigger value="field" className="flex flex-col items-center gap-1 py-2.5">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              <span className="font-semibold text-sm">Field Deposits</span>
              {counts.field > 0 && (
                <Badge className="h-5 min-w-5 px-1.5 text-[10px] bg-primary text-primary-foreground hover:bg-primary">
                  {counts.field}
                </Badge>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground font-normal">
              Agent cash → float
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="user" className="mt-4 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            CFO credits from <span className="font-semibold text-foreground">Welile Technologies Finance</span> are auto-approved and skip this queue.
          </p>
          {filtersActive && (
            <p className="text-[11px] text-muted-foreground italic">
              User deposits are looked up by Transaction ID — channel and amount
              filters above only narrow the Field Deposits tab.
            </p>
          )}
          <TidVerification />
        </TabsContent>

        <TabsContent value="field" className="mt-4 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Approving credits the agent's float, allocates rent to tagged
            tenants, and posts agent commission instantly.
          </p>
          <FieldDepositVerificationQueue
            channels={channelFilters}
            minAmount={minNum !== undefined && !Number.isNaN(minNum) ? minNum : undefined}
            maxAmount={maxNum !== undefined && !Number.isNaN(maxNum) ? maxNum : undefined}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}