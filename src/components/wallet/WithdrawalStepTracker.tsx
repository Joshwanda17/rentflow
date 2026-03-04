import { CheckCircle, Clock, User, Briefcase, DollarSign, Shield } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface StepData {
  label: string;
  description: string;
  icon: typeof User;
  completedAt?: string | null;
}

interface WithdrawalStepTrackerProps {
  status: string;
  createdAt: string;
  managerApprovedAt?: string | null;
  cfoApprovedAt?: string | null;
  cooApprovedAt?: string | null;
  processedAt?: string | null;
}

export function WithdrawalStepTracker({
  status,
  createdAt,
  managerApprovedAt,
  cfoApprovedAt,
  cooApprovedAt,
  processedAt,
}: WithdrawalStepTrackerProps) {
  const isRejected = status === 'rejected';

  const steps: StepData[] = [
    {
      label: 'Requested',
      description: 'Withdrawal submitted',
      icon: User,
      completedAt: createdAt,
    },
    {
      label: 'Manager Review',
      description: 'Manager approval',
      icon: Briefcase,
      completedAt: managerApprovedAt,
    },
    {
      label: 'CFO Review',
      description: 'CFO approval',
      icon: DollarSign,
      completedAt: cfoApprovedAt,
    },
    {
      label: 'COO Approval & Payment',
      description: 'Final approval & payout',
      icon: Shield,
      completedAt: cooApprovedAt || processedAt,
    },
  ];

  // Determine current active step
  const getActiveStepIndex = () => {
    if (status === 'approved') return 4; // all done
    if (cfoApprovedAt) return 3;
    if (managerApprovedAt) return 2;
    return 1; // pending at manager
  };

  const activeStep = isRejected ? -1 : getActiveStepIndex();

  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const isCompleted = !isRejected && index < activeStep;
        const isCurrent = !isRejected && index === activeStep && index < 4;
        const isWaiting = !isCompleted && !isCurrent;
        const StepIcon = step.icon;
        const isLast = index === steps.length - 1;

        return (
          <div key={index} className="flex gap-3">
            {/* Vertical line + circle */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors',
                  isCompleted && 'bg-emerald-500 border-emerald-500',
                  isCurrent && 'border-primary bg-primary/10 animate-pulse',
                  isWaiting && 'border-muted-foreground/30 bg-muted/50',
                  isRejected && index > 0 && 'border-muted-foreground/20 bg-muted/30',
                )}
              >
                {isCompleted ? (
                  <CheckCircle className="h-4 w-4 text-white" />
                ) : isCurrent ? (
                  <Clock className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <StepIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
                )}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'w-0.5 flex-1 min-h-[24px] transition-colors',
                    isCompleted ? 'bg-emerald-500' : 'bg-muted-foreground/20',
                  )}
                />
              )}
            </div>

            {/* Content */}
            <div className={cn('pb-4', isLast && 'pb-0')}>
              <p
                className={cn(
                  'text-sm font-semibold leading-tight',
                  isCompleted && 'text-emerald-600 dark:text-emerald-400',
                  isCurrent && 'text-foreground',
                  isWaiting && 'text-muted-foreground/60',
                )}
              >
                {step.label}
              </p>
              {isCompleted && step.completedAt && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  ✓ {format(new Date(step.completedAt), 'MMM d, yyyy • h:mm a')}
                </p>
              )}
              {isCurrent && (
                <p className="text-[10px] text-primary font-medium mt-0.5">
                  ⏳ In progress...
                </p>
              )}
              {isWaiting && !isRejected && (
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                  Waiting
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
