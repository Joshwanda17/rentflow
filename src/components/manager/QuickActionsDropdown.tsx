import { useState } from 'react';
import { 
  Zap,
  Bell, 
  MessageCircle, 
  Download, 
  UserCog, 
  UserMinus, 
  UserPlus,
  UsersRound,
  ChevronDown
} from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { hapticTap } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface QuickActionsDropdownProps {
  selectedCount: number;
  onAddUser: () => void;
  onNotify: () => void;
  onWhatsApp: () => void;
  onExport: () => void;
  onAssignRole: () => void;
  onRemoveRole: () => void;
  onReachOutInactive: () => void;
}

export function QuickActionsDropdown({
  selectedCount,
  onAddUser,
  onNotify,
  onWhatsApp,
  onExport,
  onAssignRole,
  onRemoveRole,
  onReachOutInactive,
}: QuickActionsDropdownProps) {
  const [open, setOpen] = useState(false);

  const handleAction = (action: () => void) => {
    hapticTap();
    action();
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button 
          onClick={() => hapticTap()}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all touch-manipulation",
            "bg-[#00a884] text-white hover:bg-[#00a884]/90 active:scale-95 shadow-sm"
          )}
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Zap className="h-3.5 w-3.5" />
          <span>Quick Actions</span>
          {selectedCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
              {selectedCount}
            </span>
          )}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-44 bg-[#233138] border-[#3b4a54] text-white"
      >
        <DropdownMenuItem 
          onClick={() => handleAction(onAddUser)}
          className="hover:bg-[#182229] focus:bg-[#182229] gap-2"
        >
          <UserPlus className="h-4 w-4 text-[#00a884]" />
          Add User
        </DropdownMenuItem>
        
        <DropdownMenuSeparator className="bg-[#3b4a54]" />
        
        <DropdownMenuItem 
          onClick={() => handleAction(onNotify)}
          className="hover:bg-[#182229] focus:bg-[#182229] gap-2"
        >
          <Bell className="h-4 w-4 text-[#f7c831]" />
          Notify {selectedCount > 0 && `(${selectedCount})`}
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={() => handleAction(onWhatsApp)}
          className="hover:bg-[#182229] focus:bg-[#182229] gap-2"
        >
          <MessageCircle className="h-4 w-4 text-[#25d366]" />
          WhatsApp {selectedCount > 0 && `(${selectedCount})`}
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={() => handleAction(onExport)}
          className="hover:bg-[#182229] focus:bg-[#182229] gap-2"
        >
          <Download className="h-4 w-4 text-[#53bdeb]" />
          Export
        </DropdownMenuItem>
        
        <DropdownMenuSeparator className="bg-[#3b4a54]" />
        
        <DropdownMenuItem 
          onClick={() => handleAction(onAssignRole)}
          disabled={selectedCount === 0}
          className="hover:bg-[#182229] focus:bg-[#182229] gap-2 disabled:opacity-40"
        >
          <UserCog className="h-4 w-4 text-[#8e44ad]" />
          Assign Role
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={() => handleAction(onRemoveRole)}
          disabled={selectedCount === 0}
          className="hover:bg-[#182229] focus:bg-[#182229] gap-2 disabled:opacity-40"
        >
          <UserMinus className="h-4 w-4 text-[#e74c3c]" />
          Remove Role
        </DropdownMenuItem>
        
        <DropdownMenuSeparator className="bg-[#3b4a54]" />
        
        <DropdownMenuItem 
          onClick={() => handleAction(onReachOutInactive)}
          className="hover:bg-[#182229] focus:bg-[#182229] gap-2"
        >
          <UsersRound className="h-4 w-4 text-[#e67e22]" />
          Reach Inactive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
