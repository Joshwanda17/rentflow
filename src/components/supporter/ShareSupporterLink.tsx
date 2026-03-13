import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Share2, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useUserSnapshot } from '@/hooks/useUserSnapshot';
import { getPublicOrigin } from '@/lib/getPublicOrigin';

interface ShareSupporterLinkProps {
  className?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showCount?: boolean;
}

export function ShareSupporterLink({ className, variant = 'outline', size = 'default', showCount = true }: ShareSupporterLinkProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { snapshot } = useUserSnapshot(user?.id);
  const referralCount = snapshot.supporterReferrals?.length || 0;

  const origin = getPublicOrigin();
  const shareLink = user 
    ? `${origin}/join?s=${user.id}`
    : `${origin}/become-supporter`;
  
  const shareMessage = `🎉 Join Welile as a Tenant Supporter and earn up to 15% monthly platform rewards! 

💰 Help tenants pay rent while growing your contribution
📈 Monthly platform reward payouts
🔒 Secure and flexible withdrawals
🎁 Sign up using my link and I earn a bonus!

Start supporting tenants today: ${shareLink}`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Become a Tenant Supporter - Welile',
          text: shareMessage,
          url: shareLink,
        });
        return;
      } catch (err) {
        // Fall through to WhatsApp
      }
    }

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(whatsappUrl, '_blank');
    
    toast({
      title: '📤 Link Ready to Share!',
      description: 'Share the supporter link with friends on WhatsApp',
    });
  };

  return (
    <div className="relative inline-flex">
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
      {showCount && referralCount > 0 && (
        <Badge 
          className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center p-0 text-xs bg-success text-success-foreground border-2 border-background"
        >
          <Users className="h-3 w-3 mr-0.5" />
          {referralCount}
        </Badge>
      )}
    </div>
  );
}
