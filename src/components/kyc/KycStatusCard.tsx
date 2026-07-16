import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, ShieldAlert, ShieldCheck, Lock } from 'lucide-react';
import { useKycLimits } from '@/hooks/useKycLimits';
import { formatUGX } from '@/lib/rentCalculations';

export function KycStatusCard({ compact = false }: { compact?: boolean }) {
  const { limits, usage, loading } = useKycLimits();

  if (loading || !limits || !usage) {
    return (
      <Card className="p-4 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded mb-2" />
        <div className="h-3 w-48 bg-muted rounded" />
      </Card>
    );
  }

  const Icon = limits.frozen ? Lock : limits.kyc_level >= 2 ? ShieldCheck : Shield;
  const tone = limits.frozen
    ? 'text-destructive'
    : limits.kyc_level >= 2
      ? 'text-success'
      : 'text-warning';

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${tone}`} />
          <div>
            <div className="font-medium text-sm">
              KYC Level {limits.kyc_level}
              {limits.frozen && (
                <Badge variant="destructive" className="ml-2 text-[10px]">Frozen</Badge>
              )}
            </div>
            {!compact && (
              <div className="text-xs text-muted-foreground">
                {limits.kyc_level === 1
                  ? 'Basic verification. Verify identity to raise limits.'
                  : limits.kyc_level === 2
                    ? 'Verified account.'
                    : 'Enhanced verification.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {limits.frozen ? (
        <div className="text-xs text-destructive flex items-start gap-2 p-2 rounded bg-destructive/10">
          <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>Account frozen pending review. Withdrawals blocked. Contact support.</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded bg-muted/40">
            <div className="text-muted-foreground">Daily amount</div>
            <div className="font-medium">{formatUGX(usage.remainingAmount)}</div>
            <div className="text-[10px] text-muted-foreground">
              of {formatUGX(limits.daily_withdrawal_cap_ugx)} left
            </div>
          </div>
          <div className="p-2 rounded bg-muted/40">
            <div className="text-muted-foreground">Withdrawals</div>
            <div className="font-medium">
              {usage.remainingCount} / {limits.daily_withdrawal_count_cap}
            </div>
            <div className="text-[10px] text-muted-foreground">left today</div>
          </div>
        </div>
      )}

      {limits.kyc_level === 1 && !limits.frozen && (
        <Button size="sm" variant="outline" className="w-full" disabled>
          Verify identity to raise limits (coming soon)
        </Button>
      )}
    </Card>
  );
}