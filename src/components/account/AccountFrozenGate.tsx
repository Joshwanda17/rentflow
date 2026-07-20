import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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