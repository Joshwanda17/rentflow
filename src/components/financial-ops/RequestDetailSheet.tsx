import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { format, formatDistanceToNow } from 'date-fns';
import {
  User, Phone, Wallet, ArrowDownLeft, ArrowUpRight, Shield,
  Calendar, MapPin, MessageSquare, ExternalLink, Copy, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';

interface RequestDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  requestType: 'deposits' | 'withdrawals' | 'wallet_withdrawals' | 'wallet_ops';
  requestData: any;
}

interface UserDetail {
  id: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
  created_at: string;
  last_active_at: string | null;
  city: string | null;
  country: string | null;
}

interface WalletInfo {
  balance: number;
}

interface RecentTx {
  id: string;
  amount: number;
  direction: string;
  category: string;
  description: string | null;
  transaction_date: string;
}

interface UserRole {
  role: string;
}

export function RequestDetailSheet({ open, onOpenChange, userId, requestType, requestData }: RequestDetailSheetProps) {
  const [profile, setProfile] = useState<UserDetail | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [recentTxns, setRecentTxns] = useState<RecentTx[]>([]);
  const [depositHistory, setDepositHistory] = useState<{ total: number; count: number; approved: number; rejected: number }>({ total: 0, count: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);

    const fetchAll = async () => {
      const [profileRes, walletRes, rolesRes, txRes, depositRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, phone, avatar_url, created_at, last_active_at, city, country').eq('id', userId).single(),
        supabase.from('wallets').select('balance').eq('user_id', userId).single(),
        supabase.from('user_roles').select('role').eq('user_id', userId),
        supabase.from('general_ledger')
          .select('id, amount, direction, category, description, transaction_date')
          .eq('user_id', userId)
          .eq('ledger_scope', 'wallet')
          .order('transaction_date', { ascending: false })
          .limit(15),
        supabase.from('deposit_requests')
          .select('amount, status')
          .eq('user_id', userId),
      ]);

      setProfile(profileRes.data as UserDetail | null);
      setWallet(walletRes.data as WalletInfo | null);
      setRoles((rolesRes.data as UserRole[]) || []);
      setRecentTxns((txRes.data as RecentTx[]) || []);

      const deps = (depositRes.data || []) as { amount: number; status: string }[];
      setDepositHistory({
        total: deps.reduce((s, d) => s + d.amount, 0),
        count: deps.length,
        approved: deps.filter(d => d.status === 'approved').length,
        rejected: deps.filter(d => d.status === 'rejected').length,
      });

      setLoading(false);
    };

    fetchAll();
  }, [open, userId]);

  const copyId = () => {
    if (userId) {
      navigator.clipboard.writeText(userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('User ID copied');
    }
  };

  const openWhatsApp = () => {
    if (profile?.phone) {
      const phone = profile.phone.replace(/^0/, '256');
      window.open(`https://wa.me/${phone}`, '_blank');
    }
  };

  const getRequestSummary = () => {
    if (!requestData) return null;
    if (requestType === 'deposits') {
      return {
        label: 'Deposit Request',
        fields: [
          { key: 'Amount', value: formatUGX(requestData.amount) },
          { key: 'Provider', value: requestData.provider?.toUpperCase() || '—' },
          { key: 'Transaction ID (hint)', value: requestData.transaction_id ? `••••${requestData.transaction_id.slice(-2)}` : '—' },
          { key: 'Date', value: requestData.transaction_date ? format(new Date(requestData.transaction_date), 'MMM d, yyyy HH:mm') : '—' },
          { key: 'Notes', value: requestData.notes || '—' },
          { key: 'Submitted', value: requestData.created_at ? formatDistanceToNow(new Date(requestData.created_at), { addSuffix: true }) : '—' },
        ],
      };
    }
    if (requestType === 'withdrawals') {
      return {
        label: 'Investment Withdrawal',
        fields: [
          { key: 'Amount', value: formatUGX(requestData.amount) },
          { key: 'Reason', value: requestData.reason || '—' },
          { key: 'Earliest Process Date', value: requestData.earliest_process_date ? format(new Date(requestData.earliest_process_date), 'MMM d, yyyy') : '—' },
          { key: 'Requested', value: requestData.requested_at ? formatDistanceToNow(new Date(requestData.requested_at), { addSuffix: true }) : '—' },
        ],
      };
    }
    if (requestType === 'wallet_withdrawals') {
      const method = requestData.payout_method || 'mobile_money';
      const payoutFields = method === 'bank_transfer'
        ? [
            { key: 'Payout Method', value: '🏦 Bank Transfer' },
            { key: 'Bank', value: requestData.bank_name || '—' },
            { key: 'Account Name', value: requestData.bank_account_name || '—' },
            { key: 'Account Number', value: requestData.bank_account_number || '—' },
          ]
        : method === 'cash'
        ? [
            { key: 'Payout Method', value: '💵 Cash at Agent' },
            { key: 'Agent Location', value: requestData.agent_location || '—' },
          ]
        : [
            { key: 'Payout Method', value: '📱 Mobile Money' },
            { key: 'Provider', value: (requestData.mobile_money_provider || '—').toUpperCase() },
            { key: 'MoMo Number', value: requestData.mobile_money_number || '—' },
            { key: 'MoMo Name', value: requestData.mobile_money_name || '—' },
          ];
      return {
        label: 'Wallet Withdrawal',
        fields: [
          { key: 'Amount', value: formatUGX(requestData.amount) },
          ...payoutFields,
          { key: 'Status', value: (requestData.status || '—').replace(/_/g, ' ').toUpperCase() },
          { key: 'Submitted', value: requestData.created_at ? formatDistanceToNow(new Date(requestData.created_at), { addSuffix: true }) : '—' },
        ],
      };
    }
    return {
      label: 'Wallet Operation',
      fields: [
        { key: 'Amount', value: formatUGX(requestData.amount) },
        { key: 'Category', value: (requestData.category || '').replace(/_/g, ' ') },
        { key: 'Direction', value: requestData.direction === 'cash_in' ? '↓ Cash In' : '↑ Cash Out' },
        { key: 'Description', value: requestData.description || '—' },
        { key: 'Source', value: requestData.source_table || '—' },
        { key: 'Submitted', value: requestData.created_at ? formatDistanceToNow(new Date(requestData.created_at), { addSuffix: true }) : '—' },
      ],
    };
  };

  const summary = getRequestSummary();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90dvh] rounded-t-2xl p-0">
        <SheetHeader className="p-5 pb-3">
          <SheetTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Request Details
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(90dvh-70px)]">
          <div className="px-5 pb-8 space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : (
              <>
                {/* User Profile Card */}
                {profile && (
                  <div className="rounded-2xl border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                        {profile.full_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-base truncate">{profile.full_name}</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {roles.map(r => (
                            <Badge key={r.role} variant="outline" className="text-[10px] px-1.5">{r.role}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {profile.phone && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          <span>{profile.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Joined {formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })}</span>
                      </div>
                      {(profile.city || profile.country) && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{[profile.city, profile.country].filter(Boolean).join(', ')}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Shield className="h-3.5 w-3.5" />
                        <span>{profile.last_active_at ? `Active ${formatDistanceToNow(new Date(profile.last_active_at), { addSuffix: true })}` : 'Never logged in'}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {profile.phone && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openWhatsApp}>
                          <MessageSquare className="h-3 w-3" /> WhatsApp
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={copyId}>
                        {copied ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copied ? 'Copied' : 'Copy ID'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Wallet Balance */}
                <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-muted-foreground">Current Wallet Balance</span>
                    </div>
                    <p className="text-2xl font-black tabular-nums">{formatUGX(wallet?.balance || 0)}</p>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-background p-2">
                      <p className="text-[10px] text-muted-foreground">Total Deposits</p>
                      <p className="text-xs font-bold">{formatUGX(depositHistory.total)}</p>
                    </div>
                    <div className="rounded-lg bg-background p-2">
                      <p className="text-[10px] text-muted-foreground">Approved</p>
                      <p className="text-xs font-bold text-emerald-600">{depositHistory.approved}</p>
                    </div>
                    <div className="rounded-lg bg-background p-2">
                      <p className="text-[10px] text-muted-foreground">Rejected</p>
                      <p className="text-xs font-bold text-destructive">{depositHistory.rejected}</p>
                    </div>
                  </div>
                </div>

                {/* Request Details */}
                {summary && (
                  <div className="rounded-2xl border bg-card p-4 space-y-2">
                    <p className="text-sm font-bold flex items-center gap-2">
                      <ExternalLink className="h-3.5 w-3.5 text-primary" />
                      {summary.label}
                    </p>
                    <div className="space-y-1.5">
                      {summary.fields.map(f => (
                        <div key={f.key} className="flex justify-between items-start text-sm">
                          <span className="text-muted-foreground text-xs">{f.key}</span>
                          <span className="font-medium text-xs text-right max-w-[60%] break-all">{f.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Recent Ledger Transactions */}
                <div className="space-y-2">
                  <p className="text-sm font-bold">Recent Wallet Activity</p>
                  {recentTxns.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No wallet activity recorded</p>
                  ) : (
                    <div className="space-y-1">
                      {recentTxns.map(tx => (
                        <div key={tx.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30">
                          <div className={`p-1.5 rounded-lg ${tx.direction === 'cash_in' ? 'bg-emerald-500/10' : 'bg-destructive/10'}`}>
                            {tx.direction === 'cash_in'
                              ? <ArrowDownLeft className="h-3 w-3 text-emerald-600" />
                              : <ArrowUpRight className="h-3 w-3 text-destructive" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{tx.description || tx.category.replace(/_/g, ' ')}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(tx.transaction_date), 'MMM d, HH:mm')}
                            </p>
                          </div>
                          <p className={`text-xs font-bold tabular-nums ${tx.direction === 'cash_in' ? 'text-emerald-600' : 'text-destructive'}`}>
                            {tx.direction === 'cash_in' ? '+' : '-'}{formatUGX(tx.amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
