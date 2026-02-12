import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Banknote, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { LoanProductCard } from './LoanProductCard';

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

export function LoanProductsSection() {
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Available Loans
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (products.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Available Loans
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mb-2" />
            <p>No loan products available at the moment</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-5 w-5" />
          Available Loans ({products.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <LoanProductCard
              key={product.id}
              product={product}
              onApply={fetchProducts}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
