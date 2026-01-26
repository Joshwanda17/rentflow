import { Button } from '@/components/ui/button';
import { Share2, Calculator, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ShareCalculatorLinkProps {
  className?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function ShareCalculatorLink({ className, variant = 'outline', size = 'default' }: ShareCalculatorLinkProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  // Direct to auth page with supporter role and referrer ID
  const shareLink = user 
    ? `${window.location.origin}/auth?role=supporter&ref=${user.id}`
    : `${window.location.origin}/auth?role=supporter`;
  
  const shareMessage = `💰 Start earning 15% monthly returns with Welile!

📈 Invest in rent payments
🔒 Secure and flexible
✅ Quick signup - takes 2 minutes

Join now: ${shareLink}`;

  const handleShare = async () => {
    // Check if Web Share API is available (mostly mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Try Welile Investment Calculator',
          text: shareMessage,
          url: shareLink,
        });
        return;
      } catch {
        // User cancelled or share failed, fall through to WhatsApp
      }
    }

    // Open WhatsApp with the share message
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(whatsappUrl, '_blank');
    
    toast({
      title: '📊 Calculator Link Ready!',
      description: 'Share with potential supporters to try the calculator',
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      toast({
        title: '✓ Link Copied!',
        description: 'Calculator link copied to clipboard',
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
    <div className={cn('flex gap-2', className)}>
      <Button 
        onClick={handleShare}
        variant={variant}
        size={size}
        className="gap-2 flex-1"
      >
        <Calculator className="h-4 w-4" />
        <span className="hidden sm:inline">Share Calculator</span>
        <span className="sm:hidden">Calculator</span>
        <Share2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        onClick={handleCopy}
        variant="ghost"
        size="icon"
        className="shrink-0"
      >
        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}
