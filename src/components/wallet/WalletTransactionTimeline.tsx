import { useMemo, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Calendar,
  Landmark,
  ArrowDownToLine,
  Send,
  Banknote,
  TrendingUp,
  RotateCcw,
  ShoppingBag,
  ChevronRight,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { hapticTap } from '@/lib/haptics';

export interface TimelineTransaction {
  id: string;
  sender_id: string;
  recipient_id: string;
  amount: number;
  description: string | null;
  created_at: string;
  sender_name?: string;
  recipient_name?: string;
  recipient_phone?: string;
}

interface WalletTransactionTimelineProps {
  transactions: TimelineTransaction[];
  currentUserId: string;
  currentBalance: number;
  formatCurrency: (amount: number) => string;
  onSelectTransaction: (tx: TimelineTransaction) => void;
  onViewAll?: () => void;
}

type TabValue = 'all' | 'in' | 'out';
type CategoryFilter = 'all' | string;

interface CategoryMeta {
  label: string;
  icon: React.ElementType;
  colorClass: string;
}

function deriveCategory(description: string | null, isSent: boolean): CategoryMeta {
  const d = (description || '').toLowerCase();

  if (d.includes('deposit')) {
    return { label: 'Deposit', icon: Landmark, colorClass: 'text-primary bg-primary/10' };
  }
  if (d.includes('withdraw')) {
    return { label: 'Withdrawal', icon: ArrowDownToLine, colorClass: 'text-destructive bg-destructive/10' };
  }
  if (d.includes('rent') || d.includes('repayment')) {
    return { label: 'Rent', icon: Banknote, colorClass: 'text-primary bg-primary/10' };
  }
  if (d.includes('commission')) {
    return { label: 'Commission', icon: TrendingUp, colorClass: 'text-success bg-success/10' };
  }
  if (d.includes('refund')) {
    return { label: 'Refund', icon: RotateCcw, colorClass: 'text-warning bg-warning/10' };
  }
  if (d.includes('smartphone') || d.includes('spiro') || d.includes('bike') || d.includes('merchandise')) {
    return { label: 'Merchandise', icon: ShoppingBag, colorClass: 'text-primary bg-primary/10' };
  }
  if (d.includes('transfer')) {
    return isSent
      ? { label: 'Transfer Sent', icon: Send, colorClass: 'text-destructive bg-destructive/10' }
      : { label: 'Transfer Received', icon: ArrowDownLeft, colorClass: 'text-success bg-success/10' };
  }

  // If the description is meaningful, surface it as the category label.
  const cleanDesc = (description || '').trim();
  if (cleanDesc.length > 2 && !/^payment|transaction$/i.test(cleanDesc)) {
    return isSent
      ? { label: cleanDesc, icon: ArrowUpRight, colorClass: 'text-destructive bg-destructive/10' }
      : { label: cleanDesc, icon: ArrowDownLeft, colorClass: 'text-success bg-success/10' };
  }

  return isSent
    ? { label: 'Money Out', icon: ArrowUpRight, colorClass: 'text-destructive bg-destructive/10' }
    : { label: 'Money In', icon: ArrowDownLeft, colorClass: 'text-success bg-success/10' };
}

function getDateLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEE, MMM d, yyyy');
}

function getCategoryLabel(tx: TimelineTransaction, currentUserId: string): string {
  const isSent = tx.sender_id === currentUserId;
  return deriveCategory(tx.description, isSent).label;
}

