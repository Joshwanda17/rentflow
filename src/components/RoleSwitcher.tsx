import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Home, Users, Wallet, Building2, Shield } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';

type AppRole = 'tenant' | 'agent' | 'landlord' | 'supporter' | 'manager' | 'ceo' | 'coo' | 'cfo' | 'cto' | 'cmo' | 'crm' | 'employee' | 'operations' | 'super_admin';

interface RoleSwitcherProps {
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  variant?: 'header' | 'prominent';
}

const roleConfig: Record<AppRole, { label: string; shortLabel: string; icon: React.ReactNode; emoji: string }> = {
  tenant: { 
    label: 'Tenant', 
    shortLabel: 'Tenant',
    icon: <Home className="h-3.5 w-3.5" />,
    emoji: '🏠'
  },
  agent: { 
    label: 'Agent', 
    shortLabel: 'Agent',
    icon: <Users className="h-3.5 w-3.5" />,
    emoji: '👥'
  },
  supporter: { 
    label: 'Supporter', 
    shortLabel: 'Funder',
    icon: <Wallet className="h-3.5 w-3.5" />,
    emoji: '💰'
  },
  landlord: { 
    label: 'Landlord', 
    shortLabel: 'Owner',
    icon: <Building2 className="h-3.5 w-3.5" />,
    emoji: '🏢'
  },
  manager: { 
    label: 'Manager', 
    shortLabel: 'Admin',
    icon: <Shield className="h-3.5 w-3.5" />,
    emoji: '🛡️'
  },
};

const RoleSwitcher = memo(function RoleSwitcher({ currentRole, availableRoles, onRoleChange, variant = 'header' }: RoleSwitcherProps) {
  const navigate = useNavigate();
  
  if (availableRoles.length <= 1) return null;

  const handleSwitch = (role: AppRole) => {
    if (role !== currentRole) {
      hapticTap();
      if (role === 'manager') {
        // Manager requires extra security — go through PIN flow
        navigate('/manager-login');
        return;
      }
      onRoleChange(role);
    }
  };

  // Prominent variant — full-width horizontal pills in dashboard body
  if (variant === 'prominent') {
    return (
      <div className="w-full">
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-2xl">
          {availableRoles.map((role) => {
            const config = roleConfig[role];
            const isActive = role === currentRole;
            return (
              <button
                key={role}
                onClick={() => handleSwitch(role)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-sm font-semibold transition-all duration-200 touch-manipulation min-h-[44px]",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" 
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60 active:scale-95"
                )}
              >
                <span className="text-base">{config.emoji}</span>
                <span className="truncate">{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Header variant — compact scrollable pills
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
      {availableRoles.map((role) => {
        const config = roleConfig[role];
        const isActive = role === currentRole;
        return (
          <button
            key={role}
            onClick={() => handleSwitch(role)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 touch-manipulation min-h-[32px]",
              isActive
                ? "bg-white text-primary shadow-sm"
                : "text-white/70 hover:text-white hover:bg-white/10 active:scale-95"
            )}
          >
            <span className="text-sm">{config.emoji}</span>
            <span className="hidden xs:inline">{config.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
});

export default RoleSwitcher;
