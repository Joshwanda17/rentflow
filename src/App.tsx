// TEMPORARY: Disable all realtime subscriptions to free DB connections
import '@/lib/disableRealtime';

import { lazy, Suspense, memo, useEffect, useState, Component, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import ChunkErrorBoundary from "@/components/ChunkErrorBoundary";

// Critical providers — loaded eagerly for instant auth/routing
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { CurrencyProvider } from "@/hooks/useCurrency";
import { CombinedSettingsProvider } from "@/hooks/useCombinedSettings";

// Auth providers — must be eager since they wrap all routes
import { PinAuthProvider } from "@/hooks/usePinAuth";
import { BiometricAuthProvider } from "@/hooks/useBiometricAuth";

// Deferred providers - loaded after first paint
const CartProvider = lazy(() => import("@/hooks/useCart").then(m => ({ default: m.CartProvider })));
const ComparisonProvider = lazy(() => import("@/hooks/useProductComparison").then(m => ({ default: m.ComparisonProvider })));
const OfflineProvider = lazy(() => import("@/contexts/OfflineContext").then(m => ({ default: m.OfflineProvider })));

// Lazy load optional UI components
const Toaster = lazy(() => import("@/components/ui/toaster").then(m => ({ default: m.Toaster })));
const Sonner = lazy(() => import("@/components/ui/sonner").then(m => ({ default: m.Toaster })));
const DeferredExtras = lazy(() => import("@/components/DeferredExtras"));

// Index is the entry router — must be eager for instant redirect
import Index from "./pages/Index";
// Landing is only needed on /welcome — lazy load it
const Landing = lazy(() => import("./pages/Landing"));
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
const ShopEntry = lazy(() => import('./pages/ShopEntry'));
const ManagerLogin = lazy(() => import('./pages/ManagerLogin'));
const FinancialStatement = lazy(() => import('./pages/FinancialStatement'));

// Detect iOS standalone mode for cache settings
const isIOSStandalone = (() => {
  if (typeof window === 'undefined') return false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const isStandalone = (window.navigator as any).standalone === true || 
                       window.matchMedia('(display-mode: standalone)').matches;
  return isIOS && isStandalone;
})();

// Optimized QueryClient with iOS-specific settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: isIOSStandalone ? 30 * 1000 : 10 * 60 * 1000,
      gcTime: isIOSStandalone ? 5 * 60 * 1000 : 60 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
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

// Stable routes wrapper — no RoutePrefetcher (DOM overhead), no JS page transitions
function AppRoutes() {
  return (
    <div className="min-h-screen">
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/welcome" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/select-role" element={<SelectRole />} />
          <Route path="/transactions" element={<TransactionHistory />} />
          <Route path="/financial-statement" element={<FinancialStatement />} />
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
          <Route path="/shop" element={<ShopEntry />} />
          <Route path="/manager-login" element={<ManagerLogin />} />
          <Route path="/share" element={<Index />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
  );
}

// Lightweight error boundary for deferred providers — falls back to rendering children without providers
class DeferredErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: Error) { console.warn('[DeferredProviders] Failed to load, continuing without:', err.message); }
  render() { return this.state.failed ? <>{this.props.children}</> : this.props.children; }
}

// Deferred wrapper — loads providers after first paint via idle callback
function DeferredProviders({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  
  useEffect(() => {
    const activate = () => setReady(true);
    if ('requestIdleCallback' in window) {
      const id = (window as any).requestIdleCallback(activate, { timeout: 1500 });
      return () => (window as any).cancelIdleCallback(id);
    }
    const id = setTimeout(activate, 150);
    return () => clearTimeout(id);
  }, []);
  
  if (!ready) return <>{children}</>;
  
  return (
    <DeferredErrorBoundary>
      <Suspense fallback={<>{children}</>}>
        <OfflineProvider>
          <CartProvider>
            <ComparisonProvider>
              {children}
            </ComparisonProvider>
          </CartProvider>
        </OfflineProvider>
      </Suspense>
    </DeferredErrorBoundary>
  );
}

const App = () => (
  <ChunkErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CombinedSettingsProvider>
            <LanguageProvider>
              <CurrencyProvider>
                <AuthProvider>
                  <PinAuthProvider>
                    <BiometricAuthProvider>
                      <TooltipProvider delayDuration={300}>
                        <DeferredProviders>
                          <AppRoutes />
                        </DeferredProviders>
                        <Suspense fallback={null}>
                          <DeferredExtras />
                          <Toaster />
                          <Sonner />
                        </Suspense>
                      </TooltipProvider>
                    </BiometricAuthProvider>
                  </PinAuthProvider>
                </AuthProvider>
              </CurrencyProvider>
            </LanguageProvider>
          </CombinedSettingsProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </ChunkErrorBoundary>
);

export default App;