export function WalletTransactionTimeline({
  transactions,
  currentUserId,
  currentBalance,
  formatCurrency,
  onSelectTransaction,
  onViewAll,
}: WalletTransactionTimelineProps) {
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const { runningBalances, groupedTransactions, filteredCount, availableCategories } = useMemo(() => {
    // Newest first — matches how people read their wallet activity.
    const sorted = [...transactions].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Running balance preview: anchor to the current balance and walk backwards.
    // The value shown for each transaction is the wallet balance *after* that
    // transaction occurred.
    const balances = new Map<string, number>();
    let runningBalance = currentBalance;
    for (const tx of sorted) {
      balances.set(tx.id, runningBalance);
      const isSent = tx.sender_id === currentUserId;
      const delta = isSent ? -tx.amount : tx.amount;
      runningBalance -= delta;
    }

    const filtered = sorted.filter((tx) => {
      const isSent = tx.sender_id === currentUserId;
      if (activeTab === 'in') return !isSent;
      if (activeTab === 'out') return isSent;
      return true;
    }).filter((tx) => {
      if (categoryFilter === 'all') return true;
      return getCategoryLabel(tx, currentUserId) === categoryFilter;
    });

    const categories = Array.from(
      new Set(sorted.map((tx) => getCategoryLabel(tx, currentUserId)))
    ).sort();

    const grouped: Record<string, TimelineTransaction[]> = {};
    for (const tx of filtered) {
      const dateKey = format(new Date(tx.created_at), 'yyyy-MM-dd');
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(tx);
    }

    return {
      runningBalances: balances,
      groupedTransactions: grouped,
      filteredCount: filtered.length,
      availableCategories: categories,
    };
  }, [transactions, currentUserId, currentBalance, activeTab, categoryFilter]);

  const dateEntries = useMemo(
    () =>
      Object.entries(groupedTransactions).sort(
        ([a], [b]) => new Date(b).getTime() - new Date(a).getTime()
      ),
    [groupedTransactions]
  );

  const emptyMessage =
    activeTab === 'all'
      ? 'No transactions yet'
      : activeTab === 'in'
        ? 'No cash in yet'
        : 'No cash out yet';

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-foreground">Recent Transactions</h3>
        {onViewAll && (
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              hapticTap();
              onViewAll();
            }}
            className="gap-1 h-auto p-0 text-xs text-primary font-semibold"
          >
            View All
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
        className="mb-3"
      >
        <TabsList variant="pills" className="w-full">
          <TabsTrigger value="all" variant="pills">
            All
          </TabsTrigger>
          <TabsTrigger value="in" variant="pills">
            Cash In
          </TabsTrigger>
          <TabsTrigger value="out" variant="pills">
            Cash Out
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {filteredCount === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-8 text-center text-muted-foreground">
            <Wallet className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{emptyMessage}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50 shadow-sm overflow-hidden">
          <div className="divide-y divide-border/50">
            {dateEntries.map(([dateKey, dayTransactions], dayIndex) => {
              const date = new Date(dateKey);
              const dayInTotal = dayTransactions
                .filter((tx) => tx.sender_id !== currentUserId)
                .reduce((sum, tx) => sum + tx.amount, 0);
              const dayOutTotal = dayTransactions
                .filter((tx) => tx.sender_id === currentUserId)
                .reduce((sum, tx) => sum + tx.amount, 0);

              return (
                <div key={dateKey} className="p-4">
                  {/* Date header with daily totals */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <h4 className="text-xs font-semibold text-muted-foreground">
                        {getDateLabel(date)}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-medium tabular-nums">
                      {dayInTotal > 0 && (
                        <span className="text-success">+{formatCurrency(dayInTotal)}</span>
                      )}
                      {dayOutTotal > 0 && (
                        <span className="text-destructive">-{formatCurrency(dayOutTotal)}</span>
                      )}
                    </div>
                  </div>

                  {/* Timeline items */}
                  <div className="relative pl-4">
                    {dayTransactions.map((tx, txIndex) => {
                      const isSent = tx.sender_id === currentUserId;
                      const category = deriveCategory(tx.description, isSent);
                      const Icon = category.icon;
                      const balanceAfter = runningBalances.get(tx.id) ?? 0;
                      const counterparty = isSent ? tx.recipient_name : tx.sender_name;
                      const isLast = txIndex === dayTransactions.length - 1;

                      return (
                        <button
                          key={tx.id}
                          onClick={() => {
                            hapticTap();
                            onSelectTransaction(tx);
                          }}
                          className="relative flex w-full text-left group"
                        >
                          {/* Timeline rail */}
                          <div className="absolute left-0 top-0 bottom-0 w-6 flex flex-col items-center">
                            <div
                              className={`h-2.5 w-2.5 rounded-full border-2 z-10 ${
                                isSent
                                  ? 'border-destructive bg-background'
                                  : 'border-success bg-background'
                              }`}
                            />
                            {!isLast && (
                              <div className="w-px flex-1 bg-border/60 mt-1" />
                            )}
                          </div>

                          {/* Card content */}
                          <div className="flex-1 ml-5 pb-4 last:pb-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0">
                                <div
                                  className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${category.colorClass}`}
                                >
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold text-foreground">
                                      {category.label}
                                    </p>
                                    <Badge
                                      variant="secondary"
                                      className="text-[9px] px-1.5 py-0 h-4 font-medium"
                                    >
                                      {isSent ? 'Sent' : 'Received'}
                                    </Badge>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {format(new Date(tx.created_at), 'h:mm a')}
                                    {counterparty ? ` · ${counterparty}` : ''}
                                  </p>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <p
                                  className={`text-sm font-bold tabular-nums ${
                                    isSent ? 'text-destructive' : 'text-success'
                                  }`}
                                >
                                  {isSent ? '-' : '+'}
                                  {formatCurrency(tx.amount)}
                                </p>
                                <p className="text-[10px] text-muted-foreground tabular-nums">
                                  <span className="sr-only">Balance after </span>
                                  <span aria-hidden="true">Bal </span>
                                  {formatCurrency(balanceAfter)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
