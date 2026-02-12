import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Flame, Star, Sparkles, Award, Target, Zap, Crown, Share2 } from "lucide-react";
import { format } from "date-fns";
import { ShareableAchievementCard } from "./ShareableAchievementCard";
import { useProfile } from "@/hooks/useProfile";

interface Achievement {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  requirement: string;
}

interface UserAchievement {
  achievement_key: string;
  unlocked_at: string;
  metadata: Record<string, unknown>;
}

const ACHIEVEMENTS: Achievement[] = [
  {
    key: "first_payment",
    title: "First Step",
    description: "Made your first payment",
    icon: <Sparkles className="h-5 w-5" />,
    color: "text-emerald-600",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    requirement: "Make 1 payment",
  },
  {
    key: "streak_7_days",
    title: "Week Warrior",
    description: "7-day payment streak",
    icon: <Flame className="h-5 w-5" />,
    color: "text-orange-600",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    requirement: "Pay for 7 consecutive days",
  },
  {
    key: "streak_14_days",
    title: "Fortnight Champion",
    description: "14-day payment streak",
    icon: <Star className="h-5 w-5" />,
    color: "text-amber-600",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    requirement: "Pay for 14 consecutive days",
  },
  {
    key: "streak_30_days",
    title: "Monthly Master",
    description: "30-day payment streak",
    icon: <Trophy className="h-5 w-5" />,
    color: "text-purple-600",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    requirement: "Pay for 30 consecutive days",
  },
  {
    key: "streak_60_days",
    title: "Elite Payer",
    description: "60-day payment streak",
    icon: <Crown className="h-5 w-5" />,
    color: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    requirement: "Pay for 60 consecutive days",
  },
  {
    key: "loan_completed",
    title: "Debt Free",
    description: "Fully repaid a loan",
    icon: <Target className="h-5 w-5" />,
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    requirement: "Complete a full loan repayment",
  },
  {
    key: "early_bird",
    title: "Early Bird",
    description: "Paid before 9 AM",
    icon: <Zap className="h-5 w-5" />,
    color: "text-yellow-600",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    requirement: "Make a payment before 9 AM",
  },
  {
    key: "perfect_month",
    title: "Perfect Month",
    description: "No missed payments in a month",
    icon: <Award className="h-5 w-5" />,
    color: "text-pink-600",
    bgColor: "bg-pink-100 dark:bg-pink-900/30",
    requirement: "Make all scheduled payments in a month",
  },
];

interface AchievementBadgesProps {
  userId: string;
}

export function AchievementBadges({ userId }: AchievementBadgesProps) {
  const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [shareAchievement, setShareAchievement] = useState<{ key: string; unlockedAt: string } | null>(null);
  const { profile } = useProfile();

  useEffect(() => {
    const fetchAchievements = async () => {
      // user_achievements table removed - stub
      setUserAchievements([]);
      setLoading(false);
    };

    fetchAchievements();
  }, [userId]);

  const isUnlocked = (key: string) => {
    return userAchievements.some((a) => a.achievement_key === key);
  };

  const getUnlockDate = (key: string) => {
    const achievement = userAchievements.find((a) => a.achievement_key === key);
    return achievement ? format(new Date(achievement.unlocked_at), "MMM d, yyyy") : null;
  };

  const unlockedCount = userAchievements.length;
  const totalCount = ACHIEVEMENTS.length;
  const progressPercent = Math.round((unlockedCount / totalCount) * 100);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Achievements
          </CardTitle>
          <Badge variant="secondary" className="font-medium">
            {unlockedCount}/{totalCount}
          </Badge>
        </div>
        {/* Progress bar */}
        <div className="mt-2">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-amber-400 to-amber-600"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {progressPercent}% complete
          </p>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-4 gap-3">
          <AnimatePresence>
            {ACHIEVEMENTS.map((achievement, index) => {
              const unlocked = isUnlocked(achievement.key);
              const unlockDate = getUnlockDate(achievement.key);

              return (
                <motion.button
                  key={achievement.key}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setSelectedAchievement(achievement)}
                  className={`
                    relative flex flex-col items-center justify-center p-3 rounded-xl
                    transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50
                    ${unlocked 
                      ? `${achievement.bgColor} ${achievement.color} shadow-sm hover:shadow-md` 
                      : "bg-muted/50 text-muted-foreground/40 grayscale"
                    }
                  `}
                >
                  <motion.div
                    animate={unlocked ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ duration: 0.3, repeat: unlocked ? 2 : 0, repeatDelay: 2 }}
                  >
                    {achievement.icon}
                  </motion.div>
                  <span className="text-[10px] font-medium mt-1.5 text-center leading-tight line-clamp-2">
                    {achievement.title}
                  </span>
                  {unlocked && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center"
                    >
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Achievement Detail Modal */}
        <AnimatePresence>
          {selectedAchievement && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
              onClick={() => setSelectedAchievement(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-background rounded-2xl p-6 max-w-sm w-full shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-center">
                  <div className={`
                    inline-flex items-center justify-center w-16 h-16 rounded-full mb-4
                    ${isUnlocked(selectedAchievement.key) 
                      ? `${selectedAchievement.bgColor} ${selectedAchievement.color}` 
                      : "bg-muted text-muted-foreground"
                    }
                  `}>
                    <div className="scale-150">{selectedAchievement.icon}</div>
                  </div>
                  <h3 className="text-xl font-bold mb-1">{selectedAchievement.title}</h3>
                  <p className="text-muted-foreground text-sm mb-3">
                    {selectedAchievement.description}
                  </p>
                  
                  {isUnlocked(selectedAchievement.key) ? (
                    <div className="space-y-3">
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        ✓ Unlocked on {getUnlockDate(selectedAchievement.key)}
                      </Badge>
                      <Button
                        size="sm"
                        className="w-full mt-3"
                        onClick={() => {
                          const achievement = userAchievements.find(
                            (a) => a.achievement_key === selectedAchievement.key
                          );
                          if (achievement) {
                            setShareAchievement({
                              key: achievement.achievement_key,
                              unlockedAt: achievement.unlocked_at,
                            });
                            setSelectedAchievement(null);
                          }
                        }}
                      >
                        <Share2 className="h-4 w-4 mr-2" />
                        Share Achievement
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Badge variant="outline" className="text-muted-foreground">
                        🔒 Locked
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">How to unlock:</span> {selectedAchievement.requirement}
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Shareable Achievement Card */}
        {shareAchievement && (
          <ShareableAchievementCard
            achievementKey={shareAchievement.key}
            unlockedAt={shareAchievement.unlockedAt}
            userName={profile?.full_name || "Welile User"}
            open={!!shareAchievement}
            onOpenChange={(open) => !open && setShareAchievement(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}
