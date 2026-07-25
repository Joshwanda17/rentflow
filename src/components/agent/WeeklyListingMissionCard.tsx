import { useMemo } from 'react';
import { Trophy, Users, Home, UserCheck, Clock, ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap } from '@/lib/haptics';
import { useAgentListingCampaign } from '@/hooks/useAgentListingCampaign';
import { Skeleton } from '@/components/ui/skeleton';

interface WeeklyListingMissionCardProps {
  agentId: string;
  onInvite: () => void;
  onViewTeam: () => void;
  onHelpList: () => void;
  onViewEarnings: () => void;
  onViewLeaderboard: () => void;
}

type ProgressTone = 'primary' | 'success' | 'warning';

function ProgressRow({
  icon: Icon,
  label,
  value,
  target,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  target: number;
  tone: ProgressTone;
}) {
  const pct = Math.min(100, target > 0 ? (value / target) * 100 : 0);
  const barColor =
    tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-primary';
  const iconColor =
    tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-primary';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
          <Icon className={cn('h-3.5 w-3.5', iconColor)} />
          {label}
        </span>
        <span className="text-[13px] font-bold tabular-nums text-foreground">
          {value} <span className="text-muted-foreground font-normal">of {target}</span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function WeeklyListingMissionCard({
  agentId,
  onInvite,
  onViewTeam,
  onHelpList,
  onViewEarnings,
  onViewLeaderboard,
}: WeeklyListingMissionCardProps) {
  const { campaign, isLoading } = useAgentListingCampaign(agentId);

  const { message, buttonLabel, buttonAction, complete } = useMemo(() => {
    if (!campaign) {
      return { message: '', buttonLabel: 'Invite Agents', buttonAction: onInvite, complete: false };
    }
    const invitedLeft = campaign.invited_target - campaign.invited_count;
    const activatedLeft = campaign.activated_target - campaign.activated_count;
    const done = campaign.bonus_eligible || campaign.bonus_earned > 0;

    let msg: string;
    let label: string;
    let action: () => void;

    if (done) {
      msg = 'Mission completed! You built a 20-agent listing team and unlocked the UGX 40,000 bonus.';
      label = 'View Earnings';
      action = onViewEarnings;
    } else if (campaign.invited_count === 0 && campaign.verified_houses_count === 0) {
      msg = 'Invite your first sub-agent and start earning.';
      label = 'Invite Agents';
      action = onInvite;
    } else if (invitedLeft > 0) {
      msg = `Invite ${invitedLeft} more ${invitedLeft === 1 ? 'person' : 'people'} to complete your 20-agent team.`;
      label = 'Invite Agents';
      action = onInvite;
    } else if (activatedLeft > 2) {
      msg = `Help ${activatedLeft} more agents list 3 verified houses each.`;
      label = 'Help Agents List Houses';
      action = onHelpList;
    } else if (activatedLeft > 0) {
      msg = `Only ${activatedLeft} active ${activatedLeft === 1 ? 'agent' : 'agents'} remain between you and the UGX 40,000 campaign bonus.`;
      label = 'Help Agents List Houses';
      action = onHelpList;
    } else {
      msg = 'Almost there — keep your team listing verified houses to unlock the bonus.';
      label = 'View My Team';
      action = onViewTeam;
    }
    return { message: msg, buttonLabel: label, buttonAction: action, complete: done };
  }, [campaign, onInvite, onViewTeam, onHelpList, onViewEarnings]);

  if (isLoading) {
    return <Skeleton className="w-full h-[320px] rounded-3xl" />;
  }
  if (!campaign) return null;

  const housePct = Math.min(
    100,
    campaign.verified_houses_target > 0
      ? (campaign.verified_houses_count / campaign.verified_houses_target) * 100
      : 0,
  );

  return (
    <div
      className={cn(
        'w-full rounded-3xl border p-5 relative overflow-hidden shadow-sm',
        complete
          ? 'border-success/40 bg-gradient-to-br from-success/10 via-card to-card'
          : 'border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              'h-10 w-10 rounded-2xl flex items-center justify-center shrink-0',
              complete ? 'bg-success/15' : 'bg-primary/15',
            )}
          >
            <Trophy className={cn('h-5 w-5', complete ? 'text-success' : 'text-primary')} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[16px] leading-tight text-foreground truncate">
              Weekly Listing Mission
            </p>
            <p className="text-[12px] text-muted-foreground leading-tight truncate">
              Build your 20-agent house-listing team
            </p>
          </div>
        </div>
        <div
          className={cn(
            'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shrink-0',
            campaign.days_remaining <= 1
              ? 'bg-destructive/10 text-destructive'
              : 'bg-warning/10 text-warning',
          )}
        >
          <Clock className="h-3 w-3" />
          {campaign.days_remaining}d left
        </div>
      </div>

      {/* Earnings block */}
      <div className="rounded-2xl bg-background/60 border border-border/50 p-4 mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Earned so far
        </p>
        <p className="text-3xl font-bold tracking-tight tabular-nums text-success mt-0.5">
          {formatUGX(campaign.total_earned)}
        </p>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total potential
            </p>
            <p className="text-sm font-bold tabular-nums text-foreground">
              {formatUGX(campaign.total_potential)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Still available
            </p>
            <p className="text-sm font-bold tabular-nums text-primary">
              {formatUGX(campaign.still_available)}
            </p>
          </div>
        </div>
      </div>

      {/* Big progress bar (verified houses) */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] font-semibold text-foreground">Verified houses</span>
          <span className="text-[12px] font-bold tabular-nums text-foreground">
            {campaign.verified_houses_count} / {campaign.verified_houses_target}
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              complete ? 'bg-success' : 'bg-primary',
            )}
            style={{ width: `${housePct}%` }}
          />
        </div>
      </div>

      {/* Progress rows */}
      <div className="space-y-3 mb-4">
        <ProgressRow
          icon={Users}
          label="Agents invited"
          value={campaign.invited_count}
          target={campaign.invited_target}
          tone={campaign.invited_count >= campaign.invited_target ? 'success' : 'primary'}
        />
        <ProgressRow
          icon={UserCheck}
          label="Activated sub-agents"
          value={campaign.activated_count}
          target={campaign.activated_target}
          tone={campaign.activated_count >= campaign.activated_target ? 'success' : 'warning'}
        />
      </div>

      {/* Motivational message */}
      <div
        className={cn(
          'flex items-start gap-2 rounded-2xl p-3 mb-4 text-[13px] font-medium leading-snug',
          complete ? 'bg-success/10 text-success' : 'bg-primary/5 text-foreground',
        )}
      >
        <Sparkles className={cn('h-4 w-4 shrink-0 mt-0.5', complete ? 'text-success' : 'text-primary')} />
        <span>{message}</span>
      </div>

      {/* CTA row: primary action + leaderboard */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            hapticTap();
            buttonAction();
          }}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 rounded-2xl py-3.5 font-bold text-sm text-primary-foreground active:scale-[0.98] transition-transform touch-manipulation min-h-[52px]',
            complete ? 'bg-success' : 'bg-primary',
          )}
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {buttonLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            hapticTap();
            onViewLeaderboard();
          }}
          aria-label="View leaderboard"
          className="flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3.5 font-bold text-sm text-primary bg-primary/10 border border-primary/25 active:scale-[0.98] transition-transform touch-manipulation min-h-[52px]"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Trophy className="h-4 w-4" style={{ color: '#FACC15' }} />
          <span className="hidden sm:inline">Ranks</span>
        </button>
      </div>
    </div>
  );
}

export default WeeklyListingMissionCard;
