import { Home, Wallet, Users, TrendingUp, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';

export type AgentHubTab = 'home' | 'money' | 'tenants' | 'grow' | 'subagents';

interface AgentHubTabsProps {
  active: AgentHubTab;
  onChange: (tab: AgentHubTab) => void;
}

const tabs: { id: AgentHubTab; icon: typeof Home; label: string }[] = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'money', icon: Wallet, label: 'Money' },
  { id: 'tenants', icon: Users, label: 'Tenants' },
  { id: 'grow', icon: TrendingUp, label: 'Grow' },
  { id: 'subagents', icon: UsersRound, label: 'Sub Agents' },
];

export function AgentHubTabs({ active, onChange }: AgentHubTabsProps) {
  return (
    <nav
      className="fixed left-0 right-0 z-40 px-3 pt-2 bg-background/95 backdrop-blur-md border-t border-border/40"
      style={{
        bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: '8px',
      }}
    >
      <div className="grid grid-cols-5 gap-1 p-1 rounded-2xl bg-muted/60 max-w-lg mx-auto">
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { hapticTap(); onChange(t.id); }}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl transition-all touch-manipulation min-h-[48px]',
                isActive
                  ? 'bg-background text-primary shadow-sm font-bold'
                  : 'text-muted-foreground active:scale-95'
              )}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <t.icon className={cn('h-4 w-4', isActive && 'scale-110')} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[9px] font-semibold tracking-tight leading-tight text-center">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
