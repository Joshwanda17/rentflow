import { lazy, Suspense, memo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { CartProvider } from "@/hooks/useCart";
import { ComparisonProvider } from "@/hooks/useProductComparison";
import { FontSizeProvider } from "@/hooks/useFontSize";
import { HapticSettingsProvider } from "@/hooks/useHapticSettings";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import ChunkErrorBoundary from "@/components/ChunkErrorBoundary";

// Lazy load all routes
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
const RentDiscountHistory = lazy(() => import('./pages/RentDiscountHistory'));
const Benefits = lazy(() => import('./pages/Benefits'));
const Referrals = lazy(() => import('./pages/Referrals'));
const ManagerAccess = lazy(() => import('./pages/ManagerAccess'));
const BecomeSupporter = lazy(() => import('./pages/BecomeSupporter'));
const DepositsManagement = lazy(() => import('./pages/DepositsManagement'));
const Install = lazy(() => import('./pages/Install'));
const ActivateSupporter = lazy(() => import('./pages/ActivateSupporter'));

// Optimized QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 1,
      networkMode: 'offlineFirst',
    },
  },
});

// Minimal page loader
const PageLoader = memo(() => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
));
PageLoader.displayName = 'PageLoader';

// Page transition variants
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
    y: -8,
  },
};

const pageTransition = {
  duration: 0.2,
  ease: [0.25, 0.46, 0.45, 0.94] as const,
};

// Animated routes wrapper
function AnimatedRoutes() {
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
        className="min-h-screen"
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
            <Route path="/rent-discount-history" element={<RentDiscountHistory />} />
            <Route path="/benefits" element={<Benefits />} />
            <Route path="/referrals" element={<Referrals />} />
            <Route path="/manager-access" element={<ManagerAccess />} />
            <Route path="/become-supporter" element={<BecomeSupporter />} />
            <Route path="/vendor-portal" element={<VendorPortal />} />
            <Route path="/deposits-management" element={<DepositsManagement />} />
            <Route path="/install" element={<Install />} />
            <Route path="/activate-supporter" element={<ActivateSupporter />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

const App = () => (
  <ChunkErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <FontSizeProvider>
          <HapticSettingsProvider>
            <LanguageProvider>
              <BrowserRouter>
                <AuthProvider>
                  <CartProvider>
                    <ComparisonProvider>
                      <TooltipProvider delayDuration={300}>
                        <ConnectionStatus />
                        <PWAInstallPrompt />
                        <Toaster />
                        <Sonner />
                        <AnimatedRoutes />
                      </TooltipProvider>
                    </ComparisonProvider>
                  </CartProvider>
                </AuthProvider>
              </BrowserRouter>
            </LanguageProvider>
          </HapticSettingsProvider>
        </FontSizeProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ChunkErrorBoundary>
);

export default App;