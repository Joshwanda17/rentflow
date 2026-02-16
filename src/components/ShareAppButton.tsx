import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2, MessageCircle, Copy, Check, Gift } from 'lucide-react';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export function ShareAppButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate referral link with user's ID - shorter format
  const origin = getPublicOrigin();
  const referralLink = user 
    ? `${origin}/join?r=${user.id}`
    : origin;
  
  const shareMessage = `🏠 Hey! I'm using Welile to manage my rent payments and build credit through shopping. It's super easy! Join using my link and we both get rewarded: ${referralLink}`;

  const handleShare = async () => {
    // Try native share first (works great on mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Welile - Get Rewarded!',
          text: shareMessage,
          url: referralLink,
        });
        return;
      } catch (err) {
        // User cancelled or share failed, show dialog
        if ((err as Error).name !== 'AbortError') {
          setOpen(true);
        }
      }
    } else {
      setOpen(true);
    }
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success('Referral link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsAppShare = () => {
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(whatsappUrl, '_blank');
    setOpen(false);
  };

  return (
    <>
      <Button
        onClick={handleShare}
        size="sm"
        className="gap-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg animate-pulse hover:animate-none"
      >
        <Share2 className="h-4 w-4" />
        <span className="hidden sm:inline">Invite Friends</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center flex items-center justify-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              Invite & Earn
            </DialogTitle>
            <DialogDescription className="text-center">
              Share your unique link! When friends sign up, you'll automatically receive <span className="font-bold text-primary">UGX 500</span> in your wallet!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            {/* Reward info */}
            <div className="bg-gradient-to-r from-primary/10 to-success/10 rounded-lg p-3 border border-primary/20">
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <p className="text-xl font-bold text-primary">UGX 500</p>
                  <p className="text-xs text-muted-foreground">On signup</p>
                </div>
                <div className="text-2xl text-muted-foreground">+</div>
                <div className="text-center">
                  <p className="text-xl font-bold text-success">UGX 200</p>
                  <p className="text-xs text-muted-foreground">First transaction</p>
                </div>
              </div>
              <p className="text-xs text-center text-muted-foreground mt-2">
                Earn up to <span className="font-bold">UGX 700</span> per referral!
              </p>
            </div>

            <Button
              onClick={handleWhatsAppShare}
              className="w-full gap-3 bg-[#25D366] hover:bg-[#1fb855] text-white h-12"
            >
              <MessageCircle className="h-5 w-5" />
              Share on WhatsApp
            </Button>

            <Button
              onClick={handleCopyLink}
              variant="outline"
              className="w-full gap-3 h-12"
            >
              {copied ? (
                <>
                  <Check className="h-5 w-5 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-5 w-5" />
                  Copy Referral Link
                </>
              )}
            </Button>

            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Your unique referral link:</p>
              <p className="text-xs font-mono break-all text-primary">{referralLink}</p>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Rewards are credited instantly when your friend signs up! 🎉
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
