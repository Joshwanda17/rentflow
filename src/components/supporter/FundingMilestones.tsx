import { motion } from 'framer-motion';
import { Award, Star, Trophy, Crown, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Milestone {
  count: number;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  glowColor: string;
}

const milestones: Milestone[] = [
  { 
    count: 5, 
    label: 'Rising Star', 
    icon: Star, 
    color: 'text-amber-500',
    bgColor: 'bg-gradient-to-br from-amber-500/20 to-amber-600/10',
    glowColor: 'shadow-amber-500/30'
  },
  { 
    count: 10, 
    label: 'Champion', 
    icon: Award, 
    color: 'text-blue-500',
    bgColor: 'bg-gradient-to-br from-blue-500/20 to-blue-600/10',
    glowColor: 'shadow-blue-500/30'
  },
  { 
    count: 25, 
    label: 'Legend', 
    icon: Trophy, 
    color: 'text-purple-500',
    bgColor: 'bg-gradient-to-br from-purple-500/20 to-purple-600/10',
    glowColor: 'shadow-purple-500/30'
  },
  { 
    count: 50, 
    label: 'Elite', 
    icon: Crown, 
    color: 'text-success',
    bgColor: 'bg-gradient-to-br from-success/20 to-success/10',
    glowColor: 'shadow-success/30'
  },
];

interface FundingMilestonesProps {
  fundingCount: number;
  compact?: boolean;
}

export function FundingMilestones({ fundingCount, compact = false }: FundingMilestonesProps) {
  // Find current milestone and next milestone
  const currentMilestone = [...milestones].reverse().find(m => fundingCount >= m.count);
  const nextMilestone = milestones.find(m => fundingCount < m.count);
  const progressToNext = nextMilestone 
    ? Math.min((fundingCount / nextMilestone.count) * 100, 100) 
    : 100;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {milestones.map((milestone, index) => {
          const Icon = milestone.icon;
          const isUnlocked = fundingCount >= milestone.count;
          
          return (
            <motion.div
              key={milestone.count}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: index * 0.1, type: 'spring', stiffness: 400 }}
              className={cn(
                "relative flex items-center justify-center w-8 h-8 rounded-full transition-all",
                isUnlocked 
                  ? `${milestone.bgColor} ${milestone.color} shadow-lg ${milestone.glowColor}` 
                  : "bg-muted/50 text-muted-foreground/40"
              )}
              title={`${milestone.label} (${milestone.count} fundings)`}
            >
              <Icon className="h-4 w-4" />
              {!isUnlocked && (
                <Lock className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-muted-foreground/60" />
              )}
            </motion.div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current Achievement */}
      {currentMilestone && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "flex items-center gap-3 p-3 rounded-xl border",
            currentMilestone.bgColor,
            "border-current/20"
          )}
        >
          <div className={cn(
            "flex items-center justify-center w-12 h-12 rounded-xl shadow-lg",
            currentMilestone.bgColor,
            currentMilestone.color,
            currentMilestone.glowColor
          )}>
            <currentMilestone.icon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className={cn("font-bold text-sm", currentMilestone.color)}>
              {currentMilestone.label}
            </p>
            <p className="text-xs text-muted-foreground">
              {fundingCount} tenants helped
            </p>
          </div>
        </motion.div>
      )}

      {/* Progress to Next */}
      {nextMilestone && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Next: <span className={nextMilestone.color}>{nextMilestone.label}</span>
            </span>
            <span className="font-medium text-foreground">
              {fundingCount}/{nextMilestone.count}
            </span>
          </div>
          <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressToNext}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className={cn(
                "absolute inset-y-0 left-0 rounded-full",
                nextMilestone.bgColor.replace('/20', '').replace('/10', '')
              )}
              style={{
                background: `linear-gradient(90deg, hsl(var(--primary)) 0%, ${
                  nextMilestone.color.includes('amber') ? '#f59e0b' :
                  nextMilestone.color.includes('blue') ? '#3b82f6' :
                  nextMilestone.color.includes('purple') ? '#8b5cf6' :
                  '#10b981'
                } 100%)`
              }}
            />
          </div>
        </div>
      )}

      {/* All Badges */}
      <div className="flex items-center justify-between gap-2 pt-2">
        {milestones.map((milestone, index) => {
          const Icon = milestone.icon;
          const isUnlocked = fundingCount >= milestone.count;
          const isNext = nextMilestone?.count === milestone.count;
          
          return (
            <motion.div
              key={milestone.count}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: index * 0.1, type: 'spring', stiffness: 400 }}
              className="flex flex-col items-center gap-1"
            >
              <div 
                className={cn(
                  "relative flex items-center justify-center w-10 h-10 rounded-xl transition-all",
                  isUnlocked 
                    ? `${milestone.bgColor} ${milestone.color} shadow-lg ${milestone.glowColor}` 
                    : isNext
                      ? "bg-muted/80 text-muted-foreground ring-2 ring-primary/30 ring-offset-1 ring-offset-background"
                      : "bg-muted/50 text-muted-foreground/40"
                )}
              >
                <Icon className={cn("h-5 w-5", isUnlocked && "drop-shadow-sm")} />
                {!isUnlocked && (
                  <Lock className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-muted-foreground/60 bg-background rounded-full" />
                )}
              </div>
              <span className={cn(
                "text-[10px] font-medium",
                isUnlocked ? milestone.color : "text-muted-foreground/60"
              )}>
                {milestone.count}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
