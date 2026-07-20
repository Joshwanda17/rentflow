import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ShieldAlert, Scale, User, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

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

  const reason = profileFreeze?.frozen_reason || listingBlock?.reason || null;
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
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-center overflow-y-auto bg-red-700 p-6 text-center text-white"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/30 bg-red-800/60 p-6 sm:p-8 shadow-2xl backdrop-blur-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/15">
          <ShieldAlert className="h-9 w-9 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Account Restricted</h1>

        <div className="mt-5 space-y-4 text-sm sm:text-[15px] leading-relaxed text-white/95 text-left">
          <p>
            Your account has been restricted due to suspected activity that may violate our Terms
            and Conditions or applicable laws. As a result, access to your account and its services
            has been suspended pending review.
          </p>
          <p className="flex gap-3">
            <Scale className="h-5 w-5 shrink-0 mt-0.5 text-white/80" />
            <span>
              If investigations confirm fraudulent, unauthorized, or other unlawful activities, the
              matter may be referred to the relevant law enforcement authorities. Such conduct may
              result in civil or criminal penalties, including fines or imprisonment, where
              provided for under applicable law.
            </span>
          </p>
          <p className="flex gap-3">
            <User className="h-5 w-5 shrink-0 mt-0.5 text-white/80" />
            <span>
              If you believe this restriction was made in error, please contact our support team to
              request a review.
            </span>
          </p>
        </div>

        {untilStr && (
          <p className="mt-5 text-sm">
            <span className="text-white/80">Restricted until </span>
            <span className="font-semibold">{untilStr}</span>
          </p>
        )}

        {reason && (
          <div className="mt-4 rounded-lg border border-white/25 bg-white/10 p-3 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">Reason</p>
            <p className="mt-1 text-sm font-medium text-white">{reason}</p>
          </div>
        )}

        <Button
          className="mt-6 w-full bg-[#25D366] text-white hover:bg-[#1ebe57] border-0"
          onClick={() => {
            const msg = encodeURIComponent(
              `Hello Welile Support, my account (${user?.email || user?.phone || user?.id}) has been restricted. I would like to request a review.`,
            );
            window.open(`https://wa.me/256708257899?text=${msg}`, '_blank', 'noopener');
          }}
        >
          <MessageCircle className="mr-2 h-4 w-4" />
          Chat support on WhatsApp: +256 708 257 899
        </Button>

        <button
          type="button"
          onClick={() => signOut()}
          className="mt-3 w-full text-xs font-medium uppercase tracking-wide text-white/80 underline underline-offset-4 hover:text-white"
        >
          Sign out
        </button>

        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-white/80">
          Your security is important to us. Please cooperate as we ensure a safe and fair platform.
        </p>
      </div>
    </div>
  );
}

export default AccountFrozenGate;