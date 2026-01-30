import { lazy, Suspense, memo, useEffect, useState } from "react";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";
import { useForceRefresh } from "@/hooks/useForceRefresh";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { PinAuthProvider } from "@/hooks/usePinAuth";
import { BiometricAuthProvider } from "@/hooks/useBiometricAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { CurrencyProvider } from "@/hooks/useCurrency";
import { CombinedSettingsProvider } from "@/hooks/useCombinedSettings";
import { CartProvider } from "@/hooks/useCart";
import { ComparisonProvider } from "@/hooks/useProductComparison";
import { OfflineProvider } from "@/contexts/OfflineContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import ChunkErrorBoundary from "@/components/ChunkErrorBoundary";

// Only lazy load truly optional UI components
const Toaster = lazy(() => import("@/components/ui/toaster").then(m => ({ default: m.Toaster })));
const Sonner = lazy(() => import("@/components/ui/sonner").then(m => ({ default: m.Toaster })));
const PWAInstallPrompt = lazy(() => import("@/components/PWAInstallPrompt"));
const WhatsNewModal = lazy(() => import("@/components/WhatsNewModal").then(m => ({ default: m.WhatsNewModal })));
const GlobalSettingsToolbar = lazy(() => import("@/components/GlobalSettingsToolbar").then(m => ({ default: m.GlobalSettingsToolbar })));
const IOSOptimizations = lazy(() => import("@/components/IOSOptimizations"));
const IOSLinkHandler = lazy(() => import("@/components/IOSLinkHandler"));
const IOSShareReceiver = lazy(() => import("@/components/IOSShareReceiver"));

// Lazy load routes
const Landing = lazy(() => import("./pages/Landing"));
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
const DepositHistory = lazy(() => import('./pages/DepositHistory'));
const WelileHomes = lazy(() => import('./pages/WelileHomes'));
const WelileHomesDashboard = lazy(() => import('./pages/WelileHomesDashboard'));
const LandlordWelileHomesPage = lazy(() => import('./pages/LandlordWelileHomesPage'));
const TryCalculator = lazy(() => import('./pages/TryCalculator'));
const PublicRentCalculator = lazy(() => import('./pages/PublicRentCalculator'));
const TVDashboard = lazy(() => import('./pages/TVDashboard'));

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

// Ultra-minimal page loader - shows retry after 5s
const PageLoader = memo(() => {
  const [showRetry, setShowRetry] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setShowRetry(true), 5000);
    return () => clearTimeout(timer);
  }, []);
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      {showRetry && (
        <button
          onClick={() => { sessionStorage.removeItem('chunk_retry'); location.reload(); }}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
          style={{ minHeight: '44px' }}
        >
          Tap to Retry
        </button>
      )}
    </div>
  );
});
PageLoader.displayName = 'PageLoader';

// Prefetch common routes on idle
function RoutePrefetcher() {
  const location = useLocation();
  
  useEffect(() => {
    // Prefetch likely next routes based on current location
    const prefetchMap: Record<string, string[]> = {
      '/': ['/auth', '/dashboard', '/welcome'],
      '/auth': ['/dashboard', '/select-role'],
      '/select-role': ['/dashboard'],
      '/welcome': ['/auth', '/rent-calculator', '/try-calculator'],
      '/rent-calculator': ['/auth'],
      '/try-calculator': ['/auth'],
    };
    
    const routesToPrefetch = prefetchMap[location.pathname] || [];
    
    // Use requestIdleCallback for non-blocking prefetch
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        routesToPrefetch.forEach(route => {
          const link = document.createElement('link');
          link.rel = 'prefetch';
          link.href = route;
          link.as = 'document';
          document.head.appendChild(link);
        });
      });
    }
  }, [location.pathname]);
  
  return null;
}

// Stable routes wrapper (no JS-based page transitions to avoid mobile “shaking”)
function AppRoutes() {
  // Auto-update service worker for real-time feature deployment
  useServiceWorkerUpdate();

  // Listen for force refresh signals from managers
  useForceRefresh();

  return (
    <div className="min-h-screen">
      <RoutePrefetcher />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/welcome" element={<Landing />} />
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
          <Route path="/deposit-history" element={<DepositHistory />} />
          <Route path="/welile-homes" element={<WelileHomes />} />
          <Route path="/welile-homes-dashboard" element={<WelileHomesDashboard />} />
          <Route path="/landlord-welile-homes" element={<LandlordWelileHomesPage />} />
          <Route path="/try-calculator" element={<TryCalculator />} />
          <Route path="/rent-calculator" element={<PublicRentCalculator />} />
          <Route path="/tv-dashboard" element={<TVDashboard />} />
          <Route path="/share" element={<Index />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
  );
}

// Flattened provider structure (reduced from 13 to 9 levels)
const App = () => (
  <ChunkErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <CombinedSettingsProvider>
          <LanguageProvider>
            <CurrencyProvider>
              <BrowserRouter>
                <AuthProvider>
                  <PinAuthProvider>
                    <BiometricAuthProvider>
                      <OfflineProvider>
                        <CartProvider>
                          <ComparisonProvider>
                            <TooltipProvider delayDuration={300}>
                              <AppRoutes />
                              <Suspense fallback={null}>
                                <IOSOptimizations />
                                <IOSLinkHandler />
                                <IOSShareReceiver />
                                <PWAInstallPrompt />
                                <WhatsNewModal />
                                <GlobalSettingsToolbar />
                                <Toaster />
                                <Sonner />
                              </Suspense>
                            </TooltipProvider>
                          </ComparisonProvider>
                        </CartProvider>
                      </OfflineProvider>
                    </BiometricAuthProvider>
                  </PinAuthProvider>
                </AuthProvider>
              </BrowserRouter>
            </CurrencyProvider>
          </LanguageProvider>
        </CombinedSettingsProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ChunkErrorBoundary>
);

export default App;