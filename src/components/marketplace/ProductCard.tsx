import { useState } from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Package, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_url: string | null;
  stock: number;
  agent_id: string;
}

interface ProductCardProps {
  product: Product;
  onPurchaseComplete?: () => void;
  isOwnProduct?: boolean;
}

export function ProductCard({ product, onPurchaseComplete, isOwnProduct = false }: ProductCardProps) {
  const [purchasing, setPurchasing] = useState(false);

  const handlePurchase = async () => {
    if (isOwnProduct) {
      toast.error("You can't buy your own product");
      return;
    }

    setPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke('product-purchase', {
        body: { productId: product.id, quantity: 1 }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast.success('Purchase successful!', {
        description: `You bought ${product.name} for UGX ${product.price.toLocaleString()}`
      });
      onPurchaseComplete?.();
    } catch (error: any) {
      console.error('Purchase error:', error);
      toast.error('Purchase failed', {
        description: error.message || 'Please try again'
      });
    } finally {
      setPurchasing(false);
    }
  };

  const categoryColors: Record<string, string> = {
    food: 'bg-green-500/10 text-green-500',
    drinks: 'bg-blue-500/10 text-blue-500',
    groceries: 'bg-orange-500/10 text-orange-500',
    general: 'bg-gray-500/10 text-gray-500',
  };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-300">
      <div className="aspect-square bg-muted relative overflow-hidden">
        {product.image_url ? (
          <img 
            src={product.image_url} 
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        {product.stock === 0 && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <Badge variant="destructive">Out of Stock</Badge>
          </div>
        )}
      </div>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold line-clamp-1">{product.name}</h3>
          <Badge className={categoryColors[product.category] || categoryColors.general}>
            {product.category}
          </Badge>
        </div>
        {product.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {product.description}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-lg font-bold text-primary">
            UGX {product.price.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">
            {product.stock} in stock
          </span>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button 
          className="w-full" 
          onClick={handlePurchase}
          disabled={purchasing || product.stock === 0 || isOwnProduct}
        >
          {purchasing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : isOwnProduct ? (
            'Your Product'
          ) : (
            <>
              <ShoppingCart className="mr-2 h-4 w-4" />
              Buy Now
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
