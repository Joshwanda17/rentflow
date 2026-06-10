import { Shield, Clock, XCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useFunderApprovalStatus } from '@/hooks/useFunderApprovalStatus';

/**
 * Renders a status banner explaining why "Support Tenant" / portfolio funding
 * actions are locked for self-registered funders awaiting Partner Ops approval.
 * Renders nothing once the funder is approved.
 */
export function FunderApprovalBanner({ className }: { className?: string }) {
  const { user } = useAuth();
  const { status, rejectionReason, isLoading } = useFunderApprovalStatus(user?.id);

  // Verification is no longer required — all joined users can invest as long
  // as they have funds in their wallet. The approval banner is retired.
  return null;
}

export function FunderApprovedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-success/10 text-success border border-success/30 px-2 py-0.5 text-[10px] font-semibold',
        className
      )}
    >
      <CheckCircle2 className="h-2.5 w-2.5" /> Verified Partner
    </span>
  );
}