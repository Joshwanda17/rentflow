import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ShoppingCart, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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
  const [products, setProducts] = useState<LoanProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = async () => {
    try {
      // loan_products table removed
      setProducts([]);
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
    <button 
      onClick={() => navigate('/my-loans')}
      className="w-full text-left block"
    >
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-success/5 overflow-hidden relative hover:shadow-lg active:scale-[0.99] transition-all cursor-pointer">
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
                  Tap to view & apply for loans
                </p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>

        <CardContent className="relative z-10 space-y-4">
          {/* Promo banner */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-success/10 border border-primary/20">
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
          </div>

          {/* Simple preview of loans */}
          {products.length > 0 ? (
            <div className="space-y-2">
              {products.slice(0, 2).map((product) => (
                <div key={product.id} className="p-3 rounded-lg bg-muted/50 border border-border/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{product.title}</p>
                      <p className="text-xs text-muted-foreground">
                        UGX {product.min_amount.toLocaleString()} - {product.max_amount.toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-success border-success/30">
                      {product.interest_rate}%
                    </Badge>
                  </div>
                </div>
              ))}
              {products.length > 2 && (
                <p className="text-xs text-center text-muted-foreground">
                  +{products.length - 2} more loans available
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">No loans available yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </button>
  );
}
