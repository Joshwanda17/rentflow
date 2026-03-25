import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  ArrowLeft, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Search, 
  Download, 
  Calendar,
  Receipt,
  X,
  DollarSign
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { TransactionReceipt } from '@/components/wallet/TransactionReceipt';
import { TransactionHistorySkeleton } from '@/components/skeletons/DashboardSkeletons';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';

interface Transaction {
  id: string;
  sender_id: string;
  recipient_id: string;
  amount: number;
  description: string | null;
  created_at: string;
  sender_name?: string;
  recipient_name?: string;
}

type TransactionType = 'all' | 'sent' | 'received';

export default function TransactionHistory() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [transactionType, setTransactionType] = useState<TransactionType>('all');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const fetchTransactions = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
      setLoading(false);
      return;
    }

    if (data && data.length > 0) {
      const userIds = [...new Set([...data.map(t => t.sender_id), ...data.map(t => t.recipient_id)])];
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

      const enrichedTransactions = data.map(t => ({
        ...t,
        sender_name: profileMap.get(t.sender_id) || 'Unknown',
        recipient_name: profileMap.get(t.recipient_id) || 'Unknown',
      }));

      setTransactions(enrichedTransactions);
      setFilteredTransactions(enrichedTransactions);
    } else {
      setTransactions([]);
      setFilteredTransactions([]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchTransactions();
    }
  }, [user, fetchTransactions]);

  useEffect(() => {
    let filtered = [...transactions];

    // Type filter
    if (transactionType === 'sent') {
      filtered = filtered.filter(tx => tx.sender_id === user?.id);
    } else if (transactionType === 'received') {
      filtered = filtered.filter(tx => tx.recipient_id === user?.id);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(tx => 
        tx.sender_name?.toLowerCase().includes(query) ||
        tx.recipient_name?.toLowerCase().includes(query) ||
        tx.description?.toLowerCase().includes(query) ||
        tx.amount.toString().includes(query)
      );
    }

    // Date range filter
    if (startDate) {
      filtered = filtered.filter(tx => 
        new Date(tx.created_at) >= startDate
      );
    }

    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      filtered = filtered.filter(tx => 
        new Date(tx.created_at) <= endOfDay
      );
    }

    // Amount range filter
    const minAmountNum = parseFloat(minAmount);
    const maxAmountNum = parseFloat(maxAmount);
    
    if (!isNaN(minAmountNum) && minAmountNum > 0) {
      filtered = filtered.filter(tx => tx.amount >= minAmountNum);
    }
    
    if (!isNaN(maxAmountNum) && maxAmountNum > 0) {
      filtered = filtered.filter(tx => tx.amount <= maxAmountNum);
    }

    setFilteredTransactions(filtered);
  }, [searchQuery, startDate, endDate, transactionType, minAmount, maxAmount, transactions, user?.id]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-UG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStartDate(undefined);
    setEndDate(undefined);
    setTransactionType('all');
    setMinAmount('');
    setMaxAmount('');
  };

  const exportToCSV = () => {
    if (filteredTransactions.length === 0) {
      toast.error('No transactions to export');
      return;
    }

    const headers = ['Date', 'Type', 'Name', 'Amount (UGX)', 'Description', 'Reference'];
    
    const rows = filteredTransactions.map(tx => {
      const isSent = tx.sender_id === user?.id;
      return [
        formatDate(tx.created_at),
        isSent ? 'Sent' : 'Received',
        isSent ? tx.recipient_name : tx.sender_name,
        isSent ? `-${tx.amount}` : `+${tx.amount}`,
        tx.description || '',
        `WEL-${tx.id.substring(0, 8).toUpperCase()}`
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `welile-transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();

    toast.success('Transactions exported successfully');
  };

  const hasActiveFilters = searchQuery || startDate || endDate || transactionType !== 'all' || minAmount || maxAmount;

  if (authLoading || loading) {
    return <TransactionHistorySkeleton />;
  }

  const handleRefresh = async () => {
    await fetchTransactions();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Transaction History</h1>
            <p className="text-muted-foreground text-sm">
              View and manage your wallet transactions
            </p>
          </div>
          <Button onClick={exportToCSV} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4">
            {/* Type Filter Tabs */}
            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              {[
                { value: 'all', label: 'All' },
                { value: 'received', label: 'Received' },
                { value: 'sent', label: 'Sent' },
              ].map((type) => (
                <button
                  key={type.value}
                  onClick={() => setTransactionType(type.value as TransactionType)}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    transactionType === type.value
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              {/* Search */}
              <div className="md:col-span-2">
                <Label htmlFor="search" className="sr-only">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search by name, amount, or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Start Date */}
              <div>
                <Label className="sr-only">From Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, 'MMM dd, yyyy') : 'From date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End Date */}
              <div>
                <Label className="sr-only">To Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, 'MMM dd, yyyy') : 'To date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Amount Range Filter */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="minAmount" className="text-xs text-muted-foreground mb-1.5 block">
                  Min Amount (UGX)
                </Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="minAmount"
                    type="number"
                    placeholder="0"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="maxAmount" className="text-xs text-muted-foreground mb-1.5 block">
                  Max Amount (UGX)
                </Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="maxAmount"
                    type="number"
                    placeholder="Any"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            {/* Quick Amount Presets */}
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground self-center mr-1">Quick:</span>
              {[
                { label: '< 10K', min: '', max: '10000' },
                { label: '10K - 50K', min: '10000', max: '50000' },
                { label: '50K - 100K', min: '50000', max: '100000' },
                { label: '100K - 500K', min: '100000', max: '500000' },
                { label: '> 500K', min: '500000', max: '' },
              ].map((preset) => {
                const isActive = minAmount === preset.min && maxAmount === preset.max;
                return (
                  <button
                    key={preset.label}
                    onClick={() => {
                      if (isActive) {
                        setMinAmount('');
                        setMaxAmount('');
                      } else {
                        setMinAmount(preset.min);
                        setMaxAmount(preset.max);
                      }
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {hasActiveFilters && (
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Showing {filteredTransactions.length} of {transactions.length} transactions
                </p>
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
                  <X className="h-4 w-4" />
                  Clear filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transactions List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="animate-pulse flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                    <div className="h-10 w-10 bg-muted rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-1/3" />
                      <div className="h-3 bg-muted rounded w-1/4" />
                    </div>
                    <div className="h-4 bg-muted rounded w-20" />
                  </div>
                ))}
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {hasActiveFilters ? 'No transactions match your filters' : 'No transactions yet'}
                </p>
                {hasActiveFilters && (
                  <Button variant="link" onClick={clearFilters} className="mt-2">
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTransactions.map((tx) => {
                  const isSent = tx.sender_id === user?.id;
                  return (
                    <button
                      key={tx.id}
                      onClick={() => {
                        setSelectedTransaction(tx);
                        setReceiptOpen(true);
                      }}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors w-full group"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-full ${isSent ? 'bg-destructive/20' : 'bg-green-500/20'}`}>
                          {isSent ? (
                            <ArrowUpRight className="h-5 w-5 text-destructive" />
                          ) : (
                            <ArrowDownLeft className="h-5 w-5 text-green-500" />
                          )}
                        </div>
                        <div className="text-left">
                          <p className="font-medium">
                            {isSent ? tx.recipient_name : tx.sender_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(tx.created_at)}
                          </p>
                          {tx.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {tx.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className={`font-semibold ${isSent ? 'text-destructive' : 'text-green-500'}`}>
                          {isSent ? '-' : '+'}{formatCurrency(tx.amount)}
                        </p>
                        <Receipt className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <TransactionReceipt
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        transaction={selectedTransaction}
        currentUserId={user?.id || ''}
      />
    </div>
  );
}
