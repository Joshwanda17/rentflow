import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, ArrowRight } from 'lucide-react';

const STAGES = [
  { key: 'pending', label: 'Tenant Ops' },
  { key: 'tenant_ops_approved', label: 'Agent Ops' },
  { key: 'agent_verified', label: 'Landlord Ops' },
  { key: 'landlord_ops_approved', label: 'COO' },
  { key: 'coo_approved', label: 'CFO' },
  { key: 'funded', label: 'Disbursed' },
];

const STAGE_ORDER: Record<string, number> = {};
STAGES.forEach((s, i) => { STAGE_ORDER[s.key] = i; });

interface RentPipelineTrackerProps {
  currentStatus: string;
  compact?: boolean;
}

export function RentPipelineTracker({ currentStatus, compact }: RentPipelineTrackerProps) {
  const currentIndex = STAGE_ORDER[currentStatus] ?? -1;

  return (
    <div className={cn('flex items-center gap-1', compact ? 'flex-wrap' : 'overflow-x-auto')}>
      {STAGES.map((stage, i) => {
        const completed = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={stage.key} className="flex items-center gap-1">
            <div
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium',
                completed && 'bg-primary/10 text-primary',
                active && 'bg-primary text-primary-foreground',
                !completed && !active && 'bg-muted text-muted-foreground'
              )}
            >
              {completed ? <CheckCircle2 className="h-3 w-3" /> : active ? <Clock className="h-3 w-3" /> : null}
              {stage.label}
            </div>
            {i < STAGES.length - 1 && (
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}
