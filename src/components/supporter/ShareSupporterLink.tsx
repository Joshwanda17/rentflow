import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Share2, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface ShareSupporterLinkProps {
  className?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showCount?: boolean;
}

export function ShareSupporterLink({ className, variant = 'outline', size = 'default', showCount = true }: ShareSupporterLinkProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [referralCount, setReferralCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchReferralCount = async () => {
      const { count } = await supabase
        .from('supporter_referrals')
        .select('*', { count: 'exact', head: true })
        .eq('referrer_id', user.id);
      
      setReferralCount(count || 0);
    };

    fetchReferralCount();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`supporter-referrals-count-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'supporter_referrals',
          filter: `referrer_id=eq.${user.id}`,
        },
        () => {
          setReferralCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Include referrer ID in the link
  const shareLink = user 
    ? `${window.location.origin}/become-supporter?ref=${user.id}`
    : `${window.location.origin}/become-supporter`;
  
  const shareMessage = `🎉 Join Welile as a Tenant Supporter and earn 15% monthly returns! 

💰 Help tenants pay rent while growing your investment
📈 Guaranteed monthly interest payments
🔒 Secure and flexible withdrawals
🎁 Sign up using my link and I earn a bonus!

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
