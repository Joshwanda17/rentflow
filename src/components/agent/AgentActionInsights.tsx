import { useState } from 'react';
import { AlertTriangle, Target, Share2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EarningsForecastCard } from './EarningsForecastCard';
import { CollectionStreakCard } from './CollectionStreakCard';
import { PriorityCollectionQueue } from './PriorityCollectionQueue';
import { DailyRentExpectedCard } from './DailyRentExpectedCard';
import { toast } from 'sonner';

interface Props {
  agentId: string;
  hideDailyRent?: boolean;
}

export function AgentActionInsights({ agentId, hideDailyRent }: Props) {
  const [queueOpen, setQueueOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const funderLink = `${window.location.origin}/auth?ref=${agentId}&role=funder`;

  const handleShareFunderLink = async () => {
    const shareText = `Join Welile as a funder and start earning! Sign up here: ${funderLink}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Become a Welile Funder', text: shareText, url: funderLink });
      } catch {}
    } else {
      await navigator.clipboard.writeText(funderLink);
      setCopied(true);
      toast.success('Funder signup link copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <div className="space-y-3">
        {/* Invite Funder — Purple CTA */}
        <button
          onClick={handleShareFunderLink}
          className="w-full flex items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/10 hover:bg-primary/15 p-3.5 transition-all active:scale-[0.98] touch-manipulation ring-1 ring-primary/20"
        >
          <div className="p-2.5 rounded-lg bg-primary/20 shrink-0">
            <Share2 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-primary">Invite Funder</p>
            <p className="text-[10px] text-muted-foreground">Share link for funders to sign up themselves</p>
          </div>
          {copied ? (
            <Check className="h-5 w-5 text-success" />
          ) : (
            <Copy className="h-4 w-4 text-primary/60" />
          )}
        </button>

        {/* Daily Rent Expected */}
        {!hideDailyRent && <DailyRentExpectedCard userId={agentId} />}

        {/* Earnings Forecast */}
        <EarningsForecastCard agentId={agentId} />

        {/* Collection Streak */}
        <CollectionStreakCard agentId={agentId} />

        {/* Priority Collection Queue Trigger */}
        <button
          onClick={() => setQueueOpen(true)}
          className="w-full flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 p-3 transition-all active:scale-[0.98] touch-manipulation"
        >
          <div className="p-2 rounded-lg bg-destructive/10 shrink-0">
            <Target className="h-4 w-4 text-destructive" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold">Priority Collections</p>
            <p className="text-[10px] text-muted-foreground">Tap to see who needs collection first</p>
          </div>
          <AlertTriangle className="h-4 w-4 text-destructive/60" />
        </button>
      </div>

      <PriorityCollectionQueue open={queueOpen} onOpenChange={setQueueOpen} agentId={agentId} />
    </>
  );
}
