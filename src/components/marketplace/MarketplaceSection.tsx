import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Store, Package, Loader2, ShoppingBag, Search, SlidersHorizontal, X, Heart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ProductCard } from './ProductCard';
import { CartDrawer } from './CartDrawer';
import { RecentlyViewedProducts } from './RecentlyViewedProducts';
import { ProductRecommendations } from './ProductRecommendations';
import { useAuth } from '@/hooks/useAuth';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_url: string | null;
  stock: number;
  agent_id: string;
  created_at: string;
}

interface MarketplaceSectionProps {
  showAllProducts?: boolean;
  initialCategory?: string;
}

type SortOption = 'newest' | 'oldest' | 'price_low' | 'price_high' | 'name_az' | 'name_za';

export function MarketplaceSection({ showAllProducts = true, initialCategory }: MarketplaceSectionProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { recentIds } = useRecentlyViewed();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(initialCategory || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showInStock, setShowInStock] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showWishlistOnly, setShowWishlistOnly] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWishlist = async () => {
    if (!user) {
      setWishlistIds(new Set());
      return;
    }
    try {
      const { data, error } = await supabase
        .from('wishlists')
        .select('product_id')
        .eq('user_id', user.id);

      if (error) throw error;
      setWishlistIds(new Set(data?.map(w => w.product_id) || []));
    } catch (error) {
      console.error('Error fetching wishlist:', error);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchWishlist();

    const channel = supabase
      .channel('marketplace-products')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
        },
        () => {
          fetchProducts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const categories = useMemo(() => 
    ['all', ...new Set(products.map(p => p.category))],
    [products]
  );

  const filteredAndSortedProducts = useMemo(() => {
    let result = [...products];

    // Filter by category
    if (activeCategory !== 'all') {
      result = result.filter(p => p.category === activeCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(query) ||
        (p.description?.toLowerCase().includes(query))
      );
    }

    // Filter by stock
    if (showInStock) {
      result = result.filter(p => p.stock > 0);
    }

    // Filter by wishlist
    if (showWishlistOnly) {
      result = result.filter(p => wishlistIds.has(p.id));
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'price_low':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price_high':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'name_az':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name_za':
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
    }

    return result;
  }, [products, activeCategory, searchQuery, sortBy, showInStock, showWishlistOnly, wishlistIds]);

  const activeFiltersCount = [
    activeCategory !== 'all',
    showInStock,
    showWishlistOnly,
    sortBy !== 'newest'
  ].filter(Boolean).length;

  const clearFilters = () => {
    setActiveCategory('all');
    setSearchQuery('');
    setSortBy('newest');
    setShowInStock(false);
    setShowWishlistOnly(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Marketplace
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
            <Store className="h-5 w-5" />
            Marketplace
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No products available yet</p>
            <p className="text-sm text-muted-foreground">Check back soon!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="cursor-pointer group" onClick={() => navigate('/marketplace')}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle 
          className="flex items-center gap-2 group-hover:text-primary transition-colors"
        >
          <Store className="h-5 w-5" />
          Marketplace
          <Badge variant="outline" className="ml-2 text-xs">
            {products.length} products
          </Badge>
        </CardTitle>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {user && <CartDrawer />}
          {user && (
            <Button variant="outline" size="sm" onClick={() => navigate('/wishlist')} className="gap-2">
              <Heart className="h-4 w-4" />
              Wishlist
              {wishlistIds.size > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {wishlistIds.size}
                </Badge>
              )}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate('/orders')} className="gap-2">
            <ShoppingBag className="h-4 w-4" />
            My Orders
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4" onClick={(e) => e.stopPropagation()}>
        {/* Recently Viewed */}
        <RecentlyViewedProducts onProductPurchase={fetchProducts} />
        
        {/* Search Bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className="relative"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </Button>
        </div>

        {/* Filter Options */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 p-4 rounded-lg bg-secondary/30 border border-border/50 animate-fade-in">
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sort By</label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="price_low">Price: Low to High</SelectItem>
                  <SelectItem value="price_high">Price: High to Low</SelectItem>
                  <SelectItem value="name_az">Name: A to Z</SelectItem>
                  <SelectItem value="name_za">Name: Z to A</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button
                variant={showInStock ? "default" : "outline"}
                size="sm"
                onClick={() => setShowInStock(!showInStock)}
                className="h-9"
              >
                In Stock Only
              </Button>

              {user && (
                <Button
                  variant={showWishlistOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowWishlistOnly(!showWishlistOnly)}
                  className="h-9 gap-1"
                >
                  <Heart className={`h-4 w-4 ${showWishlistOnly ? 'fill-current' : ''}`} />
                  Wishlist
                </Button>
              )}

              {activeFiltersCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-9 text-muted-foreground"
                >
                  Clear All
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Product Recommendations */}
        {recentIds.length > 0 && (
          <ProductRecommendations 
            onProductPurchase={fetchProducts}
            excludeIds={recentIds}
          />
        )}

        {/* Category Tabs */}
        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="flex-wrap h-auto">
            {categories.map((cat) => (
              <TabsTrigger key={cat} value={cat} className="capitalize">
                {cat}
              </TabsTrigger>
            ))}
          </TabsList>
          
          <TabsContent value={activeCategory} className="mt-4">
            {/* Results count */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                {filteredAndSortedProducts.length} product{filteredAndSortedProducts.length !== 1 ? 's' : ''} found
              </p>
              {searchQuery && (
                <Badge variant="secondary" className="gap-1">
                  Searching: "{searchQuery}"
                  <button onClick={() => setSearchQuery('')} className="ml-1 hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>

            {filteredAndSortedProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No products match your search</p>
                <p className="text-sm text-muted-foreground mb-4">Try adjusting your filters</p>
                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredAndSortedProducts.map((product) => (
                  <ProductCard 
                    key={product.id} 
                    product={product} 
                    onPurchaseComplete={fetchProducts}
                    isOwnProduct={product.agent_id === user?.id}
                    isInWishlist={wishlistIds.has(product.id)}
                    onWishlistChange={fetchWishlist}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
