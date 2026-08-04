import { cn } from '@/lib/utils';

interface PaymentMethodIconsProps {
  className?: string;
  iconClassName?: string;
}

function MtnIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="MTN Mobile Money"
    >
      <rect width="40" height="40" rx="8" fill="#FFCC00" />
      <path
        d="M12 28h3l4-16h-3l-2.5 10.5L11 12H8l4 16zm12 0h3l4-16h-3l-2.5 10.5L23 12h-3l4 16z"
        fill="#1a1a1a"
      />
    </svg>
  );
}

function AirtelIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Airtel Money"
    >
      <rect width="40" height="40" rx="20" fill="#E40000" />
      <path
        d="M20 8c-4 0-8 3-10 8 2 7 6 12 10 14 4-2 8-7 10-14-2-5-6-8-10-8zm0 6c2 0 4 1.5 5 4-1 4-3 7-5 9-2-2-4-5-5-9 1-2.5 3-4 5-4z"
        fill="white"
      />
    </svg>
  );
}

function EquityBankIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Equity Bank"
    >
      <rect width="40" height="40" rx="8" fill="#006633" />
      <path
        d="M20 8l-8 8h5v14h6V16h5L20 8z"
        fill="white"
      />
    </svg>
  );
}

function CashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Physical Cash"
    >
      <rect width="40" height="40" rx="8" fill="#10B981" />
      <rect x="6" y="12" width="28" height="16" rx="2" fill="white" />
      <circle cx="20" cy="20" r="4" fill="#10B981" />
      <path
        d="M8 14h2M30 26h2M8 26h2M30 14h2"
        stroke="#10B981"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const METHODS = [
  { key: 'mtn', label: 'MTN', Icon: MtnIcon },
  { key: 'airtel', label: 'Airtel', Icon: AirtelIcon },
  { key: 'equity', label: 'Equity', Icon: EquityBankIcon },
  { key: 'cash', label: 'Cash', Icon: CashIcon },
];

export function PaymentMethodIcons({ className, iconClassName }: PaymentMethodIconsProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {METHODS.map(({ key, label, Icon })` }) => (
        <div
          key={key}
          className="group relative flex flex-col items-center gap-1"
          title={label}
        >
          <Icon className={cn('h-8 w-8 rounded-lg shadow-sm', iconClassName)} />
          <span className="text-[9px] font-medium text-muted-foreground leading-none">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
