import { memo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Home, Users, Wallet, Building2, ShieldCheck, Lock } from "lucide-react";
import { hapticTap } from "@/lib/haptics";
import { AppRole } from "@/hooks/useAuth";
import { useAuth } from "@/hooks/useAuth";
import { roleDashboardRoutes } from "@/components/layout/executiveSidebarConfig";
import { roleToSlug } from "@/lib/roleRoutes";
import { useDeployedCapital } from "@/hooks/useDeployedCapital";
import { useRoleAccessRequests } from "@/hooks/useRoleAccessRequests";
import { areAllRolesUnlocked } from "@/hooks/useAppPreferences";
import ApplyForRoleDialog from "@/components/ApplyForRoleDialog";

interface BottomRoleSwitcherProps {
  currentRole: AppRole;
  onRoleChange: (role: AppRole) => void;
}

const PUBLIC_ROLES: { role: AppRole; label: string; icon: typeof Home }[] = [
  { role: "tenant", label: "Tenant", icon: Home },
  { role: "agent", label: "Agent", icon: Users },
  { role: "supporter", label: "Funder", icon: Wallet },
  { role: "landlord", label: "Owner", icon: Building2 },
];

const GATED_ROLES: AppRole[] = ["tenant", "agent", "landlord"];
const STAFF_ROLES: AppRole[] = [
  "manager",
  "super_admin",
  "employee",
  "operations",
  "ceo",
  "coo",
  "cfo",
  "cto",
  "cmo",
  "crm",
];

const BottomRoleSwitcher = memo(function BottomRoleSwitcher({ currentRole, onRoleChange }: BottomRoleSwitcherProps) {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const { isQualifiedInvestor } = useDeployedCapital(user?.id);
  const { hasApplied, requestRole } = useRoleAccessRequests(user?.id);

  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [applyRole, setApplyRole] = useState<AppRole | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const hasStaffRole = roles.some((r) => STAFF_ROLES.includes(r));
  const staffRole = roles.find((r) => STAFF_ROLES.includes(r));

  // A user who already holds every public persona (or an all-access staff role)
  // should never be prompted to "request access" — they already have the role.
  const hasAllPublicRoles = PUBLIC_ROLES.every(({ role }) => roles.includes(role));
  const hasAllAccessStaffRole = roles.includes("super_admin") || roles.includes("manager");

  const isRoleGated = (role: AppRole): boolean => {
    // Strict ownership: a role is gated unless the user actually holds it.
    // The dev-only "unlock all" preference still bypasses the gate.
    if (areAllRolesUnlocked()) return false;
    // Users who already have every role (or an all-access staff role) are never gated.
    if (hasAllPublicRoles || hasAllAccessStaffRole) return false;
    if (roles.includes(role)) return false;
    return true;
  };

  const handleSwitch = (role: AppRole) => {
    if (role === currentRole) return;
    hapticTap();

    // Check if role is gated for qualified investors
    if (isRoleGated(role)) {
      const label = PUBLIC_ROLES.find((r) => r.role === role)?.label ?? role;
      setAnnouncement(`${label} dashboard is locked. Opening access request.`);
      setApplyRole(role);
      setApplyDialogOpen(true);
      return;
    }

    const label = PUBLIC_ROLES.find((r) => r.role === role)?.label ?? role;
    setAnnouncement(`Switched to ${label} dashboard`);
    onRoleChange(role);
    // Sync URL with the new persona — URL is the source of truth.
    navigate(roleToSlug(role));
  };

  const handleStaffNav = () => {
    hapticTap();
    setAnnouncement("Opening Staff hub");
    if (staffRole) {
      const route = roleDashboardRoutes[staffRole] || "/admin/dashboard";
      navigate(route);
    }
  };

  const showStaffTab = hasStaffRole && !["tenant", "agent", "landlord", "supporter"].includes(currentRole);
  const cols = showStaffTab ? 5 : 4;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const navContent = (
    <>
      {/* Polite live region — screen readers announce role changes without stealing focus */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      <nav
        aria-label="Switch dashboard role"
        className="fixed bottom-0 left-0 right-0 z-[100] bg-background/95 backdrop-blur-md border-t border-border/40 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-2px_12px_hsl(var(--foreground)/0.06)]"
      >
        <div className={cn("grid max-w-lg mx-auto", cols === 5 ? "grid-cols-5" : "grid-cols-4")}>
          {PUBLIC_ROLES.map(({ role, label, icon: Icon }) => {
            const isActive = role === currentRole;
            const gated = isRoleGated(role);
            const pending = gated && hasApplied(role);
            return (
              <button
                key={role}
                onClick={() => handleSwitch(role)}
                aria-label={`${label}${isActive ? ' (current)' : ''}${gated ? ' (locked)' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors touch-manipulation active:scale-95 relative",
                  "outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:rounded-lg focus-visible:z-10",
                  isActive
                    ? "text-primary"
                    : gated
                      ? "text-muted-foreground/40"
                      : "text-muted-foreground hover:text-foreground",
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-xl transition-colors relative",
                    isActive && "bg-primary/10",
                  )}
                >
                  <Icon className={cn("h-5 w-5", isActive && "text-primary")} strokeWidth={isActive ? 2.5 : 2} />
                  {gated && (
                    <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-warning/20 flex items-center justify-center">
                      <Lock className="h-2 w-2 text-warning" />
                    </div>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[11px] font-semibold tracking-wide leading-none",
                    isActive && "text-primary",
                    pending && "text-warning",
                  )}
                >
                  {pending ? "Pending" : label}
                </span>
              </button>
            );
          })}
          {hasStaffRole && !["tenant", "agent", "landlord", "supporter"].includes(currentRole) && (
            <button
              onClick={handleStaffNav}
              aria-label="Staff hub"
              className="flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors touch-manipulation active:scale-95 text-muted-foreground hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:rounded-lg focus-visible:z-10"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-xl transition-colors">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-semibold tracking-wide leading-none">Staff</span>
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

  if (!mounted) return null;
  return createPortal(navContent, document.body);
});

export default BottomRoleSwitcher;
