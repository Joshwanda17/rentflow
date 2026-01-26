import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Share2, Copy, Check, Users, Gift, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { motion } from 'framer-motion';

export function InviteFriendsCard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  // Direct to auth page with tenant role and referrer ID
  const shareLink = user 
    ? `${window.location.origin}/auth?role=tenant&ref=${user.id}`
    : `${window.location.origin}/auth?role=tenant`;
  
  const shareMessage = `🏠 Struggling with rent? I use Welile to get my rent paid upfront!

💰 Get your full rent today
📅 Pay back in small daily amounts
✅ Quick signup - just 2 minutes
🎁 We BOTH get 500 UGX bonus!
📲 Install the app for the best experience

Join now: ${shareLink}`;

  const handleWhatsAppShare = async () => {
    hapticTap();
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(whatsappUrl, '_blank');
    
    toast({
      title: '📱 Sharing via WhatsApp',
      description: 'Invite friends to earn bonuses!',
    });
  };

  const handleNativeShare = async () => {
    hapticTap();
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Welile - Get Rent Help',
          text: shareMessage,
          url: shareLink,
        });
        hapticSuccess();
        return;
      } catch {
        // User cancelled or share failed, fall through to copy
        handleCopy();
      }
    } else {
      handleCopy();
    }
  };

  const handleCopy = async () => {
    hapticTap();
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      hapticSuccess();
      toast({
        title: '✓ Link Copied!',
        description: 'Share it with friends who need rent help',
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <CardContent className="p-4">
          {/* Header - more compact on mobile */}
          <div className="flex items-center gap-3 mb-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md flex-shrink-0">
              <Users className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm leading-tight">Invite Friends</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Gift className="h-3 w-3 text-amber-500 flex-shrink-0" />
                <span>Both get 500 UGX!</span>
              </p>
            </div>
          </div>

          {/* Primary Action - Full width WhatsApp button */}
          <Button
            onClick={handleWhatsAppShare}
            className="w-full h-14 bg-[#25D366] hover:bg-[#20BD5A] text-white gap-2.5 font-bold text-base mb-2 rounded-xl shadow-md active:scale-[0.98] transition-transform"
          >
            <MessageCircle className="h-6 w-6" />
            Share on WhatsApp
          </Button>

          {/* Secondary actions row */}
          <div className="flex gap-2">
            <Button
              onClick={handleNativeShare}
              variant="outline"
              className="flex-1 h-11 gap-2 rounded-xl font-medium"
            >
              <Share2 className="h-4 w-4" />
              Share
            </Button>
            
            <Button
              onClick={handleCopy}
              variant="outline"
              className="flex-1 h-11 gap-2 rounded-xl font-medium"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-success" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy Link
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

