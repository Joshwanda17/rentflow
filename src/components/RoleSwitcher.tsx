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
import { ChevronDown, Home, Users, Wallet, Building2, Shield } from 'lucide-react';

type AppRole = 'tenant' | 'agent' | 'landlord' | 'supporter' | 'manager';

interface RoleSwitcherProps {
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
}

const roleConfig: Record<AppRole, { label: string; icon: React.ReactNode; color: string }> = {
  tenant: { 
    label: 'Tenant', 
    icon: <Home className="h-4 w-4" />,
    color: 'bg-primary/20 text-primary'
  },
  agent: { 
    label: 'Agent', 
    icon: <Users className="h-4 w-4" />,
    color: 'bg-warning/20 text-warning'
  },
  supporter: { 
    label: 'Supporter', 
    icon: <Wallet className="h-4 w-4" />,
    color: 'bg-success/20 text-success'
  },
  landlord: { 
    label: 'Landlord', 
    icon: <Building2 className="h-4 w-4" />,
    color: 'bg-accent/20 text-accent'
  },
  manager: { 
    label: 'Manager', 
    icon: <Shield className="h-4 w-4" />,
    color: 'bg-destructive/20 text-destructive'
  },
};

export default function RoleSwitcher({ currentRole, availableRoles, onRoleChange }: RoleSwitcherProps) {
  const [open, setOpen] = useState(false);
  
  const currentConfig = roleConfig[currentRole];

  if (availableRoles.length <= 1) {
    return (
      <Badge className={currentConfig.color}>
        {currentConfig.icon}
        <span className="ml-1">{currentConfig.label}</span>
      </Badge>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Badge className={currentConfig.color}>
            {currentConfig.icon}
            <span className="ml-1">{currentConfig.label}</span>
          </Badge>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Switch Role</DropdownMenuLabel>
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
              className={isActive ? 'bg-secondary' : ''}
            >
              <span className="flex items-center gap-2">
                {config.icon}
                {config.label}
              </span>
              {isActive && <Badge variant="outline" className="ml-auto text-xs">Active</Badge>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
