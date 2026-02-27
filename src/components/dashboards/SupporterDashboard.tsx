import { useState, useEffect, useRef } from 'react';
import { useConfetti } from '@/components/Confetti';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useOffline } from '@/contexts/OfflineContext';
import { Button } from '@/components/ui/button';
import { 
  CreditCard, Calculator, FileText, Menu, ChevronDown, BadgeCheck
} from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { formatUGX } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { SupporterDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useWallet } from '@/hooks/useWallet';
import { FloatingShareButton } from '@/components/FloatingShareButton';
import { FloatingWalletButton } from '@/components/wallet/FloatingWalletButton';
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
import { hapticTap } from '@/lib/haptics';
import { motion } from 'framer-motion';

// Virtual Houses components
import { PortfolioSummaryCards } from '@/components/supporter/PortfolioSummaryCards';
import { VirtualHousesFeed } from '@/components/supporter/VirtualHousesFeed';
import { VirtualHouse } from '@/components/supporter/VirtualHouseCard';
import { VirtualHouseDetailsSheet } from '@/components/supporter/VirtualHouseDetailsSheet';
import { RentCategoryFeed, RentCategory } from '@/components/supporter/RentCategoryFeed';
import { CreditRequestsFeed } from '@/components/supporter/CreditRequestsFeed';
import { InvestmentPackageSheet } from '@/components/supporter/InvestmentPackageSheet';
import { OpportunitySummaryCard } from '@/components/supporter/OpportunitySummaryCard';

