// Realtime: enabled


import { lazy, Suspense, memo, useEffect, useState, Component, type ReactNode } from "react";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import ChunkErrorBoundary from "@/components/ChunkErrorBoundary";
import { PullToRefresh } from "@/components/PullToRefresh";

// Critical providers — loaded eagerly for instant auth/routing
import { AuthProvider } from "@/hooks/useAuth";
import { CombinedSettingsProvider } from "@/hooks/useCombinedSettings";

// Deferred language/currency — not needed for first paint
const LanguageProvider = lazy(() => import("@/hooks/useLanguage").then(m => ({ default: m.LanguageProvider })));
const CurrencyProvider = lazy(() => import("@/hooks/useCurrency").then(m => ({ default: m.CurrencyProvider })));

// Auth providers — deferred since they're not needed for first paint
const PinAuthProvider = lazy(() => import("@/hooks/usePinAuth").then(m => ({ default: m.PinAuthProvider })));
const BiometricAuthProvider = lazy(() => import("@/hooks/useBiometricAuth").then(m => ({ default: m.BiometricAuthProvider })));

// Deferred providers - loaded after first paint
const CartProvider = lazy(() => import("@/hooks/useCart").then(m => ({ default: m.CartProvider })));
const ComparisonProvider = lazy(() => import("@/hooks/useProductComparison").then(m => ({ default: m.ComparisonProvider })));
const OfflineProvider = lazy(() => import("@/contexts/OfflineContext").then(m => ({ default: m.OfflineProvider })));
const FeatureFlagsProvider = lazy(() => import("@/contexts/FeatureFlagsContext").then(m => ({ default: m.FeatureFlagsProvider })));

// Lazy load optional UI components
const Toaster = lazy(() => import("@/components/ui/toaster").then(m => ({ default: m.Toaster })));

const DeferredExtras = lazy(() => import("@/components/DeferredExtras"));
const FloatingToolbar = lazy(() => import("@/components/FloatingToolbar"));
const PWAInstallPrompt = lazy(() => import("@/components/PWAInstallPrompt"));


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
// Chat feature removed
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

