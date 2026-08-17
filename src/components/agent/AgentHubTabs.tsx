import { Home, Wallet, Users, TrendingUp, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';
import {
  FLOATING_NAV_ITEM,
  FLOATING_NAV_LABEL,
  FloatingNavRow,
  SlidingIndicator,
  useSlidingIndicator,
} from '@/components/ui/floating-nav';

export type AgentHubTab = 'home' | 'money' | 'tenants' | 'grow' | 'subagents';

interface AgentHubTabsProps {
  active: AgentHubTab;
  onChange: (tab: AgentHubTab) => void;
  /** When true, hides operational (tenant) sections for Merchant Agents. */
  restricted?: boolean;
}

const tabs: { id: AgentHubTab; icon: typeof Home; label: string }[] = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'money', icon: Wallet, label: 'Money' },
  { id: 'tenants', icon: Users, label: 'Tenants' },
  { id: 'grow', icon: TrendingUp, label: 'Grow' },
  { id: 'subagents', icon: Store, label: 'Service Center' },
];

export function AgentHubTabs({ active, onChange, restricted = false }: AgentHubTabsProps) {
  // Merchant Agents are locked to the Home tab only — all operational tabs are hidden.
  const visibleTabs = restricted ? tabs.filter((t) => t.id === 'home') : tabs;
  const mainTabs = visibleTabs.filter((t) => t.id !== 'subagents');
  const serviceCenterTab = visibleTabs.find((t) => t.id === 'subagents');
  const activeIndex = mainTabs.findIndex((t) => t.id === active);
  const { containerRef, setItemRef, indicatorStyle } = useSlidingIndicator(activeIndex, [
    mainTabs.length,
  ]);
  return (
    <div
      className="sticky z-20 -mx-4 px-3 pb-2"
      style={{ top: 0, paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}
      role="tablist"
      aria-label="Agent hub sections"
    >
      {serviceCenterTab && (
        <div className="mb-2 flex justify-end">
          <button
            key={serviceCenterTab.id}
            role="tab"
            aria-selected={active === serviceCenterTab.id}
            aria-label={serviceCenterTab.label}
            onClick={() => { hapticTap(); onChange(serviceCenterTab.id); }}
            className={cn(
              'relative z-10 flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 backdrop-blur-xl px-3 py-1.5 text-[10px] font-semibold tracking-wide shadow-sm transition-colors touch-manipulation active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active === serviceCenterTab.id ? 'text-primary font-bold' : 'text-muted-foreground'
            )}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <serviceCenterTab.icon className={cn('h-4 w-4', active === serviceCenterTab.id && 'scale-110')} strokeWidth={active === serviceCenterTab.id ? 2.5 : 2} />
            <span>{serviceCenterTab.label}</span>
          </button>
        </div>
      )}
      <div
        className="rounded-full border border-border/60 bg-background/90 backdrop-blur-xl shadow-[0_10px_34px_-8px_hsl(var(--foreground)/0.3)]"
      >
        <FloatingNavRow containerRef={containerRef}>
          <SlidingIndicator style={indicatorStyle} />
          {mainTabs.map((t, i) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              ref={setItemRef(i)}
              role="tab"
              aria-selected={isActive}
              aria-label={t.label}
              onClick={() => { hapticTap(); onChange(t.id); }}
              className={cn(
                FLOATING_NAV_ITEM,
                isActive ? 'text-primary font-bold' : 'text-muted-foreground'
              )}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <t.icon className={cn('h-5 w-5', isActive && 'scale-110')} strokeWidth={isActive ? 2.5 : 2} />
              <span className={FLOATING_NAV_LABEL}>{t.label}</span>
            </button>
          );
          })}
        </FloatingNavRow>
      </div>
    </div>
  );
}
