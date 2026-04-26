import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Wallet, User } from 'lucide-react';
import { TidVerification } from './TidVerification';
import { FieldDepositVerificationQueue } from './FieldDepositVerificationQueue';
import { supabase } from '@/integrations/supabase/client';

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
          <TidVerification />
        </TabsContent>

        <TabsContent value="field" className="mt-4 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Approving credits the agent's float, allocates rent to tagged
            tenants, and posts agent commission instantly.
          </p>
          <FieldDepositVerificationQueue />
        </TabsContent>
      </Tabs>
    </div>
  );
}