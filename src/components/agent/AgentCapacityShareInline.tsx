import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAgentCapacityMap } from '@/hooks/useAgentCapacityMap';
import { formatUGX } from '@/lib/rentCalculations';
import { deriveAgentBadges } from '@/lib/agentBadges';
import { AgentCapacityShareCard } from './AgentCapacityShareCard';
import { hapticTap } from '@/lib/haptics';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { Download, Share2, Loader2, FileImage } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Compact "Download report card" entry point on the Tenants page. The agent
 * sees a small clickable word; tapping it opens a modal preview of the white
 * branded capacity card with one-tap Download / Share. The modal closes itself
 * after a successful download. Self-contained — pulls the agent's live
 * capacity snapshot itself.
 */
export function AgentCapacityShareInline() {
  const { user } = useAuth();
  const ids = useMemo(() => (user?.id ? [user.id] : []), [user?.id]);
  const { data, isLoading } = useAgentCapacityMap(ids);
  const cap = user?.id ? data?.get(user.id) : undefined;
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [cardH, setCardH] = useState(0);
  const CARD_W = 540;

  // Scale the fixed-width branded card down to fit the column on mobile.
  useLayoutEffect(() => {
    if (!open) return;
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      setScale(w > 0 ? Math.min(1, w / CARD_W) : 1);
      if (cardRef.current) setCardH(cardRef.current.offsetHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (cardRef.current) ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, [cap, open]);

  if (!user?.id) return null;
  if ((isLoading && !cap) || !cap) {
    // Stay invisible until we have a snapshot — the trigger is intentionally tiny.
    return null;
  }

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
      setOpen(false);
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
      setOpen(false);
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        toast.error('Could not generate the image. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const card = (
    <AgentCapacityShareCard
      ref={cardRef}
      preview
      light
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
  );

  return (
    <>
      {/* Tiny clickable entry point */}
      <button
        type="button"
        onClick={() => { hapticTap(); setOpen(true); }}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
      >
        <FileImage className="h-4 w-4" />
        Download report card
      </button>

      {/* Off-screen capture node — always mounted so PNG export works instantly */}
      <div aria-hidden style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none' }}>
        {card}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Today&apos;s report card</DialogTitle>
          </DialogHeader>

          <div
            ref={wrapRef}
            className="rounded-xl overflow-hidden border border-border shadow-sm"
            style={{ height: cardH > 0 ? cardH * scale : undefined }}
          >
            <div style={{ width: CARD_W, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <AgentCapacityShareCard
                preview
                light
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
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AgentCapacityShareInline;