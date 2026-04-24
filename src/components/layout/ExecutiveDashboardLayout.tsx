import { useState, useEffect, useRef, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type AppRole } from '@/hooks/useAuth';
import { roleToSlug } from '@/lib/roleRoutes';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { LogOut, Menu, X, ArrowLeft, Loader2 } from 'lucide-react';
import RoleSwitcher from '@/components/RoleSwitcher';
import { executiveSidebarConfig, roleLabels, roleDashboardRoutes } from './executiveSidebarConfig';
import type { SidebarSection } from './executiveSidebarConfig';


interface ExecutiveDashboardLayoutProps {
  role: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: ReactNode;
}

export default function ExecutiveDashboardLayout({
  role,
  activeTab,
  onTabChange,
  children,
}: ExecutiveDashboardLayoutProps) {
  const { user, roles, signOut, switchRole, addRole } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const loggedRef = useRef(false);

  useEffect(() => {
    if (!user) { setCheckingProfile(false); return; }
    setCheckingProfile(false);
  }, [user]);

  // Log dashboard_accessed
  useEffect(() => {
    if (!user || loggedRef.current) return;
    loggedRef.current = true;
    supabase.from('audit_logs').insert({
      user_id: user.id,
      action_type: 'dashboard_accessed',
      metadata: { dashboard: role, timestamp: new Date().toISOString() },
    });
  }, [user, role]);

  const sections: SidebarSection[] = executiveSidebarConfig[role] || [];
  const displayRole = roleLabels[role as AppRole] || role.toUpperCase();

  const handleRoleChange = (newRole: AppRole) => {
    switchRole(newRole);
    const route = roleDashboardRoutes[newRole];
    if (route) {
      navigate(route);
    } else {
      navigate(roleToSlug(newRole));
    }
  };

  const handleExit = () => {
    navigate(roleToSlug(role as AppRole));
  };

  const SidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <nav className="flex-1 overflow-y-auto py-4 space-y-5" style={{ touchAction: 'manipulation' }}>
      {sections.map((section) => (
        <div key={section.title}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-4">
            {section.title}
          </p>
          <div className="space-y-0.5 px-2">
            {section.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.route) {
                    navigate(item.route);
                  } else {
                    onTabChange(item.id);
                  }
                  onItemClick?.();
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors select-none',
                  'active:scale-[0.98] active:bg-primary/15',
                  activeTab === item.id
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="px-2 pt-4 border-t border-border mx-2">
        <button
          type="button"
          onClick={() => { handleExit(); onItemClick?.(); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors select-none active:scale-[0.98]"
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span>Exit Dashboard</span>
        </button>
      </div>
    </nav>
  );

  if (checkingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top Bar */}
      <header className="shrink-0 z-40 h-14 bg-primary text-primary-foreground border-b border-border flex items-center px-4 gap-3">
        {/* Mobile hamburger */}
        <button
          type="button"
          className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          onClick={() => setDrawerOpen(true)}
          style={{ touchAction: 'manipulation' }}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Logo / Title */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-sm whitespace-nowrap">{displayRole}</span>
        </div>

        {/* Center: Role Switcher */}
        <div className="flex-1 flex justify-center">
          <RoleSwitcher
            currentRole={role as AppRole}
            availableRoles={roles}
            onRoleChange={handleRoleChange}
            onAddRole={addRole}
            variant="header"
          />
        </div>

        {/* Sign Out */}
        <button
          type="button"
          onClick={() => signOut()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors whitespace-nowrap"
          style={{ touchAction: 'manipulation' }}
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-border bg-card/50 overflow-y-auto">
          <SidebarContent />
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 p-2 sm:p-4 lg:p-6 max-w-7xl mx-auto w-full overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[60] lg:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            className="fixed inset-y-0 left-0 w-72 bg-background z-[70] lg:hidden flex flex-col shadow-xl animate-in slide-in-from-left duration-200"
            style={{ touchAction: 'manipulation' }}
          >
            <div className="h-14 flex items-center justify-between px-4 border-b border-border">
              <span className="font-bold text-sm">{displayRole} Dashboard</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-lg hover:bg-muted"
                style={{ touchAction: 'manipulation' }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent onItemClick={() => setDrawerOpen(false)} />
            <div className="p-4 border-t border-border">
              <button
                type="button"
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                style={{ touchAction: 'manipulation' }}
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
