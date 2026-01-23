import { motion } from 'framer-motion';
import { Share2, Users, Gift, ChevronRight, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useProfile } from '@/hooks/useProfile';

interface ModernInviteCardProps {
  onShare: () => void;
  className?: string;
}

export function ModernInviteCard({ onShare, className }: ModernInviteCardProps) {
  const { toast } = useToast();
  const { profile } = useProfile();

  const referralLink = `${window.location.origin}/join?ref=${profile?.id || ''}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      toast({
        title: '✓ Copied!',
        description: 'Referral link copied to clipboard',
      });
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className={cn('relative overflow-hidden rounded-2xl', className)}
    >
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/90 via-purple-500/85 to-fuchsia-500/80" />
      
      {/* Decorative elements */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 blur-2xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/10 blur-xl translate-y-1/2 -translate-x-1/2" />
      </div>

      {/* Content */}
      <div className="relative z-10 p-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-sm shadow-lg">
            <Gift className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white mb-0.5">Earn with Friends</h3>
            <p className="text-xs text-white/80 mb-3">
              Share your link and earn rewards when friends invest
            </p>
            
            <div className="flex gap-2">
              <Button
                onClick={onShare}
                className="flex-1 h-10 rounded-xl bg-white text-purple-600 font-bold text-sm hover:bg-white/95 active:scale-[0.98] transition-all gap-2"
              >
                <Share2 className="h-4 w-4" />
                Share Link
              </Button>
              <Button
                onClick={handleCopyLink}
                variant="ghost"
                className="h-10 px-3 rounded-xl bg-white/15 text-white hover:bg-white/25 active:scale-[0.98]"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
