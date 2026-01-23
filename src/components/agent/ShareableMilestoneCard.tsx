import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, Share2, Trophy, Star, Users, Coins, Sparkles, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import { formatUGX } from "@/lib/rentCalculations";

interface Milestone {
  count: number;
  bonus: number;
  label: string;
}

const MILESTONE_STYLES: Record<string, { bgGradient: string; icon: React.ReactNode; color: string }> = {
  Starter: {
    bgGradient: "from-emerald-600 via-emerald-500 to-teal-400",
    icon: <Star className="h-14 w-14" />,
    color: "text-emerald-200",
  },
  "Rising Star": {
    bgGradient: "from-amber-600 via-yellow-500 to-orange-400",
    icon: <Sparkles className="h-14 w-14" />,
    color: "text-amber-200",
  },
  Champion: {
    bgGradient: "from-purple-600 via-violet-500 to-fuchsia-400",
    icon: <Trophy className="h-14 w-14" />,
    color: "text-purple-200",
  },
  Elite: {
    bgGradient: "from-blue-600 via-indigo-500 to-purple-400",
    icon: <Users className="h-14 w-14" />,
    color: "text-blue-200",
  },
  Legend: {
    bgGradient: "from-rose-600 via-pink-500 to-red-400",
    icon: <Coins className="h-14 w-14" />,
    color: "text-rose-200",
  },
};

interface ShareableMilestoneCardProps {
  milestone: Milestone;
  userName: string;
  totalSignups: number;
  totalEarned: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareableMilestoneCard({
  milestone,
  userName,
  totalSignups,
  totalEarned,
  open,
  onOpenChange,
}: ShareableMilestoneCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const style = MILESTONE_STYLES[milestone.label] || MILESTONE_STYLES.Starter;

  const generateImage = async (): Promise<string | null> => {
    if (!cardRef.current) return null;

    try {
      const dataUrl = await toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 2,
        cacheBust: true,
      });
      return dataUrl;
    } catch (error) {
      console.error("Error generating image:", error);
      return null;
    }
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const dataUrl = await generateImage();
      if (dataUrl) {
        const link = document.createElement("a");
        link.download = `welile-milestone-${milestone.label.toLowerCase().replace(' ', '-')}.png`;
        link.href = dataUrl;
        link.click();
        toast.success("Milestone card downloaded!");
      }
    } catch (error) {
      toast.error("Failed to generate image");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    setIsGenerating(true);
    try {
      const dataUrl = await generateImage();
      if (!dataUrl) {
        toast.error("Failed to generate image");
        return;
      }

      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], `welile-milestone-${milestone.label.toLowerCase().replace(' ', '-')}.png`, {
        type: "image/png",
      });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `I reached ${milestone.label} on Welile!`,
          text: `I just hit ${milestone.count} referrals and earned the ${milestone.label} milestone! 🎉`,
          files: [file],
        });
        toast.success("Shared successfully!");
      } else if (navigator.share) {
        await navigator.share({
          title: `I reached ${milestone.label} on Welile!`,
          text: `I just hit ${milestone.count} referrals on Welile and earned +${formatUGX(milestone.bonus)}! 🎉 Join using my link and start earning too!`,
          url: "https://welile.com",
        });
        toast.success("Shared successfully!");
      } else {
        await navigator.clipboard.writeText(
          `I reached the ${milestone.label} milestone on Welile with ${milestone.count} referrals! 🎉 Join at welile.com`
        );
        toast.success("Link copied to clipboard!");
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.error("Failed to share");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleWhatsAppShare = () => {
    const message = `🏆 *I just reached the ${milestone.label} milestone on Welile!*

✨ ${milestone.count} referrals completed
💰 Earned +${formatUGX(milestone.bonus)} bonus

I'm building my referral network and helping friends access easy rent payments!

👉 Join Welile and start earning too: https://welile.com

#Welile #ReferralChampion`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-transparent border-none shadow-none">
        <div className="bg-background rounded-2xl overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-lg">Share Milestone</DialogTitle>
          </DialogHeader>

          {/* The shareable card */}
          <div className="px-4 pb-4">
            <div
              ref={cardRef}
              className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${style.bgGradient} p-6 text-white`}
              style={{ aspectRatio: "1/1" }}
            >
              {/* Background pattern */}
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-4 left-4 w-32 h-32 rounded-full bg-white/30 blur-2xl" />
                <div className="absolute bottom-4 right-4 w-40 h-40 rounded-full bg-white/30 blur-3xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-white/20 blur-3xl" />
              </div>

              {/* Decorative stars */}
              <div className="absolute top-6 right-6 opacity-40">
                <Star className="h-6 w-6 fill-white" />
              </div>
              <div className="absolute bottom-16 left-6 opacity-30">
                <Star className="h-4 w-4 fill-white" />
              </div>

              {/* Content */}
              <div className="relative h-full flex flex-col items-center justify-center text-center">
                {/* Milestone icon */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className={style.color}
                >
                  {style.icon}
                </motion.div>

                {/* Badge */}
                <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 mt-4 mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    🏆 Milestone Unlocked
                  </span>
                </div>

                {/* Title */}
                <h2 className="text-3xl font-bold mb-1 drop-shadow-lg">
                  {milestone.label}
                </h2>

                {/* Stats */}
                <div className="flex items-center gap-4 mt-3 mb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{milestone.count}</p>
                    <p className="text-xs text-white/80">Referrals</p>
                  </div>
                  <div className="w-px h-10 bg-white/30" />
                  <div className="text-center">
                    <p className="text-2xl font-bold">+{formatUGX(milestone.bonus)}</p>
                    <p className="text-xs text-white/80">Bonus Earned</p>
                  </div>
                </div>

                {/* Total stats */}
                <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2 mt-2">
                  <p className="text-xs text-white/80">Total Earnings</p>
                  <p className="text-lg font-bold">{formatUGX(totalEarned)}</p>
                </div>

                {/* User info */}
                <div className="mt-auto pt-4">
                  <p className="text-white/70 text-xs">Achieved by</p>
                  <p className="font-semibold text-lg">{userName}</p>
                </div>

                {/* Welile branding */}
                <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center">
                  <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1">
                    <span className="text-xs font-medium">welile.com</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="p-4 pt-0 space-y-2">
            {/* Primary WhatsApp button */}
            <Button
              className="w-full h-12 gap-2 bg-[#25D366] hover:bg-[#1fb855] text-white font-semibold touch-manipulation"
              onClick={handleWhatsAppShare}
            >
              <MessageCircle className="h-5 w-5" />
              Share on WhatsApp
            </Button>
            
            {/* Secondary buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-11 touch-manipulation"
                onClick={handleDownload}
                disabled={isGenerating}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-11 touch-manipulation"
                onClick={handleShare}
                disabled={isGenerating}
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}