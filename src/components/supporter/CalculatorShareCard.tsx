import { Calculator, Share2, Copy, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useProfile } from '@/hooks/useProfile';
import { useState } from 'react';
import { hapticTap, hapticSuccess } from '@/lib/haptics';

interface CalculatorShareCardProps {
  className?: string;
}

export function CalculatorShareCard({ className }: CalculatorShareCardProps) {
  const { toast } = useToast();
  const { profile } = useProfile();
  const [copied, setCopied] = useState(false);

  const calculatorLink = `${window.location.origin}/try-calculator?ref=${profile?.id || ''}`;
  
  const shareMessage = `💰 Want to earn 15% monthly returns?

📊 Try our FREE Investment Calculator - no signup needed!
📈 See exactly how much you can earn
🔄 With compounding up to 60 months!
🎁 Sign up & we BOTH earn UGX 500!

👉 Try it now: ${calculatorLink}`;

  const handleShare = async () => {
    hapticTap();
    
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
    
    toast({
      title: '📊 Share via WhatsApp',
      description: 'Let them try before they join!',
    });
  };

  const handleCopy = async () => {
    hapticTap();
    try {
      await navigator.clipboard.writeText(calculatorLink);
      setCopied(true);
      hapticSuccess();
      toast({
        title: '✓ Link Copied!',
        description: 'Share it anywhere',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Please copy manually',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className={cn('relative overflow-hidden rounded-2xl', className)}>
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/90 via-teal-500/85 to-cyan-500/80" />
      
      {/* Decorative elements */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 blur-2xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/10 blur-xl translate-y-1/2 -translate-x-1/2" />
      </div>

      {/* Content */}
      <div className="relative z-10 p-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-sm shadow-lg">
            <Calculator className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-bold text-white">Share Calculator</h3>
              <Sparkles className="h-4 w-4 text-yellow-300" />
            </div>
            <p className="text-xs text-white/80 mb-3">
              Let strangers try it free - you both earn UGX 500 on signup!
            </p>
            
            <div className="flex gap-2">
              <Button
                onClick={handleShare}
                className="flex-1 h-11 rounded-xl bg-white text-emerald-600 font-bold text-sm hover:bg-white/95 active:scale-[0.98] transition-all gap-2"
              >
                <Share2 className="h-4 w-4" />
                Share Link
              </Button>
              <Button
                onClick={handleCopy}
                variant="ghost"
                className="h-11 px-4 rounded-xl bg-white/15 text-white hover:bg-white/25 active:scale-[0.98]"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            
            {/* Quick info */}
            <p className="text-[10px] text-white/70 mt-2 text-center">
              Works offline • No signup needed • UGX 500 bonus each
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
