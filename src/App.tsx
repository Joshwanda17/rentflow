// Realtime: enabled


import { Suspense, memo, useEffect, useState, Component, type ReactNode } from "react";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import ChunkErrorBoundary from "@/components/ChunkErrorBoundary";
import { PullToRefresh } from "@/components/PullToRefresh";
import { lazyWithRetry, optionalLazyWithRetry } from "@/lib/lazyWithRetry";
// Route every page chunk through the concurrency-limited queue so slow
// networks never see more than N parallel chunk requests at once.
const lazy = lazyWithRetry;

// Critical providers — loaded eagerly for instant auth/routing
import { AuthProvider } from "@/hooks/useAuth";
import AccountFrozenGate from "@/components/account/AccountFrozenGate";
import { CombinedSettingsProvider } from "@/hooks/useCombinedSettings";
import { CurrencyProvider } from "@/hooks/useCurrency";

// Dev-only e2e harness (lazy + tree-shaken in prod via the import.meta.env.DEV guard below).
const BusinessAdvanceHarness = lazyWithRetry(
  () => import("@/pages/__e2e/BusinessAdvanceHarness"),
);
const LandlordSheetStackingHarness = lazyWithRetry(
  () => import("@/pages/__e2e/LandlordSheetStackingHarness"),
);
const PhoneContactActionsHarness = lazyWithRetry(
  () => import("@/pages/__e2e/PhoneContactActionsHarness"),
);
const AvailableHousesHarness = lazyWithRetry(
  () => import("@/pages/__e2e/AvailableHousesHarness"),
);
const ExistingTenantNoticeHarness = lazyWithRetry(
  () => import("@/pages/__e2e/ExistingTenantNoticeHarness"),
);
const ProxyPartnerWithdrawalHarness = lazyWithRetry(
  () => import("@/pages/__e2e/ProxyPartnerWithdrawalHarness"),
);

// Deferred language — not needed for first paint
const LanguageProvider = lazyWithRetry(() => import("@/hooks/useLanguage").then(m => ({ default: m.LanguageProvider })));

// Auth providers — deferred since they're not needed for first paint
const PinAuthProvider = lazyWithRetry(() => import("@/hooks/usePinAuth").then(m => ({ default: m.PinAuthProvider })));
const BiometricAuthProvider = lazyWithRetry(() => import("@/hooks/useBiometricAuth").then(m => ({ default: m.BiometricAuthProvider })));
const ProfileCompletionGate = optionalLazyWithRetry(() => import("@/components/onboarding/ProfileCompletionGate"), "ProfileCompletionGate");
const PushNotificationGate = optionalLazyWithRetry(() => import("@/components/notifications/PushNotificationGate"), "PushNotificationGate");
const PhoneCollectionGate = optionalLazyWithRetry(() => import("@/components/notifications/PhoneCollectionGate"), "PhoneCollectionGate");
const NameCompletionGate = optionalLazyWithRetry(() => import("@/components/notifications/NameCompletionGate"), "NameCompletionGate");
const RejectionAlertGate = optionalLazyWithRetry(() => import("@/components/notifications/RejectionAlertGate"), "RejectionAlertGate");
const SubAgentInviteGate = optionalLazyWithRetry(() => import("@/components/agent/SubAgentInviteGate"), "SubAgentInviteGate");
const MerchantAgentReferralGate = optionalLazyWithRetry(() => import("@/components/merchant/MerchantAgentReferralGate"), "MerchantAgentReferralGate");
const ForceResetPasswordGate = optionalLazyWithRetry(() => import("@/components/auth/ForceResetPasswordGate"), "ForceResetPasswordGate");

// Field recruitment campaign pages
const CampaignRedirect = lazyWithRetry(() => import("@/pages/CampaignRedirect"));
const AgentCampaignsPage = lazyWithRetry(() => import("@/pages/AgentCampaignsPage"));

// Deferred providers - loaded after first paint
const CartProvider = lazyWithRetry(() => import("@/hooks/useCart").then(m => ({ default: m.CartProvider })));
const ComparisonProvider = lazyWithRetry(() => import("@/hooks/useProductComparison").then(m => ({ default: m.ComparisonProvider })));
const OfflineProvider = lazyWithRetry(() => import("@/contexts/OfflineContext").then(m => ({ default: m.OfflineProvider })));
const FeatureFlagsProvider = lazyWithRetry(() => import("@/contexts/FeatureFlagsContext").then(m => ({ default: m.FeatureFlagsProvider })));

// Lazy load optional UI components
const Toaster = optionalLazyWithRetry(() => import("@/components/ui/toaster").then(m => ({ default: m.Toaster })), "Toaster");
const SonnerToaster = optionalLazyWithRetry(() => import("@/components/ui/sonner").then(m => ({ default: m.Toaster })), "SonnerToaster");
import MaintenanceBanner from "@/components/MaintenanceBanner";
import MaintenanceLockScreen from "@/components/MaintenanceLockScreen";
import PWAInstallGate from "@/components/PWAInstallGate";
const CreditLoadingDebugPanel = optionalLazyWithRetry(() => import("@/components/debug/CreditLoadingDebugPanel").then(m => ({ default: m.CreditLoadingDebugPanel })), "CreditLoadingDebugPanel");

