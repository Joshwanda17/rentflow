import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  User, Mail, Phone, Star, Banknote, CheckCircle, XCircle, 
  Calendar, Wallet, TrendingUp, PiggyBank, Clock, Activity,
  ArrowUpRight, ArrowDownLeft, ShoppingCart, Home, CreditCard,
  Send, Download as DownloadIcon, MessageCircle
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, formatDistanceToNow } from 'date-fns';
import WhatsAppPhoneLink from '@/components/WhatsAppPhoneLink';

interface InvestmentAccount {
  id: string;
  name: string;
  balance: number;
  color: string;
  status: string;
  created_at: string;
}

interface ActivityItem {
  id: string;
  type: 'transaction_sent' | 'transaction_received' | 'deposit' | 'withdrawal' | 'order' | 'rent_request' | 'repayment' | 'loan_repayment';
  amount: number;
  description: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

interface UserDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    avatar_url: string | null;
    rent_discount_active: boolean;
    monthly_rent: number | null;
    roles: string[];
    average_rating: number | null;
    rating_count: number;
  } | null;
}

export default function UserDetailsDialog({ open, onOpenChange, user }: UserDetailsDialogProps) {
  const [investmentAccounts, setInvestmentAccounts] = useState<InvestmentAccount[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    if (open && user) {
      fetchUserDetails();
    }
  }, [open, user]);

  const fetchUserDetails = async () => {
    if (!user) return;
    setLoading(true);

    // Fetch investment accounts
    const { data: accounts } = await supabase
      .from('investment_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Fetch wallet balance
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    setInvestmentAccounts(accounts || []);
    setWalletBalance(wallet?.balance || 0);
    setLoading(false);

    // Fetch activity log in parallel
    fetchActivityLog();
  };

  const fetchActivityLog = async () => {
    if (!user) return;
    setActivityLoading(true);

    const activities: ActivityItem[] = [];

    // Fetch sent transactions
    const { data: sentTransactions } = await supabase
      .from('wallet_transactions')
      .select('id, amount, description, created_at')
      .eq('sender_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    sentTransactions?.forEach(t => {
      activities.push({
        id: `sent-${t.id}`,
        type: 'transaction_sent',
        amount: t.amount,
        description: t.description || 'Money sent',
        created_at: t.created_at
      });
    });

    // Fetch received transactions
    const { data: receivedTransactions } = await supabase
      .from('wallet_transactions')
      .select('id, amount, description, created_at')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    receivedTransactions?.forEach(t => {
      activities.push({
        id: `received-${t.id}`,
        type: 'transaction_received',
        amount: t.amount,
        description: t.description || 'Money received',
        created_at: t.created_at
      });
    });

    // Fetch deposits
    const { data: deposits } = await supabase
      .from('wallet_deposits')
      .select('id, amount, created_at, deposit_type')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    deposits?.forEach(d => {
      activities.push({
        id: `deposit-${d.id}`,
        type: 'deposit',
        amount: d.amount,
        description: `${d.deposit_type === 'cash' ? 'Cash' : 'Mobile'} deposit`,
        created_at: d.created_at
      });
    });

    // Fetch withdrawals
    const { data: withdrawals } = await supabase
      .from('wallet_withdrawals')
      .select('id, amount, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    withdrawals?.forEach(w => {
      activities.push({
        id: `withdrawal-${w.id}`,
        type: 'withdrawal',
        amount: w.amount,
        description: 'Wallet withdrawal',
        created_at: w.created_at
      });
    });

    // Fetch product orders
    const { data: orders } = await supabase
      .from('product_orders')
      .select('id, total_price, created_at, status')
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    orders?.forEach(o => {
      activities.push({
        id: `order-${o.id}`,
        type: 'order',
        amount: o.total_price,
        description: `Product order (${o.status})`,
        created_at: o.created_at
      });
    });

    // Fetch rent requests
    const { data: rentRequests } = await supabase
      .from('rent_requests')
      .select('id, rent_amount, created_at, status')
      .eq('tenant_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    rentRequests?.forEach(r => {
      activities.push({
        id: `rent-${r.id}`,
        type: 'rent_request',
        amount: r.rent_amount,
        description: `Rent request (${r.status})`,
        created_at: r.created_at
      });
    });

    // Fetch repayments
    const { data: repayments } = await supabase
      .from('repayments')
      .select('id, amount, created_at')
      .eq('tenant_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    repayments?.forEach(r => {
      activities.push({
        id: `repayment-${r.id}`,
        type: 'repayment',
        amount: r.amount,
        description: 'Rent repayment',
        created_at: r.created_at
      });
    });

    // Fetch loan repayments
    const { data: loanRepayments } = await supabase
      .from('user_loan_repayments')
      .select('id, amount, created_at')
      .eq('borrower_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    loanRepayments?.forEach(l => {
      activities.push({
        id: `loan-repayment-${l.id}`,
        type: 'loan_repayment',
        amount: l.amount,
        description: 'Loan repayment',
        created_at: l.created_at
      });
    });

    // Sort all activities by date
    activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setActivityLog(activities.slice(0, 30)); // Keep last 30 activities
    setActivityLoading(false);
  };

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'transaction_sent':
        return <ArrowUpRight className="h-4 w-4 text-destructive" />;
      case 'transaction_received':
        return <ArrowDownLeft className="h-4 w-4 text-success" />;
      case 'deposit':
        return <DownloadIcon className="h-4 w-4 text-success" />;
      case 'withdrawal':
        return <Send className="h-4 w-4 text-warning" />;
      case 'order':
        return <ShoppingCart className="h-4 w-4 text-primary" />;
      case 'rent_request':
        return <Home className="h-4 w-4 text-chart-5" />;
      case 'repayment':
      case 'loan_repayment':
        return <CreditCard className="h-4 w-4 text-success" />;
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActivityColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'transaction_sent':
      case 'withdrawal':
        return 'text-destructive';
      case 'transaction_received':
      case 'deposit':
      case 'repayment':
      case 'loan_repayment':
        return 'text-success';
      case 'order':
        return 'text-primary';
      case 'rent_request':
        return 'text-chart-5';
      default:
        return 'text-foreground';
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      tenant: 'bg-primary/20 text-primary',
      agent: 'bg-warning/20 text-warning',
      supporter: 'bg-success/20 text-success',
      landlord: 'bg-chart-5/20 text-chart-5',
      manager: 'bg-destructive/20 text-destructive'
    };
    return colors[role] || 'bg-muted text-muted-foreground';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-success/20 text-success"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-destructive/20 text-destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge className="bg-warning/20 text-warning"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground/30'
            }`}
          />
        ))}
      </div>
    );
  };

  const totalInvested = investmentAccounts
    .filter(a => a.status === 'approved')
    .reduce((sum, a) => sum + a.balance, 0);

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={user.avatar_url || undefined} />
              <AvatarFallback className="text-lg">{getInitials(user.full_name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xl">{user.full_name}</p>
              <div className="flex items-center gap-2 mt-1">
                {user.roles.map((role) => (
                  <Badge key={role} className={`text-xs ${getRoleBadgeColor(role)}`}>
                    {role}
                  </Badge>
                ))}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview" className="gap-2">
                <User className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-2">
                <Activity className="h-4 w-4" />
                Activity
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="max-h-[60vh]">
            <TabsContent value="overview" className="mt-0">
              <div className="p-6 pt-4 space-y-6">
                {/* Contact Info */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      Contact Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-0">
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{user.email}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <WhatsAppPhoneLink phone={user.phone} />
                    </div>
                  </CardContent>
                </Card>

                {/* Financial Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="p-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Wallet className="h-3 w-3" />
                      Wallet
                    </div>
                    <p className="font-semibold text-sm">{formatUGX(walletBalance)}</p>
                  </Card>
                  <Card className="p-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <PiggyBank className="h-3 w-3" />
                      Invested
                    </div>
                    <p className="font-semibold text-sm">{formatUGX(totalInvested)}</p>
                  </Card>
                  <Card className="p-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Banknote className="h-3 w-3" />
                      Monthly Rent
                    </div>
                    <p className="font-semibold text-sm">{user.monthly_rent ? formatUGX(user.monthly_rent) : 'N/A'}</p>
                  </Card>
                  <Card className="p-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <Star className="h-3 w-3" />
                      Rating
                    </div>
                    {user.rating_count > 0 ? (
                      <div className="flex items-center gap-1">
                        {renderStars(user.average_rating || 0)}
                        <span className="text-xs text-muted-foreground">({user.rating_count})</span>
                      </div>
                    ) : (
                      <p className="font-semibold text-sm text-muted-foreground">No ratings</p>
                    )}
                  </Card>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-3 flex-wrap">
                  {user.rent_discount_active && (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Rent Discount Active
                    </Badge>
                  )}
                </div>

                <Separator />

                {/* Investment Accounts */}
                <div>
                  <h3 className="font-semibold flex items-center gap-2 mb-4">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Investment Accounts ({investmentAccounts.length})
                  </h3>

                  {loading ? (
                    <div className="space-y-3">
                      {[1, 2].map(i => (
                        <Skeleton key={i} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : investmentAccounts.length === 0 ? (
                    <Card className="p-6 text-center">
                      <PiggyBank className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">No investment accounts yet</p>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {investmentAccounts.map((account) => (
                        <Card key={account.id} className="overflow-hidden">
                          <div 
                            className="h-1"
                            style={{ backgroundColor: account.color }}
                          />
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{account.name}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                  <Calendar className="h-3 w-3" />
                                  Created {format(new Date(account.created_at), 'MMM d, yyyy')}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold">{formatUGX(account.balance)}</p>
                                <div className="mt-1">
                                  {getStatusBadge(account.status)}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="mt-0">
              <div className="p-6 pt-4">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <Activity className="h-5 w-5 text-primary" />
                  Recent Activity
                </h3>

                {activityLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : activityLog.length === 0 ? (
                  <Card className="p-8 text-center">
                    <Activity className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No activity recorded yet</p>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {activityLog.map((activity) => (
                      <Card key={activity.id} className="p-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-full bg-muted shrink-0">
                            {getActivityIcon(activity.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {activity.description}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                                </p>
                              </div>
                              <span className={`text-sm font-semibold shrink-0 ${getActivityColor(activity.type)}`}>
                                {activity.type === 'transaction_sent' || activity.type === 'withdrawal' || activity.type === 'order' ? '-' : '+'}
                                {formatUGX(activity.amount)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
