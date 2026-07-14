import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast as sonnerToast } from 'sonner';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useOffline } from '@/contexts/OfflineContext';
import { 
  FileText,
  Menu,
  WifiOff,
  RefreshCw,
  BadgeCheck,
} from 'lucide-react';
import { FindAHouseCTA } from '@/components/tenant/FindAHouseCTA';
import { WidgetErrorBoundary } from '@/components/shared/WidgetErrorBoundary';
import { formatUGX } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';

import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { TenantDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { ListSectionSkeleton } from '@/components/skeletons/SectionSkeletons';
import { PayLandlordDialog } from '@/components/wallet/PayLandlordDialog';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';
import { WalletDisclaimer } from '@/components/wallet/WalletDisclaimer';
import { useWallet } from '@/hooks/useWallet';
import { hapticTap } from '@/lib/haptics';
import AiIdButton from '@/components/ai-id/AiIdButton';
import { CreditAccessCard } from '@/components/CreditAccessCard';
import { InviteAndEarnCard } from '@/components/shared/InviteAndEarnCard';
import { SubscriptionStatusCard } from '@/components/tenant/SubscriptionStatusCard';
import { VerificationChecklist } from '@/components/shared/VerificationChecklist';

import { RentRequestButton } from '@/components/tenant/RentRequestButton';
import RentRequestForm from '@/components/tenant/RentRequestForm';
import RentCalculator from '@/components/tenant/RentCalculator';
import { 
  TenantAgreementNotice, 
  TenantAgreementModal,
  LockedActionTooltip 
} from '@/components/tenant/agreement';
import { useTenantAgreement } from '@/hooks/useTenantAgreement';
import RepaymentSection from '@/components/tenant/RepaymentSection';
import RentProcessTracker from '@/components/rent/RentProcessTracker';
import { TenantBusinessAdvancesPanel } from '@/components/tenant/TenantBusinessAdvancesPanel';
import { BusinessAdvanceStatusHero } from '@/components/tenant/BusinessAdvanceStatusHero';
import PaymentPartnersDialog from '@/components/payments/PaymentPartnersDialog';
import { TenantMenuDrawer } from '@/components/tenant/TenantMenuDrawer';
import { MerchantCodePills } from '@/components/supporter/MerchantCodePills';
import { AgentDepositDialog } from '@/components/agent/AgentDepositDialog';
import { AvailableHousesSheet } from '@/components/tenant/AvailableHousesSheet';

import { SuggestedHousesCard } from '@/components/tenant/SuggestedHousesCard';
import RentHistoryRecordCTA from '@/components/tenant/RentHistoryRecordCTA';
import { TrustBoostBanner } from '@/components/ai-id/TrustBoostBanner';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import breadHero from '@/assets/tenant-bread-hero.jpg';
import rental1 from '@/assets/rental-1.jpg';
import rental2 from '@/assets/rental-2.jpg';
import rental3 from '@/assets/rental-3.jpg';
import welileLogo from '@/assets/welile-logo.png';
import { ShareBreadDialog, WELILE_BREAD_PRICE } from '@/components/tenant/ShareBreadDialog';
import {
  useBreadReceiptPrice,
  WELILE_BREAD_DISCOUNT_RATE,
  WELILE_BREAD_MIN_PAYABLE,
  useBreadReceiptHistory,
} from '@/hooks/useBreadReceiptPrice';
import { WelileReceiptDialog } from '@/components/tenant/WelileReceiptDialog';
import { ClaimBreadDialog } from '@/components/tenant/ClaimBreadDialog';
import { ClaimRentDiscountDialog } from '@/components/tenant/ClaimRentDiscountDialog';
import { AddMonthlyRentDialog, getStoredMonthlyRent } from '@/components/tenant/AddMonthlyRentDialog';
import { RentDiscountCarousel } from '@/components/tenant/RentDiscountCarousel';
import { Share2, Plus, Info, Store } from 'lucide-react';
import { useAvailableBalance } from '@/hooks/useAvailableBalance';
import { UnifiedWalletHeroCard } from '@/components/wallet/UnifiedWalletHeroCard';
import { FunderQuickActions } from '@/components/supporter/FunderQuickActions';
import { MissionBanner } from '@/components/mission/MissionBanner';

interface TenantDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

interface RentRequest {
  id: string;
  rent_amount: number;
  duration_days: number;
  total_repayment: number;
  daily_repayment: number;
  status: string;
  created_at: string;
  disbursed_at: string | null;
}

interface Repayment {
  id: string;
  amount: number;
  payment_date: string;
  created_at: string;
  rent_request_id: string;
}

export default function TenantDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: TenantDashboardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { isOnline } = useOffline();
  const { wallet, refreshWallet } = useWallet();
  const { toast } = useToast();
  const { isAccepted: hasAcceptedTerms, isLoading: agreementLoading, acceptAgreement } = useTenantAgreement();

  // Local-first: read cache synchronously for instant paint
  const [rentRequests, setRentRequests] = useState<RentRequest[]>(() => {
    try {
      const raw = localStorage.getItem(`tenant_dashboard_${user.id}`);
      if (raw) return JSON.parse(raw).rentRequests || [];
    } catch {}
    return [];
  });
  const [repayments, setRepayments] = useState<Repayment[]>(() => {
    try {
      const raw = localStorage.getItem(`tenant_dashboard_${user.id}`);
      if (raw) return JSON.parse(raw).repayments || [];
    } catch {}
    return [];
  });
  const hasCachedData = rentRequests.length > 0;
  const [loading, setLoading] = useState(!hasCachedData);

  // Dialog states
  const [showWallet, setShowWallet] = useState(false);
  const [showPayLandlord, setShowPayLandlord] = useState(false);
  const [showPaymentPartners, setShowPaymentPartners] = useState(false);
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [isAcceptingAgreement, setIsAcceptingAgreement] = useState(false);
  const [showRepaymentSchedule, setShowRepaymentSchedule] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [breadLoaded, setBreadLoaded] = useState(false);
  const [breadError, setBreadError] = useState(false);
  const [rentalsLoaded, setRentalsLoaded] = useState<Record<string, boolean>>({});
  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const heroScrollerRef = useRef<HTMLDivElement | null>(null);
  const rentCarouselRef = useRef<HTMLDivElement | null>(null);

  // Preload + decode rental hero images so horizontal swipe is instant on mobile.
  useEffect(() => {
    let cancelled = false;
    const sources = [rental1, rental2, rental3];
    const idle = (cb: () => void) =>
      typeof (window as any).requestIdleCallback === 'function'
        ? (window as any).requestIdleCallback(cb, { timeout: 1500 })
        : window.setTimeout(cb, 200);
    idle(() => {
      if (cancelled) return;
      sources.forEach((src) => {
        const img = new Image();
        img.decoding = 'async';
        (img as any).fetchPriority = 'low';
        img.src = src;
        const markLoaded = () => {
          if (cancelled) return;
          setRentalsLoaded((prev) => (prev[src] ? prev : { ...prev, [src]: true }));
        };
        if (typeof img.decode === 'function') {
          img.decode().then(markLoaded).catch(markLoaded);
        } else {
          img.onload = markLoaded;
          img.onerror = markLoaded;
        }
      });
    });
    return () => { cancelled = true; };
  }, []);
  const [depositOpen, setDepositOpen] = useState(false);
  // Global "open deposit" entry: triggered from the mobile bottom-nav Deposit
  // FAB and from `?deposit=1` deep-links so users can reach the deposit flow
  // in one tap from anywhere.
  useEffect(() => {
    const handler = () => setDepositOpen(true);
    window.addEventListener('open-deposit', handler);
    return () => window.removeEventListener('open-deposit', handler);
  }, []);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('deposit') === '1') {
        setDepositOpen(true);
        params.delete('deposit');
        const qs = params.toString();
        window.history.replaceState(
          {},
          '',
          window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
        );
      }
    } catch { /* ignore */ }
  }, []);
  const [housesOpen, setHousesOpen] = useState(false);
  const housesTriggerRef = useRef<HTMLElement | null>(null);
  const openHousesSheet = useCallback(() => {
    const active = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;
    if (active && typeof active.focus === 'function') housesTriggerRef.current = active;
    setMenuOpen(false);
    setHousesOpen(true);
  }, []);
  const handleHousesOpenChange = useCallback((next: boolean) => {
    setHousesOpen(next);
    if (!next) {
      const el = housesTriggerRef.current;
      housesTriggerRef.current = null;
      if (el && typeof el.focus === 'function') {
        // Wait for Radix to fully tear down its focus trap (Escape and
        // overlay-click close paths still hold it for a tick) before
        // restoring focus to the exact triggering card.
        const restore = () => { try { el.focus({ preventScroll: false }); } catch { /* ignore */ } };
        requestAnimationFrame(() => requestAnimationFrame(restore));
        // Belt-and-braces fallback in case the element was momentarily
        // detached during the sheet's exit animation.
        setTimeout(restore, 120);
      }
    }
  }, []);
  const [shareBreadOpen, setShareBreadOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [claimBreadOpen, setClaimBreadOpen] = useState(false);
  const [claimRentDiscountOpen, setClaimRentDiscountOpen] = useState(false);
  const [addRentOpen, setAddRentOpen] = useState(false);
  const [savedMonthlyRent, setSavedMonthlyRent] = useState<number | null>(() => getStoredMonthlyRent());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'welile.tenant.monthlyRent') setSavedMonthlyRent(getStoredMonthlyRent());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const { available: withdrawableAvailable } = useAvailableBalance();
  const breadPrice = useBreadReceiptPrice();
  // Surface a tiny toast when a price sync round-trip completes.
  const wasSyncingRef = useRef(false);
  useEffect(() => {
    if (wasSyncingRef.current && !breadPrice.syncing) {
      sonnerToast.success('Bread price updated', { duration: 1800 });
    }
    wasSyncingRef.current = breadPrice.syncing;
  }, [breadPrice.syncing]);
  const [freeBreadsInfoOpen, setFreeBreadsInfoOpen] = useState(false);
  const breadHistory = useBreadReceiptHistory();
  // "Updated" indicator: re-renders every 30s so relative time stays fresh.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const breadPriceUpdatedAt = breadPrice.savedAt ?? nowTick;
  const formatRelativeTime = (ts: number) => {
    const diffSec = Math.max(0, Math.round((nowTick - ts) / 1000));
    if (diffSec < 60) return 'just now';
    const m = Math.floor(diffSec / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  };

  const handleAcceptAgreement = async () => {
    setIsAcceptingAgreement(true);
    try {
      return await acceptAgreement();
    } finally {
      setIsAcceptingAgreement(false);
    }
  };

  // Background fetch — never blocks UI if cache exists
  useEffect(() => {
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }
    
    (async () => {
      try {
        const { data: requests } = await supabase
          .from('rent_requests')
          .select('*')
          .eq('tenant_id', user.id)
          .order('created_at', { ascending: false });
        
        const newRentRequests = requests || [];
        const newRepayments: Repayment[] = [];
        
        setRentRequests(newRentRequests);
        setRepayments(newRepayments);
        
        localStorage.setItem(`tenant_dashboard_${user.id}`, JSON.stringify({
          rentRequests: newRentRequests,
          repayments: newRepayments,
          timestamp: Date.now()
        }));
      } catch (error) {
        console.error('[TenantDashboard] Error fetching data:', error);
      }
      setLoading(false);
    })();
  }, [user.id]);

  const fetchData = async () => {
    if (!navigator.onLine) return;
    try {
      const { data: requests } = await supabase
        .from('rent_requests')
        .select('*')
        .eq('tenant_id', user.id)
        .order('created_at', { ascending: false });
      
      const newRentRequests = requests || [];
      setRentRequests(newRentRequests);
      setRepayments([]);
      
      localStorage.setItem(`tenant_dashboard_${user.id}`, JSON.stringify({
        rentRequests: newRentRequests,
        repayments: [],
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('[TenantDashboard] Error fetching data:', error);
    }
  };

  // Progressive rendering: header + skeleton placeholders render immediately;
  // individual widgets reveal as their data arrives. The legacy full-page
  // skeleton is kept for the rare empty-cache *offline* case only.
  const showFullSkeleton = loading && !hasCachedData && !isOnline;
  if (showFullSkeleton) {
    return <TenantDashboardSkeleton />;
  }
  const dataLoading = loading && !hasCachedData;

  const handleRefresh = async () => {
    await Promise.all([fetchData(), refreshWallet()]);
  };

  const handleViewWallet = () => { hapticTap(); setShowWallet(true); };
  const handleOpenMenu = () => { hapticTap(); setMenuOpen(true); };

  const menuItems = [
    { icon: FileText, label: 'Request Rent', onClick: () => {} },
  ];

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto pb-nav">
        <main className="px-4 py-5 space-y-5 animate-fade-in max-w-lg mx-auto flex flex-col min-h-full">
          {/* Offline Notice */}
          {!isOnline && (
            <div className="animate-fade-in flex items-center gap-2.5 px-3 py-2 rounded-xl bg-warning/10 border border-warning/20">
              <WifiOff className="h-3.5 w-3.5 text-warning shrink-0" />
              <p className="text-xs text-warning flex-1">You're offline — data may be outdated</p>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.location.reload()}>
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Terms Acceptance Notice */}
          <TenantAgreementNotice onAcceptClick={() => setShowAgreementModal(true)} />

          <MissionBanner dashboardRole="tenant" />

          {/* Profile Row */}
          <div className="animate-fade-in flex items-center gap-3">
            <button onClick={() => navigate('/settings')} className="shrink-0">
              <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="md" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted-foreground font-medium">Welcome back</p>
              <h1 className="font-bold text-lg leading-tight flex items-center gap-1.5 flex-wrap">
                <span className="break-words">{profile?.full_name || 'Welcome'}</span>
                {profile?.verified ? (
                  <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 shrink-0" />
                ) : (
                  <BadgeCheck className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                )}
              </h1>
            </div>
            <AiIdButton variant="compact" />
          </div>

          {/* Prominent live tracker for any in-flight / active Business Advance */}
          <BusinessAdvanceStatusHero />

          {/* Credit access limit — full-size, prominent at top */}
          <CreditAccessCard userId={user.id} />

          {/* Wallet hero card — replaces the previous bread hero on tenant dashboard */}
          <div id="tenant-wallet-hero">
            <UnifiedWalletHeroCard
              balance={wallet?.balance ?? 0}
              role="tenant"
              onOpenWallet={() => setShowWallet(true)}
              quickActions={
                <FunderQuickActions
                  variant="hero"
                  availableBalance={wallet?.balance ?? 0}
                  onChanged={() => { refreshWallet(); }}
                />
              }
            />
          </div>
          {false && (
          <button
            type="button"
            onClick={() => {
              hapticTap();
              setReceiptDialogOpen(true);
            }}
            className="relative overflow-hidden shadow-lg group active:scale-[0.99] transition-transform bg-amber-50 dark:bg-muted flex-1 -mx-4 min-h-[80vh] rounded-none border-0 sm:flex-none sm:mx-0 sm:w-full sm:rounded-3xl sm:border sm:border-border sm:min-h-[340px] sm:max-h-[600px] block p-0"
            aria-label="Welile Rent Fees — tap to enter a Welile receipt and save 5%. Swipe to view rental options."
            aria-describedby="bread-card-desc"
          >
            {!breadError && (
              <div
                ref={heroScrollerRef}
                className="h-full w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory flex no-scrollbar"
                onClick={(e) => e.stopPropagation()}
                aria-label="Swipe to switch between bread and rental images"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const w = el.clientWidth || 1;
                  const idx = Math.round(el.scrollLeft / w);
                  if (idx !== heroSlideIndex) setHeroSlideIndex(idx);
                }}
              >
                {[
                  { src: breadHero, alt: 'Fresh loaf of Welile bread' },
                  { src: rental1, alt: 'Modern apartments rental' },
                  { src: rental2, alt: 'Family house rental' },
                  { src: rental3, alt: 'City studio rental' },
                ].map((slide, i) => {
                  const isBread = i === 0;
                  const ready = isBread ? breadLoaded : !!rentalsLoaded[slide.src];
                  return (
                    <div
                      key={i}
                      className="relative h-full w-full shrink-0 snap-center bg-amber-50 dark:bg-muted"
                    >
                      {!ready && (
                        <div
                          className="absolute inset-0 overflow-hidden"
                          aria-hidden="true"
                          role="status"
                        >
                          <div className="absolute inset-0 bg-amber-50 dark:bg-muted" />
                          <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
                        </div>
                      )}
                      <img
                        src={slide.src}
                        alt={slide.alt}
                        className={`h-full w-full object-cover object-center select-none transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}
                        width={1024}
                        height={1024}
                        loading="eager"
                        decoding="async"
                        // @ts-expect-error fetchpriority is a valid HTML attr
                        fetchpriority={isBread ? 'high' : 'low'}
                        draggable={false}
                        onLoad={() => {
                          if (isBread) setBreadLoaded(true);
                          else setRentalsLoaded((prev) => (prev[slide.src] ? prev : { ...prev, [slide.src]: true }));
                        }}
                        onError={isBread ? () => { setBreadError(true); setBreadLoaded(true); } : undefined}
                        onClick={() => { hapticTap(); setReceiptDialogOpen(true); }}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Error fallback — emoji + label, badge stays visible */}
            {breadError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6" aria-hidden="true">
                <span className="text-6xl sm:text-7xl" role="img" aria-label="bread">🍞</span>
                <p className="text-sm font-medium text-foreground/70">Daily Rent Fees</p>
                <p className="text-xs text-muted-foreground">Tap to open menu</p>
              </div>
            )}

            <span id="bread-card-desc" className="sr-only">
              {breadError
                ? 'Rent Fees image unavailable. Tap to enter a Welile receipt and save 5% on your Rent Fees.'
                : breadLoaded
                ? 'Fresh loaf of bread illustration. Tap to enter a Welile receipt and save 5% on your Rent Fees.'
                : 'Rent Fees image is loading. Tap to enter a Welile receipt and save 5% on your Rent Fees.'}
            </span>

            {/* Shimmer placeholder while bread loads */}
            {!breadLoaded && (
              <div className="absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true" role="status">
                <div className="absolute inset-0 bg-amber-50 dark:bg-muted" />
                <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
              </div>
            )}

            {/* Welile branding badge — top-left */}
            <div
              className="absolute flex flex-col items-center gap-1 rounded-2xl bg-background dark:bg-card px-2.5 py-2 shadow-md border border-border ring-1 ring-foreground/5"
              style={{
                top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
                left: 'calc(env(safe-area-inset-left, 0px) + 0.75rem)',
              }}
              role="img"
              aria-label={heroSlideIndex > 0 ? 'Welile Rent Fees' : 'Welile Bread'}
            >
              <img
                src={welileLogo}
                alt=""
                aria-hidden="true"
                className="h-7 w-7 rounded-md"
                width={28}
                height={28}
              />
              <span
                aria-hidden="true"
                className="text-[10px] font-bold uppercase tracking-widest text-foreground leading-none"
              >
                {heroSlideIndex > 0 ? 'Rent Fees' : 'Bread'}
              </span>
            </div>

            {/* Premium price badge — tap to add monthly rent */}
            {(() => {
              const onRental = heroSlideIndex > 0;
              return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                hapticTap();
                if (onRental) {
                  setAddRentOpen(true);
                } else {
                  setReceiptDialogOpen(true);
                }
              }}
              className={`absolute flex flex-col items-end gap-0.5 rounded-2xl text-white px-3 py-1.5 shadow-xl ring-1 active:scale-[0.97] transition-transform text-left drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] [text-shadow:0_1px_2px_rgba(0,0,0,0.55),0_0_1px_rgba(0,0,0,0.7)] ${
                breadPrice.freeBreads > 0
                  ? 'bg-gradient-to-br from-emerald-600 to-emerald-800 ring-white/30'
                  : breadPrice.reducedPrice < breadPrice.basePrice
                    ? 'bg-gradient-to-br from-emerald-600 to-emerald-800 ring-white/30'
                    : 'bg-gradient-to-br from-orange-600 to-rose-700 ring-white/30'
              }`}
              style={{
                top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
                right: 'calc(env(safe-area-inset-right, 0px) + 0.75rem)',
              }}
              aria-label={onRental
                ? `Monthly rent ${savedMonthlyRent ? formatUGX(savedMonthlyRent) : '— tap to add'}`
                : `Welile bread price ${formatUGX(breadPrice.reducedPrice)}`}
            >
              {onRental ? (
                <>
                  <span className="text-[9px] font-semibold uppercase tracking-[0.18em] leading-none opacity-90">
                    {savedMonthlyRent ? 'Your monthly rent' : 'Tap to add monthly rent'}
                  </span>
                  <span className="text-base sm:text-lg font-extrabold leading-none">
                    {savedMonthlyRent ? formatUGX(savedMonthlyRent) : 'Add rent'}
                  </span>
                </>
              ) : (
                <>
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] leading-none opacity-90">
                {breadPrice.freeBreads > 0
                  ? 'Free today'
                  : breadPrice.reducedPrice < breadPrice.basePrice
                    ? 'Receipt applied'
                    : 'Freshly baked'}
              </span>
              {breadPrice.freeBreads > 0 ? (
                <span className="flex items-baseline gap-1.5">
                  <span className="text-base sm:text-lg font-extrabold leading-none">FREE</span>
                  <span className="text-[10px] line-through opacity-80 leading-none">
                    {formatUGX(breadPrice.basePrice)}
                  </span>
                </span>
              ) : breadPrice.reducedPrice < breadPrice.basePrice ? (
                <span className="flex items-baseline gap-1.5">
                  <span className="text-base sm:text-lg font-extrabold leading-none">
                    {formatUGX(breadPrice.reducedPrice)}
                  </span>
                  <span className="text-[10px] line-through opacity-80 leading-none">
                    {formatUGX(breadPrice.basePrice)}
                  </span>
                </span>
              ) : (
                <span className="text-base sm:text-lg font-extrabold leading-none">
                  {formatUGX(breadPrice.basePrice)}
                </span>
              )}
              <span className="mt-0.5 inline-flex items-center gap-1 text-[8.5px] font-medium leading-none opacity-80">
                {breadPrice.syncing ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
                    Updating…
                  </>
                ) : (
                  <>Updated {formatRelativeTime(breadPriceUpdatedAt)}</>
                )}
              </span>
              {breadPrice.hasReceipt && (
                <div className="mt-1.5 pt-1.5 border-t border-white/25 w-full flex flex-col items-end gap-0.5 text-[9px] leading-tight font-medium opacity-95">
                  <span>Receipt: {formatUGX(breadPrice.receiptAmount)}</span>
                  {breadPrice.savedAt && (
                    <span className="opacity-80">
                      Applied:{' '}
                      {new Date(breadPrice.savedAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                  {breadPrice.freeBreads > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        hapticTap();
                        setFreeBreadsInfoOpen((v) => !v);
                      }}
                      aria-expanded={freeBreadsInfoOpen}
                      aria-label="What does Free Rent Fees mean?"
                      className="inline-flex items-center gap-1 rounded-full bg-white/15 hover:bg-white/25 px-1.5 py-0.5 -mr-0.5 transition-colors"
                    >
                      <span>Free Rent Fees: {breadPrice.freeBreads}×</span>
                      <Info className="h-2.5 w-2.5 opacity-90" />
                    </button>
                  )}
                  <span>
                    Now: {breadPrice.reducedPrice === 0 ? 'FREE' : formatUGX(breadPrice.reducedPrice)}
                  </span>
                  <span className="opacity-80 text-right">
                    How calculated: {Math.round(WELILE_BREAD_DISCOUNT_RATE * 100)}% of{' '}
                    {formatUGX(breadPrice.receiptAmount)} ={' '}
                    {formatUGX(Math.round(breadPrice.receiptAmount * WELILE_BREAD_DISCOUNT_RATE))} off ·
                    min price {formatUGX(WELILE_BREAD_MIN_PAYABLE)}
                  </span>
                  {freeBreadsInfoOpen && breadPrice.freeBreads > 0 && (
                    <div
                      role="tooltip"
                      className="mt-1.5 w-[180px] rounded-lg bg-foreground/95 text-background p-2 text-[9px] leading-snug font-medium text-left shadow-xl ring-1 ring-white/10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="font-bold mb-1">How free Rent Fees work</p>
                      <p className="opacity-90">
                        You earn 5% of your receipt as bread credit.
                      </p>
                      <p className="mt-1 opacity-90">
                        {formatUGX(breadPrice.receiptAmount)} × 5% ={' '}
                        {formatUGX(Math.round(breadPrice.receiptAmount * 0.05))} credit.
                      </p>
                      <p className="mt-1 opacity-90">
                        Each {formatUGX(breadPrice.basePrice)} of credit ={' '}
                        1 free Rent Fees → {breadPrice.freeBreads}× free.
                      </p>
                      <p className="mt-1 opacity-70">Tap again to close.</p>
                    </div>
                  )}
                </div>
              )}
                </>
              )}
            </button>
              );
            })()}

            {/* Action dock — organized bottom bar with primary Claim CTA + secondary actions */}
            <div
              className="absolute left-0 right-0 px-3 pointer-events-none"
              style={{
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Subtle gradient scrim for legibility over photo */}
              <div className="pointer-events-none absolute inset-x-0 -top-16 h-24 bg-gradient-to-t from-black/45 to-transparent" aria-hidden="true" />

              <div className="relative pointer-events-auto flex items-stretch gap-2 rounded-2xl bg-background dark:bg-card border border-border shadow-[0_8px_30px_-6px_rgba(0,0,0,0.35)] p-1.5">
                {/* Primary: Claim — switches to "Claim Rent Discount" when viewing a rental slide */}
                {(() => {
                  const onRental = heroSlideIndex > 0;
                  return (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        hapticTap();
                        if (onRental) {
                          setClaimRentDiscountOpen(true);
                        } else {
                          setClaimBreadOpen(true);
                        }
                      }}
                      aria-label={onRental ? 'Claim your rent fee discount' : 'Claim your discounted bread at a nearby seller'}
                      className="group flex-[1.6] inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white px-3 py-2.5 shadow-md ring-1 ring-emerald-300/40 active:scale-[0.97] transition-transform font-bold text-sm min-h-[44px]"
                    >
                      <Store className="h-4 w-4" />
                      <span className="leading-tight">{onRental ? 'Claim Rent Fee' : 'Claim Bread'}</span>
                    </button>
                  );
                })()}

                {/* Secondary: Add receipt */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    hapticTap();
                    setReceiptDialogOpen(true);
                  }}
                  aria-label="Add a Welile receipt to reduce bread price"
                  className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-foreground px-2 py-1.5 active:scale-[0.97] transition-transform min-h-[44px]"
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide leading-none">Receipt</span>
                </button>

                {/* Secondary: Share */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    hapticTap();
                    setShareBreadOpen(true);
                  }}
                  aria-label={`Share a Welile Rent Fees (${formatUGX(WELILE_BREAD_PRICE)}) with another user`}
                  className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-foreground px-2 py-1.5 active:scale-[0.97] transition-transform min-h-[44px]"
                >
                  <Share2 className="h-4 w-4" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide leading-none">Share</span>
                </button>
              </div>
            </div>
          </button>
          )}

          {/* Available houses — surfaced near the top of home so tenants find them first */}
          <div className="space-y-3">
            <WidgetErrorBoundary label="Find a house">
              <FindAHouseCTA onClick={() => { hapticTap(); openHousesSheet(); }} />
            </WidgetErrorBoundary>
            <WidgetErrorBoundary label="Suggested houses">
              <SuggestedHousesCard userId={user.id} onViewAll={() => { openHousesSheet(); }} />
            </WidgetErrorBoundary>
          </div>

          {/* Apply your Rent Fees discount to rent — horizontally scrollable rentals */}
          <div ref={rentCarouselRef} id="rent-discount-carousel">
            <RentDiscountCarousel
              discountPct={
                breadPrice.basePrice > 0
                  ? Math.max(0, (breadPrice.basePrice - breadPrice.reducedPrice) / breadPrice.basePrice)
                  : 0
              }
              onSelectHouse={() => { hapticTap(); openHousesSheet(); }}
            />
          </div>

          {/* Mini receipt history — last 5 receipts that affected bread price */}
          {breadHistory.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent receipts
                </p>
                <span className="text-[10px] text-muted-foreground">
                  Last {breadHistory.length}
                </span>
              </div>
              <ul className="divide-y divide-border/50">
                {breadHistory.map((entry) => (
                  <li
                    key={`${entry.number}-${entry.savedAt}`}
                    className="flex items-center justify-between gap-2 py-1.5 text-[11px]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] font-semibold text-foreground truncate">
                        {entry.number}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatUGX(entry.amount)} ·{' '}
                        {new Date(entry.savedAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {entry.freeBreads > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                          {entry.freeBreads}× FREE
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                          {formatUGX(entry.reducedPrice)}
                        </span>
                      )}
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        +{formatUGX(entry.credit)} credit
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Single Menu button */}
          <button
            onClick={handleOpenMenu}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border/60 bg-card hover:bg-muted/40 transition-colors touch-manipulation"
          >
            <Menu className="h-5 w-5 text-foreground/70 shrink-0" />
            <div className="flex-1 text-left">
              <p className="font-medium text-sm">Menu</p>
              <p className="text-xs text-muted-foreground">Payments, tools & more</p>
            </div>
            <span className="text-xs text-muted-foreground">→</span>
          </button>

          {/* Invite & Earn — kept on home for growth */}
          <InviteAndEarnCard variant="tenant" compact />
        </main>
      </div>

      {/* Full-screen wallet sheet */}
      <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />

      {/* Share Welile Rent Fees dialog */}
      <ShareBreadDialog
        open={shareBreadOpen}
        onOpenChange={setShareBreadOpen}
        availableBalance={withdrawableAvailable}
        onTopUp={() => setShowWallet(true)}
      />

      {/* Welile Receipt — primary bread tap action (5% discount, works offline) */}
      <WelileReceiptDialog
        open={receiptDialogOpen}
        onOpenChange={setReceiptDialogOpen}
      />

      {/* Claim discounted bread at a nearby seller */}
      <ClaimBreadDialog
        open={claimBreadOpen}
        onOpenChange={setClaimBreadOpen}
        reducedPrice={breadPrice.reducedPrice}
        basePrice={breadPrice.basePrice}
        freeBreads={breadPrice.freeBreads}
        hasReceipt={breadPrice.hasReceipt}
      />

      {/* Claim Welile rent discount with a subscribed landlord or from the Landlord Float */}
      <ClaimRentDiscountDialog
        open={claimRentDiscountOpen}
        onOpenChange={setClaimRentDiscountOpen}
        monthlyRent={savedMonthlyRent}
        discountPct={
          breadPrice.basePrice > 0
            ? Math.max(0, (breadPrice.basePrice - breadPrice.reducedPrice) / breadPrice.basePrice)
            : 0
        }
      />

      {/* Add monthly rent — applies the same bread discount to rent */}
      <AddMonthlyRentDialog
        open={addRentOpen}
        onOpenChange={setAddRentOpen}
        discountPct={
          breadPrice.basePrice > 0
            ? Math.max(0, (breadPrice.basePrice - breadPrice.reducedPrice) / breadPrice.basePrice)
            : 0
        }
        onSaved={(rent) => setSavedMonthlyRent(rent)}
      />

      {/* Menu Drawer */}
      <TenantMenuDrawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
        walletBalance={wallet?.balance ?? 0}
        onOpenWallet={() => { setMenuOpen(false); setShowWallet(true); }}
        onPayLandlord={() => hasAcceptedTerms ? setShowPayLandlord(true) : setShowAgreementModal(true)}
        onPayWelile={() => hasAcceptedTerms ? setShowPaymentPartners(true) : setShowAgreementModal(true)}
        onRepaymentSchedule={() => setShowRepaymentSchedule(prev => !prev)}
        onRentCalculator={() => setShowCalculator(true)}
        onBrowseHouses={() => { openHousesSheet(); }}
        extraContent={
          <div className="space-y-4">
            <TrustBoostBanner />
            <VerificationChecklist userId={user.id} highlightRole="tenant" compact />
            <SubscriptionStatusCard userId={user.id} />
            <RentHistoryRecordCTA />
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-0.5">Actions</p>
              <LockedActionTooltip isLocked={!hasAcceptedTerms && !agreementLoading}>
                <RentRequestButton userId={user.id} onSuccess={fetchData} />
              </LockedActionTooltip>
              <FindAHouseCTA onClick={() => { hapticTap(); openHousesSheet(); }} />
            </div>
            <SuggestedHousesCard userId={user.id} onViewAll={() => { openHousesSheet(); }} />
            {rentRequests.length > 0 && (
              <RentProcessTracker
                requestStatus={rentRequests[0].status}
                agentVerified={true}
                managerApproved={['approved', 'funded', 'disbursed', 'completed'].includes(rentRequests[0].status)}
                supporterFunded={['funded', 'disbursed', 'completed'].includes(rentRequests[0].status)}
                fundRecipientType={(rentRequests[0] as any).fund_recipient_type}
                fundRecipientName={(rentRequests[0] as any).fund_recipient_name}
                fundRoutedAt={(rentRequests[0] as any).fund_routed_at}
              />
            )}
            {rentRequests.some(r => ['disbursed', 'completed', 'funded', 'repaying'].includes(r.status)) && (
              <RepaymentSection
                userId={user.id}
                activeRequest={rentRequests.find(r => ['disbursed', 'repaying'].includes(r.status))}
                repayments={repayments}
                onRepaymentSuccess={fetchData}
              />
            )}
            {showCalculator && (
              <div className="animate-fade-in">
                <RentCalculator
                  onProceed={() => {
                    setShowCalculator(false);
                    setShowRequestForm(true);
                  }}
                />
              </div>
            )}
            {showRequestForm && (
              <div className="animate-fade-in">
                <RentRequestForm
                  userId={user.id}
                  onSuccess={() => {
                    setShowRequestForm(false);
                    fetchData();
                    toast({
                      title: 'Request Submitted',
                      description: 'Your rent request has been submitted for approval'
                    });
                  }}
                  onCancel={() => setShowRequestForm(false)}
                />
              </div>
            )}
            {showRepaymentSchedule && (
              <div className="animate-fade-in">
                <RepaymentSection
                  userId={user.id}
                  activeRequest={rentRequests.find(r => r.status === 'disbursed')}
                  repayments={repayments}
                  onRepaymentSuccess={fetchData}
                />
              </div>
            )}
            <TenantBusinessAdvancesPanel />
            <InviteAndEarnCard variant="tenant" />
            <WalletDisclaimer />
          </div>
        }
      />

      {/* Dialogs */}
      <PayLandlordDialog open={showPayLandlord} onOpenChange={setShowPayLandlord} />
      <PaymentPartnersDialog 
        open={showPaymentPartners} 
        onOpenChange={setShowPaymentPartners}
        dashboardType="tenant"
        title="Pay Rent via Mobile Money"
      />
      <TenantAgreementModal
        isOpen={showAgreementModal}
        onClose={() => setShowAgreementModal(false)}
        onAccept={handleAcceptAgreement}
        isAccepting={isAcceptingAgreement}
      />
      <AgentDepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
      <AvailableHousesSheet open={housesOpen} onOpenChange={handleHousesOpenChange} />

      {/* Fixed footer navigation */}
      
    </div>
  );
}
