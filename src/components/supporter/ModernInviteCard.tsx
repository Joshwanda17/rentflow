import { Share2, Gift, Copy, Calculator, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useProfile } from '@/hooks/useProfile';
import { useState } from 'react';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { getPublicOrigin } from '@/lib/getPublicOrigin';

interface ModernInviteCardProps {
  onShare: () => void;
  className?: string;
}

export function ModernInviteCard({ onShare, className }: ModernInviteCardProps) {
  const { toast } = useToast();
  const { profile } = useProfile();
  const [copiedCalc, setCopiedCalc] = useState(false);

  const origin = getPublicOrigin();
  const referralLink = `${origin}/join?ref=${profile?.id || ''}`;
  const calculatorLink = `${origin}/try-calculator?ref=${profile?.id || ''}`;

  const handleCopyLink = async () => {
    hapticTap();
    try {
      await navigator.clipboard.writeText(referralLink);
      hapticSuccess();
      toast({
        title: '✓ Copied!',
        description: 'Referral link copied to clipboard',
      });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Please copy manually',
        variant: 'destructive',
      });
    }
  };

  const handleShareCalculator = async () => {
    hapticTap();
    const shareMessage = `💰 Want to earn 15% monthly returns?

📊 Try this FREE Investment Calculator - no signup needed!
📈 See exactly how much you can earn
🔒 Start with as little as UGX 50,000

👉 Try it now: ${calculatorLink}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Welile Investment Calculator',
          text: shareMessage,
          url: calculatorLink,
        });
        hapticSuccess();
        return;
      } catch {
        // Fall through to WhatsApp
      }
    }

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleCopyCalculator = async () => {
    hapticTap();
    try {
      await navigator.clipboard.writeText(calculatorLink);
      setCopiedCalc(true);
      hapticSuccess();
      toast({
        title: '✓ Calculator Link Copied!',
        description: 'Share it with potential supporters',
      });
      setTimeout(() => setCopiedCalc(false), 2000);
    } catch {
      toast({
        title: 'Copy failed',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Calculator Share - PRIMARY (for strangers) */}
      <div className="relative overflow-hidden rounded-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/90 via-teal-500/85 to-cyan-500/80" />
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 blur-2xl -translate-y-1/2 translate-x-1/2" />
        </div>
        <div className="relative z-10 p-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
              <Calculator className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-bold text-white text-sm">Share Calculator</h3>
                <Sparkles className="h-3.5 w-3.5 text-yellow-300" />
              </div>
              <p className="text-[11px] text-white/80 mb-2.5">
                Let strangers try it free - auto-assigns Supporter role on signup!
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleShareCalculator}
                  className="flex-1 h-10 rounded-xl bg-white text-emerald-600 font-bold text-xs hover:bg-white/95 active:scale-[0.98] transition-all gap-1.5"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Share Calculator
                </Button>
                <Button
                  onClick={handleCopyCalculator}
                  variant="ghost"
                  className="h-10 px-3 rounded-xl bg-white/15 text-white hover:bg-white/25 active:scale-[0.98]"
                >
                  {copiedCalc ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[9px] text-white/60 mt-1.5 text-center">
                Works offline • No signup needed
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Regular Invite Link - Secondary - Fully Clickable */}
      <div 
        className="relative overflow-hidden rounded-2xl cursor-pointer active:scale-[0.98] transition-transform touch-manipulation"
        onClick={onShare}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onShare()}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/90 via-purple-500/85 to-fuchsia-500/80" />
        <div className="relative z-10 p-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
              <Gift className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-white text-sm mb-0.5">Direct Invite</h3>
              <p className="text-[11px] text-white/80 mb-2.5">
                For people ready to join - UGX 500 bonus each!
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={(e) => { e.stopPropagation(); onShare(); }}
                  className="flex-1 h-10 rounded-xl bg-white text-purple-600 font-bold text-xs hover:bg-white/95 active:scale-[0.98] transition-all gap-1.5"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Invite Link
                </Button>
                <Button
                  onClick={(e) => { e.stopPropagation(); handleCopyLink(); }}
                  variant="ghost"
                  className="h-10 px-3 rounded-xl bg-white/15 text-white hover:bg-white/25 active:scale-[0.98]"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
