import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { useToast } from '@/hooks/use-toast';
import { useAgentListingCampaign } from '@/hooks/useAgentListingCampaign';
import { hapticTap } from '@/lib/haptics';
import { Trophy, Copy, Check, ArrowRight, Clock, UsersRound } from 'lucide-react';
import bannerImg from '@/assets/leaderboard-banner.jpg';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Navigate to the full leaderboard page. */
  onViewLeaderboard: () => void;
  /** Open the invite / register sub-agent flow (fallback). */
  onInviteSubAgent: () => void;
}

export function AgentLeaderboardPromoDialog({
  open,
  onOpenChange,
  onViewLeaderboard,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { campaign } = useAgentListingCampaign(user?.id);
  const [copied, setCopied] = useState(false);

  const inviteLink = useMemo(() => {
    if (!user?.id) return '';
    const params = new URLSearchParams({ signup: '1', role: 'agent', ref: user.id });
    return `${getPublicOrigin()}/auth?${params.toString()}`;
  }, [user?.id]);

  const daysRemaining = campaign?.days_remaining ?? 0;
  const invitedCount = campaign?.invited_count ?? 0;
  const invitedTarget = campaign?.invited_target ?? 20;
  const invitedRemaining = Math.max(0, invitedTarget - invitedCount);
  const daysLabel = daysRemaining === 1 ? '1 day left' : `${daysRemaining} days left`;

  const handleCopy = async () => {
    if (!inviteLink) return;
    hapticTap();
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Invite link copied!' });
    } catch {
      toast({
        title: 'Could not copy',
        description: 'Long-press the link to copy manually.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid-cols-1 w-[calc(100%-1.5rem)] max-w-[24rem] rounded-3xl border-0 p-0 overflow-hidden gap-0"
        overlayClassName="backdrop-blur-sm bg-background/70"
      >
        {/* Hero banner */}
        <div className="relative">
          <img
            src={bannerImg}
            alt="Agent leaderboard trophy podium"
            className="h-36 sm:h-40 w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="flex items-center gap-2 text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md ring-1 ring-white/25">
                <Trophy className="h-5 w-5" style={{ color: '#FACC15' }} strokeWidth={2.3} />
              </span>
              <DialogTitle className="text-lg font-extrabold tracking-tight drop-shadow">
                Weekly Listing Mission
              </DialogTitle>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <DialogDescription asChild>
            <p className="text-[14.5px] leading-relaxed text-foreground text-center">
              It's only{' '}
              <span className="inline-flex items-center gap-1 font-extrabold" style={{ color: '#6D28D9' }}>
                <Clock className="h-3.5 w-3.5" />
                {daysLabel}
              </span>{' '}
              for the Weekly Listing Mission to end — earn{' '}
              <b className="text-foreground">UGX 250,000</b> from your sub-agents.
              Invited so far{' '}
              <b className="text-foreground">{invitedCount.toLocaleString()}</b>
              , remaining{' '}
              <b style={{ color: '#9334EB' }}>{invitedRemaining.toLocaleString()}</b>.
            </p>
          </DialogDescription>

          {/* Progress bar */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="space-y-1.5"
          >
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <UsersRound className="h-3.5 w-3.5" style={{ color: '#6D28D9' }} />
                Invites
              </span>
              <span className="tabular-nums text-foreground">
                {invitedCount}/{invitedTarget}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-violet-500/10">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (invitedCount / Math.max(1, invitedTarget)) * 100)}%`,
                  background: 'linear-gradient(90deg, #9334EB, #6D28D9)',
                }}
              />
            </div>
          </motion.div>

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
              variant="outline"
              onClick={handleCopy}
              disabled={!inviteLink}
              className="w-full h-11 rounded-2xl text-[14px] font-semibold border-violet-500/30 hover:bg-violet-500/5"
            >
              {copied ? (
                <Check className="mr-1.5 h-4 w-4" style={{ color: '#16A34A' }} />
              ) : (
                <Copy className="mr-1.5 h-4 w-4" style={{ color: '#6D28D9' }} />
              )}
              {copied ? 'Copied!' : 'Copy Sub-Agent Referral Link'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AgentLeaderboardPromoDialog;
