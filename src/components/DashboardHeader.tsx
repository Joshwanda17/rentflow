import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Menu, Settings, LogOut, Download } from 'lucide-react';
import ChatButton from '@/components/chat/ChatButton';
import RoleSwitcher from '@/components/RoleSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationBell } from '@/components/NotificationBell';
import { ShareAppButton } from '@/components/ShareAppButton';
import { AppRole } from '@/hooks/useAuth';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import IOSInstallGuide from '@/components/IOSInstallGuide';

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
}

export default function DashboardHeader({
  currentRole,
  availableRoles,
  onRoleChange,
  onSignOut,
  menuItems = [],
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
      <header className="sticky top-0 z-50 bg-gradient-to-r from-primary via-primary to-primary/95 shadow-md">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Left: Logo & Role */}
            <div className="flex items-center gap-3">
              <span 
                className="text-xl font-bold text-white tracking-tight cursor-pointer hover:opacity-90 transition-opacity"
                style={{ fontFamily: "'Chewy', cursive" }}
                onClick={() => navigate('/')}
              >
                Welile
              </span>
              <div className="h-5 w-px bg-white/20" />
              <RoleSwitcher
                currentRole={currentRole}
                availableRoles={availableRoles}
                onRoleChange={onRoleChange}
              />
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-0.5">
              {showInstallButton && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleInstallClick}
                  className="h-8 px-2.5 text-white/90 hover:text-white hover:bg-white/10 gap-1.5 text-xs font-medium"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Install</span>
                </Button>
              )}
              <ShareAppButton />
              <ChatButton />
              <NotificationBell />
              <ThemeToggle />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 text-white/90 hover:text-white hover:bg-white/10"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="end" 
                  className="w-56 bg-background/95 backdrop-blur-lg border shadow-xl"
                >
                  {menuItems.map((item, index) => (
                    <div key={index}>
                      {item.separator && index > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        onClick={item.onClick}
                        className={`gap-3 cursor-pointer ${item.destructive ? 'text-destructive' : ''}`}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </DropdownMenuItem>
                    </div>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => navigate('/settings')} 
                    className="gap-3 cursor-pointer"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={onSignOut} 
                    className="gap-3 cursor-pointer text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
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
}
