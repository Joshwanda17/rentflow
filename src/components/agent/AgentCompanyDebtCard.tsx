import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatUGX } from '@/lib/rentCalculations';
import { Loader2, Building2, ArrowRight, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentCompanyExposure } from '@/hooks/useAgentCompanyExposure';

interface Props {
  onViewBreakdown?: () => void;
}

/**
 * "Owed to Welile" — what the company has paid out for this agent's tenants
 * and is still waiting to recover. Read-only summary, no writes.
 */
export function AgentCompanyDebtCard({ onViewBreakdown }: Props) {
  const x = useAgentCompanyExposure();

  if (x.isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Hide if there's nothing to show — agent has no tenants, no debt, no advance.
  if (
    x.tenantCount === 0 &&
    x.totalOwed === 0 &&
    x.lifetimeDisbursed === 0
  ) {
    return null;
  }

  const hasDebt = x.totalOwed > 0;

  return (
    <Card className={cn(hasDebt && 'border-destructive/40')}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" /> Owed to Welile
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  aria-label="What is this?"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px] text-xs">
                This is everything Welile has paid out for your tenants that hasn't been
                repaid yet. It is not a personal debt — it goes down every time a tenant
                repays.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            'font-bold text-2xl tabular-nums',
            hasDebt ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {formatUGX(x.totalOwed)}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Outstanding company exposure on your book
        </p>

        <div className="mt-3 pt-3 border-t border-dashed space-y-1.5 text-xs">
          <Row label="Lifetime paid out for my tenants" value={x.lifetimeDisbursed} />
          <Row label="Lifetime repaid" value={x.lifetimeRepaid} positive />
          <Row
            label={`Active cycles outstanding${x.activeCycleCount ? ` (${x.activeCycleCount})` : ''}`}
            value={x.outstandingCycles}
            danger={x.outstandingCycles > 0}
          />
          {x.subscriptionDebt > 0 && (
            <Row label="Subscription debt (guarantor)" value={x.subscriptionDebt} danger />
          )}
          {x.advanceBalance > 0 && (
            <Row label="Personal advance (wallet)" value={x.advanceBalance} danger />
          )}
        </div>

        {onViewBreakdown && x.tenantCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onViewBreakdown}
            className="w-full mt-3 h-9 text-xs"
          >
            View tenant breakdown
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  danger,
  positive,
}: {
  label: string;
  value: number;
  danger?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-semibold tabular-nums',
          danger && 'text-destructive',
          positive && 'text-emerald-600',
        )}
      >
        {formatUGX(value)}
      </span>
    </div>
  );
}
