import { useState } from 'react';
import { Share2, Check, Copy, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface ShareHouseButtonProps {
  listingId: string;
  title: string;
  region: string;
  dailyRate: number;
  /** 'icon' = small icon button, 'full' = full-width button with WhatsApp */
  variant?: 'icon' | 'full';
}

export function ShareHouseButton({ listingId, title, region, dailyRate, variant = 'icon' }: ShareHouseButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Use edge function URL for OG previews (WhatsApp/social link previews show image + price)
  const ogUrl = `${SUPABASE_URL}/functions/v1/og-house?id=${listingId}`;
  const message = `🏠 Check out this house on Welile!\n\n*${title}*\n📍 ${region}\n💰 ${formatUGX(dailyRate)}/day\n\n👉 ${ogUrl}`;

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast({ title: 'Link copied!', description: 'Paste it on WhatsApp or anywhere to share.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  };

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleNativeShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.share) {
      try {
        await navigator.share({ title: `${title} — Welile`, text: message, url });
      } catch {}
    } else {
      handleCopyLink(e);
    }
  };

  // Icon variant — small overlay button
  if (variant === 'icon') {
    return (
      <button
        onClick={handleNativeShare}
        className="p-1.5 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm hover:bg-muted transition-colors touch-manipulation"
        title="Share this house"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Share2 className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
    );
  }

  // Full variant — WhatsApp + Copy buttons
  return (
    <div className="flex gap-2">
      <button
        onClick={handleWhatsApp}
        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/20 text-sm font-semibold transition-colors touch-manipulation active:scale-[0.97] min-h-[44px]"
      >
        <MessageCircle className="h-4 w-4" />
        WhatsApp
      </button>
      <button
        onClick={handleCopyLink}
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium transition-colors touch-manipulation active:scale-[0.97] min-h-[44px]"
      >
        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied!' : 'Copy Link'}
      </button>
    </div>
  );
}
