import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight, 
  Calendar, Loader2 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { LedgerEntryDetailDrawer } from './LedgerEntryDetailDrawer';

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

interface MonthGroup {
  key: string;
  label: string;
  entries: LedgerEntry[];
  totalIn: number;
  totalOut: number;
}

const CATEGORY_LABELS: Record<string, string> = {
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
  rent_facilitation_payout: 'Rent Facilitation',
  supporter_platform_rewards: 'Platform Rewards',
  agent_commission_payout: 'Commission Payouts',
  transaction_platform_expenses: 'Platform Expenses',
  operational_expenses: 'Operating Expenses',
  withdrawal: 'Withdrawals',
  transfer_out: 'Transfers Out',
  transfer_in: 'Transfers In',
  rent_obligation: 'Rent Obligations',
};

function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function groupByCategory(items: LedgerEntry[]): CategoryGroup[] {
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
}

export function WalletLedgerStatement() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchLedger = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    
    const { data, error } = await supabase
      .from('general_ledger')
      .select('id, transaction_date, amount, direction, category, description, reference_id, linked_party, source_table')
      .eq('user_id', user.id)
      .in('ledger_scope', ['wallet', 'bridge'])
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('[WalletLedgerStatement] Error:', error);
    } else {
      setEntries(data || []);
      // Auto-expand current month
      const now = format(new Date(), 'yyyy-MM');
      setExpandedMonths(new Set([now]));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  // Group entries by month
  const monthGroups: MonthGroup[] = (() => {
    const grouped: Record<string, LedgerEntry[]> = {};
    entries.forEach(e => {
      const key = format(parseISO(e.transaction_date), 'yyyy-MM');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(e);
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, entries]) => ({
        key,
        label: format(parseISO(key + '-01'), 'MMMM yyyy'),
        entries,
        totalIn: entries.filter(e => e.direction === 'cash_in').reduce((s, e) => s + Number(e.amount), 0),
        totalOut: entries.filter(e => e.direction === 'cash_out').reduce((s, e) => s + Number(e.amount), 0),
      }));
  })();

  const allTimeIn = entries.filter(e => e.direction === 'cash_in').reduce((s, e) => s + Number(e.amount), 0);
  const allTimeOut = entries.filter(e => e.direction === 'cash_out').reduce((s, e) => s + Number(e.amount), 0);

  const toggleMonth = (key: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderCategoryGroup = (group: CategoryGroup, direction: 'cash_in' | 'cash_out', monthKey: string) => {
    const key = `${monthKey}-${direction}-${group.category}`;
    const isOpen = expandedCategories.has(key);
    const colorClass = direction === 'cash_in' ? 'text-success' : 'text-destructive';

    return (
      <Collapsible key={key} open={isOpen} onOpenChange={() => toggleCategory(key)}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between py-2 px-1 hover:bg-muted/30 rounded-lg transition-colors">
            <div className="flex items-center gap-2">
              {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <span className="text-xs font-medium">{group.label}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{group.entries.length}</Badge>
            </div>
            <span className={cn("text-xs font-semibold font-mono", colorClass)}>{formatUGX(group.total)}</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-6 mb-2 space-y-1 border-l-2 border-border pl-3">
            {group.entries.slice(0, 10).map(entry => (
              <div key={entry.id} 
                className="flex items-center justify-between py-1 text-[11px] cursor-pointer hover:bg-muted/40 rounded px-1 -mx-1 transition-colors"
                onClick={() => { setSelectedEntryId(entry.id); setDetailOpen(true); }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-muted-foreground truncate">{entry.description || entry.source_table.replace(/_/g, ' ')}</p>
                  <p className="text-muted-foreground/60 text-[10px]">
                    {format(new Date(entry.transaction_date), 'MMM d, HH:mm')}
                    {entry.reference_id && ` • ${entry.reference_id}`}
                  </p>
                </div>
                <span className={cn("font-mono font-medium ml-2 shrink-0", colorClass)}>{formatUGX(Number(entry.amount))}</span>
              </div>
            ))}
            {group.entries.length > 10 && (
              <p className="text-[10px] text-muted-foreground/60 py-1">+{group.entries.length - 10} more</p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderMonth = (month: MonthGroup) => {
    const isOpen = expandedMonths.has(month.key);
    const cashIn = month.entries.filter(e => e.direction === 'cash_in');
    const cashOut = month.entries.filter(e => e.direction === 'cash_out');
    const net = month.totalIn - month.totalOut;

    return (
      <Collapsible key={month.key} open={isOpen} onOpenChange={() => toggleMonth(month.key)}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between py-3 px-2 hover:bg-muted/40 rounded-xl transition-colors">
            <div className="flex items-center gap-2">
              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <div className="text-left">
                <p className="text-sm font-semibold">{month.label}</p>
                <p className="text-[10px] text-muted-foreground">{month.entries.length} transactions</p>
              </div>
            </div>
            <div className="text-right">
              <p className={cn("text-sm font-bold font-mono", net >= 0 ? "text-success" : "text-destructive")}>
                {net >= 0 ? '+' : ''}{formatUGX(net)}
              </p>
              <div className="flex gap-2 text-[10px] text-muted-foreground">
                <span className="text-success">↓{formatUGX(month.totalIn)}</span>
                <span className="text-destructive">↑{formatUGX(month.totalOut)}</span>
              </div>
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-2 pl-4 border-l-2 border-border/50 space-y-3 pb-3">
            {/* Month summary */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="bg-success/5 border border-success/20 rounded-lg p-2">
                <div className="flex items-center gap-1 mb-0.5">
                  <ArrowDownLeft className="h-3 w-3 text-success" />
                  <span className="text-[10px] uppercase tracking-wider text-success font-semibold">In</span>
                </div>
                <p className="text-sm font-bold text-success font-mono">{formatUGX(month.totalIn)}</p>
              </div>
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-2">
                <div className="flex items-center gap-1 mb-0.5">
                  <ArrowUpRight className="h-3 w-3 text-destructive" />
                  <span className="text-[10px] uppercase tracking-wider text-destructive font-semibold">Out</span>
                </div>
                <p className="text-sm font-bold text-destructive font-mono">{formatUGX(month.totalOut)}</p>
              </div>
            </div>

            {/* Cash In breakdown */}
            {cashIn.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-0.5 px-1">
                  <ArrowDownLeft className="h-3 w-3 text-success" />
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-success">Money In</h4>
                </div>
                {groupByCategory(cashIn).map(g => renderCategoryGroup(g, 'cash_in', month.key))}
              </div>
            )}

            {/* Cash Out breakdown */}
            {cashOut.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-0.5 px-1">
                  <ArrowUpRight className="h-3 w-3 text-destructive" />
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-destructive">Money Out</h4>
                </div>
                {groupByCategory(cashOut).map(g => renderCategoryGroup(g, 'cash_out', month.key))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <>
    <Card className="border-border/50 rounded-2xl">
      <CardContent className="p-4">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-3">
          Wallet Statement
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No wallet activity yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {/* All-time summary */}
            <div className="flex items-center justify-between px-2 py-2 mb-2 bg-muted/30 rounded-xl">
              <span className="text-xs font-semibold text-muted-foreground">All-Time Net</span>
              <div className="text-right">
                <span className={cn("font-mono font-bold text-sm", allTimeIn - allTimeOut >= 0 ? "text-success" : "text-destructive")}>
                  {allTimeIn - allTimeOut >= 0 ? '+' : ''}{formatUGX(allTimeIn - allTimeOut)}
                </span>
              </div>
            </div>

            {/* Monthly breakdown */}
            {monthGroups.map(renderMonth)}
          </div>
        )}
      </CardContent>
    </Card>

    <LedgerEntryDetailDrawer
      entryId={selectedEntryId}
      open={detailOpen}
      onOpenChange={setDetailOpen}
    />
    </>
  );
}
