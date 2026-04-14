import { useState, useEffect, useRef, useCallback } from 'react';
import { AngelSharesTab } from '@/components/supporter/AngelSharesTab';
import { useConfetti } from '@/components/Confetti';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useOffline } from '@/contexts/OfflineContext';
import { Button } from '@/components/ui/button';
import { 
  CreditCard, Calculator, FileText, Menu, ChevronDown, BadgeCheck, Wallet, ChevronRight
} from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { formatUGX as _formatUGX } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';

import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { SupporterDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { useWallet } from '@/hooks/useWallet';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';
import PaymentPartnersDialog from '@/components/payments/PaymentPartnersDialog';
import { InvestmentCalculator } from '@/components/supporter/InvestmentCalculator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Agreement
import { useSupporterAgreement } from '@/hooks/useSupporterAgreement';
import { 
  SupporterAgreementModal, 
  LockedOverlay,
  AgreementAcceptedBadge
} from '@/components/supporter/agreement';
import { SupporterAgreementViewModal } from '@/components/supporter/agreement/SupporterAgreementCard';

// Menu drawer
import { SupporterMenuDrawer } from '@/components/supporter/SupporterMenuDrawer';
import { MerchantCodePills } from '@/components/supporter/MerchantCodePills';
import { VerificationChecklist } from '@/components/shared/VerificationChecklist';
import { hapticTap } from '@/lib/haptics';
// motion removed — static rendering for low-end devices

// Virtual Houses components
import { PortfolioSummaryCards } from '@/components/supporter/PortfolioSummaryCards';
import { UnifiedWalletHeroCard } from '@/components/wallet/UnifiedWalletHeroCard';
import { VirtualHousesFeed } from '@/components/supporter/VirtualHousesFeed';
import { VirtualHouse } from '@/components/supporter/VirtualHouseCard';
import { VirtualHouseDetailsSheet } from '@/components/supporter/VirtualHouseDetailsSheet';
import { RentCategoryFeed, RentCategory } from '@/components/supporter/RentCategoryFeed';
import { CreditRequestsFeed } from '@/components/supporter/CreditRequestsFeed';
import { InvestmentPackageSheet } from '@/components/supporter/InvestmentPackageSheet';
// FundingPoolCard removed from direct import
import { FunderCapitalOpportunities } from '@/components/supporter/FunderCapitalOpportunities';
import { InvestmentAccountsDrawer } from '@/components/supporter/InvestmentAccountsDrawer';

import AiIdButton from '@/components/ai-id/AiIdButton';
import { NotificationBell } from '@/components/supporter/NotificationBell';
import { InviteAndEarnCard } from '@/components/shared/InviteAndEarnCard';
import { useInactivityLock } from '@/hooks/useInactivityLock';
import { SupporterInactivityLock } from '@/components/supporter/SupporterInactivityLock';


interface SupporterDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

export default function SupporterDashboard({ 
  user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent 
}: SupporterDashboardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useProfile();
  const { isOnline } = useOffline();
  const [loading, setLoading] = useState(false);
  const [hasCachedData, setHasCachedData] = useState(() => {
    try { return !!localStorage.getItem(`supporter_houses_${user.id}`); } catch { return false; }
  });
  const [showPaymentPartners, setShowPaymentPartners] = useState(false);
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [showViewAgreementModal, setShowViewAgreementModal] = useState(false);
  const [viewAgreementTab, setViewAgreementTab] = useState<'summary' | 'full'>('summary');
  const [localHasAccepted, setLocalHasAccepted] = useState<boolean | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<VirtualHouse | null>(null);
  const [showHouseDetails, setShowHouseDetails] = useState(false);
  const [selectedPackageCategory, setSelectedPackageCategory] = useState<RentCategory | null>(null);
  const [showPackageSheet, setShowPackageSheet] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showInvestments, setShowInvestments] = useState(false);
  const [investmentsTab, setInvestmentsTab] = useState<'accounts' | 'angel'>('accounts');
  const { toast } = useToast();
  const { wallet, refreshWallet } = useWallet();
  const { fireSuccess, fireFirstFunding } = useConfetti();
  const [hasEverFunded, setHasEverFunded] = useState<boolean | null>(null);

  // Local-first: read cache synchronously in useState init
  const [virtualHouses, setVirtualHouses] = useState<VirtualHouse[]>(() => {
    try {
      const raw = localStorage.getItem(`supporter_houses_${user.id}`);
      if (raw) return JSON.parse(raw).houses || [];
    } catch {}
    return [];
  });
  const [totalRentContributed, setTotalRentContributed] = useState(() => {
    try {
      const raw = localStorage.getItem(`supporter_houses_${user.id}`);
      if (raw) return JSON.parse(raw).totalRent || 0;
    } catch {}
    return 0;
  });
  const [totalRoiEarned, setTotalRoiEarned] = useState(0);

  // Agreement
  const { hasAccepted, acceptance, loading: agreementLoading, acceptAgreement } = useSupporterAgreement();
  const effectiveHasAccepted = localHasAccepted === true || hasAccepted === true;

  // Inactivity lock — only for users with active portfolios
  const hasActivePortfolios = totalRentContributed > 0;
  const { isLocked, unlock } = useInactivityLock({ enabled: hasActivePortfolios });

  const opportunitiesRefreshRef = useRef<(() => Promise<void>) | null>(null);

  // Show agreement modal on first load if not accepted
  useEffect(() => {
    if (hasAccepted === false && !agreementLoading && localHasAccepted !== true) {
      setShowAgreementModal(true);
    }
  }, [hasAccepted, agreementLoading, localHasAccepted]);

  const handleAcceptAgreement = async (): Promise<boolean> => {
    const success = await acceptAgreement();
    if (success) {
      setLocalHasAccepted(true);
      setJustAccepted(true);
      setShowAgreementModal(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast({
        title: '🎉 Welcome to Welile Supporters!',
        description: 'Terms accepted. A copy has been sent to your email.',
      });
      // Send agreement terms to their email automatically
      supabase.functions.invoke('send-supporter-agreement-email').then(({ error }) => {
        if (error) console.error('Failed to send agreement email:', error);
      });
      setTimeout(() => setJustAccepted(false), 5000);
    }
    return success;
  };

  // Cache already loaded synchronously in useState init above

  // Scroll to opportunities
  useEffect(() => {
    if (location.hash === '#opportunities') {
      setTimeout(() => {
        const el = document.getElementById('opportunities');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [location.hash]);

  // Listen for open-deposit event from OpportunitySummaryCard
  useEffect(() => {
    const handler = () => setShowPaymentPartners(true);
    window.addEventListener('open-deposit', handler);
    return () => window.removeEventListener('open-deposit', handler);
  }, []);

  // Fetch total contributions from ledger + investor_portfolios (bounded query)
  const fetchTotalContributed = useCallback(async () => {
    if (!user?.id) return;
    try {
      // Fetch from general_ledger (supporter_rent_fund entries)
      // Query portfolios by both investor_id and agent_id to cover all cases
      const [ledgerResult, portfolioByInvestor, portfolioByAgent] = await Promise.all([
        supabase
          .from('general_ledger')
          .select('amount')
          .eq('user_id', user.id)
          .eq('category', 'supporter_rent_fund')
          .eq('direction', 'cash_out')
          .limit(500),
        supabase
          .from('investor_portfolios')
          .select('id, investment_amount, total_roi_earned, roi_percentage')
          .eq('investor_id', user.id)
          .in('status', ['active', 'pending', 'pending_approval'])
          .limit(100),
        supabase
          .from('investor_portfolios')
          .select('id, investment_amount, total_roi_earned, roi_percentage')
          .eq('agent_id', user.id)
          .is('investor_id', null)
          .in('status', ['active', 'pending', 'pending_approval'])
          .limit(100),
      ]);

      // Merge portfolios (investor_id matches + agent_id with null investor_id)
      const allPortfolios = [
        ...(!portfolioByInvestor.error && portfolioByInvestor.data ? portfolioByInvestor.data : []),
        ...(!portfolioByAgent.error && portfolioByAgent.data ? portfolioByAgent.data : []),
      ];
      // Deduplicate by id
      const seen = new Set<string>();
      const portfolioResult = { data: allPortfolios.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; }), error: null };

      const ledgerTotal = !ledgerResult.error && ledgerResult.data
        ? ledgerResult.data.reduce((sum, r) => sum + Number(r.amount), 0)
        : 0;

      const portfolioTotal = !portfolioResult.error && portfolioResult.data
        ? portfolioResult.data.reduce((sum, r) => sum + Number(r.investment_amount), 0)
        : 0;

      // Calculate expected monthly return from ROI% × capital
      const expectedMonthly = portfolioResult.data
        ? portfolioResult.data.reduce((sum, r) => sum + Number(r.investment_amount) * (Number(r.roi_percentage || 15) / 100), 0)
        : 0;
      setTotalRoiEarned(expectedMonthly);

      // Use portfolio total as source of truth — only actual investments
      // Ledger may include initial registration deposits which aren't investments
      setTotalRentContributed(portfolioTotal);
    } catch (err) {
      console.error('[SupporterDashboard] Failed to fetch contributions:', err);
    }
  }, [user?.id]);

  useEffect(() => { fetchTotalContributed(); }, [fetchTotalContributed]);

  // Auto-refresh when supporter contributes via Opportunity card or Categories
  useEffect(() => {
    const handler = () => { fetchTotalContributed(); refreshWallet(); };
    window.addEventListener('supporter-contribution-changed', handler);
    return () => window.removeEventListener('supporter-contribution-changed', handler);
  }, [fetchTotalContributed, refreshWallet]);

  const HOUSES_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  // Fetch funded houses — cache-first, lazy secondary data
  useEffect(() => {
    fetchMyHouses();
  }, [user.id]);

  const fetchMyHouses = async () => {
    // Always serve cache first
    if (hasCachedData) {
      setLoading(false);
      // Check TTL — skip network if fresh
      try {
        const cached = localStorage.getItem(`supporter_houses_${user.id}`);
        if (cached) {
          const { timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < HOUSES_CACHE_TTL) return;
        }
      } catch {}
    }

    if (!navigator.onLine) {
      setLoading(false);
      return;
    }

    if (!hasCachedData) setLoading(true);

    try {
      const { data, error } = await supabase
        .from('rent_requests')
        .select('id, rent_amount, duration_days, status, funded_at, updated_at, agent_id, request_city')
        .eq('supporter_id', user.id)
        .order('funded_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        const houses: VirtualHouse[] = data.map(r => {
          const city = r.request_city || 'Uganda';

          let paymentHealth: 'green' | 'amber' | 'red' = 'green';
          if (r.status === 'funded' || r.status === 'disbursed') paymentHealth = 'amber';
          if (r.status === 'completed' || r.status === 'repaid') paymentHealth = 'green';
          if (r.status === 'defaulted' || r.status === 'overdue') paymentHealth = 'red';

          return {
            id: r.id,
            shortId: r.id.slice(0, 6).toUpperCase(),
            area: city,
            city,
            rentAmount: Number(r.rent_amount),
            paymentHealth,
            agentManaged: !!r.agent_id,
            updatedAt: r.updated_at || r.funded_at || new Date().toISOString(),
            status: r.status || 'funded',
            durationDays: r.duration_days,
          };
        });

        const totalRent = houses.reduce((sum, h) => sum + h.rentAmount, 0);
        setVirtualHouses(houses);
        setTotalRentContributed(prev => prev || totalRent); // fallback, prefer ledger
        setHasEverFunded(houses.length > 0);

        localStorage.setItem(`supporter_houses_${user.id}`, JSON.stringify({
          houses, totalRent, timestamp: Date.now(),
        }));
        setHasCachedData(true);
      }
    } catch (error) {
      console.error('[SupporterDashboard] Error:', error);
    }
    setLoading(false);
  };


  // Portfolio health
  const portfolioHealth = (() => {
    if (virtualHouses.length === 0) return 'stable' as const;
    const redCount = virtualHouses.filter(h => h.paymentHealth === 'red').length;
    if (redCount > 0) return 'at_risk' as const;
    const greenRatio = virtualHouses.filter(h => h.paymentHealth === 'green').length / virtualHouses.length;
    return greenRatio >= 0.8 ? 'growing' as const : 'stable' as const;
  })();

  const handleHouseTap = (id: string) => {
    const house = virtualHouses.find(h => h.id === id);
    if (house) {
      setSelectedHouse(house);
      setShowHouseDetails(true);
    }
  };

  if (loading && isOnline && !hasCachedData && false) {
    return <SupporterDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await Promise.all([
      fetchMyHouses(),
      opportunitiesRefreshRef.current?.()
    ]);
  };

  const handleOpenMenu = () => { hapticTap(); setMenuOpen(true); };

  const menuItems = [
    { icon: CreditCard, label: 'Add Investment', onClick: () => setShowPaymentPartners(true) },
  ];

  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      {/* Inactivity lock overlay */}
      {isLocked && (
        <SupporterInactivityLock
          userEmail={user.email || ''}
          fullName={profile?.full_name}
          avatarUrl={profile?.avatar_url}
          onUnlock={unlock}
        />
      )}
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
        headerActions={<NotificationBell userId={user.id} />}
      />

      <div className="flex-1 min-h-0 overflow-y-auto pb-16 md:pb-4 overscroll-contain">
        <main className="px-3 xs:px-4 py-4 xs:py-5 space-y-5 max-w-lg mx-auto">
          
          {/* ═══ INLINE GREETING BAR ═══ */}
          <div className="flex flex-col items-center gap-2 py-2">
            <button onClick={() => navigate('/settings')} className="shrink-0 min-h-[44px] min-w-[44px]">
              <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="lg" />
            </button>
            <div className="flex flex-col items-center gap-0.5">
              <h1 className="font-bold text-lg leading-tight flex items-center gap-1.5">
                <span className="break-words">{profile?.full_name?.split(' ')[0] || 'Supporter'}</span>
                {profile?.verified ? (
                  <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 shrink-0" />
                ) : (
                  <BadgeCheck className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                )}
              </h1>
              <p className="text-[11px] text-muted-foreground font-medium">Welcome back</p>
            </div>
            <AiIdButton variant="compact" />
          </div>

          <MerchantCodePills />

          {/* ═══ PORTFOLIO HERO CARD ═══ */}
          <UnifiedWalletHeroCard
            balance={wallet?.balance ?? 0}
            role="supporter"
            secondaryLabel="Invested"
            secondaryValue={_formatUGX(totalRentContributed)}
            houses={virtualHouses.length}
            returnPerMonth={_formatUGX(totalRoiEarned)}
            deployed={_formatUGX(totalRentContributed)}
            onOpenWallet={() => setShowWallet(true)}
            onHousesTap={() => {
              const el = document.getElementById('my-houses');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            onReturnTap={() => {
              setInvestmentsTab('accounts');
              setShowInvestments(true);
            }}
            onDeployedTap={() => {
              setInvestmentsTab('accounts');
              setShowInvestments(true);
            }}
          />

          <VerificationChecklist userId={user.id} highlightRole="supporter" compact />


          {/* ═══ QUICK ACTIONS — Pill Style ═══ */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                hapticTap();
                if (!effectiveHasAccepted) { setShowAgreementModal(true); return; }
                setShowPaymentPartners(true);
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-lg shadow-primary/20 active:scale-[0.96] transition-transform touch-manipulation min-h-[48px]"
            >
              <CreditCard className="h-4.5 w-4.5" />
              Add Funds
            </button>

            <button
              onClick={() => { hapticTap(); setShowCalculator(true); }}
              className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-card border-2 border-border/60 text-foreground font-bold text-sm shadow-sm active:scale-[0.96] transition-transform touch-manipulation min-h-[48px]"
            >
              <Calculator className="h-4.5 w-4.5 text-primary" />
              ROI
            </button>

            <button
              onClick={handleOpenMenu}
              className="flex items-center justify-center px-4 py-3.5 rounded-2xl bg-card border-2 border-border/60 text-muted-foreground shadow-sm active:scale-[0.96] transition-transform touch-manipulation min-h-[48px]"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          {/* ═══ SECTION: OPPORTUNITIES ═══ */}
          <div id="opportunities" className="relative scroll-mt-4 space-y-4">
            <div className="flex items-center gap-2 px-1">
              <div className="w-1 h-5 rounded-full bg-primary" />
              <h2 className="text-sm font-black text-foreground tracking-tight">Capital Opportunities</h2>
            </div>
            {!effectiveHasAccepted && <LockedOverlay onAcceptClick={() => setShowAgreementModal(true)} />}
            <FunderCapitalOpportunities />
          </div>

          {/* ═══ MY FUNDED HOUSES (collapsible) ═══ */}
          {virtualHouses.length > 0 && (
            <div id="my-houses" className="space-y-3 scroll-mt-4">
              <div className="flex items-center gap-2 px-1">
                <div className="w-1 h-5 rounded-full bg-success" />
                <h2 className="text-sm font-black text-foreground tracking-tight">My Houses</h2>
              </div>
              <Collapsible defaultOpen>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-card border border-border/60 shadow-sm hover:bg-accent/30 transition-colors touch-manipulation active:scale-[0.98]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                        <span className="text-lg">🏘️</span>
                      </div>
                      <div className="text-left">
                        <span className="font-bold text-sm text-foreground">{virtualHouses.length} Properties</span>
                        <p className="text-[10px] text-muted-foreground">Your funded portfolio</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                        {virtualHouses.length}
                      </Badge>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pt-3">
                    <VirtualHousesFeed
                      houses={virtualHouses}
                      loading={loading}
                      onHouseTap={handleHouseTap}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}


        </main>
      </div>
      <SupporterMenuDrawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onAddInvestment={() => setShowPaymentPartners(true)}
        onOpenCalculator={() => setShowCalculator(true)}
        onViewAgreement={() => { setViewAgreementTab('summary'); setShowViewAgreementModal(true); }}
        showCreditRequests
        isLocked={!effectiveHasAccepted}
        onLockedClick={() => setShowAgreementModal(true)}
        onFundCategory={(cat) => {
          if (!effectiveHasAccepted) {
            setShowAgreementModal(true);
            return;
          }
          setSelectedPackageCategory(cat);
          setShowPackageSheet(true);
        }}
        onRefreshRef={opportunitiesRefreshRef}
      />

      {/* Invite & Earn */}
      <InviteAndEarnCard variant="supporter" compact />

      <PaymentPartnersDialog 
        open={showPaymentPartners} 
        onOpenChange={setShowPaymentPartners}
        dashboardType="supporter"
        title="Add Investment via Mobile Money"
      />
      
      <SupporterAgreementModal
        open={showAgreementModal}
        onOpenChange={setShowAgreementModal}
        onAccept={handleAcceptAgreement}
        loading={agreementLoading}
      />
      
      <SupporterAgreementViewModal
        open={showViewAgreementModal}
        onOpenChange={setShowViewAgreementModal}
        defaultTab={viewAgreementTab}
      />
      
      <Dialog open={showCalculator} onOpenChange={setShowCalculator}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Earnings Calculator & Projections
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 pt-0">
            <InvestmentCalculator />
          </div>
        </DialogContent>
      </Dialog>
      

      <VirtualHouseDetailsSheet
        house={selectedHouse}
        open={showHouseDetails}
        onOpenChange={setShowHouseDetails}
      />
      
      <InvestmentPackageSheet
        open={showPackageSheet}
        onOpenChange={setShowPackageSheet}
        category={selectedPackageCategory}
        onAcceptAndDeposit={() => setShowPaymentPartners(true)}
      />

      <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />
      <InvestmentAccountsDrawer open={showInvestments} onOpenChange={setShowInvestments} defaultTab={investmentsTab} />
      
      
    </div>
  );
}
