import { useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAgentCapacityMap } from '@/hooks/useAgentCapacityMap';
import { formatUGX } from '@/lib/rentCalculations';
import { deriveAgentBadges } from '@/lib/agentBadges';
import { AgentCapacityShareCard } from './AgentCapacityShareCard';
import { hapticTap } from '@/lib/haptics';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { Download, Share2, Loader2 } from 'lucide-react';

/**
 * Minimalistic today-capacity badges card, rendered inline and visible the
 * moment the Tenants page opens. Reuses the branded share card (preview mode)
 * plus one-tap Download / Share to WhatsApp. Self-contained — pulls the
 * agent's live capacity snapshot itself.
 */
export function AgentCapacityShareInline() {
  const { user } = useAuth();
  const ids = useMemo(() => (user?.id ? [user.id] : []), [user?.id]);
  const { data, isLoading } = useAgentCapacityMap(ids);
  const cap = user?.id ? data?.get(user.id) : undefined;
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  if (!user?.id) return null;

  if (isLoading && !cap) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading today&apos;s capacity card…</span>
      </div>
    );
  }
  if (!cap) return null;

  const canPost = cap.can_post_rent_today;
  const remainingSlots = canPost && cap.per_tenant_max > 0
    ? Math.floor(cap.headroom / cap.per_tenant_max)
    : 0;
  const badges = deriveAgentBadges(cap);

  const agentName = (user.user_metadata as any)?.full_name
    || (user.user_metadata as any)?.name
    || user.email?.split('@')[0]
    || 'Agent';
  const dateLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Kampala',
  });

  const generatePng = async (pixelRatio = 2) => {
    if (!cardRef.current) throw new Error('No card ref');
    return toPng(cardRef.current, { pixelRatio, cacheBust: true, skipFonts: true });
  };

  const downloadPng = async () => {
    if (busy) return;
    hapticTap();
    setBusy(true);
    try {
      const dataUrl = await generatePng(2);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `welile-capacity-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Image downloaded');
    } catch {
      toast.error('Could not generate the image. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const doShare = async () => {
    if (busy) return;
    hapticTap();
    setBusy(true);
    try {
      const dataUrl = await generatePng(2);
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `welile-capacity-${Date.now()}.png`, { type: 'image/png' });
      const shareText = `My Welile rent-request capacity today: ${formatUGX(cap.paid_today)} of ${formatUGX(cap.expected_daily)} collected.`;
      const canShareFiles = typeof navigator !== 'undefined'
        && !!navigator.canShare
        && navigator.canShare({ files: [file] });
      if (canShareFiles) {
        await navigator.share({ files: [file], text: shareText, title: 'Welile capacity' });
      } else {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
        toast.success('Image saved — attach it to your WhatsApp message');
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        toast.error('Could not generate the image. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-3 space-y-3">
      <div className="rounded-xl overflow-hidden border border-border shadow-sm">
        <AgentCapacityShareCard
          ref={cardRef}
          preview
          agentName={agentName}
          paidToday={cap.paid_today}
          expectedDaily={cap.expected_daily}
          paidYesterday={cap.paid_yesterday}
          perTenantMax={cap.per_tenant_max}
          headroom={cap.headroom}
          remainingSlots={remainingSlots}
          canPost={canPost}
          dateLabel={dateLabel}
          badges={badges}
          tenantCount={cap.active_tenant_count}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={downloadPng}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download
        </button>
        <button
          type="button"
          onClick={doShare}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
          Share
        </button>
      </div>
    </div>
  );
}

export default AgentCapacityShareInline;