import { useState } from 'react';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { User } from '@supabase/supabase-js';

import AiIdButton from '@/components/ai-id/AiIdButton';
import { UnifiedWalletHeroCard } from '@/components/wallet/UnifiedWalletHeroCard';
import { AgentRiskExposureCard } from '@/components/agent/AgentRiskExposureCard';

import { Button } from '@/components/ui/button';
import { 
  UserPlus,
  Wallet,
  Menu,
  WifiOff,
  RefreshCw,
  BadgeCheck,
  Home,
  TrendingUp,
  Banknote,
  FileText,
  Users,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUGX } from '@/lib/rentCalculations';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';
import { WalletDisclaimer } from '@/components/wallet/WalletDisclaimer';

import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { AgentDepositDialog } from '@/components/agent/AgentDepositDialog';
import { UnifiedRegistrationDialog } from '@/components/agent/UnifiedRegistrationDialog';
import { RegisterSubAgentDialog } from '@/components/agent/RegisterSubAgentDialog';
import AgentRentRequestDialog from '@/components/agent/AgentRentRequestDialog';
import { useAgentEarnings } from '@/hooks/useAgentEarnings';
import { AgentDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';

import { hapticTap } from '@/lib/haptics';
import { AgentAgreementBanner } from '@/components/agent/agreement';
import { VerificationChecklist } from '@/components/shared/VerificationChecklist';
import { useOffline } from '@/contexts/OfflineContext';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useOfflineAgentDashboard } from '@/hooks/useOfflineAgentDashboard';
import { useWallet } from '@/hooks/useWallet';
import { useAgentBalances } from '@/hooks/useAgentBalances';
import { EarningsRankSystemSheet } from '@/components/agent/EarningsRankSystemSheet';
import { AgentMenuDrawer } from '@/components/agent/AgentMenuDrawer';
import { AgentActionInsights } from '@/components/agent/AgentActionInsights';
import { DailyRentExpectedCard } from '@/components/agent/DailyRentExpectedCard';
import { AgentManagedPropertyDialog } from '@/components/agent/AgentManagedPropertyDialog';
import { AgentManagedPropertiesSheet } from '@/components/agent/AgentManagedPropertiesSheet';
import { AgentLandlordPayoutDialog } from '@/components/agent/AgentLandlordPayoutDialog';
import { AgentLandlordPayoutFlow } from '@/components/agent/AgentLandlordPayoutFlow';
import { AgentLandlordFloatCard } from '@/components/agent/AgentLandlordFloatCard';
import { AgentFloatPayoutWizard } from '@/components/agent/AgentFloatPayoutWizard';
import { LandlordRecoveryLedger } from '@/components/agent/LandlordRecoveryLedger';
import { FloatPayoutStatusTracker } from '@/components/agent/FloatPayoutStatusTracker';
import { FloatTransactionHistory } from '@/components/agent/FloatTransactionHistory';
import { VerificationOpportunitiesButton } from '@/components/agent/VerificationOpportunitiesButton';
import { CreditVerificationButton } from '@/components/agent/CreditVerificationButton';
import { AgentMyRentRequestsSheet } from '@/components/agent/AgentMyRentRequestsSheet';
import { AgentTenantsSheet } from '@/components/agent/AgentTenantsSheet';

import { AgentTopUpTenantDialog } from '@/components/agent/AgentTopUpTenantDialog';
import { AgentInvestForPartnerDialog } from '@/components/agent/AgentInvestForPartnerDialog';
import { AgentAngelPoolInvestDialog } from '@/components/agent/AgentAngelPoolInvestDialog';
import { ProxyInvestmentHistorySheet } from '@/components/agent/ProxyInvestmentHistorySheet';
import { AgentReceiptDialog } from '@/components/agent/AgentReceiptDialog';
import { AgentLandlordMapSheet } from '@/components/agent/AgentLandlordMapSheet';
import { RentalFinderSheet } from '@/components/agent/RentalFinderSheet';
import { ListEmptyHouseDialog } from '@/components/agent/ListEmptyHouseDialog';
import { AgentListingsSheet } from '@/components/agent/AgentListingsSheet';
import { NearbyTenantsSheet } from '@/components/agent/NearbyTenantsSheet';
import { MySubAgentsSheet } from '@/components/agent/MySubAgentsSheet';
import { RecruitSubAgentCTA } from '@/components/agent/RecruitSubAgentCTA';
import { QuickShareSubAgentSheet } from '@/components/agent/QuickShareSubAgentSheet';
import { FunderManagementSheet } from '@/components/agent/FunderManagementSheet';
import { AgentPartnerDashboardSheet } from '@/components/agent/AgentPartnerDashboardSheet';
import { Card, CardContent } from '@/components/ui/card';
import { CreditAccessCard } from '@/components/CreditAccessCard';
import { ApprovedRentRequestsWidget } from '@/components/rent/ApprovedRentRequestsWidget';
import { RecentAutoCharges } from '@/components/wallet/RecentAutoCharges';
import { AgentTenantRentRequestsList } from '@/components/agent/AgentTenantRentRequestsList';
import { AgentVerificationOpportunitiesCard } from '@/components/agent/AgentVerificationOpportunitiesCard';
import { TodayCollectionsCard } from '@/components/agent/TodayCollectionsCard';
import { useIsFinancialAgent } from '@/hooks/useIsFinancialAgent';
import { FinancialAgentSection } from '@/components/agent/FinancialAgentSection';

