import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, Star, Receipt, Home, ChevronDown, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCreditAccessLimit, formatCreditAmount } from '@/hooks/useCreditAccessLimit';
import { Skeleton } from '@/components/ui/skeleton';
import { hapticTap } from '@/lib/haptics';
import { CreditRequestSheet } from '@/components/CreditRequestSheet';

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
  const [sheetOpen, setSheetOpen] = useState(false);

  const progressPercentage = Math.min((limit.totalLimit / MAX_LIMIT) * 100, 100);

  const handleRequestCredit = () => {
    if (limit.totalLimit <= 0) return;
    hapticTap();
    setSheetOpen(true);
  };

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
                <p className="text-xs text-muted-foreground">Rent Fee Available</p>
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
          <button
            onClick={handleRequestCredit}
            disabled={limit.totalLimit <= 0}
            className="w-full mt-2 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-[11px] font-bold active:scale-[0.97] transition-transform disabled:opacity-50 touch-manipulation"
          >
            <Send className="h-3 w-3" /> Apply Now
          </button>
          <CreditRequestSheet open={sheetOpen} onOpenChange={setSheetOpen} userId={userId} creditLimit={limit.totalLimit} />
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
      <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-transparent shadow-lg shadow-primary/10">
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/15 ring-1 ring-primary/20">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Your Available Loan</p>
                <p className="font-black text-2xl text-foreground leading-tight">
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
            <Progress value={progressPercentage} className="h-2.5 rounded-full" />
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

          {/* Apply Now Button */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleRequestCredit}
            disabled={limit.totalLimit <= 0}
            className="w-full relative overflow-hidden flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 rounded-2xl bg-primary text-primary-foreground text-xs sm:text-sm font-black tracking-wide disabled:opacity-50 touch-manipulation shadow-lg shadow-primary/20 active:scale-[0.97] transition-transform"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />
            <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">⚡ Apply Now</span>
            <span className="hidden sm:inline">⚡ Apply Now — Instant Decision</span>
          </motion.button>
        </CardContent>
      </Card>

      <CreditRequestSheet open={sheetOpen} onOpenChange={setSheetOpen} userId={userId} creditLimit={limit.totalLimit} />
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
