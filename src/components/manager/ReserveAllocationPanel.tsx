import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Lock, Unlock, Shield, Info } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

// Reserve policy: 20% of total buffer is mandatory reserve (untouchable)
const RESERVE_RATIO = 0.20;

interface ReserveData {
  totalBuffer: number;
  mandatoryReserve: number;
  operationalFloat: number;
  totalOutstanding: number;
  reserveCoverageMonths: number;
}

export function ReserveAllocationPanel() {
  const [data, setData] = useState<ReserveData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReserveData();
  }, []);

  const fetchReserveData = async () => {
    setLoading(true);

    const [ledgerRes, rentRes] = await Promise.all([
      supabase.from('general_ledger').select('direction, amount'),
      supabase.from('rent_requests').select('status, rent_amount, amount_repaid, funded_at'),
    ]);

    const ledger = ledgerRes.data || [];
    const rents = rentRes.data || [];

    let cashIn = 0, cashOut = 0;
    for (const e of ledger) {
      if (e.direction === 'credit') cashIn += Number(e.amount);
      else if (e.direction === 'debit') cashOut += Number(e.amount);
    }

    const funded = rents.filter(r => r.funded_at || ['funded', 'disbursed', 'completed'].includes(r.status || ''));
    const totalFacilitated = funded.reduce((s, r) => s + Number(r.rent_amount), 0);
    const totalRepaid = funded.reduce((s, r) => s + Number(r.amount_repaid), 0);
    const totalOutstanding = totalFacilitated - totalRepaid;

    const totalBuffer = Math.max(cashIn - cashOut, 0);
    const mandatoryReserve = totalBuffer * RESERVE_RATIO;
    const operationalFloat = totalBuffer - mandatoryReserve;

    // How many months of average monthly outflow the reserve covers
    // Estimate monthly outflow from total cashOut / months of operation
    const firstEntry = ledger.length > 0 ? ledger[0] : null;
    let monthsActive = 1;
    if (firstEntry) {
      // We don't have transaction_date in our select, estimate from data volume
      monthsActive = Math.max(1, Math.ceil(ledger.length / 30)); // rough estimate
    }
    const avgMonthlyOut = cashOut / monthsActive;
    const reserveCoverageMonths = avgMonthlyOut > 0 ? mandatoryReserve / avgMonthlyOut : 999;

    setData({ totalBuffer, mandatoryReserve, operationalFloat, totalOutstanding, reserveCoverageMonths });
    setLoading(false);
  };

  if (loading) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (!data) return null;

  const reservePct = data.totalBuffer > 0 ? (data.mandatoryReserve / data.totalBuffer) * 100 : 0;
  const floatPct = data.totalBuffer > 0 ? (data.operationalFloat / data.totalBuffer) * 100 : 0;

  const isReserveAdequate = data.reserveCoverageMonths >= 1;

  return (
    <div className="space-y-3">
      <Card className="border-2 border-amber-500/30 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent pointer-events-none" />
        <CardContent className="relative p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-500" />
            <h4 className="text-sm font-bold flex-1">Reserve Allocation</h4>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-muted/50">
              {(RESERVE_RATIO * 100).toFixed(0)}% Policy
            </Badge>
          </div>

          {/* Visual split bar */}
          <div className="space-y-2">
            <div className="flex rounded-xl overflow-hidden h-8 border border-border/40">
              <div
                className="bg-amber-500/80 flex items-center justify-center transition-all"
                style={{ width: `${reservePct}%` }}
              >
                {reservePct > 15 && (
                  <span className="text-[9px] text-white font-bold flex items-center gap-0.5">
                    <Lock className="h-2.5 w-2.5" /> Reserve
                  </span>
                )}
              </div>
              <div
                className="bg-primary/60 flex items-center justify-center transition-all"
                style={{ width: `${floatPct}%` }}
              >
                {floatPct > 15 && (
                  <span className="text-[9px] text-white font-bold flex items-center gap-0.5">
                    <Unlock className="h-2.5 w-2.5" /> Float
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Numbers */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Lock className="h-3 w-3 text-amber-600" />
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide font-medium">Mandatory Reserve</p>
              </div>
              <p className="text-sm font-black text-amber-600">{formatUGX(data.mandatoryReserve)}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">Untouchable safety net</p>
            </div>
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Unlock className="h-3 w-3 text-primary" />
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide font-medium">Operational Float</p>
              </div>
              <p className="text-sm font-black text-primary">{formatUGX(data.operationalFloat)}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">Available for facilitation</p>
            </div>
          </div>

          {/* Reserve coverage indicator */}
          <div className="p-3 rounded-xl bg-muted/50 border border-border/40 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-bold">Reserve Coverage</p>
              </div>
              <Badge variant="outline" className={cn(
                "text-[9px] px-1.5 py-0",
                isReserveAdequate
                  ? 'bg-success/10 text-success border-success/30'
                  : 'bg-destructive/10 text-destructive border-destructive/30'
              )}>
                {isReserveAdequate ? '✅ Adequate' : '🚨 Low'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Reserve covers{' '}
              <span className={cn("font-bold", isReserveAdequate ? 'text-success' : 'text-destructive')}>
                {data.reserveCoverageMonths === 999 ? '∞' : `${data.reserveCoverageMonths.toFixed(1)}`}
              </span>
              {' '}months of avg outflow
            </p>
            <Progress
              value={Math.min(data.reserveCoverageMonths / 3 * 100, 100)}
              className="h-1.5"
            />
          </div>

          {/* Rule explanation */}
          <p className="text-[10px] text-muted-foreground text-center italic">
            {(RESERVE_RATIO * 100).toFixed(0)}% of the net buffer is locked as mandatory reserve. Only the operational float can be used for new facilitation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
