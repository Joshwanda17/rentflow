import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import posterAsset from '@/assets/account-restricted-poster.png.asset.json';

interface ListingBlock {
  blocked?: boolean;
  blocked_until?: string;
  reason?: string;
  freeze_scope?: string;
}

/**
 * Account-wide freeze gate. Renders a full-screen "Account Restricted" overlay
 * on every dashboard (agent, tenant, landlord, partner, staff, etc.) when the
 * signed-in user is frozen via either:
 *   - `profiles.is_frozen = true` (set from Platform Users / KYC / Manager tools), OR
 *   - the CTO Agent Freeze panel with scope = 'all' (get_my_listing_block RPC).
 *
 * Mounted once inside AuthProvider so it applies to the entire authenticated app.
 */
export function AccountFrozenGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();

  const { data: profileFreeze } = useQuery({
    queryKey: ['account-frozen-profile', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_frozen, frozen_reason')
        .eq('id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { is_frozen: boolean | null; frozen_reason: string | null } | null;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const { data: listingBlock } = useQuery({
    queryKey: ['account-frozen-listing-block', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_my_listing_block');
      if (error) return { blocked: false } as ListingBlock;
      return (data as ListingBlock) ?? { blocked: false };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const profileFrozen = !!profileFreeze?.is_frozen;
  const listingFrozen = !!listingBlock?.blocked && listingBlock?.freeze_scope === 'all';
  const frozen = !!user && (profileFrozen || listingFrozen);

  if (!frozen) return <>{children}</>;

  const rawReason = profileFreeze?.frozen_reason || listingBlock?.reason || null;
  const reason = rawReason?.replace('0708 257 899', '+256777607640');
  const until = listingBlock?.blocked_until ? new Date(listingBlock.blocked_until) : null;
  const untilStr = until
    ? until.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Africa/Kampala',
      })
    : null;

  return (
    <div
      role="alert"
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-start overflow-y-auto bg-black p-4 sm:p-6 text-center text-white"
    >
      <div className="w-full max-w-md mx-auto flex flex-col items-center gap-4 py-4">
        <img
          src={posterAsset.url}
          alt="Account Restricted"
          className="w-full h-auto rounded-xl shadow-2xl select-none"
          draggable={false}
        />

        {(reason || untilStr) && (
          <div className="w-full rounded-lg border border-red-500/40 bg-red-950/60 p-3 text-left backdrop-blur-sm">
            {untilStr && (
              <p className="text-sm">
                <span className="text-white/70">Restricted until </span>
                <span className="font-semibold text-white">{untilStr}</span>
              </p>
            )}
            {reason && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-red-300">Reason</p>
                <p className="mt-1 text-sm font-medium text-white">{reason}</p>
              </>
            )}
          </div>
        )}

        <Button
          className="w-full bg-[#25D366] text-white hover:bg-[#1ebe57] border-0 font-semibold"
          onClick={() => {
            const msg = encodeURIComponent(
              `Hello Welile Support, my account (${user?.email || user?.phone || user?.id}) has been restricted. I would like to request a review.`,
            );
            window.open(`https://wa.me/256777607640?text=${msg}`, '_blank', 'noopener');
          }}
        >
          <MessageCircle className="mr-2 h-4 w-4" />
          Chat support on WhatsApp: +256777607640
        </Button>

        <button
          type="button"
          onClick={() => signOut()}
          className="text-xs font-medium uppercase tracking-wide text-white/70 underline underline-offset-4 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export default AccountFrozenGate;