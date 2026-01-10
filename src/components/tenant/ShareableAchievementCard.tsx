import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, Share2, Trophy, Flame, Star, Sparkles, Award, Target, Zap, Crown, X } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";

interface Achievement {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgGradient: string;
}

const ACHIEVEMENT_STYLES: Record<string, Achievement> = {
  first_payment: {
    key: "first_payment",
    title: "First Step",
    description: "Made my first payment on Welile!",
    icon: <Sparkles className="h-12 w-12" />,
    color: "text-emerald-400",
    bgGradient: "from-emerald-600 via-emerald-500 to-teal-400",
  },
  streak_7_days: {
    key: "streak_7_days",
    title: "Week Warrior",
    description: "7 days of consistent payments!",
    icon: <Flame className="h-12 w-12" />,
    color: "text-orange-400",
    bgGradient: "from-orange-600 via-red-500 to-amber-400",
  },
  streak_14_days: {
    key: "streak_14_days",
    title: "Fortnight Champion",
    description: "14 days of payment excellence!",
    icon: <Star className="h-12 w-12" />,
    color: "text-amber-400",
    bgGradient: "from-amber-600 via-yellow-500 to-orange-400",
  },
  streak_30_days: {
    key: "streak_30_days",
    title: "Monthly Master",
    description: "30 days of perfect payments!",
    icon: <Trophy className="h-12 w-12" />,
    color: "text-purple-400",
    bgGradient: "from-purple-600 via-violet-500 to-fuchsia-400",
  },
  streak_60_days: {
    key: "streak_60_days",
    title: "Elite Payer",
    description: "60 days of dedication!",
    icon: <Crown className="h-12 w-12" />,
    color: "text-blue-400",
    bgGradient: "from-blue-600 via-indigo-500 to-purple-400",
  },
  loan_completed: {
    key: "loan_completed",
    title: "Debt Free",
    description: "Fully repaid my loan!",
    icon: <Target className="h-12 w-12" />,
    color: "text-green-400",
    bgGradient: "from-green-600 via-emerald-500 to-teal-400",
  },
  early_bird: {
    key: "early_bird",
    title: "Early Bird",
    description: "Paid before 9 AM!",
    icon: <Zap className="h-12 w-12" />,
    color: "text-yellow-400",
    bgGradient: "from-yellow-500 via-amber-400 to-orange-400",
  },
  perfect_month: {
    key: "perfect_month",
    title: "Perfect Month",
    description: "No missed payments this month!",
    icon: <Award className="h-12 w-12" />,
    color: "text-pink-400",
    bgGradient: "from-pink-600 via-rose-500 to-red-400",
  },
};

interface ShareableAchievementCardProps {
  achievementKey: string;
  unlockedAt: string;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareableAchievementCard({
  achievementKey,
  unlockedAt,
  userName,
  open,
  onOpenChange,
}: ShareableAchievementCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const achievement = ACHIEVEMENT_STYLES[achievementKey];

  if (!achievement) return null;

  const generateImage = async (): Promise<string | null> => {
    if (!cardRef.current) return null;

    try {
      // Generate high-quality image
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
        link.download = `welile-achievement-${achievement.key}.png`;
        link.href = dataUrl;
        link.click();
        toast.success("Achievement card downloaded!");
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

      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], `welile-achievement-${achievement.key}.png`, {
        type: "image/png",
      });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `I unlocked ${achievement.title} on Welile!`,
          text: achievement.description,
          files: [file],
        });
        toast.success("Shared successfully!");
      } else if (navigator.share) {
        // Share without file if file sharing not supported
        await navigator.share({
          title: `I unlocked ${achievement.title} on Welile!`,
          text: `${achievement.description} 🎉 Join me on Welile.com - Africa's leading rent facilitation platform!`,
          url: "https://welile.com",
        });
        toast.success("Shared successfully!");
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(
          `I unlocked ${achievement.title} on Welile! ${achievement.description} 🎉 Join me at welile.com`
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-transparent border-none shadow-none">
        <div className="bg-background rounded-2xl overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg">Share Achievement</DialogTitle>
            </div>
          </DialogHeader>

          {/* The shareable card */}
          <div className="px-4 pb-4">
            <div
              ref={cardRef}
              className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${achievement.bgGradient} p-6 text-white`}
              style={{ aspectRatio: "1/1" }}
            >
              {/* Background pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-4 left-4 w-32 h-32 rounded-full bg-white/20 blur-2xl" />
                <div className="absolute bottom-4 right-4 w-40 h-40 rounded-full bg-white/20 blur-3xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
              </div>

              {/* Content */}
              <div className="relative h-full flex flex-col items-center justify-center text-center">
                {/* Achievement icon */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className={`mb-4 ${achievement.color}`}
                >
                  {achievement.icon}
                </motion.div>

                {/* Badge */}
                <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Achievement Unlocked
                  </span>
                </div>

                {/* Title */}
                <h2 className="text-2xl font-bold mb-2 drop-shadow-lg">
                  {achievement.title}
                </h2>

                {/* Description */}
                <p className="text-white/90 text-sm mb-4 max-w-[200px]">
                  {achievement.description}
                </p>

                {/* User info */}
                <div className="mt-auto">
                  <p className="text-white/80 text-xs mb-1">Achieved by</p>
                  <p className="font-semibold">{userName}</p>
                  <p className="text-white/60 text-xs mt-1">
                    {format(new Date(unlockedAt), "MMMM d, yyyy")}
                  </p>
                </div>

                {/* Welile branding */}
                <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-2">
                  <div className="bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                    <span className="text-xs font-medium">welile.com</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="p-4 pt-0 flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDownload}
              disabled={isGenerating}
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button
              className="flex-1"
              onClick={handleShare}
              disabled={isGenerating}
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
