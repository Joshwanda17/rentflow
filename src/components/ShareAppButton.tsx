import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2, MessageCircle, Copy, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const APP_URL = window.location.origin;
const SHARE_MESSAGE = `🏠 Hey! I'm using Welile to manage my rent payments and build credit through shopping. It's super easy! Join me: ${APP_URL}`;

export function ShareAppButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    // Try native share first (works great on mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Welile',
          text: SHARE_MESSAGE,
          url: APP_URL,
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
    await navigator.clipboard.writeText(APP_URL);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsAppShare = () => {
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(SHARE_MESSAGE)}`;
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
            <DialogTitle className="text-center">Share Welile</DialogTitle>
            <DialogDescription className="text-center">
              Invite your friends and family to join Welile!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
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
                  Copy Link
                </>
              )}
            </Button>

            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Share this link:</p>
              <p className="text-sm font-mono break-all text-primary">{APP_URL}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
