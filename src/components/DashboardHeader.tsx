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
import { Menu, Settings, LogOut, Download, Globe, ChevronDown } from 'lucide-react';
import RoleSwitcher from '@/components/RoleSwitcher';
import { NotificationBell } from '@/components/NotificationBell';
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

const roleLabels: Record<AppRole, string> = {
  tenant: 'Tenant',
  agent: 'Agent',
  supporter: 'Funder',
  landlord: 'Owner',
  manager: 'Admin',
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

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
    } else if (isInstallable) {
      await promptInstall();
    } else {
      navigate('/install');
    }
  };

  const showInstallButton = (isIOS && !isInstalled) || (isInstallable && !isInstalled);

  return (
    <>
      <header className="sticky top-0 z-50 bg-primary shadow-sm">
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between">
            {/* Left: Logo + current role */}
            <div className="flex items-center gap-2">
              <span 
                className="text-lg font-bold text-white tracking-tight cursor-pointer"
                style={{ fontFamily: "'Chewy', cursive" }}
                onClick={() => navigate('/')}
              >
                Welile
              </span>

              {/* Current role badge — compact indicator */}
              {availableRoles.length > 1 && (
                <>
                  <div className="h-3.5 w-px bg-white/20" />
                  <span className="text-xs font-medium text-white/70">
                    {roleLabels[currentRole]}
                  </span>
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

            {/* Right: Notification + Menu only */}
            <div className="flex items-center gap-0.5">
              <NotificationBell />

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
                  className="w-64 bg-background/98 backdrop-blur-xl border shadow-2xl rounded-2xl p-1"
                >
                  {/* Role Switcher inside menu */}
                  {availableRoles.length > 1 && (
                    <>
                      <div className="px-2 py-2">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">Switch Role</p>
                        <RoleSwitcher
                          currentRole={currentRole}
                          availableRoles={availableRoles}
                          onRoleChange={onRoleChange}
                          variant="prominent"
                        />
                      </div>
                      <DropdownMenuSeparator />
                    </>
                  )}

                  {/* Install & Messages — mobile */}
                  <div className="sm:hidden">
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
                      <div className="p-1.5 rounded-lg bg-success/10">
                        <Globe className="h-4 w-4 text-success" />
                      </div>
                      Messages
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </div>

                  {/* Desktop-only items */}
                  <div className="hidden sm:block">
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
                      <div className="p-1.5 rounded-lg bg-success/10">
                        <Globe className="h-4 w-4 text-success" />
                      </div>
                      Messages
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </div>
                  
                  {/* Custom menu items */}
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