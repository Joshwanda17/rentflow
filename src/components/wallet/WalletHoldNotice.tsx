/**
 * WalletHoldNotice — explains a suppressed available balance.
 *
 * When a user's available (withdrawable) balance is zero — or materially
 * reduced — because in-flight withdrawal requests are still holding funds,
 * this notice states the held amount and the reason. Without it, users who
 * were legitimately credited believe their deposit disappeared.
 *
 * Presentation only: it reads the canonical `useWalletBalance` hook and never
 * mutates a balance.
 */
import { Clock, Info } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/hooks/useCurrency';
import { useWalletBalance } from '@/hooks/wallet/useWalletBalance';

interface WalletHoldNoticeProps {
  /** Defaults to the signed-in user. */
  userId?: string;
  /** Compact styling for dark hero cards. */
  variant?: 'hero' | 'card';
  className?: string;
}

export function WalletHoldNotice({ userId, variant = 'card', className = '' }: WalletHoldNoticeProps) {
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const targetId = userId ?? user?.id;
  const { withdrawable, pendingHolds, isLoading } = useWalletBalance(targetId);

  if (isLoading || !targetId) return null;
  if (!pendingHolds || pendingHolds <= 0) return null;

  const fullySuppressed = withdrawable <= 0;

  if (variant === 'hero') {
    return (
      <div
        className={`rounded-xl border border-amber-300/25 bg-amber-500/10 p-3 ${className}`}
        role="status"
      >
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-amber-100">
              Held amount: {formatAmount(pendingHolds)}
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-amber-100/70">
              {fullySuppressed
                ? 'Available balance shows UGX 0 because pending withdrawal requests are awaiting reconciliation. Your money is recorded and has not been lost.'
                : 'Pending withdrawal requests awaiting reconciliation are held back from your available balance.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 ${className}`} role="status">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Available balance: {formatAmount(Math.max(0, withdrawable))}
          </p>
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            Held amount: {formatAmount(pendingHolds)}
          </p>
          <p className="text-xs text-muted-foreground">
            Reason: pending withdrawal requests awaiting reconciliation. Nothing has been lost — the
            held amount is released or paid out once finance reconciles those requests.
          </p>
        </div>
      </div>
    </div>
  );
}

export default WalletHoldNotice;
