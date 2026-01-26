import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { hapticTap, hapticSuccess } from '@/lib/haptics';

interface RentCalculatorShareButtonProps {
  calculatorType: 'daily' | 'weekly-monthly';
  className?: string;
}

export function RentCalculatorShareButton({ calculatorType, className }: RentCalculatorShareButtonProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const calculatorName = calculatorType === 'daily' ? 'Daily Repayment' : 'Flexible Repayment';
  
  // Include referrer ID in the link
  const shareLink = user 
    ? `${window.location.origin}/rent-calculator?type=${calculatorType}&ref=${user.id}`
    : `${window.location.origin}/rent-calculator?type=${calculatorType}`;
  
  const shareMessage = `💰 Need help with rent? Try this ${calculatorName} Calculator!

📊 Calculate your repayment plan
📅 Flexible payment options
🏠 Get rent assistance easily

Try it now: ${shareLink}`;

  const handleShare = async () => {
    hapticTap();
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Welile ${calculatorName} Calculator`,
          text: shareMessage,
          url: shareLink,
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
      description: 'Help others calculate their rent repayment!',
    });
  };

  const handleCopy = async () => {
    hapticTap();
    try {
      await navigator.clipboard.writeText(shareLink);
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
    <div className={`flex gap-2 ${className}`}>
      <Button
        onClick={handleShare}
        variant="outline"
        size="sm"
        className="gap-1.5 flex-1"
      >
        <Share2 className="h-3.5 w-3.5" />
        Share
      </Button>
      <Button
        onClick={handleCopy}
        variant="ghost"
        size="sm"
        className="px-2"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
