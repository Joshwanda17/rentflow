import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface ShareSupporterLinkProps {
  className?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function ShareSupporterLink({ className, variant = 'outline', size = 'default' }: ShareSupporterLinkProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  // Include referrer ID in the link
  const shareLink = user 
    ? `${window.location.origin}/become-supporter?ref=${user.id}`
    : `${window.location.origin}/become-supporter`;
  
  const shareMessage = `🎉 Join Welile as a Tenant Supporter and earn 15% monthly returns! 

💰 Help tenants pay rent while growing your investment
📈 Guaranteed monthly interest payments
🔒 Secure and flexible withdrawals
🎁 Make your first investment and I earn a bonus!

Start investing today: ${shareLink}`;

  const handleShare = async () => {
    // Check if Web Share API is available (mostly mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Become a Tenant Supporter - Welile',
          text: shareMessage,
          url: shareLink,
        });
        return;
      } catch (err) {
        // User cancelled or share failed, fall through to WhatsApp
      }
    }

    // Open WhatsApp with the share message
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(whatsappUrl, '_blank');
    
    toast({
      title: '📤 Link Ready to Share!',
      description: 'Share the supporter link with friends on WhatsApp',
    });
  };

  return (
    <Button 
      onClick={handleShare}
      variant={variant}
      size={size}
      className={`gap-2 ${className}`}
    >
      <Share2 className="h-4 w-4" />
      <span className="hidden sm:inline">Share on WhatsApp</span>
      <span className="sm:hidden">Share</span>
    </Button>
  );
}
