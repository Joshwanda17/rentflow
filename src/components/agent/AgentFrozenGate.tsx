import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ShieldAlert, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ListingBlock {
  blocked?: boolean;
  blocked_until?: string;
  reason?: string;
  freeze_scope?: string;
}

/**
 * Full-screen gate shown when the signed-in agent is under a FULL account freeze
 * (freeze_scope === 'all'). While frozen, NO agent activities are available in the
 * UI. Server-side triggers enforce the same rule on every agent write table.
 */
export function AgentFrozenGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ['my-listing-block-gate'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_my_listing_block');
      if (error) throw error;
      return (data as ListingBlock) ?? { blocked: false };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const frozen = !!data?.blocked && data?.freeze_scope === 'all';

  if (isLoading || !frozen) {
    return <>{children}</>;
  }

  const until = data?.blocked_until ? new Date(data.blocked_until) : null;
  const untilStr = until
    ? until.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Africa/Kampala',
      })
    : null;

  return (
    <div className="h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-6 sm:p-8 shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Account frozen</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account has been temporarily blocked. No agent activities — listing houses,
          collecting rent, deposits, visits or payouts — can take place during this period.
        </p>

        {untilStr && (
          <p className="mt-4 text-sm">
            <span className="text-muted-foreground">Blocked until </span>
            <span className="font-semibold text-foreground">{untilStr}</span>
          </p>
        )}

        {data?.reason && (
          <div className="mt-4 rounded-lg border border-border bg-background p-3 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reason</p>
            <p className="mt-1 text-sm font-medium text-foreground">{data.reason}</p>
          </div>
        )}

        <Button
          variant="outline"
          className="mt-6 w-full"
          onClick={() => window.open('https://wa.me/256777607640', '_blank')}
        >
          <Phone className="mr-2 h-4 w-4" />
          Contact support: +256 777 607 640
        </Button>
      </div>
    </div>
  );
}

export default AgentFrozenGate;