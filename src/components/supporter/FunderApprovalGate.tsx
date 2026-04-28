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

  if (isLoading || status === 'approved') return null;

  if (status === 'rejected') {
    return (
      <div
        className={cn(
          'rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2.5',
          className
        )}
      >
        <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div className="text-xs">
          <p className="font-bold text-destructive">Account verification rejected</p>
          <p className="text-muted-foreground mt-0.5">
            {rejectionReason || 'Your funder account was not approved. Please contact Partner Ops for next steps.'}
          </p>
        </div>
      </div>
    );
  }

  // pending / none
  return (
    <div
      className={cn(
        'rounded-xl border border-warning/30 bg-warning/5 p-3 flex items-start gap-2.5',
        className
      )}
    >
      <Shield className="h-4 w-4 text-warning shrink-0 mt-0.5" />
      <div className="text-xs">
        <p className="font-bold text-warning flex items-center gap-1">
          <Clock className="h-3 w-3" /> Awaiting verification
        </p>
        <p className="text-muted-foreground mt-0.5 leading-relaxed">
          Your account is being reviewed by Partner Ops. You'll be able to support tenants
          and create portfolios as soon as you're approved — usually within 24 hours.
        </p>
      </div>
    </div>
  );
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