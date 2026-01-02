import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  AlertCircle, 
  Send, 
  Banknote,
  CheckCheck,
  Hourglass,
  Ban
} from 'lucide-react';
import { cn } from '@/lib/utils';

type StatusType = 
  | 'pending' 
  | 'approved' 
  | 'funded' 
  | 'disbursed' 
  | 'completed' 
  | 'rejected'
  | 'active'
  | 'inactive'
  | 'processing'
  | 'success'
  | 'error'
  | 'warning';

interface StatusIndicatorProps {
  status: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const statusConfig: Record<StatusType, { 
  icon: typeof Clock; 
  label: string; 
  bgColor: string; 
  textColor: string;
  dotColor: string;
}> = {
  pending: {
    icon: Hourglass,
    label: 'Pending',
    bgColor: 'bg-warning/10',
    textColor: 'text-warning',
    dotColor: 'bg-warning',
  },
  approved: {
    icon: CheckCircle,
    label: 'Approved',
    bgColor: 'bg-primary/10',
    textColor: 'text-primary',
    dotColor: 'bg-primary',
  },
  funded: {
    icon: Banknote,
    label: 'Funded',
    bgColor: 'bg-success/10',
    textColor: 'text-success',
    dotColor: 'bg-success',
  },
  disbursed: {
    icon: Send,
    label: 'Sent',
    bgColor: 'bg-success/10',
    textColor: 'text-success',
    dotColor: 'bg-success',
  },
  completed: {
    icon: CheckCheck,
    label: 'Done',
    bgColor: 'bg-muted',
    textColor: 'text-muted-foreground',
    dotColor: 'bg-muted-foreground',
  },
  rejected: {
    icon: XCircle,
    label: 'Rejected',
    bgColor: 'bg-destructive/10',
    textColor: 'text-destructive',
    dotColor: 'bg-destructive',
  },
  active: {
    icon: CheckCircle,
    label: 'Active',
    bgColor: 'bg-success/10',
    textColor: 'text-success',
    dotColor: 'bg-success',
  },
  inactive: {
    icon: Ban,
    label: 'Inactive',
    bgColor: 'bg-muted',
    textColor: 'text-muted-foreground',
    dotColor: 'bg-muted-foreground',
  },
  processing: {
    icon: Loader2,
    label: 'Processing',
    bgColor: 'bg-primary/10',
    textColor: 'text-primary',
    dotColor: 'bg-primary',
  },
  success: {
    icon: CheckCircle,
    label: 'Success',
    bgColor: 'bg-success/10',
    textColor: 'text-success',
    dotColor: 'bg-success',
  },
  error: {
    icon: XCircle,
    label: 'Error',
    bgColor: 'bg-destructive/10',
    textColor: 'text-destructive',
    dotColor: 'bg-destructive',
  },
  warning: {
    icon: AlertCircle,
    label: 'Warning',
    bgColor: 'bg-warning/10',
    textColor: 'text-warning',
    dotColor: 'bg-warning',
  },
};

const sizeConfig = {
  sm: {
    container: 'h-6 px-2 gap-1',
    icon: 'h-3.5 w-3.5',
    dot: 'h-2 w-2',
    text: 'text-[10px]',
  },
  md: {
    container: 'h-7 px-2.5 gap-1.5',
    icon: 'h-4 w-4',
    dot: 'h-2.5 w-2.5',
    text: 'text-xs',
  },
  lg: {
    container: 'h-8 px-3 gap-2',
    icon: 'h-5 w-5',
    dot: 'h-3 w-3',
    text: 'text-sm',
  },
};

export function StatusIndicator({ 
  status, 
  showLabel = false, 
  size = 'sm',
  className 
}: StatusIndicatorProps) {
  const normalizedStatus = status.toLowerCase() as StatusType;
  const config = statusConfig[normalizedStatus] || statusConfig.pending;
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;
  const isProcessing = normalizedStatus === 'processing';

  return (
    <div 
      className={cn(
        'inline-flex items-center justify-center rounded-full font-medium transition-all',
        config.bgColor,
        config.textColor,
        sizeStyles.container,
        className
      )}
    >
      <Icon className={cn(sizeStyles.icon, isProcessing && 'animate-spin')} />
      {showLabel && (
        <span className={sizeStyles.text}>{config.label}</span>
      )}
    </div>
  );
}

// Simple dot indicator for compact lists
export function StatusDot({ 
  status, 
  size = 'sm',
  pulse = false,
  className 
}: { 
  status: string; 
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  className?: string;
}) {
  const normalizedStatus = status.toLowerCase() as StatusType;
  const config = statusConfig[normalizedStatus] || statusConfig.pending;
  const sizeStyles = sizeConfig[size];

  return (
    <div className={cn('relative', className)}>
      <div className={cn(
        'rounded-full',
        config.dotColor,
        sizeStyles.dot
      )} />
      {pulse && (
        <div className={cn(
          'absolute inset-0 rounded-full animate-ping opacity-75',
          config.dotColor,
          sizeStyles.dot
        )} />
      )}
    </div>
  );
}
