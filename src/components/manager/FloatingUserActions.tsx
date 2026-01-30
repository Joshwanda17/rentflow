import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55]"
          />
        )}
      </AnimatePresence>

      {/* Floating Button - WhatsApp Style */}
      <motion.button
        onClick={handleToggle}
        className={cn(
          "fixed bottom-24 right-4 z-[60] p-4 rounded-full shadow-xl transition-colors touch-manipulation",
          isOpen 
            ? "bg-[#374045]" 
            : "bg-[#00a884]"
        )}
        whileTap={{ scale: 0.9 }}
        animate={{ rotate: isOpen ? 45 : 0 }}
      >
        {isOpen ? (
          <X className="h-6 w-6 text-white" />
        ) : (
          <MoreHorizontal className="h-6 w-6 text-white" />
        )}
        {selectedCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-[#25d366] text-white text-xs font-bold flex items-center justify-center">
            {selectedCount}
          </span>
        )}
      </motion.button>

      {/* Refresh Button */}
      <motion.button
        onClick={() => {
          hapticTap();
          onRefresh();
        }}
        disabled={refreshing}
        className="fixed bottom-24 right-20 z-[55] p-3 rounded-full bg-[#202c33] shadow-lg touch-manipulation"
        whileTap={{ scale: 0.9 }}
      >
        <RefreshCw className={cn("h-5 w-5 text-[#8696a0]", refreshing && "animate-spin")} />
      </motion.button>

      {/* Actions Panel - WhatsApp Style */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-40 left-4 right-4 z-[60] bg-[#202c33] rounded-2xl shadow-2xl border border-[#3b4a54] overflow-hidden max-w-sm mx-auto"
          >
            {/* Header */}
            <div className="p-3 bg-[#182229] border-b border-[#3b4a54]">
              <p className="text-sm font-semibold text-center text-white">
                ⚡ Quick Actions
                {selectedCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-[#00a884] text-white text-xs">
                    {selectedCount} selected
                  </span>
                )}
              </p>
            </div>

            {/* Actions Grid */}
            <div className="p-3 grid grid-cols-4 gap-2">
              {actions.map((action, index) => (
                <motion.button
                  key={action.label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => !action.disabled && handleAction(action.onClick)}
                  disabled={action.disabled}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-all touch-manipulation min-h-[70px]",
                    action.disabled 
                      ? "opacity-40 cursor-not-allowed bg-[#182229]" 
                      : "active:scale-95 bg-[#182229]"
                  )}
                >
                  <div className={cn("p-2 rounded-xl", action.color)}>
                    <action.icon className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-medium text-center leading-tight text-[#8696a0]">
                    {action.label}
                  </span>
                  {action.showBadge && selectedCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#25d366] text-white text-[10px] font-bold flex items-center justify-center">
                      {selectedCount}
                    </span>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
