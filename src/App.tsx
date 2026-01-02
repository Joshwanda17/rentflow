import { lazy, Suspense, memo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { CartProvider } from "@/hooks/useCart";
import { ComparisonProvider } from "@/hooks/useProductComparison";
import { FontSizeProvider } from "@/hooks/useFontSize";
import { HapticSettingsProvider } from "@/hooks/useHapticSettings";
import { ConnectionStatus } from "@/components/ConnectionStatus";

// Lazy load routes for better initial load performance at scale
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SelectRole = lazy(() => import("./pages/SelectRole"));
const TransactionHistory = lazy(() => import("./pages/TransactionHistory"));
const Settings = lazy(() => import("./pages/Settings"));
const AgentEarnings = lazy(() => import("./pages/AgentEarnings"));
const UpdatePassword = lazy(() => import("./pages/UpdatePassword"));
const OrderHistory = lazy(() => import("./pages/OrderHistory"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const AgentAnalytics = lazy(() => import("./pages/AgentAnalytics"));
const FlashSales = lazy(() => import("./pages/FlashSales"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const Categories = lazy(() => import("./pages/Categories"));
const SellerProfile = lazy(() => import("./pages/SellerProfile"));
const NotFound = lazy(() => import("./pages/NotFound"));
const MyReceipts = lazy(() => import('./pages/MyReceipts'));
const VendorPortal = lazy(() => import('./pages/VendorPortal'));
const MyLoans = lazy(() => import('./pages/MyLoans'));
const PaymentSchedule = lazy(() => import('./pages/PaymentSchedule'));
const PayLandlord = lazy(() => import('./pages/PayLandlord'));
// Optimized QueryClient for 40M+ users scale
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time: 5 minutes - reduces server load
      staleTime: 5 * 60 * 1000,
      // Cache time: 30 minutes - keeps data in memory
      gcTime: 30 * 60 * 1000,
      // Retry with exponential backoff
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Don't refetch on window focus for mobile users
      refetchOnWindowFocus: false,
      // Network-aware fetching
      networkMode: 'offlineFirst',
    },
    mutations: {
      // Retry mutations once
      retry: 1,
      networkMode: 'offlineFirst',
    },
  },
});

const pageVariants = {
  initial: { 
    opacity: 0, 
    y: 8,
  },
  animate: { 
    opacity: 1, 
    y: 0,
  },
  exit: { 
    opacity: 0,
    y: -4,
  },
};

const pageTransition = {
  duration: 0.2,
  ease: [0.25, 0.46, 0.45, 0.94] as const,
};

// Minimal loading fallback for code splitting
const PageLoader = memo(() => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
));

PageLoader.displayName = 'PageLoader';

const AnimatedRoutes = memo(function AnimatedRoutes() {
  const location = useLocation();
  
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={pageTransition}
      >
        <Suspense fallback={<PageLoader />}>
          <Routes location={location}>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/select-role" element={<SelectRole />} />
            <Route path="/transactions" element={<TransactionHistory />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/earnings" element={<AgentEarnings />} />
            <Route path="/update-password" element={<UpdatePassword />} />
            <Route path="/orders" element={<OrderHistory />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/analytics" element={<AgentAnalytics />} />
            <Route path="/flash-sales" element={<FlashSales />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/seller/:sellerId" element={<SellerProfile />} />
            <Route path="/my-receipts" element={<MyReceipts />} />
            <Route path="/my-loans" element={<MyLoans />} />
            <Route path="/payment-schedule" element={<PaymentSchedule />} />
            <Route path="/pay-landlord" element={<PayLandlord />} />
            <Route path="/vendor-portal" element={<VendorPortal />} />
            <Route path="*" element={<NotFound />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
});

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <FontSizeProvider>
        <HapticSettingsProvider>
          <LanguageProvider>
            <AuthProvider>
              <CartProvider>
                <ComparisonProvider>
                  <TooltipProvider delayDuration={300}>
                    <ConnectionStatus />
                    <Toaster />
                    <Sonner />
                    <BrowserRouter>
                      <AnimatedRoutes />
                    </BrowserRouter>
                  </TooltipProvider>
                </ComparisonProvider>
              </CartProvider>
            </AuthProvider>
          </LanguageProvider>
        </HapticSettingsProvider>
      </FontSizeProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