import AiIdButton from '@/components/ai-id/AiIdButton';


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
  const [loading, setLoading] = useState(true);
  const [hasCachedData, setHasCachedData] = useState(false);
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
  const { toast } = useToast();
  const { wallet } = useWallet();
  const { fireSuccess, fireFirstFunding } = useConfetti();
  const [hasEverFunded, setHasEverFunded] = useState<boolean | null>(null);

  // Virtual houses data (from funded rent_requests)
  const [virtualHouses, setVirtualHouses] = useState<VirtualHouse[]>([]);
  const [totalRentSecured, setTotalRentSecured] = useState(0);

  // Agreement
  const { hasAccepted, acceptance, loading: agreementLoading, acceptAgreement } = useSupporterAgreement();
  const effectiveHasAccepted = localHasAccepted === true || hasAccepted === true;

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
        description: 'Terms accepted. You can now start investing and helping tenants.',
      });
      setTimeout(() => setJustAccepted(false), 5000);
    }
    return success;
  };

  // Load cached data
  useEffect(() => {
    const cached = localStorage.getItem(`supporter_houses_${user.id}`);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        setVirtualHouses(data.houses || []);
        setTotalRentSecured(data.totalRent || 0);
        setHasCachedData(true);
      } catch (e) {
        console.warn('[SupporterDashboard] Cache read failed');
      }
    }
  }, [user.id]);

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
        setTotalRentSecured(totalRent);
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

  if (loading && isOnline && !hasCachedData) {
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
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto pb-28 md:pb-4">
        <main className="px-4 py-5 space-y-5 animate-fade-in max-w-lg mx-auto">
          
          {/* ═══ GREETING + QUICK ACTIONS ═══ */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/settings')} className="shrink-0">
                <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="lg" />
              </button>
              <div>
                <p className="text-sm text-muted-foreground font-medium">Welcome back 👋</p>
                <h1 className="font-black text-xl leading-tight flex items-center gap-1">
                  {profile?.full_name?.split(' ')[0] || 'Supporter'}
                  {profile?.verified ? (
                    <span className="flex items-center gap-0.5">
                      <BadgeCheck className="h-4 w-4 text-purple-500 fill-purple-500/20" />
                      <span className="text-[9px] text-purple-500 font-medium">Verified</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5">
                      <BadgeCheck className="h-4 w-4 text-muted-foreground/40" />
                      <span className="text-[9px] text-muted-foreground font-medium">Unverified</span>
                    </span>
                  )}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AiIdButton variant="compact" />
              {effectiveHasAccepted ? (
                <AgreementAcceptedBadge 
                  acceptedAt={acceptance?.accepted_at}
                  showCelebration={justAccepted}
                  variant="compact"
                />
              ) : (
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => setShowAgreementModal(true)}
                  className="text-sm border-2 border-amber-500/50 text-amber-600 hover:bg-amber-500/10 gap-1.5 rounded-xl h-10 px-3 font-bold"
                >
                  <FileText className="h-4 w-4" />
                  Accept Terms
                </Button>
              )}
            </div>
          </div>

          {/* ═══ PORTFOLIO HERO CARD ═══ */}
          <PortfolioSummaryCards
            housesFunded={virtualHouses.length}
            rentSecured={totalRentSecured}
            portfolioHealth={portfolioHealth}
          />

          {/* ═══ QUICK ACTION BUTTONS - BIG & BOLD ═══ */}
          <div className="grid grid-cols-3 gap-3">
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              onClick={() => {
                hapticTap();
                if (!effectiveHasAccepted) { setShowAgreementModal(true); return; }
                setShowPaymentPartners(true);
              }}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 active:scale-[0.95] transition-transform touch-manipulation min-h-[90px]"
            >
              <CreditCard className="h-8 w-8" />
              <span className="text-sm font-black">Add Funds</span>
            </motion.button>

            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              onClick={() => { hapticTap(); setShowCalculator(true); }}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-card border-2 border-border/60 text-foreground shadow-sm active:scale-[0.95] transition-transform touch-manipulation min-h-[90px]"
            >
              <Calculator className="h-8 w-8 text-primary" />
              <span className="text-sm font-black">Calculator</span>
            </motion.button>

            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              onClick={handleOpenMenu}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-card border-2 border-border/60 text-foreground shadow-sm active:scale-[0.95] transition-transform touch-manipulation min-h-[90px]"
            >
              <Menu className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-black">More</span>
            </motion.button>
          </div>

          {/* Credit Access moved to menu drawer */}

          {/* ═══ RENT CATEGORIES ═══ */}
          <div id="opportunities" className="relative scroll-mt-4 space-y-4">
            {!effectiveHasAccepted && <LockedOverlay onAcceptClick={() => setShowAgreementModal(true)} />}

            {/* ═══ WELILE AI CREDIT REQUESTS ═══ */}
            <CreditRequestsFeed
              isLocked={!effectiveHasAccepted}
              onLockedClick={() => setShowAgreementModal(true)}
            />

            {/* ═══ OPPORTUNITY SUMMARY CARD ═══ */}
            <OpportunitySummaryCard />

            <RentCategoryFeed
              onFundCategory={(cat) => {
                if (!effectiveHasAccepted) {
                  setShowAgreementModal(true);
                  return;
                }
                setSelectedPackageCategory(cat);
                setShowPackageSheet(true);
              }}
              isLocked={!effectiveHasAccepted}
              onLockedClick={() => setShowAgreementModal(true)}
              onRefreshRef={opportunitiesRefreshRef}
            />
          </div>

          {/* ═══ MY FUNDED HOUSES (collapsible) ═══ */}
          {virtualHouses.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-card border border-border/60 shadow-sm hover:bg-accent/30 transition-colors touch-manipulation active:scale-[0.98]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <span className="text-lg">🏘️</span>
                    </div>
                    <div className="text-left">
                      <span className="font-bold text-sm text-foreground">My Houses</span>
                      <p className="text-[10px] text-muted-foreground">{virtualHouses.length} funded properties</p>
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
          )}

          {/* ADD ROLE */}
          <div className="flex justify-center">
            {addRoleComponent}
          </div>

        </main>
      </PullToRefresh>
      <SupporterMenuDrawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onAddInvestment={() => setShowPaymentPartners(true)}
        onOpenCalculator={() => setShowCalculator(true)}
        onViewAgreement={() => { setViewAgreementTab('summary'); setShowViewAgreementModal(true); }}
      />


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
              Investment Calculator & ROI Projections
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

      <FloatingWalletButton />
      <FloatingShareButton />
      <MobileBottomNav currentRole={currentRole} />
    </div>
  );
}
