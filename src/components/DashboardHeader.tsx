import { useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Menu, Settings, LogOut, Download, Globe, Home, Users, Wallet, Building2, Shield, ChevronDown } from 'lucide-react';

import { hapticTap } from '@/lib/haptics';
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

const roleConfig: Record<AppRole, { label: string; emoji: string; icon: React.ReactNode }> = {
  tenant: { label: 'Tenant', emoji: '🏠', icon: <Home className="h-4 w-4" /> },
  agent: { label: 'Agent', emoji: '👥', icon: <Users className="h-4 w-4" /> },
  supporter: { label: 'Funder', emoji: '💰', icon: <Wallet className="h-4 w-4" /> },
  landlord: { label: 'Owner', emoji: '🏢', icon: <Building2 className="h-4 w-4" /> },
  manager: { label: 'Admin', emoji: '🛡️', icon: <Shield className="h-4 w-4" /> },
};

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
  const [rolePickerOpen, setRolePickerOpen] = useState(false);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
    } else if (isInstallable) {
      await promptInstall();
    } else {
      navigate('/install');
    }
  };

  const handleRoleSwitch = (role: AppRole) => {
    if (role !== currentRole) {
      hapticTap();
      setRolePickerOpen(false);
      if (role === 'manager') {
        navigate('/manager-login');
        return;
      }
      onRoleChange(role);
    } else {
      setRolePickerOpen(false);
    }
  };

  const showInstallButton = (isIOS && !isInstalled) || (isInstallable && !isInstalled);

  return (
    <>
      <header className="sticky top-0 z-50 bg-primary shadow-sm">
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between">
            {/* Left: Logo + tappable role picker */}
            <div className="flex items-center gap-2">
              <span 
                className="text-lg font-bold text-white tracking-tight cursor-pointer"
                style={{ fontFamily: "'Chewy', cursive" }}
                onClick={() => navigate('/')}
              >
                Welile
              </span>

              {/* Tappable role badge — opens role picker */}
              {availableRoles.length >= 1 && (
                <>
                  <div className="h-3.5 w-px bg-white/20" />
                  <Popover open={rolePickerOpen} onOpenChange={setRolePickerOpen}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 transition-all touch-manipulation min-h-[32px]">
                        <span className="text-sm">{roleConfig[currentRole].emoji}</span>
                        <span className="text-xs font-semibold text-white">
                          {roleConfig[currentRole].label}
                        </span>
                        <ChevronDown className="h-3 w-3 text-white/60" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent 
                      align="start" 
                      sideOffset={8}
                      className="w-48 p-1.5 rounded-2xl shadow-2xl border bg-background/98 backdrop-blur-xl"
                    >
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-2 pt-1 pb-1.5">
                        Switch Role
                      </p>
                      {availableRoles.map((role) => {
                        const config = roleConfig[role];
                        const isActive = role === currentRole;
                        return (
                          <button
                            key={role}
                            onClick={() => handleRoleSwitch(role)}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-sm font-medium transition-all touch-manipulation min-h-[44px]",
                              isActive
                                ? "bg-primary/10 text-primary font-semibold"
                                : "text-foreground hover:bg-muted active:scale-[0.98]"
                            )}
                          >
                            <span className="text-base">{config.emoji}</span>
                            <span>{config.label}</span>
                            {isActive && (
                              <span className="ml-auto text-primary text-xs">✓</span>
                            )}
                          </button>
                        );
                      })}
                    </PopoverContent>
                  </Popover>
                </>
              )}

              {/* Opportunity badge for supporters */}
              {opportunityCount !== undefined && opportunityCount > 0 && (
                <button
                  onClick={onOpportunityBadgeClick}
                  className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-white text-primary rounded-full px-1 shadow-sm animate-pulse touch-manipulation"
                >
                  {opportunityCount > 99 ? '99+' : opportunityCount}
                </button>
              )}
            </div>

            {/* Right: Notification + Menu */}
            <div className="flex items-center gap-0.5">
              

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 min-w-[44px] min-h-[44px] text-white/90 hover:text-white hover:bg-white/10 rounded-xl touch-manipulation"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="end" 
                  className="w-56 bg-background/98 backdrop-blur-xl border shadow-2xl rounded-2xl p-1"
                >
                  {showInstallButton && (
                    <DropdownMenuItem
                      onClick={handleInstallClick}
                      className="gap-3 cursor-pointer py-3 px-3 rounded-xl text-sm font-medium touch-manipulation"
                    >
                      <div className="p-1.5 rounded-lg bg-primary/10">
                        <Download className="h-4 w-4 text-primary" />
                      </div>
                      Install App
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => navigate('/chat')}
                    className="gap-3 cursor-pointer py-3 px-3 rounded-xl text-sm font-medium touch-manipulation"
                  >
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <Globe className="h-4 w-4 text-primary" />
                    </div>
                    Messages
                  </DropdownMenuItem>

                  {menuItems.length > 0 && <DropdownMenuSeparator />}
                  
                  {menuItems.map((item, index) => (
                    <div key={index}>
                      {item.separator && index > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        onClick={item.onClick}
                        className={cn(
                          "gap-3 cursor-pointer py-3 px-3 rounded-xl text-sm font-medium touch-manipulation",
                          item.destructive ? 'text-destructive' : ''
                        )}
                      >
                        <div className={cn(
                          "p-1.5 rounded-lg",
                          item.destructive ? "bg-destructive/10" : "bg-muted"
                        )}>
                          <item.icon className={cn("h-4 w-4", item.destructive && "text-destructive")} />
                        </div>
                        {item.label}
                      </DropdownMenuItem>
                    </div>
                  ))}
                  
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => navigate('/settings')} 
                    className="gap-3 cursor-pointer py-3 px-3 rounded-xl text-sm font-medium touch-manipulation"
                  >
                    <div className="p-1.5 rounded-lg bg-muted">
                      <Settings className="h-4 w-4" />
                    </div>
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={onSignOut} 
                    className="gap-3 cursor-pointer py-3 px-3 rounded-xl text-sm font-medium text-destructive touch-manipulation"
                  >
                    <div className="p-1.5 rounded-lg bg-destructive/10">
                      <LogOut className="h-4 w-4 text-destructive" />
                    </div>
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {showIOSGuide && (
        <IOSInstallGuide onClose={() => setShowIOSGuide(false)} />
      )}
    </>
  );
});

export default DashboardHeader;
