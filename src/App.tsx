import { lazy, Suspense, memo } from "react";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { CurrencyProvider } from "@/hooks/useCurrency";
import { FontSizeProvider } from "@/hooks/useFontSize";
import { HapticSettingsProvider } from "@/hooks/useHapticSettings";
import { CartProvider } from "@/hooks/useCart";
import { ComparisonProvider } from "@/hooks/useProductComparison";
import { OfflineProvider } from "@/contexts/OfflineContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import ChunkErrorBoundary from "@/components/ChunkErrorBoundary";

// Lazy load non-critical UI components
const Toaster = lazy(() => import("@/components/ui/toaster").then(m => ({ default: m.Toaster })));
const Sonner = lazy(() => import("@/components/ui/sonner").then(m => ({ default: m.Toaster })));
const ConnectionStatus = lazy(() => import("@/components/ConnectionStatus").then(m => ({ default: m.ConnectionStatus })));
const PWAInstallPrompt = lazy(() => import("@/components/PWAInstallPrompt"));
const WhatsNewModal = lazy(() => import("@/components/WhatsNewModal").then(m => ({ default: m.WhatsNewModal })));
const GlobalSettingsToolbar = lazy(() => import("@/components/GlobalSettingsToolbar").then(m => ({ default: m.GlobalSettingsToolbar })));
const IOSOptimizations = lazy(() => import("@/components/IOSOptimizations"));
const OfflineBanner = lazy(() => import("@/components/OfflineBanner").then(m => ({ default: m.OfflineBanner })));

// Lazy load routes
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
const Chat = lazy(() => import('./pages/Chat'));
const ChatInvite = lazy(() => import('./pages/ChatInvite'));
const AgentRegistrations = lazy(() => import('./pages/AgentRegistrations'));
const SubAgentAnalytics = lazy(() => import('./pages/SubAgentAnalytics'));
const Join = lazy(() => import('./pages/Join'));
const Calculator = lazy(() => import('./pages/Calculator'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const SupporterEarnings = lazy(() => import('./pages/SupporterEarnings'));
const InvestmentPortfolio = lazy(() => import('./pages/InvestmentPortfolio'));
const MyWatchlist = lazy(() => import('./pages/MyWatchlist'));
const Opportunities = lazy(() => import('./pages/Opportunities'));
const AuditLog = lazy(() => import('./pages/AuditLog'));

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
  
  // Auto-update service worker for real-time feature deployment
  useServiceWorkerUpdate();
  
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
            <Route path="/chat" element={<Chat />} />
            <Route path="/chat/invite/:userId" element={<ChatInvite />} />
            <Route path="/agent-registrations" element={<AgentRegistrations />} />
            <Route path="/sub-agents" element={<SubAgentAnalytics />} />
            <Route path="/join" element={<Join />} />
            <Route path="/calculator" element={<Calculator />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/supporter-earnings" element={<SupporterEarnings />} />
            <Route path="/investment-portfolio" element={<InvestmentPortfolio />} />
            <Route path="/my-watchlist" element={<MyWatchlist />} />
            <Route path="/opportunities" element={<Opportunities />} />
            <Route path="/audit-log" element={<AuditLog />} />
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
              <CurrencyProvider>
                <BrowserRouter>
                  <AuthProvider>
                    <OfflineProvider>
                      <CartProvider>
                        <ComparisonProvider>
                          <TooltipProvider delayDuration={300}>
                            <Suspense fallback={null}>
                              <IOSOptimizations />
                              <OfflineBanner />
                              <ConnectionStatus />
                              <PWAInstallPrompt />
                              <WhatsNewModal />
                              <GlobalSettingsToolbar />
                              <Toaster />
                              <Sonner />
                            </Suspense>
                            <AnimatedRoutes />
                          </TooltipProvider>
                        </ComparisonProvider>
                      </CartProvider>
                    </OfflineProvider>
                  </AuthProvider>
                </BrowserRouter>
              </CurrencyProvider>
            </LanguageProvider>
          </HapticSettingsProvider>
        </FontSizeProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ChunkErrorBoundary>
);

export default App;