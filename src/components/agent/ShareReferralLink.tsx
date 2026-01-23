import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Copy, Check, Share2, Link2, Gift, Users } from 'lucide-react';
import { motion } from 'framer-motion';

export function ShareReferralLink() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const getShareLink = () => {
    if (!user) return '';
    return `${window.location.origin}/auth?ref=${user.id}`;
  };

  const getWhatsAppMessage = () => {
    return `👋 Hey! Join me on Welile!

🏠 Welile helps you manage rent payments easily.

✨ Benefits:
• Pay rent in small daily amounts
• Access rent loans when needed
• Track all your payments

🎁 Sign up using my link and we both earn rewards!

👉 TAP HERE TO JOIN:
${getShareLink()}

Let's make rent easy! 💪`;
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(getShareLink());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Link copied!' });
  };

  const handleShareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(getWhatsAppMessage())}`, '_blank');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Welile',
          text: 'Join me on Welile and get started with easy rent management!',
          url: getShareLink(),
        });
      } catch (err) {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-violet-500/5 overflow-hidden">
        <CardContent className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-lg shadow-primary/25">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                Invite & Earn
              </h3>
              <p className="text-xs text-muted-foreground">
                Earn <span className="font-bold text-primary">UGX 500</span> for each signup!
              </p>
            </div>
          </div>

          {/* Link Section */}
          <div className="relative p-3 rounded-xl bg-background/80 border border-primary/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Link2 className="h-3 w-3" />
              <span>Your referral link</span>
            </div>
            <div className="flex gap-2">
              <Input 
                value={getShareLink()} 
                readOnly 
                className="h-10 text-xs font-mono bg-muted/50 border-primary/20" 
              />
              <Button 
                variant={copied ? "default" : "outline"} 
                size="icon" 
                onClick={handleCopyLink}
                className={`h-10 w-10 shrink-0 transition-all ${copied ? 'bg-success hover:bg-success/90' : 'border-primary/30 hover:bg-primary/10'}`}
              >
                {copied ? <Check className="h-4 w-4 text-white" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Share Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button 
              onClick={handleShareWhatsApp}
              className="h-12 gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold touch-manipulation"
            >
              <Share2 className="h-4 w-4" />
              WhatsApp
            </Button>
            <Button 
              variant="outline"
              onClick={handleNativeShare}
              className="h-12 gap-2 border-primary/30 hover:bg-primary/10 touch-manipulation"
            >
              <Share2 className="h-4 w-4" />
              Share Link
            </Button>
          </div>

          {/* Info */}
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
            <Users className="h-4 w-4 text-primary shrink-0" />
            <p className="text-[11px] text-muted-foreground">
              Share with friends & family. When they sign up, you both earn rewards!
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
