import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ShoppingCart, 
  Banknote, 
  Calendar, 
  User, 
  Percent, 
  ArrowRight,
  Sparkles,
  TrendingUp,
  Plus
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { LoanProductCard } from './LoanProductCard';
import { CreateLoanProductDialog } from './CreateLoanProductDialog';
import { useAuth } from '@/hooks/useAuth';

interface LoanProduct {
  id: string;
  agent_id: string;
  title: string;
  description: string | null;
  min_amount: number;
  max_amount: number;
  interest_rate: number;
  min_duration_days: number;
  max_duration_days: number;
  agent_name?: string;
}

export function FoodShoppingLoansSection() {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const [products, setProducts] = useState<LoanProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const isAgent = roles.includes('agent');

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('loan_products')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch agent names
      const agentIds = [...new Set(data?.map((p) => p.agent_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', agentIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) || []);

      setProducts(
        (data || []).map((p) => ({
          ...p,
          agent_name: profileMap.get(p.agent_id) || 'Unknown',
        }))
      );
    } catch (error) {
      console.error('Error fetching loan products:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  if (loading) {
    return (
      <Card className="border-2 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-60" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-52" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-success/5 overflow-hidden relative">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      
      <CardHeader className="pb-3 relative z-10">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 ring-2 ring-primary/20">
              <ShoppingCart className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Food Shopping Loans</CardTitle>
                <Badge className="bg-primary/20 text-primary border-primary/30 gap-1">
                  <Sparkles className="h-3 w-3" />
                  {products.length} Available
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Quick loans for your grocery & food shopping needs
              </p>
            </div>
          </div>
          
          {/* CTA for creating loans */}
          <CreateLoanProductDialog onCreated={fetchProducts} />
        </div>
      </CardHeader>

      <CardContent className="relative z-10 space-y-4">
        {/* Promo banner */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-success/10 border border-primary/20">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h4 className="font-semibold">Why Food Shopping Loans?</h4>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-primary">5-15%</p>
              <p className="text-xs text-muted-foreground">Low Interest</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-success">7-30</p>
              <p className="text-xs text-muted-foreground">Days to Repay</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-warning">70%</p>
              <p className="text-xs text-muted-foreground">Rent Savings</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Get a food shopping loan → Shop at Welile agents → Post receipts → Save on rent!
          </p>
        </div>

        {/* Loan Products */}
        {products.length === 0 ? (
          <div className="text-center py-8 px-4">
            <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-4">
              <ShoppingCart className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-2">No Loans Available Yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              Be the first to create a food shopping loan product and help others in the community!
            </p>
            <CreateLoanProductDialog onCreated={fetchProducts} />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {products.slice(0, 6).map((product) => (
              <LoanProductCard
                key={product.id}
                product={product}
                onApply={fetchProducts}
              />
            ))}
          </div>
        )}

        {/* View all link */}
        {products.length > 6 && (
          <Button 
            variant="outline" 
            className="w-full gap-2"
            onClick={() => navigate('/my-loans')}
          >
            View All {products.length} Loan Products
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}

        {/* Encourage creating loans */}
        {!isAgent && products.length > 0 && (
          <div className="p-4 rounded-xl bg-muted/50 border border-border/50 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Want to help others with food shopping loans?
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Become an agent and create your own loan products
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
              <Plus className="h-4 w-4 mr-2" />
              Become an Agent
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
