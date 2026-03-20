import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, ArrowRight, Coins, Shield, UserCheck, FileCheck, Banknote, Wallet } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

const STAGES = [
  {
    key: 'pending',
    label: 'Tenant Ops',
    agentBenefit: 'assigned',
    agentDesc: 'Agent assigned based on proximity — earns task assignment',
    icon: UserCheck,
  },
  {
    key: 'tenant_ops_approved',
    label: 'Agent Ops',
    agentBenefit: 'verification_bonus',
    agentDesc: 'Agent verifies tenant & property → UGX 10,000 verification bonus',
    icon: Shield,
  },
  {
    key: 'agent_verified',
    label: 'Landlord Ops',
    agentBenefit: 'pipeline',
    agentDesc: 'Landlord verified — agent\'s commission is being secured',
    icon: FileCheck,
  },
  {
    key: 'landlord_ops_approved',
    label: 'COO',
    agentBenefit: 'pipeline',
    agentDesc: 'Operational sign-off — commission locked and pending',
    icon: FileCheck,
  },
  {
    key: 'coo_approved',
    label: 'CFO',
    agentBenefit: 'pipeline',
    agentDesc: 'Awaiting payout authorization — commission queued on disbursement',
    icon: Banknote,
  },
  {
    key: 'funded',
    label: 'Disbursed',
    agentBenefit: 'commission',
    agentDesc: '5% commission auto-queued to agent wallet for approval',
    icon: Wallet,
  },
];

const STAGE_ORDER: Record<string, number> = {};
STAGES.forEach((s, i) => { STAGE_ORDER[s.key] = i; });

interface RentPipelineTrackerProps {
  currentStatus: string;
  compact?: boolean;
  rentAmount?: number;
  showAgentBenefits?: boolean;
}

export function RentPipelineTracker({ currentStatus, compact, rentAmount, showAgentBenefits }: RentPipelineTrackerProps) {
  const currentIndex = STAGE_ORDER[currentStatus] ?? -1;
  const commission = rentAmount ? Math.floor(rentAmount * 0.05) : 0;
  const verificationBonus = 10000;

  return (
    <div className="space-y-2">
      {/* Pipeline Steps */}
      <div className={cn('flex items-center gap-1', compact ? 'flex-wrap' : 'overflow-x-auto')}>
        {STAGES.map((stage, i) => {
          const completed = i < currentIndex;
          const active = i === currentIndex;
          const isDisbursed = stage.key === 'funded';
          return (
            <div key={stage.key} className="flex items-center gap-1">
              <div
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all',
                  completed && 'bg-primary/10 text-primary',
                  active && 'bg-primary text-primary-foreground',
                  !completed && !active && 'bg-muted text-muted-foreground',
                  isDisbursed && completed && 'bg-success/20 text-success'
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

      {/* Agent Benefits Breakdown */}
      {showAgentBenefits && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Coins className="h-3.5 w-3.5 text-success" />
            Agent Earnings at Each Stage
          </p>
          <div className="space-y-1">
            {STAGES.map((stage, i) => {
              const completed = i < currentIndex;
              const active = i === currentIndex;
              const StageIcon = stage.icon;

              let earningLabel = '';
              let earningColor = 'text-muted-foreground';
              if (stage.agentBenefit === 'assigned') {
                earningLabel = 'Task assigned';
                earningColor = completed || active ? 'text-primary' : 'text-muted-foreground';
              } else if (stage.agentBenefit === 'verification_bonus') {
                earningLabel = `+${formatUGX(verificationBonus)} bonus`;
                earningColor = completed ? 'text-success' : active ? 'text-primary' : 'text-muted-foreground';
              } else if (stage.agentBenefit === 'commission') {
                earningLabel = commission > 0 ? `+${formatUGX(commission)} (5%)` : '+5% of rent';
                earningColor = completed ? 'text-success font-bold' : 'text-muted-foreground';
              } else {
                earningLabel = 'Processing…';
                earningColor = completed ? 'text-primary/70' : 'text-muted-foreground';
              }

              return (
                <div
                  key={stage.key}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all',
                    completed && 'bg-primary/5',
                    active && 'bg-primary/10 ring-1 ring-primary/20',
                    !completed && !active && 'opacity-50'
                  )}
                >
                  <StageIcon className={cn('h-3.5 w-3.5 shrink-0', completed ? 'text-success' : active ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="flex-1 text-foreground">{stage.agentDesc}</span>
                  <span className={cn('font-semibold whitespace-nowrap', earningColor)}>
                    {earningLabel}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Total Potential */}
          {rentAmount && (
            <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-success/10 border border-success/20 mt-2">
              <span className="text-xs font-semibold text-success flex items-center gap-1.5">
                <Wallet className="h-4 w-4" />
                Total Agent Earning Potential
              </span>
              <span className="font-bold text-success">
                {formatUGX(verificationBonus + commission)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}