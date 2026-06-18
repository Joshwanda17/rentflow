import { useState } from 'react';
import { Share2, Check, Copy, MessageCircle, Home } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { useToast } from '@/hooks/use-toast';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { supabase } from '@/integrations/supabase/client';

interface ShareNearbyHousesButtonProps {
  /** Coordinates of the area to feature in the shared link (usually the sharer's location). */
  latitude?: number | null;
  longitude?: number | null;
  /** Human-readable area name shown in the message (e.g. city or region). */
  area?: string | null;
  /** Optional region filter applied on the destination page. */
  region?: string | null;
  /** 'icon' = compact icon button, 'full' = WhatsApp + Copy/Share buttons. */
  variant?: 'icon' | 'full';
  className?: string;
}

/**
 * Shares ONE link that opens the public "Find a House" page pre-centred on the
 * sharer's area, so whoever taps it instantly sees all houses near that location.
 * Works on WhatsApp and any platform (native share sheet + copy fallback).
 */
export function ShareNearbyHousesButton({
  latitude,
  longitude,
  area,
  region,
  variant = 'full',
  className = '',
}: ShareNearbyHousesButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const buildLink = async () => {
    const params = new URLSearchParams();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) params.set('ref', user.id);
    } catch { /* anonymous sharing is fine */ }
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      params.set('lat', latitude.toFixed(6));
      params.set('lng', longitude.toFixed(6));
    }
    if (region) params.set('region', region);
    const qs = params.toString();
    return `${getPublicOrigin()}/find-a-house${qs ? `?${qs}` : ''}`;
  };

  const buildMessage = (link: string) => {
    const where = area ? ` near ${area}` : ' near you';
    return [
      `🏠 *Houses for rent${where} on Welile!*`,
      ``,
      `Browse ALL available houses in one place — pay daily, no big deposit.`,
      `🎁 Move in today: your first 7 days are FREE.`,
      ``,
      `👉 Tap to see every house: ${link}`,
    ].join('\n');
  };

  const handleWhatsApp = async (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticTap();
    const link = await buildLink();
    const message = buildMessage(link);
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard optional */ }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticTap();
    const link = await buildLink();
    const message = buildMessage(link);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Houses for rent on Welile', text: message, url: link });
        return;
      } catch { /* user dismissed or unsupported — fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast({ title: 'Link copied!', description: 'Paste it on WhatsApp or anywhere to share all houses.' });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleShare}
        className={`p-1.5 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm hover:bg-muted transition-colors touch-manipulation ${className}`}
        title="Share all houses near you"
        aria-label="Share all houses near you"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Share2 className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
    );
  }

  return (
    <div className={`flex gap-2 ${className}`}>
      <button
        onClick={handleWhatsApp}
        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/20 text-sm font-semibold transition-colors touch-manipulation active:scale-[0.97] min-h-[44px]"
      >
        <MessageCircle className="h-4 w-4" />
        Share on WhatsApp
      </button>
      <button
        onClick={handleShare}
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium transition-colors touch-manipulation active:scale-[0.97] min-h-[44px]"
        title="Share all houses near you"
      >
        {copied ? <Check className="h-4 w-4 text-success" /> : <Share2 className="h-4 w-4" />}
        {copied ? 'Copied!' : 'Share'}
      </button>
    </div>
  );
}
