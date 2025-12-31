import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  ShoppingBag, 
  Store, 
  Package, 
  Loader2,
  Calendar,
  Coins
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import AppBreadcrumb from '@/components/AppBreadcrumb';
import { ThemeToggle } from '@/components/ThemeToggle';
import WelileLogo from '@/components/WelileLogo';

interface OrderWithProduct {
  id: string;
  product_id: string;
  buyer_id: string;
  agent_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  agent_commission: number;
  status: string;
  created_at: string;
  product_name?: string;
  product_image?: string | null;
  buyer_name?: string;
  agent_name?: string;
}

export default function OrderHistory() {
  const navigate = useNavigate();
  const { user, role, roles } = useAuth();
  const [purchases, setPurchases] = useState<OrderWithProduct[]>([]);
  const [sales, setSales] = useState<OrderWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('purchases');

  const isAgent = roles.includes('agent');

  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user]);

  const fetchOrders = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch purchases (orders where user is buyer)
      const { data: purchaseData, error: purchaseError } = await supabase
        .from('product_orders')
        .select('*')
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false });

      if (purchaseError) throw purchaseError;

      // Enrich purchases with product details
      const enrichedPurchases = await Promise.all(
        (purchaseData || []).map(async (order) => {
          const { data: product } = await supabase
            .from('products')
            .select('name, image_url')
            .eq('id', order.product_id)
            .maybeSingle();

          const { data: agent } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', order.agent_id)
            .maybeSingle();

          return {
            ...order,
            product_name: product?.name || 'Unknown Product',
            product_image: product?.image_url,
            agent_name: agent?.full_name || 'Unknown Seller',
          };
        })
      );

      setPurchases(enrichedPurchases);

      // If user is an agent, also fetch sales
      if (isAgent) {
        const { data: salesData, error: salesError } = await supabase
          .from('product_orders')
          .select('*')
          .eq('agent_id', user.id)
          .order('created_at', { ascending: false });

        if (salesError) throw salesError;

        // Enrich sales with product and buyer details
        const enrichedSales = await Promise.all(
          (salesData || []).map(async (order) => {
            const { data: product } = await supabase
              .from('products')
              .select('name, image_url')
              .eq('id', order.product_id)
              .maybeSingle();

            const { data: buyer } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', order.buyer_id)
              .maybeSingle();

            return {
              ...order,
              product_name: product?.name || 'Unknown Product',
              product_image: product?.image_url,
              buyer_name: buyer?.full_name || 'Unknown Buyer',
            };
          })
        );

        setSales(enrichedSales);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
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

  const totalPurchases = purchases.reduce((sum, o) => sum + Number(o.total_price), 0);
  const totalSales = sales.reduce((sum, o) => sum + Number(o.total_price), 0);
  const totalCommission = sales.reduce((sum, o) => sum + Number(o.agent_commission), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-card border-b border-border/50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <WelileLogo showText={false} />
              <h1 className="text-lg font-semibold">Order History</h1>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 animate-fade-in">
        <AppBreadcrumb />

        {/* Stats */}
        <div className={`grid gap-4 ${isAgent ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1'}`}>
          <Card className="elevated-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
                  <ShoppingBag className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Spent</p>
                  <p className="text-xl font-bold">{formatUGX(totalPurchases)}</p>
                  <p className="text-xs text-muted-foreground">{purchases.length} orders</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {isAgent && (
            <>
              <Card className="elevated-card">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-success/20 to-success/5">
                      <Store className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Sales</p>
                      <p className="text-xl font-bold text-success">{formatUGX(totalSales)}</p>
                      <p className="text-xs text-muted-foreground">{sales.length} orders</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="elevated-card">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-warning/20 to-warning/5">
                      <Coins className="h-5 w-5 text-warning" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Commission Earned</p>
                      <p className="text-xl font-bold">{formatUGX(totalCommission)}</p>
                      <p className="text-xs text-muted-foreground">1% per sale</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Orders */}
        {isAgent ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="purchases" className="gap-2">
                <ShoppingBag className="h-4 w-4" />
                My Purchases ({purchases.length})
              </TabsTrigger>
              <TabsTrigger value="sales" className="gap-2">
                <Store className="h-4 w-4" />
                My Sales ({sales.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="purchases" className="mt-6">
              <OrderList orders={purchases} type="purchase" formatDate={formatDate} />
            </TabsContent>

            <TabsContent value="sales" className="mt-6">
              <OrderList orders={sales} type="sale" formatDate={formatDate} />
            </TabsContent>
          </Tabs>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                My Purchases
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OrderList orders={purchases} type="purchase" formatDate={formatDate} />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

interface OrderListProps {
  orders: OrderWithProduct[];
  type: 'purchase' | 'sale';
  formatDate: (date: string) => string;
}

function OrderList({ orders, type, formatDate }: OrderListProps) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          {type === 'purchase' ? 'No purchases yet' : 'No sales yet'}
        </p>
        <p className="text-sm text-muted-foreground">
          {type === 'purchase' 
            ? 'Browse the marketplace to find products!' 
            : 'Add products to your shop to start selling!'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <div 
          key={order.id}
          className="flex items-start gap-4 p-4 rounded-xl bg-secondary/30 border border-border/50 hover:border-primary/30 transition-colors"
        >
          {/* Product Image */}
          <div className="w-16 h-16 rounded-lg bg-muted overflow-hidden flex-shrink-0">
            {order.product_image ? (
              <img 
                src={order.product_image} 
                alt={order.product_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Order Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold truncate">{order.product_name}</h3>
                <p className="text-sm text-muted-foreground">
                  {type === 'purchase' 
                    ? `Sold by: ${order.agent_name}` 
                    : `Buyer: ${order.buyer_name}`}
                </p>
              </div>
              <Badge variant="success" className="shrink-0">
                {order.status}
              </Badge>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">
                Qty: {order.quantity} × UGX {Number(order.unit_price).toLocaleString()}
              </span>
              <span className="font-semibold">
                Total: {formatUGX(Number(order.total_price))}
              </span>
              {type === 'sale' && (
                <span className="text-success font-medium">
                  +{formatUGX(Number(order.agent_commission))} commission
                </span>
              )}
            </div>

            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatDate(order.created_at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
