import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Banknote, Trash2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { CreateLoanProductDialog } from './CreateLoanProductDialog';

interface LoanProduct {
  id: string;
  title: string;
  description: string | null;
  min_amount: number;
  max_amount: number;
  interest_rate: number;
  min_duration_days: number;
  max_duration_days: number;
  active: boolean;
  created_at: string;
}

export function AgentLoanProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<LoanProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = async () => {
    if (!user) return;
    try {
      // loan_products table removed
      setProducts([]);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [user]);

  const toggleActive = async (id: string, active: boolean) => {
    try {
      // loan_products table removed
      toast.success('Feature currently unavailable');
      return;
    } catch (error: any) {
      toast.error(error.message || 'Failed to update');
    }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete this loan product?')) return;

    try {
      // loan_products table removed
      toast.success('Feature currently unavailable');
      return;
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            My Loan Products
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-5 w-5" />
          My Loan Products ({products.length})
        </CardTitle>
        <CreateLoanProductDialog onCreated={fetchProducts} />
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Banknote className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No loan products yet</p>
            <p className="text-sm">Create your first loan product to start lending</p>
          </div>
        ) : (
          <div className="space-y-4">
            {products.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{product.title}</h4>
                    <Badge variant={product.active ? 'default' : 'secondary'}>
                      {product.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    UGX {product.min_amount.toLocaleString()} - {product.max_amount.toLocaleString()} | {product.interest_rate}% service fee | {product.min_duration_days}-{product.max_duration_days} days
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={product.active}
                    onCheckedChange={(checked) => toggleActive(product.id, checked)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteProduct(product.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
