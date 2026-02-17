import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Star, Receipt, Home, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCreditAccessLimit, formatCreditAmount } from '@/hooks/useCreditAccessLimit';
import { Skeleton } from '@/components/ui/skeleton';

interface CreditAccessCardProps {
  userId: string;
  /** Show breakdown details */
  showBreakdown?: boolean;
  /** Compact version for other dashboards */
  compact?: boolean;
}

const MAX_LIMIT = 30_000_000;
const MIN_LIMIT = 30_000;

export function CreditAccessCard({ userId, showBreakdown = true, compact = false }: CreditAccessCardProps) {
  const { limit, loading } = useCreditAccessLimit(userId);
  const [currency, setCurrency] = useState('UGX');
  const [expanded, setExpanded] = useState(false);

  const progressPercentage = Math.min((limit.totalLimit / MAX_LIMIT) * 100, 100);

  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-2 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const currencyOptions = ['UGX', 'USD', 'EUR', 'GBP'];

  if (compact) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Credit Access</p>
                <p className="font-bold text-sm text-primary">
                  {formatCreditAmount(limit.totalLimit, currency)}
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              {currencyOptions.map(c => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium transition-colors ${
                    currency === c 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <Progress value={progressPercentage} className="h-1 mt-2" />
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent">
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Your Credit Access</p>
                <p className="font-bold text-xl text-foreground">
                  {formatCreditAmount(limit.totalLimit, currency)}
                </p>
              </div>
            </div>
            {/* Currency Switcher */}
            <div className="flex flex-wrap gap-1 max-w-[120px] justify-end">
              {currencyOptions.map(c => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`text-[10px] px-2 py-1 rounded-full font-semibold transition-colors ${
                    currency === c 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <Progress value={progressPercentage} className="h-2" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{formatCreditAmount(MIN_LIMIT, currency)}</span>
              <span>{formatCreditAmount(MAX_LIMIT, currency)}</span>
            </div>
          </div>

          {/* Breakdown Toggle */}
          {showBreakdown && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              <span className="font-medium">How to increase your limit</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 pt-1">
                  <BreakdownRow
                    icon={<Star className="h-3.5 w-3.5 text-yellow-500" />}
                    label="Landlord Ratings"
                    value={limit.bonusFromRatings}
                    currency={currency}
                    tip="Get good ratings from your landlord"
                  />
                  <BreakdownRow
                    icon={<Receipt className="h-3.5 w-3.5 text-blue-500" />}
                    label="Rent Receipts Posted"
                    value={limit.bonusFromReceipts}
                    currency={currency}
                    tip="Post verified rent payment receipts"
                  />
                  <BreakdownRow
                    icon={<TrendingUp className="h-3.5 w-3.5 text-green-500" />}
                    label="Rent Access History"
                    value={limit.bonusFromRentHistory}
                    currency={currency}
                    tip="Complete rent access requests on time"
                  />
                  <BreakdownRow
                    icon={<Home className="h-3.5 w-3.5 text-purple-500" />}
                    label="Landlord Rent Collected"
                    value={limit.bonusFromLandlordRent}
                    currency={currency}
                    tip="Register properties & tenants as a landlord"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Auto-qualify badge */}
          <div className="flex justify-center">
            <Badge variant="secondary" className="text-[10px] bg-success/10 text-success border-success/20">
              ✓ Auto-qualified • No application needed
            </Badge>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function BreakdownRow({ 
  icon, label, value, currency, tip 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: number; 
  currency: string; 
  tip: string;
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{label}</p>
        <p className="text-[10px] text-muted-foreground">{tip}</p>
      </div>
      <span className={`text-xs font-bold shrink-0 ${value > 0 ? 'text-success' : 'text-muted-foreground'}`}>
        +{formatCreditAmount(value, currency)}
      </span>
    </div>
  );
}
