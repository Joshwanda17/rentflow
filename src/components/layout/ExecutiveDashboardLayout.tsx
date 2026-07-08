import { useState, useEffect, useRef, ReactNode } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth, type AppRole } from '@/hooks/useAuth';
import { roleToSlug } from '@/lib/roleRoutes';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { LogOut, Menu, X, ArrowLeft, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { Search } from 'lucide-react';
import RoleSwitcher from '@/components/RoleSwitcher';
import { SidebarSkeleton, TopBarSkeleton } from '@/components/skeletons/SectionSkeletons';
import { executiveSidebarConfig, roleLabels, roleDashboardRoutes } from './executiveSidebarConfig';
import type { SidebarSection } from './executiveSidebarConfig';
import { GlossaryButton } from '@/components/shared/GlossaryButton';
import { MissionBanner } from '@/components/mission/MissionBanner';


interface ExecutiveDashboardLayoutProps {
  role: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: ReactNode;
  /** Optional badge counts keyed by sidebar item id (e.g. { advances: 3 }). */
  badges?: Record<string, number>;
}

export default function ExecutiveDashboardLayout({
  role,
  activeTab,
  onTabChange,
  children,
  badges,
}: ExecutiveDashboardLayoutProps) {
  const { user, roles, signOut, switchRole, addRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [navQuery, setNavQuery] = useState('');
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

  /**
   * Per-section open state for collapsible groups (e.g. COO → Reports).
   * Initialised from the section's `defaultOpen`, but auto-opened when the
   * current route matches one of its items so the active page is visible.
   */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    sections.forEach((s) => {
      if (s.collapsible) init[s.title] = s.defaultOpen ?? false;
    });
    return init;
  });

  // When the URL changes, force-open the group containing the active route.
  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      sections.forEach((s) => {
        if (!s.collapsible) return;
        const hasActive = s.items.some((it) =>
          it.route
            ? location.pathname === it.route || location.pathname.startsWith(it.route + '/')
            : activeTab === it.id,
        );
        if (hasActive) next[s.title] = true;
        else if (next[s.title] === undefined) next[s.title] = s.defaultOpen ?? false;
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, activeTab, role]);

  /**
   * Sync ?section=<id> from the URL → activeTab state. This means a deep link like
   * /cfo/dashboard?section=platform-impact opens that view AND highlights the row.
   * NOTE: this MUST match the param used by `usePersistedActiveTab` (`?section`).
   * Using a different param (`?tab`) here caused the two to clobber each other on
   * every navigation, resetting the view back to Overview (the "flash" bug).
   */
  useEffect(() => {
    const urlTab = searchParams.get('section');
    if (urlTab && urlTab !== activeTab) {
      onTabChange(urlTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /**
   * When a sidebar tab is clicked, push the tab id into the URL so refresh /
   * link sharing keeps the highlight. Route items still navigate to their URL.
   */
  const handleItemClick = (item: { id: string; route?: string }) => {
    if (item.route) {
      navigate(item.route);
      return;
    }
    onTabChange(item.id);
    // `onTabChange` (usePersistedActiveTab) already writes `?section`. Avoid a
    // second competing setSearchParams call here — two calls in the same tick
    // clobber each other (last write wins) and drop a param.
  };

  /**
   * A sidebar item is "active" when:
   *  - it has a route AND the current pathname starts with that route, OR
   *  - it is a tab-style item whose id matches activeTab.
   */
  const isItemActive = (item: { id: string; route?: string }) => {
    if (item.route) {
      return location.pathname === item.route ||
        location.pathname.startsWith(item.route + '/');
    }
    return activeTab === item.id;
  };

  /**
   * Clear the persisted sidebar tab for THIS role+route combo and reset the
   * dashboard back to the default overview view. Mirrors the storage key
   * convention used by `usePersistedActiveTab`.
   */
  const handleResetSelection = () => {
    try {
      window.localStorage.removeItem(
        `dashboard:${role}:${location.pathname}:activeTab`,
      );
    } catch {
      /* storage unavailable */
    }
    onTabChange('overview');
    // `onTabChange('overview')` already clears the `?section` param via the hook.
  };

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
      {/* Quick filter — type to jump to any section on a phone */}
      <div className="px-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            value={navQuery}
            onChange={(e) => setNavQuery(e.target.value)}
            placeholder="Search menu…"
            className="w-full h-11 pl-9 pr-9 rounded-xl bg-muted/60 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            style={{ fontSize: 16 }}
          />
          {navQuery && (
            <button
              type="button"
              onClick={() => setNavQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-muted"
              aria-label="Clear search"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
      {sections.map((section) => {
        const isOpen = section.collapsible ? !!openGroups[section.title] : true;
        const SectionIcon = section.icon;
        const q = navQuery.trim().toLowerCase();
        const visibleItems = q
          ? section.items.filter((it) => it.label.toLowerCase().includes(q))
          : section.items;
        if (q && visibleItems.length === 0) return null;
        // While searching, force every matching group open.
        const sectionOpen = q ? true : isOpen;
        return (
          <div key={section.title}>
            {section.collapsible ? (
              <button
                type="button"
                onClick={() =>
                  setOpenGroups((prev) => ({ ...prev, [section.title]: !prev[section.title] }))
                }
                className="w-full flex items-center justify-between gap-2 px-4 mb-2 group"
                aria-expanded={sectionOpen}
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              >
                <span className="flex items-center gap-2">
                  {SectionIcon && <SectionIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
                    {section.title}
                  </span>
                </span>
                {sectionOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            ) : (
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-4">
                {section.title}
              </p>
            )}
            {sectionOpen && (
              <div className="space-y-0.5 px-2">
                {visibleItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      handleItemClick(item);
                      setNavQuery('');
                      onItemClick?.();
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors select-none',
                      'active:scale-[0.98] active:bg-primary/15',
                      isItemActive(item)
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                    style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {badges && badges[item.id] > 0 && (
                      <span className="ml-auto shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-none">
                        {badges[item.id] > 99 ? '99+' : badges[item.id]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {navQuery.trim() &&
        sections.every(
          (s) =>
            s.items.filter((it) =>
              it.label.toLowerCase().includes(navQuery.trim().toLowerCase()),
            ).length === 0,
        ) && (
          <p className="px-4 text-sm text-muted-foreground">No menu items match “{navQuery}”.</p>
        )}

      <div className="px-2 pt-4 border-t border-border mx-2">
        <button
          type="button"
          onClick={() => { handleResetSelection(); onItemClick?.(); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors select-none active:scale-[0.98] mb-1"
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          title="Clear saved sidebar selection and return to Overview"
        >
          <RotateCcw className="h-4 w-4 shrink-0" />
          <span>Reset sidebar selection</span>
        </button>
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
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <TopBarSkeleton />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <SidebarSkeleton />
          <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-4">
            <div className="h-8 w-48 rounded bg-muted/50 animate-pulse" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="h-24 rounded-xl bg-muted/40 animate-pulse" />
              <div className="h-24 rounded-xl bg-muted/40 animate-pulse" />
              <div className="h-24 rounded-xl bg-muted/40 animate-pulse" />
              <div className="h-24 rounded-xl bg-muted/40 animate-pulse" />
            </div>
            <div className="h-64 rounded-xl bg-muted/30 animate-pulse" />
          </main>
        </div>
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

        {/* Glossary — shared team vocabulary */}
        <GlossaryButton variant="header" />

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
          {SidebarContent({})}
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 p-2 sm:p-4 lg:p-6 max-w-7xl mx-auto w-full overflow-y-auto overflow-x-hidden">
          {activeTab !== 'mission-goals' && (
            <MissionBanner dashboardRole={role} className="mb-4" />
          )}
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
            {SidebarContent({ onItemClick: () => setDrawerOpen(false) })}
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
