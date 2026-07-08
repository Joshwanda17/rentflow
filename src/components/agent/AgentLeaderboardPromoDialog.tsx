import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap } from '@/lib/haptics';
import { Trophy, UserPlus, UsersRound, Coins, ArrowRight, Sparkles } from 'lucide-react';
import bannerImg from '@/assets/leaderboard-banner.jpg';

/** Same leaderboard multiplier used on the full leaderboard page. */
const PER_INVITE = 10000;

interface MyRank {
  agent_id: string;
  rank: number;
  agent_name: string;
  avatar_url: string | null;
  invite_count: number;
  total_ranked: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Navigate to the full leaderboard page. */
  onViewLeaderboard: () => void;
  /** Open the invite / register sub-agent flow. */
  onInviteSubAgent: () => void;
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export function AgentLeaderboardPromoDialog({
  open,
  onOpenChange,
  onViewLeaderboard,
  onInviteSubAgent,
}: Props) {
  const { user } = useAuth();

  const { data: myRank } = useQuery({
    queryKey: ['my-subagent-rank', 'weekly', user?.id],
    enabled: !!user?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_subagent_rank', {
        p_period: 'weekly',
      });
      if (error) throw error;
      return ((data?.[0] as MyRank) ?? null);
    },
    staleTime: 60_000,
  });

  const rank = myRank?.rank ?? 0;
  const invites = myRank?.invite_count ?? 0;
  const earnings = invites * PER_INVITE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm rounded-3xl border-0 p-0 overflow-hidden gap-0"
        overlayClassName="backdrop-blur-sm bg-background/70"
      >
        {/* Hero banner */}
        <div className="relative">
          <img
            src={bannerImg}
            alt="Agent leaderboard trophy podium"
            className="h-40 w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="flex items-center gap-2 text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md ring-1 ring-white/25">
                <Trophy className="h-5 w-5" style={{ color: '#FACC15' }} strokeWidth={2.3} />
              </span>
              <DialogTitle className="text-lg font-extrabold tracking-tight drop-shadow">
                Agent Leaderboard
              </DialogTitle>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <DialogDescription asChild>
            <p className="text-center text-[15px] font-semibold text-foreground">
              You're currently ranked{' '}
              <span
                className="inline-flex items-center gap-1 font-extrabold"
                style={{ color: '#6D28D9' }}
              >
                <Sparkles className="h-4 w-4" style={{ color: '#FACC15' }} />
                {rank > 0 ? ordinal(rank) : 'unranked'}
              </span>{' '}
              this week.
            </p>
          </DialogDescription>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3.5"
            >
              <div className="flex items-center gap-1.5 text-violet-600">
                <UsersRound className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wide">
                  Successful Invites
                </span>
              </div>
              <p className="mt-1.5 text-2xl font-extrabold text-foreground tabular-nums">
                {invites.toLocaleString()}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3.5"
            >
              <div className="flex items-center gap-1.5 text-amber-600">
                <Coins className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wide">
                  Reg. Earnings
                </span>
              </div>
              <p className="mt-1.5 text-2xl font-extrabold text-foreground tabular-nums">
                {formatUGX(earnings)}
              </p>
            </motion.div>
          </div>

          <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
            Keep inviting sub-agents to climb the leaderboard and grow your
            earnings.
          </p>

          {/* Actions */}
          <div className="space-y-2 pt-1">
            <Button
              onClick={() => {
                hapticTap();
                onOpenChange(false);
                onViewLeaderboard();
              }}
              className="w-full h-12 rounded-2xl text-[15px] font-bold text-white shadow-md active:scale-[0.98] transition-transform"
              style={{ background: 'linear-gradient(135deg, #9334EB, #6D28D9)' }}
            >
              <Trophy className="mr-1.5 h-4.5 w-4.5" style={{ color: '#FACC15' }} />
              View Leaderboard
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                hapticTap();
                onOpenChange(false);
                onInviteSubAgent();
              }}
              className="w-full h-11 rounded-2xl text-[14px] font-semibold text-foreground hover:bg-muted"
            >
              <UserPlus className="mr-1.5 h-4 w-4" style={{ color: '#6D28D9' }} />
              Invite Sub-Agent
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AgentLeaderboardPromoDialog;
