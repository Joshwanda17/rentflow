import {
  Bell,
  TrendingUp,
  Home,
  Banknote,
  Store,
  CreditCard,
  Undo2,
  FileText,
  Users,
  Briefcase,
  Wallet,
  ArrowDownToLine,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  useCfoApprovalNotifications,
  type CfoApprovalNotificationKey,
} from '@/hooks/useCfoApprovalNotifications';

/**
 * Notification bell for the CFO dashboard header. Purely an alert layer over
 * the existing approval queues — clicking an entry jumps to the existing list.
 */
export function CFOApprovalNotificationsBell({
  onJump,
}: {
  onJump: (tabId: string) => void;
}) {
  const { notifications, total, isLoading } = useCfoApprovalNotifications();

  const icons: Record<CfoApprovalNotificationKey, typeof Bell> = {
    roi: TrendingUp,
    rent: Home,
    agentAdvances: Banknote,
    businessAdvances: Briefcase,
    creditDraws: CreditCard,
    allocationReturns: Undo2,
    unfunding: Undo2,
    merchantFloat: Store,
    agentRequisitions: FileText,
    partnerTopups: Wallet,
    directorRequisitions: FileText,
    employeeRequisitions: Users,
    withdrawals: ArrowDownToLine,
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            total > 0 ? `${total} approvals awaiting your review` : 'No pending approvals'
          }
          className="relative p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          style={{ touchAction: 'manipulation' }}
        >
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {total > 99 ? '99+' : total}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Approval Notifications</p>
          <p className="text-xs text-muted-foreground">Items ready for CFO approval</p>
        </div>
        <div className="divide-y divide-border">
          {isLoading && (
            <p className="px-4 py-6 text-sm text-muted-foreground">Checking approvals…</p>
          )}
          {!isLoading && notifications.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No pending approvals right now.
            </p>
          )}
          {notifications.map((n) => {
            const Icon = icons[n.key] ?? Bell;
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => onJump(n.tabId)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors"
              >
                <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{n.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {n.count} {n.count === 1 ? 'item' : 'items'} awaiting approval
                  </span>
                </span>
                <span className="text-xs font-bold text-primary">{n.count}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
