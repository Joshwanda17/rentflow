import { Home, Wallet, Users, TrendingUp, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';

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
  const colsClass =
    visibleTabs.length === 1
      ? 'grid-cols-1'
      : visibleTabs.length === 4
        ? 'grid-cols-4'
        : 'grid-cols-5';
  return (
    <div
      className="sticky z-20 -mx-4 px-4 pb-2 bg-background/95 backdrop-blur-md border-b border-border/40"
      style={{ top: 0, paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}
      role="tablist"
      aria-label="Agent hub sections"
    >
      <div
        className={cn('grid gap-1 p-1 rounded-2xl bg-muted/60', colsClass)}
      >
        {visibleTabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              aria-label={t.label}
              onClick={() => { hapticTap(); onChange(t.id); }}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl transition-all touch-manipulation min-h-[56px]',
                isActive
                  ? 'bg-background text-primary shadow-sm font-bold'
                  : 'text-muted-foreground active:scale-95'
              )}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <t.icon className={cn('h-5 w-5', isActive && 'scale-110')} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-semibold tracking-tight leading-tight text-center">{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
