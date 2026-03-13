import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Home, Users, Wallet, Building2 } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { AppRole } from '@/hooks/useAuth';

interface BottomRoleSwitcherProps {
  currentRole: AppRole;
  onRoleChange: (role: AppRole) => void;
}

const PUBLIC_ROLES: { role: AppRole; label: string; icon: typeof Home }[] = [
  { role: 'tenant', label: 'Tenant', icon: Home },
  { role: 'agent', label: 'Agent', icon: Users },
  { role: 'supporter', label: 'Funder', icon: Wallet },
  { role: 'landlord', label: 'Owner', icon: Building2 },
];

const BottomRoleSwitcher = memo(function BottomRoleSwitcher({ currentRole, onRoleChange }: BottomRoleSwitcherProps) {
  const handleSwitch = (role: AppRole) => {
    if (role === currentRole) return;
    hapticTap();
    onRoleChange(role);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border/40 pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4 max-w-lg mx-auto">
        {PUBLIC_ROLES.map(({ role, label, icon: Icon }) => {
          const isActive = role === currentRole;
          return (
            <button
              key={role}
              onClick={() => handleSwitch(role)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] transition-colors touch-manipulation active:scale-95",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className={cn(
                "flex items-center justify-center w-8 h-8 rounded-xl transition-colors",
                isActive && "bg-primary/10"
              )}>
                <Icon className={cn("h-4.5 w-4.5", isActive && "text-primary")} />
              </div>
              <span className={cn(
                "text-[10px] font-semibold tracking-wide",
                isActive && "text-primary"
              )}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});

export default BottomRoleSwitcher;