// New Phase 1 components
import { AgentDailyOpsCard } from '@/components/agent/AgentDailyOpsCard';
import { AgentVisitPaymentWizard } from '@/components/agent/AgentVisitPaymentWizard';
import { GeneratePaymentTokenDialog } from '@/components/agent/GeneratePaymentTokenDialog';
import { RecordAgentCollectionDialog } from '@/components/agent/RecordAgentCollectionDialog';
import { AgentDepositCashDialog } from '@/components/agent/AgentDepositCashDialog';
import { AgentCashPayoutsTab } from '@/components/agent/AgentCashPayoutsTab';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AgentDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

export default function AgentDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: AgentDashboardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { refreshEarnings, totalEarnings } = useAgentEarnings();
  const { wallet, refreshWallet } = useWallet();
  const { floatBalance, commissionBalance, refetch: refreshBalances } = useAgentBalances();
  const { isOnline } = useOffline();
  
  const { 
    stats, 
    isLoading: loading, 
    refreshData: refreshOfflineData, 
    hasLoadedOnce 
  } = useOfflineAgentDashboard();
  
  const { tenantsCount, referralCount, subAgentCount } = stats;
  
  const [depositOpen, setDepositOpen] = useState(false);
  const [registerUserOpen, setRegisterUserOpen] = useState(false);
  const [inviteSubAgentOpen, setInviteSubAgentOpen] = useState(false);
  const [rentRequestOpen, setRentRequestOpen] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [earningsRankOpen, setEarningsRankOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [managedPropertyOpen, setManagedPropertyOpen] = useState(false);
  const [managedPropertiesSheetOpen, setManagedPropertiesSheetOpen] = useState(false);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [payoutProperty, setPayoutProperty] = useState<any>(null);
  const [myRentRequestsOpen, setMyRentRequestsOpen] = useState(false);
  
  const [topUpTenantOpen, setTopUpTenantOpen] = useState(false);
  const [tenantsSheetOpen, setTenantsSheetOpen] = useState(false);
  const [investForPartnerOpen, setInvestForPartnerOpen] = useState(false);
  const [proxyHistoryOpen, setProxyHistoryOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [landlordMapOpen, setLandlordMapOpen] = useState(false);
  const [rentalFinderOpen, setRentalFinderOpen] = useState(false);
  const [listHouseOpen, setListHouseOpen] = useState(false);
  const [myListingsOpen, setMyListingsOpen] = useState(false);

  // Phase 1: Agent Operations dialogs
  const [visitDialogOpen, setVisitDialogOpen] = useState(false);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [recordCollectionOpen, setRecordCollectionOpen] = useState(false);
  const [depositCashOpen, setDepositCashOpen] = useState(false);
  const [nearbyTenantsOpen, setNearbyTenantsOpen] = useState(false);
  const [applyingToSell, setApplyingToSell] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [subAgentsSheetOpen, setSubAgentsSheetOpen] = useState(false);
  const [shareLinkOpen, setShareLinkOpen] = useState(false);
  const [funderSheetOpen, setFunderSheetOpen] = useState(false);
  const [partnerDashboardOpen, setPartnerDashboardOpen] = useState(false);
  const [cashPayoutsOpen, setCashPayoutsOpen] = useState(false);
  const [landlordPayoutFlowOpen, setLandlordPayoutFlowOpen] = useState(false);
  const [floatPayoutOpen, setFloatPayoutOpen] = useState(false);
  const [recoveryLedgerOpen, setRecoveryLedgerOpen] = useState(false);
  const [payoutStatusOpen, setPayoutStatusOpen] = useState(false);
  const [floatHistoryOpen, setFloatHistoryOpen] = useState(false);
  const [requisitionOpen, setRequisitionOpen] = useState(false);
  const [angelPoolInvestOpen, setAngelPoolInvestOpen] = useState(false);

  const { isFinancialAgent } = useIsFinancialAgent();
  // Check if this agent is a CFO-assigned cashout agent
  const { data: isCashoutAgent } = useQuery({
    queryKey: ['is-cashout-agent', user.id],
    queryFn: async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data } = await supabase
        .from('cashout_agents')
        .select('*')
        .eq('agent_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      return data;
    },
  });

  const handleApplyToSell = async () => {
    setApplyingToSell(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase
        .from('profiles')
        .update({ seller_application_status: 'pending' })
        .eq('id', user.id);
      if (error) throw error;
      const { toast } = await import('sonner');
      toast.success('Application submitted! A manager will review your request.');
    } catch (err) {
      const { toast } = await import('sonner');
      toast.error('Failed to submit application');
    } finally {
      setApplyingToSell(false);
    }
  };

  if (loading && isOnline && !hasLoadedOnce) {
    return <AgentDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await Promise.all([refreshOfflineData(), refreshEarnings(), refreshWallet(), refreshBalances()]);
  };

  const handleRegisterUser = () => { hapticTap(); setRegisterUserOpen(true); };
  const handleDeposit = () => { hapticTap(); setDepositOpen(true); };
  const handleInviteSubAgent = () => { hapticTap(); setInviteSubAgentOpen(true); };
  const handleViewWallet = () => { hapticTap(); setShowWallet(true); };
  const handleOpenMenu = () => { hapticTap(); setMenuOpen(true); };

  const menuItems = [
    { icon: UserPlus, label: 'Register User', onClick: handleRegisterUser },
  ];

  const quickActions = [] as any[];

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      <OfflineBanner />
      
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      <div className="flex-1 overflow-y-auto pb-16 md:pb-4">
        <main className="px-4 py-5 space-y-5 max-w-lg mx-auto">
        {/* Offline Notice */}
        {!isOnline && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-warning/10 border border-warning/20">
            <WifiOff className="h-3.5 w-3.5 text-warning shrink-0" />
            <p className="text-xs text-warning flex-1">You're offline — data may be outdated</p>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.location.reload()}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        )}

        <AgentAgreementBanner />

        {/* Profile + Name + AI ID */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/settings')} className="shrink-0">
            <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="lg" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-xl leading-tight flex items-center gap-1.5 flex-wrap">
              <span className="break-words">{profile?.full_name || 'Agent'}</span>
              {profile?.verified && (
                <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 shrink-0" />
              )}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Welile Agent{profile?.territory ? ` · ${profile.territory}` : ''}</p>
          </div>
          <AiIdButton variant="compact" />
        </div>

        {/* Wallet Hero Card */}
        <UnifiedWalletHeroCard
          balance={floatBalance + commissionBalance}
          role="agent"
          secondaryLabel="Withdrawable"
          secondaryValue={formatUGX(commissionBalance)}
        />

        {/* Verification Checklist */}
        <VerificationChecklist userId={user.id} highlightRole="agent" compact />

        {/* Risk Exposure — guarantor liability visibility */}
        <AgentRiskExposureCard />

        {/* Daily Rent Expected — top priority visibility */}
        <div key="daily-rent-card">
          <DailyRentExpectedCard userId={user.id} />
        </div>

        {/* Today's Collections — who owes, at a glance */}
        <TodayCollectionsCard agentId={user.id} onViewTenants={() => setTenantsSheetOpen(true)} />

        {/* 5 Key Action Buttons + Hub — immediately accessible */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Banknote, label: 'Pay Rent', onClick: () => setTopUpTenantOpen(true), color: 'text-primary', bg: 'bg-primary/10 border-primary/30 hover:bg-primary/15' },
            { icon: FileText, label: 'Add Tenant', onClick: () => setRentRequestOpen(true), color: 'text-[#7C3BED]', bg: 'bg-[#7C3BED]/10 border-[#7C3BED]/30 hover:bg-[#7C3BED]/15 ring-1 ring-[#7C3BED]/30' },
            { icon: Users, label: 'Tenants', onClick: () => setTenantsSheetOpen(true), color: 'text-primary', bg: 'bg-primary/10 border-primary/30 hover:bg-primary/15' },
            { icon: Home, label: 'List House', onClick: () => setListHouseOpen(true), color: 'text-[#7C3BED]', bg: 'bg-[#7C3BED]/10 border-[#7C3BED]/30 hover:bg-[#7C3BED]/15' },
            { icon: TrendingUp, label: 'Credit', onClick: () => setCreditOpen(prev => !prev), color: 'text-[#7C3BED]', bg: 'bg-[#7C3BED]/10 border-[#7C3BED]/30 hover:bg-[#7C3BED]/15' },
            { icon: Menu, label: 'Agent Hub', onClick: handleOpenMenu, color: 'text-foreground/70', bg: 'bg-card border-border/40 hover:bg-muted/40' },
          ].map((action, i) => (
            <button
              key={action.label}
              onClick={() => { hapticTap(); action.onClick(); }}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border touch-manipulation active:opacity-80",
                action.bg
              )}
            >
              <action.icon className={cn("h-5 w-5", action.color)} />
              <span className={cn("text-[11px] font-semibold", action.color)}>{action.label}</span>
            </button>
          ))}
        </div>

        {/* Credit Access — toggles on Credit button */}
        {creditOpen && (
          <div className="overflow-hidden">
            <CreditAccessCard userId={user.id} compact />
          </div>
        )}

        {/* Action Insights: Forecast, Streak, Priority Queue (Daily Rent already shown above) */}
        <AgentActionInsights agentId={user.id} hideDailyRent />

        {/* Cash Payouts - Only visible for CFO-assigned cashout agents */}
        {isCashoutAgent && (
          <button
            onClick={() => { hapticTap(); setCashPayoutsOpen(true); }}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-orange-500/40 bg-orange-500/10 touch-manipulation active:opacity-80"
          >
            <div className="p-2.5 rounded-lg bg-orange-500/20">
              <Banknote className="h-5 w-5 text-orange-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-sm text-orange-700 dark:text-orange-400">Cash Payouts</p>
              <p className="text-[10px] text-muted-foreground">
                {isCashoutAgent.handles_cash && isCashoutAgent.handles_bank ? 'Cash & Bank' : isCashoutAgent.handles_cash ? 'Cash Only' : 'Bank Only'} · {isCashoutAgent.label || 'Cashout Agent'}
              </p>
            </div>
            <span className="text-lg text-orange-500">›</span>
          </button>
        )}

        {/* Landlord Funds — Pay Landlord via MoMo (escrow float) */}
        <AgentLandlordFloatCard
          onPayLandlord={() => { hapticTap(); setFloatPayoutOpen(true); }}
          onOpenRecovery={() => { hapticTap(); setRecoveryLedgerOpen(true); }}
          onOpenHistory={() => { hapticTap(); setFloatHistoryOpen(true); }}
          onOpenStatusTracker={() => { hapticTap(); setPayoutStatusOpen(true); }}
        />

        <RecentAutoCharges />

        </main>
      </div>

      <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />
      
      <AgentMenuDrawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onRegisterUser={handleRegisterUser}
        onDeposit={handleDeposit}
        onPostRentRequest={() => setRentRequestOpen(true)}
        onInviteSubAgent={handleInviteSubAgent}
        onOpenEarningsRank={() => setEarningsRankOpen(true)}
        onManageProperty={() => { setMenuOpen(false); setManagedPropertyOpen(true); }}
        onViewManagedProperties={() => { setMenuOpen(false); setManagedPropertiesSheetOpen(true); }}
        onViewMyRentRequests={() => { setMenuOpen(false); setMyRentRequestsOpen(true); }}
        onTopUpTenant={() => { setMenuOpen(false); setTopUpTenantOpen(true); }}
        onViewTenants={() => { setMenuOpen(false); setTenantsSheetOpen(true); }}
        onInvestForPartner={() => { setMenuOpen(false); setInvestForPartnerOpen(true); }}
        onViewProxyHistory={() => { setMenuOpen(false); setProxyHistoryOpen(true); }}
        onIssueReceipt={() => { setMenuOpen(false); setReceiptOpen(true); }}
        onViewLandlordMap={() => { setMenuOpen(false); setLandlordMapOpen(true); }}
        onFindRentals={() => { setMenuOpen(false); setRentalFinderOpen(true); }}
        onListEmptyHouse={() => { setMenuOpen(false); setListHouseOpen(true); }}
        onViewMyListings={() => { setMenuOpen(false); setMyListingsOpen(true); }}
        onViewSubAgents={() => { setMenuOpen(false); setSubAgentsSheetOpen(true); }}
        onShareSubAgentLink={() => { setMenuOpen(false); setShareLinkOpen(true); }}
        onManageFunders={() => { setMenuOpen(false); setFunderSheetOpen(true); }}
        onOpenPartnerDashboard={() => { setMenuOpen(false); setPartnerDashboardOpen(true); }}
        onOpenRequisition={() => { setMenuOpen(false); setRequisitionOpen(true); }}
        onAngelPoolInvest={() => { setMenuOpen(false); setAngelPoolInvestOpen(true); }}
        isFinancialAgent={isFinancialAgent}
        onInviteFunder={() => {
          setMenuOpen(false);
          const funderLink = `${getPublicOrigin()}/auth?ref=${user.id}&role=funder`;
          const shareText = `Join Welile as a funder and start earning! Sign up here: ${funderLink}`;
          if (navigator.share) {
            navigator.share({ title: 'Become a Welile Funder', text: shareText, url: funderLink }).catch(() => {});
          } else {
            navigator.clipboard.writeText(funderLink).then(() => {
              import('sonner').then(({ toast }) => toast.success('Funder signup link copied!'));
            });
          }
        }}
        onInviteAngelInvestor={() => {
          setMenuOpen(false);
          const investorLink = `${getPublicOrigin()}/auth?ref=${user.id}&role=supporter`;
          const shareText = `🦄 Join the Welile Angel Pool — invest in Africa's rent-tech revolution! Own equity in a high-growth platform. Sign up here: ${investorLink}`;
          if (navigator.share) {
            navigator.share({ title: 'Invest in Welile Angel Pool', text: shareText, url: investorLink }).catch(() => {});
          } else {
            navigator.clipboard.writeText(investorLink).then(() => {
              import('sonner').then(({ toast }) => toast.success('Angel investor signup link copied!'));
            });
          }
        }}
        onShareTenantForm={async () => {
          setMenuOpen(false);
          try {
            const { toast } = await import('sonner');
            toast.info('Generating shareable link...');
            const { supabase } = await import('@/integrations/supabase/client');
            const { data, error } = await supabase.functions.invoke('generate-tenant-form-token', {});
            if (error || data?.error) throw new Error(data?.error || error?.message || 'Failed to generate link');
            const tenantFormLink = `${getPublicOrigin()}/register-tenant?agent=${user.id}&token=${data.token}`;
            const shareText = `Register as a Welile tenant using this form: ${tenantFormLink}`;
            if (navigator.share) {
              navigator.share({ title: 'Tenant Registration', text: shareText, url: tenantFormLink }).catch(() => {});
            } else {
              await navigator.clipboard.writeText(tenantFormLink);
              toast.success('Tenant registration link copied!');
            }
          } catch (err: any) {
            const { toast } = await import('sonner');
            toast.error(err.message || 'Failed to generate link');
          }
        }}
        onSharePartnerForm={async () => {
          setMenuOpen(false);
          try {
            const { toast } = await import('sonner');
            toast.info('Generating partner form link...');
            const { supabase } = await import('@/integrations/supabase/client');
            const { data, error } = await supabase.functions.invoke('generate-tenant-form-token', {});
            if (error || data?.error) throw new Error(data?.error || error?.message || 'Failed to generate link');
            const partnerFormLink = `${getPublicOrigin()}/register-partner?agent=${user.id}&token=${data.token}`;
            const shareText = `🤝 Invest with Welile and earn 15% monthly ROI! Register here: ${partnerFormLink}`;
            if (navigator.share) {
              navigator.share({ title: 'Partner Registration', text: shareText, url: partnerFormLink }).catch(() => {});
            } else {
              await navigator.clipboard.writeText(partnerFormLink);
              toast.success('Partner registration link copied!');
            }
          } catch (err: any) {
            const { toast } = await import('sonner');
            toast.error(err.message || 'Failed to generate link');
          }
        }}
      />

      {/* Existing Dialogs */}
      <AgentDepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
      <UnifiedRegistrationDialog 
        open={registerUserOpen} 
        onOpenChange={setRegisterUserOpen}
        onSuccess={() => { refreshOfflineData(); refreshEarnings(); }}
      />
      <RegisterSubAgentDialog
        open={inviteSubAgentOpen}
        onOpenChange={setInviteSubAgentOpen}
        onSuccess={() => { refreshOfflineData(); refreshEarnings(); }}
      />
      <AgentRentRequestDialog 
        open={rentRequestOpen} 
        onOpenChange={setRentRequestOpen} 
        onSuccess={() => setRentRequestOpen(false)}
      />
      <EarningsRankSystemSheet open={earningsRankOpen} onOpenChange={setEarningsRankOpen} />
      <AgentManagedPropertyDialog open={managedPropertyOpen} onOpenChange={setManagedPropertyOpen} onSuccess={refreshOfflineData} />
      <AgentManagedPropertiesSheet open={managedPropertiesSheetOpen} onOpenChange={setManagedPropertiesSheetOpen} onRequestPayout={(p) => { setPayoutProperty(p); setPayoutDialogOpen(true); }} />
      <AgentLandlordPayoutDialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen} property={payoutProperty} />
      <AgentLandlordPayoutFlow open={landlordPayoutFlowOpen} onOpenChange={setLandlordPayoutFlowOpen} />
      <AgentFloatPayoutWizard open={floatPayoutOpen} onOpenChange={setFloatPayoutOpen} />
      <LandlordRecoveryLedger open={recoveryLedgerOpen} onOpenChange={setRecoveryLedgerOpen} />
      <FloatPayoutStatusTracker open={payoutStatusOpen} onOpenChange={setPayoutStatusOpen} />
      <FloatTransactionHistory open={floatHistoryOpen} onOpenChange={setFloatHistoryOpen} />
      <VerificationOpportunitiesButton />
      <CreditVerificationButton />
      <AgentMyRentRequestsSheet open={myRentRequestsOpen} onOpenChange={setMyRentRequestsOpen} />
      <AgentTenantsSheet open={tenantsSheetOpen} onOpenChange={setTenantsSheetOpen} />
      <AgentTopUpTenantDialog open={topUpTenantOpen} onOpenChange={setTopUpTenantOpen} onSuccess={refreshOfflineData} />
      <AgentInvestForPartnerDialog open={investForPartnerOpen} onOpenChange={setInvestForPartnerOpen} onSuccess={() => { refreshOfflineData(); refreshWallet(); }} />
      <ProxyInvestmentHistorySheet open={proxyHistoryOpen} onOpenChange={setProxyHistoryOpen} />
      <AgentAngelPoolInvestDialog open={angelPoolInvestOpen} onOpenChange={setAngelPoolInvestOpen} onSuccess={() => { refreshOfflineData(); refreshWallet(); }} />
      <AgentReceiptDialog open={receiptOpen} onOpenChange={setReceiptOpen} />
      <AgentLandlordMapSheet open={landlordMapOpen} onOpenChange={setLandlordMapOpen} />
      <RentalFinderSheet open={rentalFinderOpen} onOpenChange={setRentalFinderOpen} />
      <ListEmptyHouseDialog open={listHouseOpen} onOpenChange={setListHouseOpen} onSuccess={refreshOfflineData} />
      <AgentListingsSheet open={myListingsOpen} onOpenChange={setMyListingsOpen} />

      {/* Phase 1: Agent Operations Dialogs */}
      <AgentVisitPaymentWizard open={visitDialogOpen} onOpenChange={setVisitDialogOpen} onSuccess={refreshOfflineData} />
      <GeneratePaymentTokenDialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen} />
      <RecordAgentCollectionDialog open={recordCollectionOpen} onOpenChange={setRecordCollectionOpen} />
      <AgentDepositCashDialog open={depositCashOpen} onOpenChange={setDepositCashOpen} />
      <NearbyTenantsSheet open={nearbyTenantsOpen} onOpenChange={setNearbyTenantsOpen} />
      <MySubAgentsSheet open={subAgentsSheetOpen} onOpenChange={setSubAgentsSheetOpen} />
      <QuickShareSubAgentSheet open={shareLinkOpen} onOpenChange={setShareLinkOpen} />
      <FunderManagementSheet open={funderSheetOpen} onOpenChange={setFunderSheetOpen} />
      <AgentPartnerDashboardSheet open={partnerDashboardOpen} onOpenChange={setPartnerDashboardOpen} />
      <FinancialAgentSection open={requisitionOpen} onOpenChange={setRequisitionOpen} />

      {/* Cash Payouts Dialog - only rendered for cashout agents */}
      <Dialog open={cashPayoutsOpen} onOpenChange={setCashPayoutsOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-orange-500" />
              Cash & Bank Payouts
            </DialogTitle>
          </DialogHeader>
          <AgentCashPayoutsTab />
        </DialogContent>
      </Dialog>

      
    </div>
  );
}
