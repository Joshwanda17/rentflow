import { Share2, Gift, Copy, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useProfile } from '@/hooks/useProfile';

interface ModernInviteCardProps {
  onShare: () => void;
  className?: string;
}

export function ModernInviteCard({ onShare, className }: ModernInviteCardProps) {
  const { toast } = useToast();
  const { profile } = useProfile();

  const referralLink = `${window.location.origin}/join?ref=${profile?.id || ''}`;
  const calculatorLink = `${window.location.origin}/try-calculator?ref=${profile?.id || ''}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
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
    const shareMessage = `💰 See how much you can earn with Welile!

📊 Try our Investment Calculator - No sign up needed!
📈 Earn 15% monthly returns

Try it now: ${calculatorLink}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Try Welile Investment Calculator',
          text: shareMessage,
          url: calculatorLink,
        });
        return;
      } catch {
        // Fall through to WhatsApp
      }
    }

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className={cn('relative overflow-hidden rounded-2xl', className)}>
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/90 via-purple-500/85 to-fuchsia-500/80" />
      
      {/* Decorative elements */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 blur-2xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/10 blur-xl translate-y-1/2 -translate-x-1/2" />
      </div>

      {/* Content */}
      <div className="relative z-10 p-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-sm shadow-lg">
            <Gift className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white mb-0.5">Invite & Earn</h3>
            <p className="text-xs text-white/80 mb-3">
              Share your link or let them try the calculator first!
            </p>
            
            <div className="space-y-2">
              {/* Main share row */}
              <div className="flex gap-2">
                <Button
                  onClick={onShare}
                  className="flex-1 h-10 rounded-xl bg-white text-purple-600 font-bold text-sm hover:bg-white/95 active:scale-[0.98] transition-all gap-2"
                >
                  <Share2 className="h-4 w-4" />
                  Invite Link
                </Button>
                <Button
                  onClick={handleCopyLink}
                  variant="ghost"
                  className="h-10 px-3 rounded-xl bg-white/15 text-white hover:bg-white/25 active:scale-[0.98]"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Calculator share button */}
              <Button
                onClick={handleShareCalculator}
                variant="ghost"
                className="w-full h-9 rounded-xl bg-white/10 text-white hover:bg-white/20 active:scale-[0.98] text-xs gap-2"
              >
                <Calculator className="h-3.5 w-3.5" />
                Share Calculator (for strangers)
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
