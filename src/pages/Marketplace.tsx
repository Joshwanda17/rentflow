import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Store, ArrowLeft, Zap, Grid3X3, ShoppingBag, Heart, ShoppingCart } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import WelileLogo from '@/components/WelileLogo';
import { useAuth } from '@/hooks/useAuth';
import { MarketplaceSection } from '@/components/marketplace/MarketplaceSection';
import MobileBottomNav from '@/components/MobileBottomNav';
import { CartDrawer } from '@/components/marketplace/CartDrawer';
import { useCart } from '@/hooks/useCart';

export default function Marketplace() {
  const { itemCount } = useCart();
  const { user, signOut, role } = useAuth();
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get('category') || undefined;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Header */}
      <motion.header 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl"
      >
        <div className="container mx-auto px-3 py-3 sm:px-4 sm:py-4">
          {/* Mobile Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4">
              <Link to="/">
                <motion.div whileHover={{ scale: 1.05 }} transition={{ type: 'spring', stiffness: 400, damping: 17 }}>
                  <WelileLogo />
                </motion.div>
              </Link>
              <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary gap-1 text-xs sm:text-sm">
                <Store className="h-3 w-3" />
                <span className="hidden xs:inline">Marketplace</span>
                <span className="xs:hidden">Shop</span>
              </Badge>
            </div>

            {/* Mobile Quick Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Categories - always visible */}
              <Link to="/categories">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button variant="outline" size="sm" className="h-9 w-9 p-0 sm:h-9 sm:w-auto sm:px-3 sm:gap-2">
                    <Grid3X3 className="h-4 w-4" />
                    <span className="hidden sm:inline">Categories</span>
                  </Button>
                </motion.div>
              </Link>

              {/* Flash Sales - always visible */}
              <Link to="/flash-sales">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button variant="outline" size="sm" className="h-9 w-9 p-0 sm:h-9 sm:w-auto sm:px-3 sm:gap-2 border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10">
                    <Zap className="h-4 w-4 fill-current" />
                    <span className="hidden sm:inline">Flash Sales</span>
                  </Button>
                </motion.div>
              </Link>

              {/* Orders - visible on mobile */}
              {user && (
                <Link to="/orders">
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button variant="outline" size="sm" className="h-9 w-9 p-0 sm:h-9 sm:w-auto sm:px-3 sm:gap-2">
                      <ShoppingBag className="h-4 w-4" />
                      <span className="hidden sm:inline">Orders</span>
                    </Button>
                  </motion.div>
                </Link>
              )}

              {/* Wishlist - visible on mobile */}
              {user && (
                <Link to="/wishlist">
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button variant="outline" size="sm" className="h-9 w-9 p-0 sm:h-9 sm:w-auto sm:px-3 sm:gap-2">
                      <Heart className="h-4 w-4" />
                      <span className="hidden sm:inline">Wishlist</span>
                    </Button>
                  </motion.div>
                </Link>
              )}

              <ThemeToggle />

              {/* Back/Sign In - Desktop only */}
              <Link to={user ? "/dashboard" : "/auth"} className="hidden sm:block">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    {user ? 'Dashboard' : 'Sign In'}
                  </Button>
                </motion.div>
              </Link>
            </div>
          </div>

          {/* Category badge if filtered */}
          {initialCategory && (
            <div className="mt-2">
              <Badge className="capitalize">{initialCategory}</Badge>
            </div>
          )}
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="container mx-auto px-3 py-4 sm:px-4 sm:py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <MarketplaceSection initialCategory={initialCategory} />
        </motion.div>
      </main>

      {/* Floating Cart Button - Mobile */}
      {user && (
        <div className="fixed bottom-24 right-4 z-50 md:hidden">
          <CartDrawer>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="relative"
            >
              <Button 
                size="lg" 
                className="h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90"
              >
                <ShoppingCart className="h-6 w-6" />
              </Button>
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </motion.div>
          </CartDrawer>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      {user && role && (
        <MobileBottomNav currentRole={role} onSignOut={signOut} />
      )}
    </div>
  );
}
