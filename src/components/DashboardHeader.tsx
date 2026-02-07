import { ReactNode, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Menu, Settings, LogOut, Download, Globe } from 'lucide-react';
import ChatButton from '@/components/chat/ChatButton';
import RoleSwitcher from '@/components/RoleSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationBell } from '@/components/NotificationBell';
import { ShareAppButton } from '@/components/ShareAppButton';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { AppRole } from '@/hooks/useAuth';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import IOSInstallGuide from '@/components/IOSInstallGuide';
import { cn } from '@/lib/utils';

interface MenuItemConfig {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  separator?: boolean;
}

interface DashboardHeaderProps {
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  onSignOut: () => Promise<void>;
  menuItems?: MenuItemConfig[];
  opportunityCount?: number;
  onOpportunityBadgeClick?: () => void;
}

// Memoized for performance - prevents re-renders on parent state changes
const DashboardHeader = memo(function DashboardHeader({
  currentRole,
  availableRoles,
  onRoleChange,
  onSignOut,
  menuItems = [],
  opportunityCount,
  onOpportunityBadgeClick,
}: DashboardHeaderProps) {
  const navigate = useNavigate();
  const { isIOS, isInstalled, isInstallable, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
    } else if (isInstallable) {
      await promptInstall();
    } else {
      navigate('/install');
    }
  };

  // Show install button for iOS users who haven't installed, or Android users who can install
  const showInstallButton = (isIOS && !isInstalled) || (isInstallable && !isInstalled);

  return (
    <>
      <header className="sticky top-0 z-50 bg-gradient-to-r from-primary via-primary to-primary/90 shadow-lg backdrop-blur-sm border-b border-primary/20">
        <div className="px-3 py-2">
          <div className="flex items-center justify-between">
            {/* Left: Logo & Role Switcher - Always visible */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <span 
                  className="text-lg font-bold text-white tracking-tight cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ fontFamily: "'Chewy', cursive" }}
                  onClick={() => navigate('/')}
                >
                  Welile
                </span>
                {/* Opportunity Count Badge - Only for supporters */}
                {opportunityCount !== undefined && opportunityCount > 0 && (
                  <button
                    onClick={onOpportunityBadgeClick}
                    className="absolute -top-1 -right-5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-white text-primary rounded-full px-1 shadow-md animate-pulse hover:scale-110 transition-transform touch-manipulation"
                  >
                    {opportunityCount > 99 ? '99+' : opportunityCount}
                  </button>
                )}
              </div>
              {/* Role Switcher - Inline pills for instant switching */}
              <div className="h-4 w-px bg-white/20 rounded-full ml-2" />
              <RoleSwitcher
                currentRole={currentRole}
                availableRoles={availableRoles}
                onRoleChange={onRoleChange}
              />
            </div>

            {/* Right: Actions - Mobile Optimized with larger touch targets */}
            <div className="flex items-center gap-1">
              {/* Desktop only items */}
              <div className="hidden sm:flex items-center gap-1">
                {showInstallButton && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleInstallClick}
                    className="h-9 px-3 text-white/90 hover:text-white hover:bg-white/10 gap-1.5 text-xs font-medium rounded-xl"
                  >
                    <Download className="h-4 w-4" />
                    <span>Install</span>
                  </Button>
                )}
                <LocaleSwitcher variant="combined" className="text-white border-white/20 hover:bg-white/10" />
                <ShareAppButton />
                <ChatButton />
              </div>
              
              {/* Always visible - with larger touch targets for mobile */}
              <NotificationBell />
              <ThemeToggle />

              {/* Main Menu Button - Extra large for mobile */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-11 w-11 min-w-[44px] min-h-[44px] text-white/90 hover:text-white hover:bg-white/15 rounded-xl touch-manipulation"
                  >
                    <Menu className="h-6 w-6" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="end" 
                  className="w-64 bg-background/98 backdrop-blur-xl border-2 shadow-2xl rounded-2xl p-1"
                >
                  {/* Mobile-only menu items - Role switcher now always visible in header */}
                  
                  {/* Mobile-only menu items */}
                  <div className="sm:hidden">
                    <DropdownMenuSeparator />
                    {showInstallButton && (
                      <DropdownMenuItem
                        onClick={handleInstallClick}
                        className="gap-3 cursor-pointer py-3.5 px-3 rounded-xl text-base font-medium touch-manipulation"
                      >
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Download className="h-5 w-5 text-primary" />
                        </div>
                        Install App
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => navigate('/chat')}
                      className="gap-3 cursor-pointer py-3.5 px-3 rounded-xl text-base font-medium touch-manipulation"
                    >
                      <div className="p-2 rounded-lg bg-success/10">
                        <Globe className="h-5 w-5 text-success" />
                      </div>
                      Messages
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </div>
                  
                  {/* Menu items with larger touch targets */}
                  {menuItems.map((item, index) => (
                    <div key={index}>
                      {item.separator && index > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        onClick={item.onClick}
                        className={cn(
                          "gap-3 cursor-pointer py-3.5 px-3 rounded-xl text-base font-medium touch-manipulation",
                          item.destructive ? 'text-destructive' : ''
                        )}
                      >
                        <div className={cn(
                          "p-2 rounded-lg",
                          item.destructive ? "bg-destructive/10" : "bg-muted"
                        )}>
                          <item.icon className={cn("h-5 w-5", item.destructive && "text-destructive")} />
                        </div>
                        {item.label}
                      </DropdownMenuItem>
                    </div>
                  ))}
                  
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => navigate('/settings')} 
                    className="gap-3 cursor-pointer py-3.5 px-3 rounded-xl text-base font-medium touch-manipulation"
                  >
                    <div className="p-2 rounded-lg bg-muted">
                      <Settings className="h-5 w-5" />
                    </div>
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={onSignOut} 
                    className="gap-3 cursor-pointer py-3.5 px-3 rounded-xl text-base font-medium text-destructive touch-manipulation"
                  >
                    <div className="p-2 rounded-lg bg-destructive/10">
                      <LogOut className="h-5 w-5 text-destructive" />
                    </div>
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* iOS Install Guide Modal */}
      {showIOSGuide && (
        <IOSInstallGuide onClose={() => setShowIOSGuide(false)} />
      )}
    </>
  );
});

export default DashboardHeader;
