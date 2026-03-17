import { useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SITE_URL = 'https://welilereceipts.com';

interface ShareHouseButtonProps {
  listingId: string;
  title: string;
  region: string;
  dailyRate: number;
  /** 'icon' = small icon button, 'full' = full-width button */
  variant?: 'icon' | 'full';
}

export function ShareHouseButton({ listingId, title, region, dailyRate, variant = 'icon' }: ShareHouseButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const url = `${SITE_URL}/house/${listingId}`;

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const shareData = {
      title: `${title} — Daily Rent | Welile`,
      text: `Check out this house: ${title} in ${region} on Welile!`,
      url,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: 'Link copied!', description: 'Share it with anyone.' });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (variant === 'full') {
    return (
      <button
        onClick={handleShare}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium transition-colors touch-manipulation active:scale-[0.97]"
      >
        {copied ? <Check className="h-4 w-4 text-success" /> : <Share2 className="h-4 w-4" />}
        {copied ? 'Link Copied!' : 'Share This House'}
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      className="p-1.5 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm hover:bg-muted transition-colors touch-manipulation"
      title="Share this house"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Share2 className="h-3.5 w-3.5 text-muted-foreground" />}
    </button>
  );
}
