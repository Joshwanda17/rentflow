import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { generateWelileAiId } from '@/lib/welileAiId';
import welileWordmark from '@/assets/welile-wordmark.png.asset.json';

interface Props {
  userId: string;
  partnerName: string;
}

/**
 * Bank-card styled summary of the partner's deployed capital.
 * - Welile wordmark (white) top-right, AI ID top-left
 * - Total principal across active portfolios
 * - Nearest upcoming payout date (MM/YY)
 * - Partner name at the bottom
 */
export function PartnerVirtualCard({ userId, partnerName }: Props) {
  const [principal, setPrincipal] = useState(0);
  const [nextPayout, setNextPayout] = useState<string>('--/--');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) return;
      const { data, error } = await supabase
        .from('investor_portfolios')
        .select('investment_amount, next_roi_date, maturity_date')
        .eq('investor_id', userId)
        .in('status', ['active', 'pending', 'pending_approval'])
        .limit(200);
      if (cancelled || error || !data) return;

      setPrincipal(data.reduce((s, r) => s + Number(r.investment_amount || 0), 0));

      const dates = data
        .map((r) => r.next_roi_date || r.maturity_date)
        .filter(Boolean)
        .map((d) => new Date(d as string))
        .filter((d) => !isNaN(d.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());
      const upcoming = dates.find((d) => d.getTime() >= Date.now() - 86400000) || dates[0];
      if (upcoming) {
        const mm = String(upcoming.getMonth() + 1).padStart(2, '0');
        const yy = String(upcoming.getFullYear()).slice(-2);
        setNextPayout(`${mm}/${yy}`);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const aiId = userId ? generateWelileAiId(userId) : '';

  return (
    <div className="relative overflow-hidden rounded-3xl p-5 shadow-xl bg-gradient-to-br from-primary via-primary/90 to-accent">
      {/* soft light blobs */}
      <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-primary-foreground/10 blur-2xl" />
      <div className="pointer-events-none absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-primary-foreground/10 blur-2xl" />

      <div className="relative flex items-start justify-between gap-3">
        <span className="rounded-lg bg-primary-foreground/15 px-2.5 py-1 font-mono text-[11px] font-bold tracking-widest text-primary-foreground">
          {aiId}
        </span>
        <img
          src={welileWordmark.url}
          alt="Welile"
          className="h-5 w-auto brightness-0 invert opacity-95"
          loading="lazy"
        />
      </div>

      <p className="relative mt-6 text-3xl font-black tracking-tight text-primary-foreground">
        {formatUGX(principal)}
      </p>

      <div className="relative mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-foreground/60">
            Next payout
          </p>
          <p className="font-mono text-sm font-bold text-primary-foreground">{nextPayout}</p>
        </div>
        <p className="max-w-[60%] truncate text-right text-sm font-bold uppercase tracking-wide text-primary-foreground">
          {partnerName || 'Partner'}
        </p>
      </div>
    </div>
  );
}