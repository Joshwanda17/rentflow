import { createPortal } from 'react-dom';
import { BarChart3, Sparkles, Users, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';

export type SubAgentSection = 'subagent-overview' | 'subagent-invite' | 'subagent-team';

const ITEMS: { id: SubAgentSection; label: string; icon: typeof BarChart3 }[] = [
  { id: 'subagent-overview', label: 'Summary', icon: BarChart3 },
  { id: 'subagent-invite', label: 'Invites', icon: Sparkles },
  { id: 'subagent-team', label: 'Team', icon: Users },
];

interface SubAgentBottomNavProps {
  active: SubAgentSection;
  onNavigate: (id: SubAgentSection) => void;
  onInvite: () => void;
}

export function SubAgentBottomNav({ active, onNavigate, onInvite }: SubAgentBottomNavProps) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <nav
      aria-label="Sub-agent sections"
      className="fixed bottom-0 inset-x-0 z-[60] bg-background/95 backdrop-blur-xl border-t border-border/60 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-2px_12px_hsl(var(--foreground)/0.06)]"
    >
      <div className="grid grid-cols-4 max-w-lg mx-auto">
        {ITEMS.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => { hapticTap(); onNavigate(item.id); }}
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] touch-manipulation transition-colors active:scale-95',
                isActive ? 'text-orange-500' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <div className={cn('flex items-center justify-center w-8 h-8 rounded-xl transition-colors', isActive && 'bg-orange-500/10')}>
                <item.icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className="text-[11px] font-semibold leading-none">{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => { hapticTap(); onInvite(); }}
          aria-label="Invite sub-agent"
          className="flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] touch-manipulation transition-colors active:scale-95 text-muted-foreground hover:text-foreground"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-orange-500 text-white">
            <UserPlus className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="text-[11px] font-semibold leading-none">Invite</span>
        </button>
      </div>
    </nav>,
    document.body,
  );
}