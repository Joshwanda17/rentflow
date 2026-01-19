import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Home, Users, Wallet, Building2, Shield, RefreshCw } from 'lucide-react';

type AppRole = 'tenant' | 'agent' | 'landlord' | 'supporter' | 'manager';

interface RoleSwitcherProps {
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  variant?: 'header' | 'prominent';
}

const roleConfig: Record<AppRole, { label: string; icon: React.ReactNode; color: string; emoji: string }> = {
  tenant: { 
    label: 'Tenant', 
    icon: <Home className="h-4 w-4" />,
    color: 'bg-primary/20 text-primary',
    emoji: '🏠'
  },
  agent: { 
    label: 'Agent', 
    icon: <Users className="h-4 w-4" />,
    color: 'bg-warning/20 text-warning',
    emoji: '👥'
  },
  supporter: { 
    label: 'Supporter', 
    icon: <Wallet className="h-4 w-4" />,
    color: 'bg-success/20 text-success',
    emoji: '💰'
  },
  landlord: { 
    label: 'Landlord', 
    icon: <Building2 className="h-4 w-4" />,
    color: 'bg-accent/20 text-accent',
    emoji: '🏢'
  },
  manager: { 
    label: 'Manager', 
    icon: <Shield className="h-4 w-4" />,
    color: 'bg-destructive/20 text-destructive',
    emoji: '🛡️'
  },
};

export default function RoleSwitcher({ currentRole, availableRoles, onRoleChange, variant = 'header' }: RoleSwitcherProps) {
  const [open, setOpen] = useState(false);
  
  const currentConfig = roleConfig[currentRole];

  // Prominent variant - Large, eye-catching button for dashboard body
  if (variant === 'prominent') {
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="lg" 
            className="w-full h-14 gap-3 border-2 border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 shadow-lg rounded-xl touch-manipulation"
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-xl">
                {currentConfig.emoji}
              </div>
              <div className="text-left">
                <p className="text-xs text-muted-foreground font-medium">Current Role</p>
                <p className="font-bold text-foreground">{currentConfig.label}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-primary">
              <RefreshCw className="h-5 w-5" />
              <span className="text-sm font-semibold">Switch</span>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-72 p-2">
          <DropdownMenuLabel className="text-center text-base font-bold py-2">
            🔄 Switch Your Role
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {availableRoles.map((role) => {
            const config = roleConfig[role];
            const isActive = role === currentRole;
            return (
              <DropdownMenuItem
                key={role}
                onClick={() => {
                  onRoleChange(role);
                  setOpen(false);
                }}
                className={`gap-3 py-4 px-3 rounded-xl my-1 cursor-pointer touch-manipulation ${isActive ? 'bg-primary/15 border-2 border-primary/30' : 'hover:bg-muted'}`}
              >
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-xl">
                  {config.emoji}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-base">{config.label}</p>
                  <p className="text-xs text-muted-foreground">Tap to switch</p>
                </div>
                {isActive && (
                  <Badge className="bg-primary text-primary-foreground">Active</Badge>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Header variant - Compact but visible
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="gap-2 text-white hover:bg-white/10 border border-white/30 bg-white/10 h-10 px-3 rounded-xl touch-manipulation min-w-[44px]"
        >
          <span className="text-lg">{currentConfig.emoji}</span>
          <span className="text-sm font-semibold hidden xs:inline">{currentConfig.label}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2">
        <DropdownMenuLabel className="text-center font-bold">
          🔄 Switch Role
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableRoles.map((role) => {
          const config = roleConfig[role];
          const isActive = role === currentRole;
          return (
            <DropdownMenuItem
              key={role}
              onClick={() => {
                onRoleChange(role);
                setOpen(false);
              }}
              className={`gap-3 py-3 px-3 rounded-xl my-0.5 cursor-pointer touch-manipulation ${isActive ? 'bg-primary/10 border border-primary/20' : ''}`}
            >
              <span className="text-xl">{config.emoji}</span>
              <span className="font-semibold flex-1">{config.label}</span>
              {isActive && <Badge variant="outline" className="text-xs">Active</Badge>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
