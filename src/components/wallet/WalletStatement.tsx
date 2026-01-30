import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FileText,
  TrendingUp,
  TrendingDown,
  Users,
  CheckCircle2,
  Gift,
  ArrowDownToLine,
  Banknote,
  Calendar
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';

interface StatementEntry {
  id: string;
  date: string;
  type: 'credit' | 'debit';
  category: string;
  description: string;
  amount: number;
  source_name?: string;
  balance_after?: number;
}

export function WalletStatement() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<StatementEntry[]>([]);
  const [totals, setTotals] = useState({ totalIn: 0, totalOut: 0 });

  useEffect(() => {
    if (open && user) {
      fetchStatement();
    }
  }, [open, user]);

  const fetchStatement = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const allEntries: StatementEntry[] = [];

      // 1. Fetch referral bonuses (as referrer - earned 500 each)
      const { data: referralsAsReferrer } = await supabase
        .from('referrals')
        .select('id, created_at, bonus_amount, referred_id')
        .eq('referrer_id', user.id)
        .eq('credited', true);

      // Get referred user names
      const referredIds = (referralsAsReferrer || []).map(r => r.referred_id);
      let referredNamesMap: Record<string, string> = {};
      if (referredIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', referredIds);
        referredNamesMap = (profiles || []).reduce((acc, p) => {
          acc[p.id] = p.full_name || 'User';
          return acc;
        }, {} as Record<string, string>);
      }

      for (const ref of referralsAsReferrer || []) {
        allEntries.push({
          id: `ref-${ref.id}`,
          date: ref.created_at,
          type: 'credit',
          category: 'referral_bonus',
          description: 'Referral Bonus',
          amount: ref.bonus_amount || 500,
          source_name: referredNamesMap[ref.referred_id],
        });
      }

      // 2. Fetch welcome bonus (as referred)
      const { data: welcomeBonus } = await supabase
        .from('referrals')
        .select('id, created_at, bonus_amount, referrer_id')
        .eq('referred_id', user.id)
        .eq('credited', true)
        .maybeSingle();

      if (welcomeBonus) {
        // Get referrer name
        const { data: referrerProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', welcomeBonus.referrer_id)
          .maybeSingle();

        allEntries.push({
          id: `welcome-${welcomeBonus.id}`,
          date: welcomeBonus.created_at,
          type: 'credit',
          category: 'welcome_bonus',
          description: 'Welcome Bonus',
          amount: welcomeBonus.bonus_amount || 500,
          source_name: referrerProfile?.full_name ? `Referred by ${referrerProfile.full_name}` : 'Signup reward',
        });
      }

      // 3. Fetch agent earnings (excluding referral_bonus to avoid duplicates)
      const { data: earnings } = await supabase
        .from('agent_earnings')
        .select('id, created_at, amount, earning_type, description, source_user_id')
        .eq('agent_id', user.id)
        .neq('earning_type', 'referral_bonus');

      // Get source user names
      const sourceIds = [...new Set((earnings || []).filter(e => e.source_user_id).map(e => e.source_user_id))];
      let sourceNamesMap: Record<string, string> = {};
      if (sourceIds.length > 0) {
        const { data: sourceProfiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', sourceIds);
        sourceNamesMap = (sourceProfiles || []).reduce((acc, p) => {
          acc[p.id] = p.full_name || 'User';
          return acc;
        }, {} as Record<string, string>);
      }

      for (const earning of earnings || []) {
        allEntries.push({
          id: `earning-${earning.id}`,
          date: earning.created_at,
          type: 'credit',
          category: earning.earning_type,
          description: getCategoryLabel(earning.earning_type),
          amount: earning.amount,
          source_name: earning.source_user_id ? sourceNamesMap[earning.source_user_id] : undefined,
        });
      }

      // 4. Fetch withdrawals (approved only)
      const { data: withdrawals } = await supabase
        .from('agent_commission_payouts')
        .select('id, created_at, processed_at, amount, mobile_money_provider, mobile_money_number')
        .eq('agent_id', user.id)
        .eq('status', 'approved');

      for (const w of withdrawals || []) {
        allEntries.push({
          id: `withdrawal-${w.id}`,
          date: w.processed_at || w.created_at,
          type: 'debit',
          category: 'withdrawal',
          description: 'Withdrawal',
          amount: w.amount,
          source_name: `${w.mobile_money_provider} - ${w.mobile_money_number}`,
        });
      }

      // Sort by date (oldest first for running balance calculation)
      allEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Calculate running balance
      let runningBalance = 0;
      for (const entry of allEntries) {
        if (entry.type === 'credit') {
          runningBalance += entry.amount;
        } else {
          runningBalance -= entry.amount;
        }
        entry.balance_after = Math.max(0, runningBalance);
      }

      // Reverse for display (newest first)
      allEntries.reverse();

      // Calculate totals
      const totalIn = allEntries.filter(e => e.type === 'credit').reduce((sum, e) => sum + e.amount, 0);
      const totalOut = allEntries.filter(e => e.type === 'debit').reduce((sum, e) => sum + e.amount, 0);

      setEntries(allEntries);
      setTotals({ totalIn, totalOut });
    } catch (error) {
      console.error('[WalletStatement] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'referral_bonus': return 'Referral Bonus';
      case 'welcome_bonus': return 'Welcome Bonus';
      case 'approval_bonus': return 'Approval Bonus';
      case 'commission': return 'Commission (5%)';
      case 'subagent_commission': return 'Sub-agent Commission';
      case 'referral_first_transaction': return 'First Transaction Bonus';
      case 'withdrawal': return 'Withdrawal';
      default: return category.replace(/_/g, ' ');
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'referral_bonus': return Users;
      case 'welcome_bonus': return Gift;
      case 'approval_bonus': return CheckCircle2;
      case 'commission':
      case 'subagent_commission': return TrendingUp;
      case 'referral_first_transaction': return Gift;
      case 'withdrawal': return ArrowDownToLine;
      default: return Banknote;
    }
  };

  const getCategoryColor = (category: string, type: 'credit' | 'debit') => {
    if (type === 'debit') return 'text-warning bg-warning/10';
    switch (category) {
      case 'referral_bonus': return 'text-blue-500 bg-blue-500/10';
      case 'welcome_bonus': return 'text-pink-500 bg-pink-500/10';
      case 'approval_bonus': return 'text-success bg-success/10';
      case 'commission':
      case 'subagent_commission': return 'text-purple-500 bg-purple-500/10';
      case 'referral_first_transaction': return 'text-amber-500 bg-amber-500/10';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  // Group entries by date
  const groupedEntries = entries.reduce((groups, entry) => {
    const dateKey = format(new Date(entry.date), 'yyyy-MM-dd');
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(entry);
    return groups;
  }, {} as Record<string, StatementEntry[]>);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 text-xs font-semibold"
        >
          <FileText className="h-3.5 w-3.5" />
          Statement
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Wallet Statement
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : (
          <ScrollArea className="h-[calc(90vh-100px)] py-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-4 rounded-2xl bg-success/10 border border-success/20">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <span className="text-xs font-semibold text-success">Total In</span>
                </div>
                <p className="text-xl font-bold text-success">+{formatUGX(totals.totalIn)}</p>
              </div>
              <div className="p-4 rounded-2xl bg-warning/10 border border-warning/20">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="h-4 w-4 text-warning" />
                  <span className="text-xs font-semibold text-warning">Total Out</span>
                </div>
                <p className="text-xl font-bold text-warning">-{formatUGX(totals.totalOut)}</p>
              </div>
            </div>

            {/* Timeline */}
            {Object.keys(groupedEntries).length > 0 ? (
              <div className="space-y-6">
                {Object.entries(groupedEntries).map(([dateKey, dayEntries]) => (
                  <div key={dateKey}>
                    {/* Date Header */}
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-bold text-muted-foreground">
                        {format(new Date(dateKey), 'EEEE, MMM d, yyyy')}
                      </span>
                    </div>

                    {/* Day's Entries */}
                    <div className="space-y-2 pl-2 border-l-2 border-muted ml-2">
                      {dayEntries.map((entry) => {
                        const Icon = getCategoryIcon(entry.category);
                        const colorClass = getCategoryColor(entry.category, entry.type);
                        
                        return (
                          <div 
                            key={entry.id}
                            className="relative pl-4"
                          >
                            {/* Timeline dot */}
                            <div className={`absolute -left-[9px] top-4 h-4 w-4 rounded-full border-2 border-background ${
                              entry.type === 'credit' ? 'bg-success' : 'bg-warning'
                            }`} />

                            <div className="p-3 rounded-xl bg-card border shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                  <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
                                    <Icon className="h-5 w-5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-semibold text-sm">{entry.description}</p>
                                      <Badge 
                                        variant="outline" 
                                        className={`text-[10px] px-1.5 py-0 shrink-0 ${
                                          entry.type === 'credit' 
                                            ? 'border-success/30 text-success' 
                                            : 'border-warning/30 text-warning'
                                        }`}
                                      >
                                        {entry.type === 'credit' ? 'IN' : 'OUT'}
                                      </Badge>
                                    </div>
                                    {entry.source_name && (
                                      <p className="text-xs text-muted-foreground truncate">
                                        {entry.type === 'credit' ? 'From: ' : ''}{entry.source_name}
                                      </p>
                                    )}
                                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                      {format(new Date(entry.date), 'h:mm a')}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className={`font-bold ${
                                    entry.type === 'credit' ? 'text-success' : 'text-warning'
                                  }`}>
                                    {entry.type === 'credit' ? '+' : '-'}{formatUGX(entry.amount)}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    Bal: {formatUGX(entry.balance_after || 0)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="font-semibold text-muted-foreground">No transactions yet</p>
                <p className="text-sm text-muted-foreground/70">
                  Your wallet activity will appear here
                </p>
              </div>
            )}
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
