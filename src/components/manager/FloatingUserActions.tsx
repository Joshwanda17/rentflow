import { useState } from 'react';

import { 
  MoreHorizontal, 
  X, 
  Bell, 
  MessageCircle, 
  Download, 
  UserCog, 
  UserMinus, 
  UserPlus,
  Filter,
  RefreshCw,
  UsersRound
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap, hapticSuccess } from '@/lib/haptics';

interface FloatingUserActionsProps {
  selectedCount: number;
  totalCount: number;
  onAddUser: () => void;
  onNotify: () => void;
  onWhatsApp: () => void;
  onExport: () => void;
  onAssignRole: () => void;
  onRemoveRole: () => void;
  onFilter: () => void;
  onRefresh: () => void;
  onReachOutInactive: () => void;
  refreshing?: boolean;
}

export function FloatingUserActions({
  selectedCount,
  totalCount,
  onAddUser,
  onNotify,
  onWhatsApp,
  onExport,
  onAssignRole,
  onRemoveRole,
  onFilter,
  onRefresh,
  onReachOutInactive,
  refreshing = false
}: FloatingUserActionsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = () => {
    hapticTap();
    setIsOpen(!isOpen);
  };

  const handleAction = (action: () => void) => {
    hapticSuccess();
    action();
    setIsOpen(false);
  };

  const actions = [
    { icon: UserPlus, label: 'Add User', onClick: onAddUser, color: 'bg-[#00a884] text-white' },
    { icon: Bell, label: 'Notify', onClick: onNotify, color: 'bg-[#f7c831] text-black', showBadge: selectedCount > 0 },
    { icon: MessageCircle, label: 'WhatsApp', onClick: onWhatsApp, color: 'bg-[#25d366] text-white', showBadge: selectedCount > 0 },
    { icon: Download, label: 'Export', onClick: onExport, color: 'bg-[#53bdeb] text-white' },
    { icon: UserCog, label: 'Assign Role', onClick: onAssignRole, color: 'bg-[#8e44ad] text-white', disabled: selectedCount === 0 },
    { icon: UserMinus, label: 'Remove Role', onClick: onRemoveRole, color: 'bg-[#e74c3c] text-white', disabled: selectedCount === 0 },
    { icon: Filter, label: 'Filters', onClick: onFilter, color: 'bg-[#374045] text-white' },
    { icon: UsersRound, label: 'Reach Inactive', onClick: onReachOutInactive, color: 'bg-[#e67e22] text-white' },
  ];

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] animate-fade-in"
        />
      )}

      {/* Floating Button */}
      <button
        onClick={handleToggle}
        className={cn(
          "fixed bottom-20 right-3 z-[60] p-3 rounded-full shadow-xl transition-all active:scale-90 touch-manipulation",
          isOpen 
            ? "bg-[hsl(210,11%,24%)] rotate-45" 
            : "bg-[hsl(160,100%,33%)]"
        )}
      >
        {isOpen ? (
          <X className="h-5 w-5 text-white" />
        ) : (
          <MoreHorizontal className="h-5 w-5 text-white" />
        )}
        {selectedCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-4 px-1 rounded-full bg-[hsl(145,58%,49%)] text-white text-[10px] font-bold flex items-center justify-center">
            {selectedCount}
          </span>
        )}
      </button>

      {/* Refresh Button */}
      <button
        onClick={() => {
          hapticTap();
          onRefresh();
        }}
        disabled={refreshing}
        className="fixed bottom-20 right-16 z-[55] p-2.5 rounded-full bg-[hsl(207,18%,16%)] shadow-lg active:scale-90 transition-transform touch-manipulation"
      >
        <RefreshCw className={cn("h-4 w-4 text-[hsl(210,9%,58%)]", refreshing && "animate-spin")} />
      </button>

      {/* Actions Panel */}
      {isOpen && (
        <div className="fixed bottom-36 left-3 right-3 z-[60] bg-[hsl(207,18%,16%)] rounded-xl shadow-2xl border border-[hsl(207,18%,28%)] overflow-hidden max-w-xs mx-auto animate-scale-in">
          {/* Header */}
          <div className="px-2 py-1.5 bg-[hsl(210,25%,10%)] border-b border-[hsl(207,18%,28%)]">
            <p className="text-xs font-semibold text-center text-white">
              ⚡ Actions
              {selectedCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[hsl(160,100%,33%)] text-white text-[10px]">
                  {selectedCount}
                </span>
              )}
            </p>
          </div>

          {/* Actions Grid */}
          <div className="p-2 grid grid-cols-4 gap-1.5">
            {actions.map((action, index) => (
              <button
                key={action.label}
                onClick={() => !action.disabled && handleAction(action.onClick)}
                disabled={action.disabled}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 p-2 rounded-lg transition-all touch-manipulation min-h-[52px] animate-fade-in",
                  action.disabled 
                    ? "opacity-40 cursor-not-allowed bg-[hsl(210,25%,10%)]" 
                    : "active:scale-95 bg-[hsl(210,25%,10%)]"
                )}
                style={{ animationDelay: `${index * 20}ms` }}
              >
                <div className={cn("p-1.5 rounded-lg", action.color)}>
                  <action.icon className="h-4 w-4" />
                </div>
                <span className="text-[9px] font-medium text-center leading-tight text-[hsl(210,9%,58%)]">
                  {action.label}
                </span>
                {action.showBadge && selectedCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-[hsl(145,58%,49%)] text-white text-[8px] font-bold flex items-center justify-center">
                    {selectedCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
