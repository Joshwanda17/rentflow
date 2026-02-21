import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight, 
  Calendar, Loader2, RefreshCw 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';

interface LedgerEntry {
  id: string;
  transaction_date: string;
  amount: number;
  direction: string;
  category: string;
  description: string | null;
  reference_id: string | null;
  linked_party: string | null;
  source_table: string;
}

interface CategoryGroup {
  category: string;
  label: string;
  total: number;
  entries: LedgerEntry[];
}

const CATEGORY_LABELS: Record<string, string> = {
  // Cash In
  tenant_access_fee: 'Access Fees',
  tenant_request_fee: 'Request Fees',
  rent_repayment: 'Rent Repayments',
  supporter_facilitation_capital: 'Supporter Capital',
  agent_remittance: 'Agent Remittance',
  platform_service_income: 'Service Income',
  deposit: 'Deposits',
  referral_bonus: 'Referral Bonuses',
  agent_commission: 'Agent Commissions',
  first_transaction_bonus: 'First Transaction Bonus',
  opening_balance: 'Opening Balance',
  // Cash Out
  rent_facilitation_payout: 'Rent Facilitation',
  supporter_platform_rewards: 'Platform Rewards',
  agent_commission_payout: 'Commission Payouts',
  transaction_platform_expenses: 'Platform Expenses',
  operational_expenses: 'Operating Expenses',
  withdrawal: 'Withdrawals',
  transfer_out: 'Transfers Out',
  transfer_in: 'Transfers In',
};

function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function WalletLedgerStatement() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const currentMonth = subMonths(new Date(), monthOffset);
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const fetchLedger = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    
    const { data, error } = await supabase
      .from('general_ledger')
      .select('id, transaction_date, amount, direction, category, description, reference_id, linked_party, source_table')
      .eq('user_id', user.id)
      .gte('transaction_date', monthStart.toISOString())
      .lte('transaction_date', monthEnd.toISOString())
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('[WalletLedgerStatement] Error:', error);
    } else {
      setEntries(data || []);
    }
    setLoading(false);
  }, [user, monthStart.toISOString(), monthEnd.toISOString()]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const cashIn = entries.filter(e => e.direction === 'cash_in');
  const cashOut = entries.filter(e => e.direction === 'cash_out');

  const totalIn = cashIn.reduce((s, e) => s + Number(e.amount), 0);
  const totalOut = cashOut.reduce((s, e) => s + Number(e.amount), 0);

  const groupByCategory = (items: LedgerEntry[]): CategoryGroup[] => {
    const groups: Record<string, LedgerEntry[]> = {};
    items.forEach(e => {
      if (!groups[e.category]) groups[e.category] = [];
      groups[e.category].push(e);
    });
    return Object.entries(groups)
      .map(([category, entries]) => ({
        category,
        label: getCategoryLabel(category),
        total: entries.reduce((s, e) => s + Number(e.amount), 0),
        entries,
      }))
      .sort((a, b) => b.total - a.total);
  };

  const cashInGroups = groupByCategory(cashIn);
  const cashOutGroups = groupByCategory(cashOut);

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderCategoryGroup = (group: CategoryGroup, direction: 'cash_in' | 'cash_out') => {
    const key = `${direction}-${group.category}`;
    const isOpen = expandedCategories.has(key);
    const colorClass = direction === 'cash_in' ? 'text-success' : 'text-destructive';

    return (
      <Collapsible key={key} open={isOpen} onOpenChange={() => toggleCategory(key)}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between py-2.5 px-1 hover:bg-muted/30 rounded-lg transition-colors">
            <div className="flex items-center gap-2">
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">{group.label}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {group.entries.length}
              </Badge>
            </div>
            <span className={cn("text-sm font-semibold font-mono", colorClass)}>
              {formatUGX(group.total)}
            </span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-6 mb-2 space-y-1 border-l-2 border-border pl-3">
            {group.entries.slice(0, 10).map(entry => (
              <div key={entry.id} className="flex items-center justify-between py-1.5 text-xs">
                <div className="flex-1 min-w-0">
                  <p className="text-muted-foreground truncate">
                    {entry.description || entry.source_table.replace(/_/g, ' ')}
                  </p>
                  <p className="text-muted-foreground/60 text-[10px]">
                    {format(new Date(entry.transaction_date), 'MMM d, HH:mm')}
                    {entry.reference_id && ` • ${entry.reference_id}`}
                  </p>
                </div>
                <span className={cn("font-mono font-medium ml-2 shrink-0", colorClass)}>
                  {formatUGX(Number(entry.amount))}
                </span>
              </div>
            ))}
            {group.entries.length > 10 && (
              <p className="text-[10px] text-muted-foreground/60 py-1">
                +{group.entries.length - 10} more entries
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <Card className="border-border/50 rounded-2xl">
      <CardContent className="p-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
            Wallet Statement
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setMonthOffset(prev => prev + 1)}
            >
              <ChevronDown className="h-3.5 w-3.5 rotate-90" />
            </Button>
            <span className="text-xs font-medium min-w-[80px] text-center">
              {format(currentMonth, 'MMM yyyy')}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={monthOffset === 0}
              onClick={() => setMonthOffset(prev => Math.max(0, prev - 1))}
            >
              <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No activity in {format(currentMonth, 'MMMM yyyy')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-success/5 border border-success/20 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowDownLeft className="h-3.5 w-3.5 text-success" />
                  <span className="text-[10px] uppercase tracking-wider text-success font-semibold">Money In</span>
                </div>
                <p className="text-lg font-bold text-success font-mono">{formatUGX(totalIn)}</p>
              </div>
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowUpRight className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-[10px] uppercase tracking-wider text-destructive font-semibold">Money Out</span>
                </div>
                <p className="text-lg font-bold text-destructive font-mono">{formatUGX(totalOut)}</p>
              </div>
            </div>

            {/* Net change */}
            <div className="flex items-center justify-between px-1 py-2 border-y border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Net Change</span>
              <span className={cn(
                "font-mono font-bold text-sm",
                totalIn - totalOut >= 0 ? "text-success" : "text-destructive"
              )}>
                {totalIn - totalOut >= 0 ? '+' : ''}{formatUGX(totalIn - totalOut)}
              </span>
            </div>

            {/* Cash In breakdown */}
            {cashInGroups.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1 px-1">
                  <ArrowDownLeft className="h-3.5 w-3.5 text-success" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-success">Money In</h4>
                </div>
                <div className="space-y-0.5">
                  {cashInGroups.map(g => renderCategoryGroup(g, 'cash_in'))}
                </div>
                <div className="flex justify-between px-1 pt-2 border-t border-success/20 mt-1">
                  <span className="text-xs font-semibold text-success">Total In</span>
                  <span className="text-xs font-bold font-mono text-success">{formatUGX(totalIn)}</span>
                </div>
              </div>
            )}

            {/* Cash Out breakdown */}
            {cashOutGroups.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1 px-1">
                  <ArrowUpRight className="h-3.5 w-3.5 text-destructive" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-destructive">Money Out</h4>
                </div>
                <div className="space-y-0.5">
                  {cashOutGroups.map(g => renderCategoryGroup(g, 'cash_out'))}
                </div>
                <div className="flex justify-between px-1 pt-2 border-t border-destructive/20 mt-1">
                  <span className="text-xs font-semibold text-destructive">Total Out</span>
                  <span className="text-xs font-bold font-mono text-destructive">{formatUGX(totalOut)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
