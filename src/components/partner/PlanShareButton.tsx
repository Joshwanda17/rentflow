import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  createPlanShareLink,
  planShareDescription,
  planShareTitle,
  type SharePlanInput,
} from '@/lib/planShareLink';

async function buildLink(plan: SharePlanInput) {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error('Sign in to share this plan');
  return createPlanShareLink(userId, plan.rent_request_id);
}

/**
 * Trackable share action for a fundable rent plan.
 * `variant="icon"` sits on the plan card; `variant="block"` is the detail sheet row.
 */
export function PlanShareButton({
  plan,
  variant = 'icon',
}: {
  plan: SharePlanInput;
  variant?: 'icon' | 'block';
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const url = await buildLink(plan);
      const title = planShareTitle(plan);
      const text = `${title}\n\n${planShareDescription(plan)}`;

      if (navigator.share) {
        try {
          await navigator.share({ title, text, url });
          return;
        } catch (e: any) {
          if (e?.name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      toast.success('Share link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not create the share link');
    } finally {
      setBusy(false);
    }
  };

  if (variant === 'block') {
    return (
      <Button
        variant="outline"
        className="w-full gap-2 rounded-xl"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          void share();
        }}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : copied ? (
          <Check className="h-4 w-4" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
        {copied ? 'Link copied' : 'Share this plan'}
      </Button>
    );
  }

  return (
    <Button
      size="icon"
      variant="outline"
      disabled={busy}
      aria-label="Share this rent plan"
      className="h-10 w-10 shrink-0 rounded-full"
      onClick={(e) => {
        e.stopPropagation();
        void share();
      }}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : copied ? (
        <Check className="h-4 w-4" />
      ) : (
        <Share2 className="h-4 w-4" />
      )}
    </Button>
  );
}
