import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useIsMerchantAgent } from '@/hooks/useIsMerchantAgent';
import { useMerchantOnlineStatus } from '@/hooks/useMerchantOnlineStatus';
import { Button } from '@/components/ui/button';
import { formatUGX } from '@/lib/rentCalculations';
import { Banknote, MapPin, Clock, Hash, Navigation, X, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DispatchCard {
  withdrawalId: string;
  amount: number;
  payoutMethod: string | null;
  reference: string;
  createdAt: string | null;
  expiresAt: string | null;
  customerName: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  claimed: boolean;
}


function makeReference(id: string) {
  return `WD-${id.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Global, Uber-style incoming-withdrawal dispatch overlay for online merchant
 * agents. Appears on top of ANY screen the moment a request is dispatched to
 * this agent, with a live countdown, Accept and Ignore. First to Accept claims
 * it atomically; everyone else's card flips to "Already claimed".
 */
export function MerchantDispatchListener() {
  const { user } = useAuth();
  const { isMerchantAgent } = useIsMerchantAgent();
  const { isOnline } = useMerchantOnlineStatus();
  const navigate = useNavigate();

  const [queue, setQueue] = useState<DispatchCard[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const agentPos = useRef<{ lat: number; lng: number } | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const active = isMerchantAgent && isOnline && !!user?.id;

  // Grab the agent's coarse location once so we can show distance.
  useEffect(() => {
    if (!active || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        agentPos.current = { lat: p.coords.latitude, lng: p.coords.longitude };
      },
      () => {},
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
    );
  }, [active]);

  // 1s ticker for the countdown.
  useEffect(() => {
    if (queue.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [queue.length]);

  const loadCard = useCallback(async (withdrawalId: string) => {
    if (seen.current.has(withdrawalId)) return;
    seen.current.add(withdrawalId);
    const { data, error } = await supabase.rpc('get_dispatch_context', {
      p_withdrawal_id: withdrawalId,
    });
    const ctx = data as Record<string, unknown> | null;
    if (error || !ctx || ctx.ok !== true) return;
    if (ctx.dispatch_claimed_by) return; // already taken before we rendered
    const expiresAt = (ctx.dispatch_expires_at as string | null) ?? null;
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return; // expired
    const card: DispatchCard = {
      withdrawalId,
      amount: Number(ctx.amount) || 0,
      payoutMethod: (ctx.payout_method as string | null) ?? null,
      reference: makeReference(withdrawalId),
      createdAt: (ctx.created_at as string | null) ?? null,
      expiresAt,
      customerName: (ctx.customer_name as string | null) ?? null,
      area: ((ctx.city as string | null) || (ctx.address as string | null)) ?? null,
      latitude: ctx.latitude != null ? Number(ctx.latitude) : null,
      longitude: ctx.longitude != null ? Number(ctx.longitude) : null,
      claimed: false,
    };
    setQueue((q) => (q.some((c) => c.withdrawalId === withdrawalId) ? q : [...q, card]));
  }, []);

  // Realtime: new per-agent dispatch rows + claim/expiry updates.
  useEffect(() => {
    if (!active || !user?.id) return;
    const channel = supabase
      .channel(`merchant-dispatch-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'withdrawal_notification_log',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.channel !== 'push') return;
          if (row.response !== 'pending') return;
          if (typeof row.withdrawal_id === 'string') void loadCard(row.withdrawal_id);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'withdrawal_requests' },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const id = row.id as string;
          const claimedBy = row.dispatch_claimed_by as string | null;
          if (claimedBy && claimedBy !== user.id) {
            setQueue((q) =>
              q.map((c) => (c.withdrawalId === id ? { ...c, claimed: true } : c)),
            );
            setTimeout(() => {
              setQueue((q) => q.filter((c) => c.withdrawalId !== id));
            }, 2500);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [active, user?.id, loadCard]);

  const dismiss = useCallback((id: string) => {
    setQueue((q) => q.filter((c) => c.withdrawalId !== id));
  }, []);

  const handleAccept = useCallback(
    async (card: DispatchCard) => {
      setBusy(true);
      const { data, error } = await supabase.rpc('accept_withdrawal_dispatch', {
        p_withdrawal_id: card.withdrawalId,
      });
      setBusy(false);
      const res = data as Record<string, unknown> | null;
      if (error || !res || res.ok !== true) {
        const reason = res?.error;
        if (reason === 'already_claimed' || reason === 'not_available') {
          toast.info('This withdrawal was already claimed by another agent.');
        } else {
          toast.error('Could not claim this withdrawal. Please try again.');
        }
        dismiss(card.withdrawalId);
        return;
      }
      toast.success('Claimed! Complete the payout now.');
      dismiss(card.withdrawalId);
      navigate('/agent/cash-payouts');
    },
    [dismiss, navigate],
  );

  const handleIgnore = useCallback(
    async (card: DispatchCard) => {
      void supabase.rpc('ignore_withdrawal_dispatch', { p_withdrawal_id: card.withdrawalId });
      dismiss(card.withdrawalId);
    },
    [dismiss],
  );

  if (!active || queue.length === 0) return null;

  const card = queue[0];
  const secondsLeft = card.expiresAt
    ? Math.max(0, Math.round((new Date(card.expiresAt).getTime() - now) / 1000))
    : null;

  // Auto-expire the front card when the countdown ends.
  if (secondsLeft === 0 && !card.claimed) {
    setTimeout(() => dismiss(card.withdrawalId), 0);
  }

  let distanceKm: number | null = null;
  if (agentPos.current && card.latitude != null && card.longitude != null) {
    distanceKm = haversineKm(
      agentPos.current.lat,
      agentPos.current.lng,
      card.latitude,
      card.longitude,
    );
  }

  const requestTime = card.createdAt
    ? new Date(card.createdAt).toLocaleTimeString('en-UG', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Kampala',
      })
    : '—';

  return (
    <div className="fixed inset-x-0 top-0 z-[120] flex justify-center px-3 pt-3 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm animate-in slide-in-from-top-4 fade-in duration-300">
        <div className="overflow-hidden rounded-3xl border border-primary/30 bg-card shadow-2xl">
          {/* Header + countdown */}
          <div className="relative bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground/70" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-foreground" />
                </span>
                <span className="text-sm font-bold uppercase tracking-wide">
                  New Withdrawal Request
                </span>
              </div>
              {secondsLeft != null && !card.claimed && (
                <div className="flex items-center gap-1 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-xs font-bold tabular-nums">
                  <Clock className="h-3.5 w-3.5" />
                  {secondsLeft}s
                </div>
              )}
            </div>
            {queue.length > 1 && (
              <p className="mt-0.5 text-[11px] text-primary-foreground/80">
                +{queue.length - 1} more waiting
              </p>
            )}
          </div>

          {card.claimed ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-muted-foreground" />
              <p className="text-base font-semibold">Withdrawal already claimed</p>
              <p className="text-sm text-muted-foreground">
                Another agent took this one. Stay online for the next request.
              </p>
            </div>
          ) : (
            <>
              <div className="px-4 py-4">
                <div className="flex items-center gap-2 text-3xl font-extrabold tabular-nums">
                  <Banknote className="h-7 w-7 text-emerald-600" />
                  {formatUGX(card.amount)}
                </div>
                <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                  {(card.payoutMethod || 'cash').replace(/_/g, ' ')} payout
                </p>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">Service area</p>
                      <p className="truncate font-medium">{card.area || 'Assigned area'}</p>
                    </div>
                  </div>
                  {distanceKm != null && (
                    <div className="flex items-start gap-2">
                      <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">Distance</p>
                        <p className="font-medium">{distanceKm.toFixed(1)} km</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">Requested</p>
                      <p className="font-medium">{requestTime}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Hash className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">Reference</p>
                      <p className="truncate font-medium">{card.reference}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 border-t border-border p-3">
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5"
                  disabled={busy}
                  onClick={() => handleIgnore(card)}
                >
                  <X className="h-4 w-4" /> Ignore
                </Button>
                <Button
                  className="flex-[2] gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={busy || secondsLeft === 0}
                  onClick={() => handleAccept(card)}
                >
                  <CheckCircle2 className="h-4 w-4" /> Accept Withdrawal
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MerchantDispatchListener;