const RegisterTenantPublic = lazy(() => import('./pages/RegisterTenantPublic'));
const RegisterPartnerPublic = lazy(() => import('./pages/RegisterPartnerPublic'));
const ActivatePartner = lazy(() => import('./pages/ActivatePartner'));
const ResolveShortLink = lazy(() => import('./pages/ResolveShortLink'));
const HouseDetail = lazy(() => import('./pages/HouseDetail'));
const ShopEntry = lazy(() => import('./pages/ShopEntry'));
const ManagerLogin = lazy(() => import('./pages/ManagerLogin'));
const StaffPortal = lazy(() => import('./pages/StaffPortal'));
const FinancialStatement = lazy(() => import('./pages/FinancialStatement'));
const ReinvestmentHistory = lazy(() => import('./pages/ReinvestmentHistory'));
// Executive role-isolated dashboards
const CTODashboardPage = lazy(() => import('./pages/cto/Dashboard'));
const CEODashboardPage = lazy(() => import('./pages/ceo/Dashboard'));
const CMODashboardPage = lazy(() => import('./pages/cmo/Dashboard'));
const CRMDashboardPage = lazy(() => import('./pages/crm/Dashboard'));
const CFODashboardPage = lazy(() => import('./pages/cfo/Dashboard'));
const COODashboardPage = lazy(() => import('./pages/coo/Dashboard'));
const HRDashboardPage = lazy(() => import('./pages/hr/Dashboard'));
const HREmployeeProfilePage = lazy(() => import('./pages/hr/EmployeeProfile'));
const AdminDashboardPage = lazy(() => import('./pages/admin/Dashboard'));
const AdminUsersPage = lazy(() => import('./pages/admin/Users'));
const AdminFinancialOpsPage = lazy(() => import('./pages/admin/FinancialOps'));
const RoleGuard = lazy(() => import('./components/auth/RoleGuard'));
const ExecutiveHubPage = lazy(() => import('./pages/ExecutiveHub'));
const ROITrendsPage = lazy(() => import('./components/executive/ROITrendsPage'));
const OperationsDashboardPage = lazy(() => import('./pages/operations/Dashboard'));
const AgentAdvances = lazy(() => import('./pages/AgentAdvances'));
const AgentAdvanceDetail = lazy(() => import('./pages/AgentAdvanceDetail'));
const AgentCashPayoutsPage = lazy(() => import('./pages/agent/CashPayouts'));
const ActiveUsersDetail = lazy(() => import('./pages/coo/ActiveUsersDetail'));
const EarningAgentsDetail = lazy(() => import('./pages/coo/EarningAgentsDetail'));
const TenantsBalancesDetail = lazy(() => import('./pages/coo/TenantsBalancesDetail'));
const NewRentRequestsDetail = lazy(() => import('./pages/coo/NewRentRequestsDetail'));
const ActivePartnersDetail = lazy(() => import('./pages/coo/ActivePartnersDetail'));
const NewPartnerRequestsDetail = lazy(() => import('./pages/coo/NewPartnerRequestsDetail'));
const ActiveLandlordsDetail = lazy(() => import('./pages/coo/ActiveLandlordsDetail'));
const PipelineLandlordsDetail = lazy(() => import('./pages/coo/PipelineLandlordsDetail'));
const RentCoverageDetail = lazy(() => import('./pages/coo/RentCoverageDetail'));
const WelileAIPage = lazy(() => import('./components/ai-chat/WelileAIChatButton').then(m => ({ default: m.WelileAIPage })));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const ShareLocation = lazy(() => import('./pages/ShareLocation'));
const InvestorPortfolioPublic = lazy(() => import('./pages/InvestorPortfolioPublic'));
const RentMoney = lazy(() => import('./pages/RentMoney'));
const FindAHouse = lazy(() => import('./pages/FindAHouse'));
const LandlordAgreement = lazy(() => import('./pages/LandlordAgreement'));
const AgentAgreement = lazy(() => import('./pages/AgentAgreement'));
const AngelPool = lazy(() => import('./pages/AngelPool'));
const AngelPoolAgreement = lazy(() => import('./pages/AngelPoolAgreement'));
const AgentCommissionBenefits = lazy(() => import('./pages/AgentCommissionBenefits'));

// Detect iOS standalone mode for cache settings
const isIOSStandalone = (() => {
  if (typeof window === 'undefined') return false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const isStandalone = (window.navigator as any).standalone === true || 
                       window.matchMedia('(display-mode: standalone)').matches;
  return isIOS && isStandalone;
})();

// Detect slow connection — agents in low-network areas get longer cache times
const isSlowNetwork = (() => {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as any).connection;
  if (conn) {
    return conn.saveData || conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g' || conn.effectiveType === '3g';
  }
  return false;
})();

// Apply save-data class to document for CSS optimizations
if (isSlowNetwork && typeof document !== 'undefined') {
  document.documentElement.classList.add('save-data');
  // Listen for connection changes
  const conn = (navigator as any).connection;
  if (conn) {
    conn.addEventListener('change', () => {
      const slow = conn.saveData || conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g' || conn.effectiveType === '3g';
      document.documentElement.classList.toggle('save-data', slow);
    });
  }
}

// Optimized QueryClient — longer caches on slow networks for agents in remote areas
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: isSlowNetwork ? 30 * 60 * 1000 : (isIOSStandalone ? 5 * 60 * 1000 : 10 * 60 * 1000),
      gcTime: isSlowNetwork ? 120 * 60 * 1000 : (isIOSStandalone ? 30 * 60 * 1000 : 60 * 60 * 1000),
      retry: isSlowNetwork ? 3 : 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, isSlowNetwork ? 30000 : 15000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: isSlowNetwork ? 3 : 1,
      networkMode: 'offlineFirst',
    },
  },
});

