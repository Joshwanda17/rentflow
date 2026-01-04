import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  FileText, 
  Banknote, 
  Users, 
  Receipt, 
  ChartBar,
  ShoppingCart,
  Loader2,
  Search,
  X,
  User,
  Package
} from 'lucide-react';
import { RentRequestsManager } from '@/components/manager/RentRequestsManager';
import { LoanApplicationsManager } from '@/components/manager/LoanApplicationsManager';
import UserProfilesTable from '@/components/manager/UserProfilesTable';
import { ReceiptManagement } from '@/components/manager/ReceiptManagement';
import { FinancialOverview } from '@/components/manager/FinancialOverview';
import { OrdersManager } from '@/components/manager/OrdersManager';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';

interface SearchResult {
  type: 'user' | 'rent_request' | 'order' | 'loan';
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  amount?: number;
}

export default function ManagerAccess() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'rent-requests');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (!loading && (!user || role !== 'manager')) {
      navigate('/dashboard');
    }
  }, [user, role, loading, navigate]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value });
    setSearchQuery('');
    setShowResults(false);
  };

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const query = searchQuery.toLowerCase().trim();
      const results: SearchResult[] = [];

      try {
        // Search users
        const { data: users } = await supabase
          .from('profiles')
          .select('id, full_name, phone, email')
          .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(5);

        users?.forEach(u => {
          results.push({
            type: 'user',
            id: u.id,
            title: u.full_name,
            subtitle: u.phone || u.email,
          });
        });

        // Search rent requests by tenant name
        const { data: rentRequests } = await supabase
          .from('rent_requests')
          .select('id, rent_amount, status, tenant_id, created_at')
          .limit(20);

        if (rentRequests?.length) {
          const tenantIds = [...new Set(rentRequests.map(r => r.tenant_id))];
          const { data: tenantProfiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', tenantIds);

          rentRequests.forEach(r => {
            const tenant = tenantProfiles?.find(p => p.id === r.tenant_id);
            if (tenant?.full_name.toLowerCase().includes(query)) {
              results.push({
                type: 'rent_request',
                id: r.id,
                title: `Rent Request - ${tenant.full_name}`,
                subtitle: format(new Date(r.created_at), 'MMM d, yyyy'),
                status: r.status || 'pending',
                amount: r.rent_amount,
              });
            }
          });
        }

        // Search orders by product name or buyer
        const { data: orders } = await supabase
          .from('product_orders')
          .select('id, total_price, status, product_id, buyer_id, created_at')
          .limit(20);

        if (orders?.length) {
          const productIds = [...new Set(orders.map(o => o.product_id))];
          const buyerIds = [...new Set(orders.map(o => o.buyer_id))];
          
          const [{ data: products }, { data: buyers }] = await Promise.all([
            supabase.from('products').select('id, name').in('id', productIds),
            supabase.from('profiles').select('id, full_name').in('id', buyerIds)
          ]);

          orders.forEach(o => {
            const product = products?.find(p => p.id === o.product_id);
            const buyer = buyers?.find(b => b.id === o.buyer_id);
            if (product?.name.toLowerCase().includes(query) || buyer?.full_name.toLowerCase().includes(query)) {
              results.push({
                type: 'order',
                id: o.id,
                title: product?.name || 'Unknown Product',
                subtitle: buyer?.full_name || 'Unknown Buyer',
                status: o.status,
                amount: o.total_price,
              });
            }
          });
        }

        // Search loan applications
        const { data: loans } = await supabase
          .from('loan_applications')
          .select('id, amount, status, applicant_id, created_at')
          .limit(20);

        if (loans?.length) {
          const applicantIds = [...new Set(loans.map(l => l.applicant_id))];
          const { data: applicants } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', applicantIds);

          loans.forEach(l => {
            const applicant = applicants?.find(a => a.id === l.applicant_id);
            if (applicant?.full_name.toLowerCase().includes(query)) {
              results.push({
                type: 'loan',
                id: l.id,
                title: `Loan - ${applicant.full_name}`,
                subtitle: format(new Date(l.created_at), 'MMM d, yyyy'),
                status: l.status,
                amount: l.amount,
              });
            }
          });
        }

        setSearchResults(results.slice(0, 10));
        setShowResults(true);
      } catch (error) {
        console.error('Search error:', error);
      }
      
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false);
    setSearchQuery('');
    
    switch (result.type) {
      case 'user':
        handleTabChange('users');
        break;
      case 'rent_request':
        handleTabChange('rent-requests');
        break;
      case 'order':
        handleTabChange('orders');
        break;
      case 'loan':
        handleTabChange('loans');
        break;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'user': return <User className="h-4 w-4" />;
      case 'rent_request': return <FileText className="h-4 w-4" />;
      case 'order': return <Package className="h-4 w-4" />;
      case 'loan': return <Banknote className="h-4 w-4" />;
      default: return <Search className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'pending': return 'bg-warning/10 text-warning border-warning/30';
      case 'approved':
      case 'funded':
      case 'delivered': return 'bg-success/10 text-success border-success/30';
      case 'rejected':
      case 'cancelled': return 'bg-destructive/10 text-destructive border-destructive/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || role !== 'manager') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-6">
      {/* Header */}
      <header className="sticky top-0 z-50 wa-header shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/dashboard')}
              className="text-white/90 hover:text-white hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold text-white">Manager Access</h1>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* Global Search */}
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users, requests, orders, loans..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => {
                  setSearchQuery('');
                  setShowResults(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {showResults && (
            <Card className="absolute top-full left-0 right-0 mt-1 z-50 shadow-lg max-h-80 overflow-auto">
              <CardContent className="p-2">
                {isSearching ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="space-y-1">
                    {searchResults.map((result) => (
                      <button
                        key={`${result.type}-${result.id}`}
                        onClick={() => handleResultClick(result)}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="p-2 rounded-lg bg-muted">
                          {getTypeIcon(result.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{result.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {result.amount && (
                            <span className="text-xs font-medium">{formatUGX(result.amount)}</span>
                          )}
                          {result.status && (
                            <Badge variant="outline" className={`text-xs ${getStatusColor(result.status)}`}>
                              {result.status}
                            </Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    No results found for "{searchQuery}"
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="w-full h-auto flex-wrap gap-1 bg-muted/50 p-1">
            <TabsTrigger value="rent-requests" className="gap-1.5 text-xs flex-1 min-w-[100px]">
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Rent</span> Requests
            </TabsTrigger>
            <TabsTrigger value="loans" className="gap-1.5 text-xs flex-1 min-w-[80px]">
              <Banknote className="h-3.5 w-3.5" />
              Loans
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-1.5 text-xs flex-1 min-w-[80px]">
              <ShoppingCart className="h-3.5 w-3.5" />
              Orders
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5 text-xs flex-1 min-w-[80px]">
              <Users className="h-3.5 w-3.5" />
              Users
            </TabsTrigger>
            <TabsTrigger value="receipts" className="gap-1.5 text-xs flex-1 min-w-[80px]">
              <Receipt className="h-3.5 w-3.5" />
              Receipts
            </TabsTrigger>
            <TabsTrigger value="financials" className="gap-1.5 text-xs flex-1 min-w-[100px]">
              <ChartBar className="h-3.5 w-3.5" />
              Financials
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rent-requests" className="mt-4">
            <RentRequestsManager />
          </TabsContent>

          <TabsContent value="loans" className="mt-4">
            <LoanApplicationsManager />
          </TabsContent>

          <TabsContent value="orders" className="mt-4">
            <OrdersManager />
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <UserProfilesTable />
          </TabsContent>

          <TabsContent value="receipts" className="mt-4">
            <ReceiptManagement userId={user.id} />
          </TabsContent>

          <TabsContent value="financials" className="mt-4">
            <FinancialOverview />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
