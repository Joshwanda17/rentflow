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
import { 
  User, Mail, Phone, Star, Banknote, CheckCircle, XCircle, 
  Calendar, Wallet, TrendingUp, PiggyBank, Clock
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';

interface InvestmentAccount {
  id: string;
  name: string;
  balance: number;
  color: string;
  status: string;
  created_at: string;
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
  const [loading, setLoading] = useState(false);

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

        <ScrollArea className="max-h-[70vh]">
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
                  <span className="text-sm">{user.phone}</span>
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