// Ultra-minimal page loader - shows retry after 5s
const PageLoader = memo(() => {
  const [showRetry, setShowRetry] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setShowRetry(true), 3500);
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
// Global banner - lazy loaded
function AppRoutes() {
  const handlePullRefresh = async () => {
    try {
      // Clear all caches
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      // Unregister service workers so fresh content loads
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch {
      // ignore cache errors
    }
    // Hard reload to pick up new assets
    window.location.reload();
  };

  return (
    <PullToRefresh onRefresh={handlePullRefresh} className="min-h-screen">
      <div>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/welcome" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/r/:code" element={<ResolveShortLink />} />
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
          <Route path="/angel-pool" element={<AngelPool />} />
          <Route path="/vendor-portal" element={<VendorPortal />} />
          <Route path="/deposits-management" element={<DepositsManagement />} />
          <Route path="/install" element={<Install />} />
          <Route path="/activate-supporter" element={<ActivateSupporter />} />
          {/* Chat feature removed */}
          <Route path="/agent-registrations" element={<AgentRegistrations />} />
          <Route path="/sub-agents" element={<SubAgentAnalytics />} />
          <Route path="/join" element={<Join />} />
          <Route path="/calculator" element={<Calculator />} />
          <Route path="/users" element={<RoleGuard allowedRoles={['super_admin', 'manager', 'cto']}><AdminUsersPage /></RoleGuard>} />
          <Route path="/platform-users" element={<RoleGuard allowedRoles={['manager', 'cto']}><UserManagement /></RoleGuard>} />
          <Route path="/supporter-earnings" element={<SupporterEarnings />} />
          <Route path="/reinvestment-history" element={<ReinvestmentHistory />} />
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
          <Route path="/find-a-house" element={<FindAHouse />} />
          <Route path="/house/:id" element={<HouseDetail />} />
          
          <Route path="/shop" element={<ShopEntry />} />
          <Route path="/landlord-agreement" element={<LandlordAgreement />} />
          <Route path="/agent-agreement" element={<AgentAgreement />} />
          <Route path="/angel-pool-agreement" element={<AngelPoolAgreement />} />
          <Route path="/agent-commission-benefits" element={<AgentCommissionBenefits />} />
          <Route path="/manager-login" element={<ManagerLogin />} />
          <Route path="/staff" element={<StaffPortal />} />
          {/* Role-isolated executive dashboards */}
          <Route path="/cto/dashboard" element={<RoleGuard allowedRoles={['cto', 'super_admin']}><CTODashboardPage /></RoleGuard>} />
          <Route path="/ceo/dashboard" element={<RoleGuard allowedRoles={['ceo', 'super_admin', 'cto']}><CEODashboardPage /></RoleGuard>} />
          <Route path="/cfo/dashboard" element={<RoleGuard allowedRoles={['cfo', 'super_admin', 'cto']}><CFODashboardPage /></RoleGuard>} />
          <Route path="/coo/dashboard" element={<RoleGuard allowedRoles={['coo', 'super_admin', 'cto']}><COODashboardPage /></RoleGuard>} />
          <Route path="/cmo/dashboard" element={<RoleGuard allowedRoles={['cmo', 'super_admin', 'cto']}><CMODashboardPage /></RoleGuard>} />
          <Route path="/crm/dashboard" element={<RoleGuard allowedRoles={['crm', 'super_admin', 'cto']}><CRMDashboardPage /></RoleGuard>} />
          <Route path="/hr/dashboard" element={<RoleGuard allowedRoles={['hr', 'super_admin', 'cto']}><HRDashboardPage /></RoleGuard>} />
          <Route path="/hr/profiles/:userId" element={<RoleGuard allowedRoles={['hr', 'super_admin', 'cto']}><HREmployeeProfilePage /></RoleGuard>} />
          <Route path="/admin/dashboard" element={<RoleGuard allowedRoles={['super_admin', 'manager', 'employee']}><AdminDashboardPage /></RoleGuard>} />
          <Route path="/admin/users" element={<RoleGuard allowedRoles={['super_admin', 'manager', 'cto']}><AdminUsersPage /></RoleGuard>} />
          <Route path="/admin/financial-ops" element={<RoleGuard allowedRoles={['super_admin', 'manager', 'coo', 'cfo']}><AdminFinancialOpsPage /></RoleGuard>} />
          <Route path="/operations" element={<RoleGuard allowedRoles={['operations', 'super_admin', 'manager']}><OperationsDashboardPage /></RoleGuard>} />
          {/* Legacy redirects */}
          <Route path="/coo-dashboard" element={<RoleGuard allowedRoles={['coo', 'super_admin', 'cto']}><COODashboardPage /></RoleGuard>} />
          <Route path="/cfo-dashboard" element={<RoleGuard allowedRoles={['cfo', 'super_admin', 'cto']}><CFODashboardPage /></RoleGuard>} />
          <Route path="/executive-hub" element={<RoleGuard allowedRoles={['ceo', 'cto', 'cmo', 'crm', 'coo', 'cfo', 'super_admin', 'manager', 'employee', 'operations']}><ExecutiveHubPage /></RoleGuard>} />
          <Route path="/roi-trends" element={<RoleGuard allowedRoles={['ceo', 'coo', 'cfo', 'super_admin', 'manager', 'operations']}><ROITrendsPage /></RoleGuard>} />
           <Route path="/agent-advances" element={<AgentAdvances />} />
           <Route path="/agent-advances/:id" element={<AgentAdvanceDetail />} />
           <Route path="/agent/cash-payouts" element={<AgentCashPayoutsPage />} />
          <Route path="/coo/active-users" element={<ActiveUsersDetail />} />
          <Route path="/coo/earning-agents" element={<EarningAgentsDetail />} />
          <Route path="/coo/tenants-balances" element={<TenantsBalancesDetail />} />
          <Route path="/coo/rent-requests" element={<NewRentRequestsDetail />} />
          <Route path="/coo/active-partners" element={<ActivePartnersDetail />} />
          <Route path="/coo/partner-requests" element={<NewPartnerRequestsDetail />} />
          <Route path="/coo/active-landlords" element={<ActiveLandlordsDetail />} />
          <Route path="/coo/pipeline-landlords" element={<PipelineLandlordsDetail />} />
          <Route path="/coo/rent-coverage" element={<RentCoverageDetail />} />
          <Route path="/share" element={<Index />} />
          <Route path="/ai" element={<WelileAIPage />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/share-location" element={<ShareLocation />} />
          <Route path="/investor/portfolio/:token" element={<InvestorPortfolioPublic />} />
          <Route path="/register-tenant" element={<RegisterTenantPublic />} />
          <Route path="/register-partner" element={<RegisterPartnerPublic />} />
          <Route path="/activate" element={<ActivatePartner />} />
          <Route path="/rent-money" element={<RentMoney />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      </div>
    </PullToRefresh>
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
      const id = (window as any).requestIdleCallback(activate, { timeout: 800 });
      return () => (window as any).cancelIdleCallback(id);
    }
    const id = setTimeout(activate, 100);
    return () => clearTimeout(id);
  }, []);
  
  if (!ready) return <>{children}</>;
  
  return (
    <DeferredErrorBoundary>
      <Suspense fallback={<>{children}</>}>
        <PinAuthProvider>
          <BiometricAuthProvider>
            <OfflineProvider>
              <FeatureFlagsProvider>
                <CartProvider>
                  <ComparisonProvider>
                    {children}
                  </ComparisonProvider>
                </CartProvider>
              </FeatureFlagsProvider>
            </OfflineProvider>
          </BiometricAuthProvider>
        </PinAuthProvider>
      </Suspense>
    </DeferredErrorBoundary>
  );
}

const App = () => (
  <HelmetProvider>
  <ChunkErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CombinedSettingsProvider>
            <AuthProvider>
              <TooltipProvider delayDuration={300}>
                <Suspense fallback={null}>
                  <LanguageProvider>
                    <CurrencyProvider>
                      <DeferredProviders>
                        <AppRoutes />
                      </DeferredProviders>
                      <Suspense fallback={null}>
                        <DeferredExtras />
                        <FloatingToolbar />
                        <PWAInstallPrompt />
                        <Toaster />
                        
                      </Suspense>
                    </CurrencyProvider>
                  </LanguageProvider>
                </Suspense>
              </TooltipProvider>
            </AuthProvider>
          </CombinedSettingsProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </ChunkErrorBoundary>
  </HelmetProvider>
);
export default App;
