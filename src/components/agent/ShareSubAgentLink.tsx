import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Copy, Check, Share2, Users, Link2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export function ShareSubAgentLink() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const getShareLink = () => {
    if (!user) return '';
    return `${window.location.origin}/auth?ref=${user.id}&become=agent`;
  };

  const getWhatsAppMessage = () => {
    return `🚀 Join me as a Sub-Agent on Welile!

💰 Earn money by:
• Registering tenants & landlords
• Earning 4% commission on repayments
• Building your own team of sub-agents

✨ It's FREE to join and start earning!

👉 Sign up here:
${getShareLink()}

Let's grow together! 🤝`;
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
          title: 'Join Welile as a Sub-Agent',
          text: 'Earn money by registering tenants & landlords. Sign up for free!',
          url: getShareLink(),
        });
      } catch (err) {
        // User cancelled or error
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
      <Card className="border-2 border-orange-500/30 bg-gradient-to-br from-orange-500/5 via-amber-500/5 to-yellow-500/5 overflow-hidden">
        <CardContent className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25">
              <Users className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-base flex items-center gap-2">
                Recruit Sub-Agents
                <Sparkles className="h-4 w-4 text-orange-500" />
              </h3>
              <p className="text-xs text-muted-foreground">
                Earn <span className="font-bold text-orange-600">UGX 500</span> for each signup!
              </p>
            </div>
          </div>

          {/* Link Section */}
          <div className="relative p-3 rounded-xl bg-background/80 border border-orange-500/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Link2 className="h-3 w-3" />
              <span>Your referral link</span>
            </div>
            <div className="flex gap-2">
              <Input 
                value={getShareLink()} 
                readOnly 
                className="h-10 text-xs font-mono bg-muted/50 border-orange-500/20" 
              />
              <Button 
                variant={copied ? "default" : "outline"} 
                size="icon" 
                onClick={handleCopyLink}
                className={`h-10 w-10 shrink-0 transition-all ${copied ? 'bg-green-600 hover:bg-green-700' : 'border-orange-500/30 hover:bg-orange-500/10'}`}
              >
                {copied ? <Check className="h-4 w-4 text-white" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Share Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button 
              onClick={handleShareWhatsApp}
              className="h-11 gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold"
            >
              <Share2 className="h-4 w-4" />
              WhatsApp
            </Button>
            <Button 
              variant="outline"
              onClick={handleNativeShare}
              className="h-11 gap-2 border-orange-500/30 hover:bg-orange-500/10"
            >
              <Share2 className="h-4 w-4" />
              Share Link
            </Button>
          </div>

          {/* Info */}
          <p className="text-[11px] text-center text-muted-foreground">
            When someone signs up using your link, they become your sub-agent and you earn 1% of their earnings!
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default ShareSubAgentLink;