const DeferredExtras = optionalLazyWithRetry(() => import("@/components/DeferredExtras"), "DeferredExtras");
const FloatingToolbar = optionalLazyWithRetry(() => import("@/components/FloatingToolbar"), "FloatingToolbar");
const PWAInstallPrompt = optionalLazyWithRetry(() => import("@/components/PWAInstallPrompt"), "PWAInstallPrompt");
const MerchantDispatchListener = optionalLazyWithRetry(() => import("@/components/agent/MerchantDispatchListener"), "MerchantDispatchListener");

// Index is the entry router — must be eager for instant redirect

import Index from "./pages/Index";
// Landing is only needed on /welcome — lazy load it
const Landing = lazy(() => import("./pages/Landing"));
const Auth = lazy(() => import("./pages/Auth"));
const OAuthFunnel = lazy(() => import("./pages/OAuthFunnel"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DashboardRedirect = lazy(() => import("./pages/DashboardRedirect"));
const SelectRole = lazy(() => import("./pages/SelectRole"));
const TransactionHistory = lazy(() => import("./pages/TransactionHistory"));
const Settings = lazy(() => import("./pages/Settings"));
const AgentEarnings = lazy(() => import("./pages/AgentEarnings"));
const UpdatePassword = lazy(() => import("./pages/UpdatePassword"));
const OrderHistory = lazy(() => import("./pages/OrderHistory"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const AgentAnalytics = lazy(() => import("./pages/AgentAnalytics"));
const AgentPartners = lazy(() => import("./pages/AgentPartners"));
const FlashSales = lazy(() => import("./pages/FlashSales"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const Categories = lazy(() => import("./pages/Categories"));
const SellerProfile = lazy(() => import("./pages/SellerProfile"));
const SellerPortal = lazy(() => import("./pages/SellerPortal"));
const SharedBreadClaim = lazy(() => import("./pages/SharedBreadClaim"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
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
const InstallDiagnostics = lazy(() => import('./pages/InstallDiagnostics'));
const SupportReport = lazy(() => import('./pages/SupportReport'));
const ActivateSupporter = lazy(() => import('./pages/ActivateSupporter'));
// Chat feature removed
const AgentRegistrations = lazy(() => import('./pages/AgentRegistrations'));
const SubAgentAnalytics = lazy(() => import('./pages/SubAgentAnalytics'));
const MerchandiseStore = lazy(() => import('./pages/MerchandiseStore'));
const Join = lazy(() => import('./pages/Join'));
const SubAgentInvite = lazy(() => import('./pages/SubAgentInvite'));
const InviteMerchantAgent = lazy(() => import('./pages/InviteMerchantAgent'));
const MerchantRegister = lazy(() => import('./pages/MerchantRegister'));
const MerchantAgentOnboarding = lazy(() => import('./pages/MerchantAgentOnboarding'));
const MerchantAgentReferrals = lazy(() => import('./pages/MerchantAgentReferrals'));
const AgentLeaderboard = lazy(() => import('./pages/agent/Leaderboard'));
const RecordRent = lazy(() => import('./pages/RecordRent'));
const Calculator = lazy(() => import('./pages/Calculator'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const SupporterEarnings = lazy(() => import('./pages/SupporterEarnings'));
const InvestmentPortfolio = lazy(() => import('./pages/InvestmentPortfolio'));
const MyWatchlist = lazy(() => import('./pages/MyWatchlist'));
const Opportunities = lazy(() => import('./pages/Opportunities'));
const AvailableHouses = lazy(() => import('./pages/AvailableHouses'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const ReceivablesAudit = lazy(() => import('./pages/ReceivablesAudit'));
const DepositHistory = lazy(() => import('./pages/DepositHistory'));
const DepositVerificationDetail = lazy(() => import('./pages/DepositVerificationDetail'));
const WelileHomes = lazy(() => import('./pages/WelileHomes'));
const WelileHomesDashboard = lazy(() => import('./pages/WelileHomesDashboard'));
const LandlordWelileHomesPage = lazy(() => import('./pages/LandlordWelileHomesPage'));
const TryCalculator = lazy(() => import('./pages/TryCalculator'));
const PublicRentCalculator = lazy(() => import('./pages/PublicRentCalculator'));
const LandlordSignup = lazy(() => import('./pages/LandlordSignup'));
const PayRentInstallmentsGuide = lazy(() => import('./pages/PayRentInstallmentsGuide'));
const CostOfRentingGuide = lazy(() => import('./pages/CostOfRentingGuide'));
const NeighborhoodComparisonGuide = lazy(() => import('./pages/NeighborhoodComparisonGuide'));

const RegisterTenantPublic = lazy(() => import('./pages/RegisterTenantPublic'));
const RegisterPartnerPublic = lazy(() => import('./pages/RegisterPartnerPublic'));
const ActivatePartner = lazy(() => import('./pages/ActivatePartner'));
const BusinessAdvanceTrack = lazy(() => import('./pages/BusinessAdvanceTrack'));
const ResolveRLink = lazy(() => import('./pages/ResolveRLink'));
const TrackedRedirect = lazy(() => import('./pages/TrackedRedirect'));
const RentAccessLimitPublic = lazy(() => import('./pages/RentAccessLimitPublic'));
const Unsubscribe = lazy(() => import('./pages/Unsubscribe'));
const StopSms = lazy(() => import('./pages/StopSms'));
const PublicRequisitionForm = lazy(() => import('./pages/PublicRequisitionForm'));
const PayoutReceipt = lazy(() => import('./pages/PayoutReceipt'));
const ResumeSms = lazy(() => import('./pages/ResumeSms'));
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
const InvestorReportPage = lazy(() => import('./pages/cfo/InvestorReportPage'));
const MoneyFlowTracePage = lazy(() => import('./pages/cfo/MoneyFlowTrace'));
const LedgerEntryDetailPage = lazy(() => import('./pages/cfo/LedgerEntryDetail'));
const LedgerEntryDeepLinkPage = lazy(() => import('./pages/LedgerEntryDeepLink'));
const VerificationRequestDetailPage = lazy(() => import('./pages/VerificationRequestDetail'));
const PhantomDriftDetailPage = lazy(() => import('./pages/cfo/PhantomDriftDetail'));
const COODashboardPage = lazy(() => import('./pages/coo/Dashboard'));
const HRDashboardPage = lazy(() => import('./pages/hr/Dashboard'));
const HREmployeeProfilePage = lazy(() => import('./pages/hr/EmployeeProfile'));
const DirectorDashboardPage = lazy(() => import('./pages/director/Dashboard'));
const AdminDashboardPage = lazy(() => import('./pages/admin/Dashboard'));
const AdminUsersPage = lazy(() => import('./pages/admin/Users'));
const AdminAccessAuditPage = lazy(() => import('./pages/admin/AccessAudit'));
const AdminFinancialOpsPage = lazy(() => import('./pages/admin/FinancialOps'));
const AdminReferralsPage = lazy(() => import('./pages/admin/Referrals'));
const AdminOAuthFailuresPage = lazy(() => import('./pages/admin/OAuthFailures'));
const AdminArchivedAccountsPage = lazy(() => import('./pages/admin/ArchivedAccounts'));
const AdminAccountConflictsPage = lazy(() => import('./pages/admin/AccountConflicts'));
const AgentRecommendationAuditPage = lazy(() => import('./pages/admin/AgentRecommendationAudit'));
const AdminKycConsolePage = lazy(() => import('./pages/admin/KycConsole'));
const RoleGuard = lazy(() => import('./components/auth/RoleGuard'));
const ExecutiveHubPage = lazy(() => import('./pages/ExecutiveHub'));
const AgentPerformanceReportPage = lazy(() => import('./pages/AgentPerformanceReport'));
const ROITrendsPage = lazy(() => import('./components/executive/ROITrendsPage'));
const OperationsDashboardPage = lazy(() => import('./pages/operations/Dashboard'));
const AgentAdvances = lazy(() => import('./pages/AgentAdvances'));
const AgentAdvanceDetail = lazy(() => import('./pages/AgentAdvanceDetail'));
const AgentCashPayoutsPage = lazy(() => import('./pages/agent/CashPayouts'));
const PayoutReceiptHistory = lazy(() => import('./pages/agent/PayoutReceiptHistory'));
const MerchantTransactionHistory = lazy(() => import('./pages/agent/MerchantTransactionHistory'));
const AgentFloatBreakdownPage = lazy(() => import('./pages/agent/FloatBreakdown'));
const RentDisbursementProcessPage = lazy(() => import('./pages/RentDisbursementProcess'));
const ActiveUsersDetail = lazy(() => import('./pages/coo/ActiveUsersDetail'));
const EarningAgentsDetail = lazy(() => import('./pages/coo/EarningAgentsDetail'));
const TenantsBalancesDetail = lazy(() => import('./pages/coo/TenantsBalancesDetail'));
const NewRentRequestsDetail = lazy(() => import('./pages/coo/NewRentRequestsDetail'));
const ActivePartnersDetail = lazy(() => import('./pages/coo/ActivePartnersDetail'));
const NewPartnerRequestsDetail = lazy(() => import('./pages/coo/NewPartnerRequestsDetail'));
const ActiveLandlordsDetail = lazy(() => import('./pages/coo/ActiveLandlordsDetail'));
const PipelineLandlordsDetail = lazy(() => import('./pages/coo/PipelineLandlordsDetail'));
const RentCoverageDetail = lazy(() => import('./pages/coo/RentCoverageDetail'));
const COOPartnerOpsReport = lazy(() => import('./pages/coo/reports/PartnerOpsReport'));
const COOAgentOpsReport = lazy(() => import('./pages/coo/reports/AgentOpsReport'));
const COOTenantOpsReport = lazy(() => import('./pages/coo/reports/TenantOpsReport'));
const COOFinancialOpsReport = lazy(() => import('./pages/coo/reports/FinancialOpsReport'));
const WelileAIPage = lazy(() => import('./components/ai-chat/WelileAIChatButton').then(m => ({ default: m.WelileAIPage })));
const Terms = lazy(() => import('./pages/Terms'));
const SeoResults = lazy(() => import('./pages/SeoResults'));
const PartnersTerms = lazy(() => import('./pages/PartnersTerms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const ShareLocation = lazy(() => import('./pages/ShareLocation'));
const InvestorPortfolioPublic = lazy(() => import('./pages/InvestorPortfolioPublic'));
const PortfolioActionRequest = lazy(() => import('./pages/PortfolioActionRequest'));
const RentMoney = lazy(() => import('./pages/RentMoney'));
const FindAHouse = lazy(() => import('./pages/FindAHouse'));
const LandlordAgreement = lazy(() => import('./pages/LandlordAgreement'));
const AgentAgreement = lazy(() => import('./pages/AgentAgreement'));
const MerchantAgreement = lazy(() => import('./pages/MerchantAgreement'));
const AngelPool = lazy(() => import('./pages/AngelPool'));
const AngelPoolAgreement = lazy(() => import('./pages/AngelPoolAgreement'));
const AgentCommissionBenefits = lazy(() => import('./pages/AgentCommissionBenefits'));
const Internship = lazy(() => import('./pages/Internship'));
const Careers = lazy(() => import('./pages/Careers'));
const HolisticProfile = lazy(() => import('./pages/HolisticProfile'));
// Public funder signup (multi-step) — lives in pages/Onboarding.tsx and is exported as FunderOnboarding.
const FunderOnboarding = lazy(() => import('./pages/Onboarding'));
const PortfolioCompletion = lazy(() => import('./pages/PortfolioCompletion'));
// Admin queue used by COO / Partner Ops to approve self-registered funders.
const PartnerOnboarding = lazy(() => import('./pages/PartnerOnboarding'));

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
      // Reconnect refetch was the largest source of duplicate DB calls
      // whenever a laptop woke from sleep or a phone rejoined WiFi.
      // Realtime channels handle freshness after a reconnect; anything
      // that genuinely needs a hard refetch opts in per-query.
      refetchOnReconnect: false,
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
    const timer = setTimeout(() => setShowRetry(true), 10000);
    return () => clearTimeout(timer);
  }, []);
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      {showRetry && (
        <button
          onClick={() => { sessionStorage.removeItem('chunk_retry'); window.location.reload(); }}
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

// Global floating widgets (WhatsApp FAB, agent nav FAB, PWA install prompt).
// Hidden on the public payout-receipt view so customers reviewing their
// receipt from an SMS/QR link see a clean, distraction-free page.
function GlobalFloatingWidgets() {
  const location = useLocation();
  const isReceiptRoute =
    location.pathname.startsWith('/r/') ||
    location.pathname.startsWith('/receipt/');
  if (isReceiptRoute) return null;
  return (
    <>
      <FloatingToolbar />
      <PWAInstallPrompt />
      <MerchantDispatchListener />
    </>

  );
}

// Onboarding / interruption gates (profile setup, location, push, invites).
// Hidden on the public payout-receipt view so customers opening their receipt
// from an SMS/QR link are never blocked by the "Quick setup" onboarding screen.
function GlobalOnboardingGates() {
  const location = useLocation();
  const isReceiptRoute =
    location.pathname.startsWith('/r/') ||
    location.pathname.startsWith('/receipt/');
  if (isReceiptRoute) return null;
  return (
    <>
      <ProfileCompletionGate />
      <PushNotificationGate />
      <PhoneCollectionGate />
      <NameCompletionGate />
      <RejectionAlertGate />
      <SubAgentInviteGate />
      <MerchantAgentReferralGate />
    </>
  );
}

function AppRoutes() {
  const location = useLocation();
  const PTR_DISABLED_PREFIXES = ['/', '/index', '/auth', '/welcome', '/funder-onboarding', '/executive-hub'];
  const disablePullToRefresh = PTR_DISABLED_PREFIXES.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + '/'),
  );

  const handlePullRefresh = async () => {
    window.location.reload();
  };

  const routeContent = (
    <div className="min-h-screen" data-pull-to-refresh={disablePullToRefresh ? 'disabled' : undefined}>
      <div>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/welcome" element={<Landing />} />
           <Route path="/internship" element={<Internship />} />
           <Route path="/careers" element={<Careers />} />
           <Route path="/auth" element={<Auth />} />
          <Route path="/oauth-funnel" element={<OAuthFunnel />} />
          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/funder-onboarding" element={<FunderOnboarding />} />
          <Route path="/partner-onboarding" element={<PartnerOnboarding />} />
          <Route path="/partners/:partnerId/portfolios/:portfolioId/complete" element={<PortfolioCompletion />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="/stop-sms" element={<StopSms />} />
          <Route path="/requisition/new" element={<PublicRequisitionForm />} />
          <Route path="/receipt/:id" element={<PayoutReceipt />} />
          <Route path="/resume-sms" element={<ResumeSms />} />
          <Route path="/r/:code" element={<ResolveRLink />} />
          <Route path="/c/:slug/:code" element={<CampaignRedirect />} />
          <Route path="/c/:code" element={<CampaignRedirect />} />
          <Route path="/agent/campaigns" element={<AgentCampaignsPage />} />
          <Route path="/invite/merchant-agent" element={<InviteMerchantAgent />} />
          <Route path="/merchant/register" element={<MerchantRegister />} />
          <Route path="/merchant-agent/onboarding" element={<MerchantAgentOnboarding />} />
          <Route path="/merchant-agent-referrals" element={<MerchantAgentReferrals />} />
          <Route path="/profile/:aiId" element={<HolisticProfile />} />
          <Route path="/id/:aiId" element={<HolisticProfile publicMode />} />
          {/* Persona-specific dashboards. URL is the source of truth for which
              public-role view to render. Internal `supporter` role is exposed
              as `/dashboard/funder` (BOU/CMA terminology). */}
          {/* Legacy catch-all: forward bare `/dashboard` (and any unknown
              persona slug under `/dashboard/*`) to the user's persona slug.
              Keeps old home-screen icons / SMS / email links working. */}
          <Route path="/dashboard" element={<DashboardRedirect />} />
          <Route path="/dashboard/tenant" element={<Dashboard />} />
          <Route path="/dashboard/agent" element={<Dashboard />} />
          <Route path="/dashboard/landlord" element={<Dashboard />} />
          <Route path="/dashboard/funder" element={<Dashboard />} />
          <Route path="/dashboard/manager" element={<Dashboard />} />
          <Route path="/dashboard/agents/leaderboard" element={<AgentLeaderboard />} />
          <Route path="/dashboard/*" element={<DashboardRedirect />} />
          <Route path="/verification-request/:id" element={<VerificationRequestDetailPage />} />
          {/* Dev-only Playwright harnesses — stripped from production builds. */}
          {import.meta.env.DEV && (
            <Route
              path="/__e2e/business-advance"
              element={
                <Suspense fallback={null}>
                  <BusinessAdvanceHarness />
                </Suspense>
              }
            />
          )}
          {import.meta.env.DEV && (
            <Route
              path="/__e2e/landlord-sheet-stacking"
              element={
                <Suspense fallback={null}>
                  <LandlordSheetStackingHarness />
                </Suspense>
              }
            />
          )}
          {import.meta.env.DEV && (
            <Route
              path="/__e2e/phone-contact-actions"
              element={
                <Suspense fallback={null}>
                  <PhoneContactActionsHarness />
                </Suspense>
              }
            />
          )}
          {import.meta.env.DEV && (
            <Route
              path="/__e2e/available-houses"
              element={
                <Suspense fallback={null}>
                  <AvailableHousesHarness />
                </Suspense>
              }
            />
          )}
          {import.meta.env.DEV && (
            <Route
              path="/__e2e/existing-tenant-notice"
              element={
                <Suspense fallback={null}>
                  <ExistingTenantNoticeHarness />
                </Suspense>
              }
            />
          )}
          {import.meta.env.DEV && (
            <Route
              path="/__e2e/proxy-partner-withdrawal"
              element={
                <Suspense fallback={null}>
                  <ProxyPartnerWithdrawalHarness />
                </Suspense>
              }
            />
          )}
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
          <Route path="/seller-portal" element={<SellerPortal />} />
          <Route path="/bread/:code" element={<SharedBreadClaim />} />
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
          <Route path="/install-diagnostics" element={<InstallDiagnostics />} />
          <Route path="/support-report/:token" element={<SupportReport />} />
          <Route path="/activate-supporter" element={<ActivateSupporter />} />
          {/* Chat feature removed */}
          <Route path="/agent-registrations" element={<AgentRegistrations />} />
          <Route path="/sub-agents" element={<SubAgentAnalytics />} />
          <Route path="/merchandise" element={<MerchandiseStore />} />
          <Route path="/agent/partners" element={<AgentPartners />} />
          <Route path="/join" element={<Join />} />
          <Route path="/sub-agent-invite" element={<SubAgentInvite />} />
          {/* Short alias used by emailed invite links, resend + gate resume */}
          <Route path="/n" element={<SubAgentInvite />} />
          <Route path="/record-rent" element={<RecordRent />} />
          <Route path="/calculator" element={<Calculator />} />
          <Route path="/users" element={<RoleGuard allowedRoles={['super_admin', 'manager', 'cto']}><AdminUsersPage /></RoleGuard>} />
          <Route path="/platform-users" element={<RoleGuard allowedRoles={['manager', 'cto']}><UserManagement /></RoleGuard>} />
          <Route path="/supporter-earnings" element={<SupporterEarnings />} />
          <Route path="/reinvestment-history" element={<ReinvestmentHistory />} />
          <Route path="/investment-portfolio" element={<InvestmentPortfolio />} />
          <Route path="/my-watchlist" element={<MyWatchlist />} />
          <Route path="/opportunities" element={<Opportunities />} />
          <Route path="/houses" element={<AvailableHouses />} />
          <Route path="/audit-log" element={<AuditLog />} />
          <Route path="/receivables-audit" element={<RoleGuard allowedRoles={['super_admin', 'manager', 'cto', 'cfo', 'coo', 'ceo']}><ReceivablesAudit /></RoleGuard>} />
          <Route path="/deposit-history" element={<DepositHistory />} />
          <Route path="/deposit-history/:id" element={<DepositVerificationDetail />} />
          <Route path="/welile-homes" element={<WelileHomes />} />
          <Route path="/welile-homes-dashboard" element={<WelileHomesDashboard />} />
          <Route path="/landlord-welile-homes" element={<LandlordWelileHomesPage />} />
          <Route path="/try-calculator" element={<TryCalculator />} />
          <Route path="/rent-calculator" element={<PublicRentCalculator />} />
          <Route path="/guides/pay-rent-in-installments-uganda" element={<PayRentInstallmentsGuide />} />
          <Route path="/guides/cost-of-renting" element={<CostOfRentingGuide />} />
          <Route path="/guides/cost-of-renting-in-:citySlug" element={<CostOfRentingGuide />} />
          <Route path="/guides/compare" element={<NeighborhoodComparisonGuide />} />
          <Route path="/guides/compare/:comparisonSlug" element={<NeighborhoodComparisonGuide />} />
          <Route path="/find-a-house" element={<FindAHouse />} />
          <Route path="/find-a-house/:regionSlug" element={<FindAHouse />} />
          <Route path="/house/:id" element={<HouseDetail />} />
          
          <Route path="/shop" element={<ShopEntry />} />
          <Route path="/landlord-signup" element={<LandlordSignup />} />
          <Route path="/landlord-agreement" element={<LandlordAgreement />} />
          <Route path="/agent-agreement" element={<AgentAgreement />} />
          <Route path="/merchant-agreement" element={<MerchantAgreement />} />
          <Route path="/angel-pool-agreement" element={<AngelPoolAgreement />} />
          <Route path="/agent-commission-benefits" element={<AgentCommissionBenefits />} />
          <Route path="/manager-login" element={<ManagerLogin />} />
          <Route path="/staff" element={<StaffPortal />} />
          {/* Role-isolated executive dashboards */}
          <Route path="/cto/dashboard" element={<RoleGuard allowedRoles={['cto', 'super_admin']}><CTODashboardPage /></RoleGuard>} />
          <Route path="/ceo/dashboard" element={<RoleGuard allowedRoles={['ceo', 'super_admin', 'cto']}><CEODashboardPage /></RoleGuard>} />
          <Route path="/cfo/dashboard" element={<RoleGuard allowedRoles={['cfo', 'super_admin', 'cto']}><CFODashboardPage /></RoleGuard>} />
          <Route path="/cfo/investor-report" element={<RoleGuard allowedRoles={['cfo', 'ceo', 'coo', 'super_admin', 'cto']}><InvestorReportPage /></RoleGuard>} />
          <Route path="/cfo/money-flow-trace" element={<RoleGuard allowedRoles={['cfo', 'ceo', 'coo', 'super_admin', 'cto', 'manager']}><MoneyFlowTracePage /></RoleGuard>} />
          <Route path="/cfo/ledger/:id" element={<RoleGuard allowedRoles={['cfo', 'ceo', 'coo', 'super_admin', 'cto', 'manager']}><LedgerEntryDetailPage /></RoleGuard>} />
          <Route path="/ledger/:id" element={<RoleGuard allowedRoles={['cfo', 'ceo', 'coo', 'super_admin', 'cto', 'manager', 'operations', 'employee']}><LedgerEntryDeepLinkPage /></RoleGuard>} />
          <Route path="/cfo/phantom-drift/:userId" element={<RoleGuard allowedRoles={['cfo', 'super_admin', 'cto', 'manager']}><PhantomDriftDetailPage /></RoleGuard>} />
          <Route path="/coo/dashboard" element={<RoleGuard allowedRoles={['coo', 'super_admin', 'cto']}><COODashboardPage /></RoleGuard>} />
          <Route path="/cmo/dashboard" element={<RoleGuard allowedRoles={['cmo', 'super_admin', 'cto']}><CMODashboardPage /></RoleGuard>} />
          <Route path="/crm/dashboard" element={<RoleGuard allowedRoles={['crm', 'super_admin', 'cto']}><CRMDashboardPage /></RoleGuard>} />
          <Route path="/hr/dashboard" element={<RoleGuard allowedRoles={['hr', 'super_admin', 'cto']}><HRDashboardPage /></RoleGuard>} />
          <Route path="/hr/profiles/:userId" element={<RoleGuard allowedRoles={['hr', 'super_admin', 'cto']}><HREmployeeProfilePage /></RoleGuard>} />
          <Route path="/admin/dashboard" element={<RoleGuard allowedRoles={['super_admin', 'manager', 'employee']}><AdminDashboardPage /></RoleGuard>} />
          <Route path="/director/dashboard" element={<RoleGuard allowedRoles={['ceo', 'super_admin', 'manager']}><DirectorDashboardPage /></RoleGuard>} />
          <Route path="/admin/users" element={<RoleGuard allowedRoles={['super_admin', 'manager', 'cto']}><AdminUsersPage /></RoleGuard>} />
          <Route path="/admin/access-audit" element={<RoleGuard allowedRoles={['super_admin', 'manager', 'cto']}><AdminAccessAuditPage /></RoleGuard>} />
          <Route path="/admin/financial-ops" element={<RoleGuard allowedRoles={['super_admin', 'manager', 'coo', 'cfo']}><AdminFinancialOpsPage /></RoleGuard>} />
          <Route path="/admin/referrals" element={<RoleGuard allowedRoles={['super_admin', 'manager', 'cfo', 'coo', 'cto']}><AdminReferralsPage /></RoleGuard>} />
          <Route path="/admin/oauth-failures" element={<RoleGuard allowedRoles={['super_admin', 'manager', 'ceo', 'coo', 'cto']}><AdminOAuthFailuresPage /></RoleGuard>} />
          <Route path="/admin/archived-accounts" element={<RoleGuard allowedRoles={['super_admin', 'manager']}><AdminArchivedAccountsPage /></RoleGuard>} />
          <Route path="/admin/account-conflicts" element={<RoleGuard allowedRoles={['super_admin', 'manager']}><AdminAccountConflictsPage /></RoleGuard>} />
          <Route path="/admin/recommendation-audit" element={<RoleGuard allowedRoles={['super_admin', 'manager', 'cto', 'coo', 'operations']}><AgentRecommendationAuditPage /></RoleGuard>} />
          <Route path="/admin/kyc" element={<RoleGuard allowedRoles={['super_admin', 'manager', 'cfo', 'operations']}><AdminKycConsolePage /></RoleGuard>} />
          <Route path="/operations" element={<RoleGuard allowedRoles={['operations', 'super_admin', 'manager']}><OperationsDashboardPage /></RoleGuard>} />
          {/* Legacy redirects */}
          <Route path="/coo-dashboard" element={<RoleGuard allowedRoles={['coo', 'super_admin', 'cto']}><COODashboardPage /></RoleGuard>} />
          <Route path="/cfo-dashboard" element={<RoleGuard allowedRoles={['cfo', 'super_admin', 'cto']}><CFODashboardPage /></RoleGuard>} />
          <Route path="/executive-hub" element={<RoleGuard allowedRoles={['ceo', 'cto', 'cmo', 'crm', 'coo', 'cfo', 'super_admin', 'manager', 'employee', 'operations']}><ExecutiveHubPage /></RoleGuard>} />
          <Route path="/agent-performance-report" element={<AgentPerformanceReportPage />} />
          <Route path="/roi-trends" element={<RoleGuard allowedRoles={['ceo', 'coo', 'cfo', 'super_admin', 'manager', 'operations']}><ROITrendsPage /></RoleGuard>} />
           <Route path="/rent-disbursement-process" element={<RoleGuard allowedRoles={['agent', 'manager', 'operations', 'coo', 'cfo', 'ceo', 'super_admin', 'cto']}><RentDisbursementProcessPage /></RoleGuard>} />
           <Route path="/agent-advances" element={<AgentAdvances />} />
           <Route path="/agent-advances/:id" element={<AgentAdvanceDetail />} />
           <Route path="/agent/cash-payouts" element={<AgentCashPayoutsPage />} />
          <Route path="/agent/payout-receipts" element={<PayoutReceiptHistory />} />
          <Route path="/agent/transaction-history" element={<MerchantTransactionHistory />} />
           <Route path="/agent/float-breakdown" element={<AgentFloatBreakdownPage />} />
          <Route path="/coo/active-users" element={<ActiveUsersDetail />} />
          <Route path="/coo/earning-agents" element={<EarningAgentsDetail />} />
          <Route path="/coo/tenants-balances" element={<TenantsBalancesDetail />} />
          <Route path="/coo/rent-requests" element={<NewRentRequestsDetail />} />
          <Route path="/coo/active-partners" element={<ActivePartnersDetail />} />
          <Route path="/coo/partner-requests" element={<NewPartnerRequestsDetail />} />
          <Route path="/coo/active-landlords" element={<ActiveLandlordsDetail />} />
          <Route path="/coo/pipeline-landlords" element={<PipelineLandlordsDetail />} />
          <Route path="/coo/rent-coverage" element={<RentCoverageDetail />} />
          {/* COO → Reports */}
          <Route path="/coo/reports/partner-ops"   element={<RoleGuard allowedRoles={['coo', 'super_admin', 'cto', 'manager']}><COOPartnerOpsReport /></RoleGuard>} />
          <Route path="/coo/reports/agent-ops"     element={<RoleGuard allowedRoles={['coo', 'super_admin', 'cto', 'manager']}><COOAgentOpsReport /></RoleGuard>} />
          <Route path="/coo/reports/tenant-ops"    element={<RoleGuard allowedRoles={['coo', 'super_admin', 'cto', 'manager']}><COOTenantOpsReport /></RoleGuard>} />
          <Route path="/coo/reports/financial-ops" element={<RoleGuard allowedRoles={['coo', 'super_admin', 'cto', 'manager']}><COOFinancialOpsReport /></RoleGuard>} />
          <Route path="/share" element={<Index />} />
          <Route path="/ai" element={<WelileAIPage />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/seo-results" element={<SeoResults />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/partners-terms" element={<PartnersTerms />} />
          <Route path="/privacy-policy" element={<Privacy />} />
          <Route path="/share-location" element={<ShareLocation />} />
          <Route path="/investor/portfolio/:token" element={<InvestorPortfolioPublic />} />
          <Route path="/portfolios/:portfolioId/renew" element={<PortfolioActionRequest mode="renew" />} />
          <Route path="/portfolios/:portfolioId/redeem" element={<PortfolioActionRequest mode="redeem" />} />
          <Route path="/register-tenant" element={<RegisterTenantPublic />} />
          <Route path="/register-partner" element={<RegisterPartnerPublic />} />
          <Route path="/activate" element={<ActivatePartner />} />
          <Route path="/business-advance/track" element={<BusinessAdvanceTrack />} />
          <Route path="/rent-money" element={<RentMoney />} />
          {/* Bot referral short links: welileapp.com/{CODE} — must be last before catch-all */}
          <Route path="/:code" element={<TrackedRedirect />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      </div>
    </div>
  );

  if (disablePullToRefresh) return routeContent;

  return (
    <PullToRefresh onRefresh={handlePullRefresh} className="min-h-screen">
      {routeContent}
    </PullToRefresh>
  );
}

// Lightweight error boundary for deferred providers — falls back to rendering children without providers
class DeferredErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: Error) { console.warn('[DeferredProviders] Failed to load, continuing without:', err.message); }
  render() { return this.state.failed ? (this.props.fallback ?? null) : this.props.children; }
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
    <DeferredErrorBoundary fallback={<>{children}</>}>
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

// Lazy-load the public RecordRent shell (no auth, no settings, no realtime)
const PublicRecordRent = lazy(() => import('./pages/RecordRent'));
const RecordRentErrorBoundary = lazy(() => import('./components/public/RecordRentErrorBoundary'));

/**
 * Standalone shell for /record-rent — bypasses AuthProvider, CombinedSettingsProvider,
 * realtime, theme chain, PWA prompt, etc. This is critical for in-app browsers
 * (WhatsApp, Instagram, Facebook) where storage access can be restricted and
 * cause the full app shell to crash.
 */
const PublicRecordRentApp = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<PageLoader />}>
        <RecordRentErrorBoundary>
          <BrowserRouter>
            <PublicRecordRent />
          </BrowserRouter>
        </RecordRentErrorBoundary>
      </Suspense>
    </QueryClientProvider>
  </HelmetProvider>
);

const isPublicRecordRentRoute = () => {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === '/record-rent' || window.location.pathname.startsWith('/record-rent/');
};

const App = () => {
  // Early exit for public rent recorder — must run before any provider initializes
  if (isPublicRecordRentRoute()) {
    return <PublicRecordRentApp />;
  }

  return (
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
                        <MaintenanceBanner />
                        <PWAInstallGate>
                          <AccountFrozenGate>
                            <AppRoutes />
                          </AccountFrozenGate>
                        </PWAInstallGate>
                        <MaintenanceLockScreen />
                      </DeferredProviders>
                      <DeferredErrorBoundary>
                        <Suspense fallback={null}>
                          <DeferredExtras />
                          <GlobalFloatingWidgets />
                          <Toaster />
                          <SonnerToaster />
                          <ForceResetPasswordGate />
                          <GlobalOnboardingGates />
                          <CreditLoadingDebugPanel />
                        </Suspense>
                      </DeferredErrorBoundary>
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
};
export default App;