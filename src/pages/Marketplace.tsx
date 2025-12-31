import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Store, ArrowLeft, Zap, Grid3X3 } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import WelileLogo from '@/components/WelileLogo';
import { useAuth } from '@/hooks/useAuth';
import { MarketplaceSection } from '@/components/marketplace/MarketplaceSection';

export default function Marketplace() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get('category') || undefined;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <motion.header 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl"
      >
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/">
              <motion.div whileHover={{ scale: 1.05 }} transition={{ type: 'spring', stiffness: 400, damping: 17 }}>
                <WelileLogo />
              </motion.div>
            </Link>
            <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary gap-1">
              <Store className="h-3 w-3" />
              Marketplace
            </Badge>
            {initialCategory && (
              <Badge className="capitalize">{initialCategory}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link to="/categories">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Grid3X3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Categories</span>
                </Button>
              </motion.div>
            </Link>
            <Link to="/flash-sales">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button variant="outline" size="sm" className="gap-2 border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10">
                  <Zap className="h-4 w-4 fill-current" />
                  <span className="hidden sm:inline">Flash Sales</span>
                </Button>
              </motion.div>
            </Link>
            <ThemeToggle />
            <Link to={user ? "/dashboard" : "/auth"}>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  {user ? 'Dashboard' : 'Sign In'}
                </Button>
              </motion.div>
            </Link>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <MarketplaceSection initialCategory={initialCategory} />
        </motion.div>
      </main>
    </div>
  );
}
