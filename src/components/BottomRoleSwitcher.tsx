import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Home, Users, Wallet, Building2, ShieldCheck, Lock } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { AppRole } from '@/hooks/useAuth';
import { useAuth } from '@/hooks/useAuth';
import { roleDashboardRoutes } from '@/components/layout/executiveSidebarConfig';
import { roleToSlug } from '@/lib/roleRoutes';
import { useDeployedCapital } from '@/hooks/useDeployedCapital';
import { useRoleAccessRequests } from '@/hooks/useRoleAccessRequests';
import { areAllRolesUnlocked } from '@/hooks/useAppPreferences';
import ApplyForRoleDialog from '@/components/ApplyForRoleDialog';

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

const GATED_ROLES: AppRole[] = ['tenant', 'agent', 'landlord'];
const STAFF_ROLES: AppRole[] = ['manager', 'super_admin', 'employee', 'operations', 'ceo', 'coo', 'cfo', 'cto', 'cmo', 'crm'];

const BottomRoleSwitcher = memo(function BottomRoleSwitcher({ currentRole, onRoleChange }: BottomRoleSwitcherProps) {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const { isQualifiedInvestor } = useDeployedCapital(user?.id);
  const { hasApplied, requestRole } = useRoleAccessRequests(user?.id);

  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [applyRole, setApplyRole] = useState<AppRole | null>(null);

  const hasStaffRole = roles.some(r => STAFF_ROLES.includes(r));
  const staffRole = roles.find(r => STAFF_ROLES.includes(r));

  const isRoleGated = (role: AppRole): boolean => {
    // Strict ownership: a role is gated unless the user actually holds it.
    // The dev-only "unlock all" preference still bypasses the gate.
    if (areAllRolesUnlocked()) return false;
    if (roles.includes(role)) return false;
    return true;
  };

  const handleSwitch = (role: AppRole) => {
    if (role === currentRole) return;
    hapticTap();

    // Check if role is gated for qualified investors
    if (isRoleGated(role)) {
      setApplyRole(role);
      setApplyDialogOpen(true);
      return;
    }

    onRoleChange(role);
    // Sync URL with the new persona — URL is the source of truth.
    navigate(roleToSlug(role));
  };

  const handleStaffNav = () => {
    hapticTap();
    if (staffRole) {
      const route = roleDashboardRoutes[staffRole] || '/admin/dashboard';
      navigate(route);
    }
  };

  const showStaffTab = hasStaffRole && !['tenant', 'agent', 'landlord', 'supporter'].includes(currentRole);
  const cols = showStaffTab ? 5 : 4;

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border/40 pb-[env(safe-area-inset-bottom,0px)]">
        <div className={cn("grid max-w-lg mx-auto", cols === 5 ? "grid-cols-5" : "grid-cols-4")}>
          {PUBLIC_ROLES.map(({ role, label, icon: Icon }) => {
            const isActive = role === currentRole;
            const gated = isRoleGated(role);
            const pending = gated && hasApplied(role);
            return (
              <button
                key={role}
                onClick={() => handleSwitch(role)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[44px] transition-colors touch-manipulation active:scale-95 relative",
                  isActive
                    ? "text-primary"
                    : gated
                      ? "text-muted-foreground/40"
                      : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-xl transition-colors relative",
                  isActive && "bg-primary/10"
                )}>
                  <Icon className={cn("h-4.5 w-4.5", isActive && "text-primary")} />
                  {gated && (
                    <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-warning/20 flex items-center justify-center">
                      <Lock className="h-2 w-2 text-warning" />
                    </div>
                  )}
                </div>
                <span className={cn(
                  "text-[10px] font-semibold tracking-wide",
                  isActive && "text-primary",
                  pending && "text-warning"
                )}>
                  {pending ? 'Pending' : label}
                </span>
              </button>
            );
          })}
          {hasStaffRole && !['tenant', 'agent', 'landlord', 'supporter'].includes(currentRole) && (
            <button
              onClick={handleStaffNav}
              className="flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[44px] transition-colors touch-manipulation active:scale-95 text-muted-foreground hover:text-foreground"
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-xl transition-colors">
                <ShieldCheck className="h-4.5 w-4.5" />
              </div>
              <span className="text-[10px] font-semibold tracking-wide">Staff</span>
            </button>
          )}
        </div>
      </nav>

      <ApplyForRoleDialog
        open={applyDialogOpen}
        onOpenChange={setApplyDialogOpen}
        role={applyRole}
        hasApplied={applyRole ? hasApplied(applyRole) : false}
        onApply={requestRole}
      />
    </>
  );
});

export default BottomRoleSwitcher;
