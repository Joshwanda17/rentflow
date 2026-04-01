import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CreditCard, Calculator, Menu, BadgeCheck, Wallet, ChevronRight,
  Crown, Shield, ArrowUpRight, TrendingUp, Home
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { useWallet } from '@/hooks/useWallet';
import { useCurrency } from '@/hooks/useCurrency';
import { hapticTap } from '@/lib/haptics';
import DashboardHeader from '@/components/DashboardHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import AiIdButton from '@/components/ai-id/AiIdButton';
import { AngelHeroCard } from '@/components/angel-pool/AngelHeroCard';
import { AngelCalculator } from '@/components/angel-pool/AngelCalculator';
import { AngelPoolDashboard } from '@/components/angel-pool/AngelPoolDashboard';
import { AngelActivityFeed } from '@/components/angel-pool/AngelActivityFeed';
import { AngelInvestorCard } from '@/components/angel-pool/AngelInvestorCard';
import { MOCK_TOTAL_RAISED, MOCK_INVESTORS } from '@/components/angel-pool/mockData';
import { TOTAL_POOL_UGX, PRICE_PER_SHARE, TOTAL_SHARES, POOL_PERCENT } from '@/components/angel-pool/constants';
import { useAuth } from '@/hooks/useAuth';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';

export default function AngelPool() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { wallet } = useWallet();
  const { formatAmount, formatAmountCompact } = useCurrency();
  const { role: currentRole, roles: availableRoles, switchRole, signOut } = useAuth();
  const [showWallet, setShowWallet] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const poolRef = useRef<HTMLDivElement>(null);
  const calcRef = useRef<HTMLDivElement>(null);

  const scrollToPool = () => poolRef.current?.scrollIntoView({ behavior: 'smooth' });
  const scrollToCalc = () => calcRef.current?.scrollIntoView({ behavior: 'smooth' });

  const walletBalance = wallet?.balance ?? 0;
  const sharesSold = MOCK_TOTAL_RAISED / PRICE_PER_SHARE;
  const sharesRemaining = TOTAL_SHARES - sharesSold;
  const progress = (MOCK_TOTAL_RAISED / TOTAL_POOL_UGX) * 100;

  // Mock data for the portfolio hero
  const myInvestment = 5_000_000; // mock
  const myShares = Math.floor(myInvestment / PRICE_PER_SHARE);
  const monthlyReturn = myInvestment * 0.15;

  const menuItems = [
    { icon: CreditCard, label: 'Invest in Pool', onClick: scrollToCalc },
  ];

  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      <DashboardHeader
        currentRole={currentRole || 'supporter'}
        availableRoles={availableRoles.length ? availableRoles : ['supporter']}
        onRoleChange={switchRole}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      <div className="flex-1 min-h-0 overflow-y-auto pb-28 md:pb-4 overscroll-contain">
        <main className="px-3 xs:px-4 py-4 xs:py-5 space-y-5 max-w-lg mx-auto pb-8">

          {/* ═══ INLINE GREETING BAR ═══ */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/settings')} className="shrink-0 min-h-[44px] min-w-[44px]">
                <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="md" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground font-medium">Welcome back</p>
                <h1 className="font-bold text-lg leading-tight flex items-center gap-1.5">
                  <span className="break-words">{profile?.full_name?.split(' ')[0] || 'Investor'}</span>
                  {profile?.verified ? (
                    <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 shrink-0" />
                  ) : (
                    <BadgeCheck className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                  )}
                </h1>
              </div>
              <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">TEST</span>
            </div>
            <AiIdButton variant="compact" />
          </div>

          {/* ═══ PORTFOLIO HERO CARD — Matches Funder ═══ */}
          <div className="portfolio-hero-card rounded-3xl p-5 relative overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-white/[0.06] pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full bg-white/[0.04] pointer-events-none" />
            <div className="absolute top-1/2 right-0 w-64 h-[1px] bg-gradient-to-l from-transparent via-white/10 to-transparent pointer-events-none" />

            <div className="relative z-10 space-y-5">
              {/* Top Label */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-white/15 backdrop-blur-sm">
                    <Crown className="h-3.5 w-3.5 text-white/90" />
                  </div>
                  <span className="text-[11px] font-semibold text-white/70 uppercase tracking-[0.12em]">
                    Angel Pool Portfolio
                  </span>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-wider">Active</span>
                </div>
              </div>

              {/* Main Balance */}
              <button
                onClick={() => { hapticTap(); setShowWallet(true); }}
                className="w-full text-left group"
              >
                <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-white/60 mb-1.5 flex items-center gap-1.5">
                  <Wallet className="h-3 w-3" />
                  Available Balance
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-[clamp(1.5rem,6vw,2.25rem)] font-black tracking-tight leading-none text-white truncate">
                    <span className="sm:hidden">{formatAmountCompact(walletBalance)}</span>
                    <span className="hidden sm:inline">{formatAmount(walletBalance)}</span>
                  </p>
                </div>
                {monthlyReturn > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-500/20">
                      <ArrowUpRight className="h-3 w-3 text-emerald-300" />
                      <span className="text-[11px] font-bold text-emerald-300">
                        +{formatAmountCompact(monthlyReturn)}/mo
                      </span>
                    </div>
                  </div>
                )}
              </button>

              {/* Divider */}
              <div className="h-[1px] bg-white/10" />

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className="portfolio-stat-cell-v2 rounded-xl px-2 py-3 text-center">
                  <div className="flex items-center justify-center mb-1.5">
                    <Crown className="h-3.5 w-3.5 text-white/60" />
                  </div>
                  <p className="text-xl font-black leading-none text-white">{myShares}</p>
                  <p className="text-[8px] uppercase tracking-[0.14em] font-bold text-white/50 mt-1.5">Shares</p>
                </div>

                <div className="portfolio-stat-cell-v2 rounded-xl px-1.5 py-3 text-center overflow-hidden">
                  <div className="flex items-center justify-center mb-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400/80" />
                  </div>
                  <p className="text-sm font-black leading-none text-white truncate">
                    {formatAmountCompact(monthlyReturn)}
                  </p>
                  <p className="text-[8px] uppercase tracking-[0.14em] font-bold text-white/50 mt-1.5">Return/mo</p>
                </div>

                <div className="portfolio-stat-cell-v2 rounded-xl px-1.5 py-3 text-center overflow-hidden">
                  <div className="flex items-center justify-center mb-1.5">
                    <Wallet className="h-3.5 w-3.5 text-amber-400/80" />
                  </div>
                  <p className="text-sm font-black leading-none text-white truncate">
                    {formatAmountCompact(myInvestment)}
                  </p>
                  <p className="text-[8px] uppercase tracking-[0.14em] font-bold text-white/50 mt-1.5">Invested</p>
                </div>
              </div>

              {/* Trust Strip */}
              <div className="flex items-center justify-between px-1 pt-1">
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3 w-3 text-white/40" />
                  <span className="text-[9px] text-white/40 font-medium">{POOL_PERCENT}% Equity Pool</span>
                </div>
                <span className="text-[9px] text-white/40 font-medium">
                  Pool: {progress.toFixed(1)}% filled
                </span>
              </div>
            </div>
          </div>

          {/* ═══ MY ANGEL PORTFOLIO — Big Card ═══ */}
          <button
            onClick={() => { hapticTap(); scrollToPool(); }}
            className="w-full rounded-2xl bg-card border-2 border-primary/20 p-4 flex items-center gap-4 active:scale-[0.98] transition-all touch-manipulation shadow-sm hover:border-primary/40 min-h-[72px]"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Crown className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="font-bold text-base text-foreground">Angel Pool</p>
              <p className="text-xs text-muted-foreground mt-0.5">View pool status & top investors</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground/50 shrink-0" />
          </button>

          {/* ═══ QUICK ACTIONS — Pill Style ═══ */}
          <div className="flex gap-2">
            <button
              onClick={() => { hapticTap(); scrollToCalc(); }}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-lg shadow-primary/20 active:scale-[0.96] transition-transform touch-manipulation min-h-[48px]"
            >
              <CreditCard className="h-4.5 w-4.5" />
              Invest Now
            </button>

            <button
              onClick={() => { hapticTap(); scrollToCalc(); }}
              className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-card border-2 border-border/60 text-foreground font-bold text-sm shadow-sm active:scale-[0.96] transition-transform touch-manipulation min-h-[48px]"
            >
              <Calculator className="h-4.5 w-4.5 text-primary" />
              ROI
            </button>

            <button
              onClick={() => { hapticTap(); setMenuOpen(!menuOpen); }}
              className="flex items-center justify-center px-4 py-3.5 rounded-2xl bg-card border-2 border-border/60 text-muted-foreground shadow-sm active:scale-[0.96] transition-transform touch-manipulation min-h-[48px]"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          {/* ═══ SECTION: ANGEL POOL OPPORTUNITY ═══ */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <div className="w-1 h-5 rounded-full bg-primary" />
              <h2 className="text-sm font-black text-foreground tracking-tight">Angel Pool Opportunity</h2>
            </div>

            {/* Angel Pool Summary Card — Matches OpportunitySummaryCard style */}
            <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm">
              <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-primary/10">
                    <Crown className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-black text-foreground text-sm tracking-tight">Early Angel Pool</h3>
                    <p className="text-[10px] text-muted-foreground font-medium leading-tight">Own a piece of Welile Technologies</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[9px] px-2 py-0.5 border-success/40 text-success bg-success/5 font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-success mr-1 animate-pulse" />
                  Open
                </Badge>
              </div>

              <div className="px-5 pb-3">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">Total Pool Target</p>
                <p className="text-2xl sm:text-3xl font-black text-foreground mt-1">
                  <span className="sm:hidden">{formatAmountCompact(TOTAL_POOL_UGX)}</span>
                  <span className="hidden sm:inline">{formatAmount(TOTAL_POOL_UGX)}</span>
                </p>
                <p className="text-[11px] text-primary font-semibold mt-1">
                  🚀 {POOL_PERCENT}% equity — {TOTAL_SHARES.toLocaleString()} shares at {formatAmountCompact(PRICE_PER_SHARE)}/share
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-px bg-border/40">
                <div className="bg-card px-3 py-4 text-center">
                  <p className="text-xl font-black text-foreground">{sharesSold.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground font-medium mt-0.5">Shares Sold</p>
                </div>
                <div className="bg-card px-3 py-4 text-center">
                  <p className="text-xl font-black text-foreground">{MOCK_INVESTORS.length}</p>
                  <p className="text-[9px] text-muted-foreground font-medium mt-0.5">Angel Investors</p>
                </div>
                <div className="bg-card px-3 py-4 text-center">
                  <p className="text-xl font-black text-foreground">{sharesRemaining.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground font-medium mt-0.5">Shares Left</p>
                </div>
              </div>

              {/* Features */}
              <div className="px-5 py-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-3 w-3" /> Equity Pool
                  </span>
                  <span className="font-bold text-primary">{POOL_PERCENT}%</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Wallet className="h-3 w-3" /> Min Investment
                  </span>
                  <span className="font-bold">{formatAmountCompact(PRICE_PER_SHARE)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Shield className="h-3 w-3" /> Risk Level
                  </span>
                  <span className="font-bold">Verified & Secured</span>
                </div>
              </div>

              {/* CTA */}
              <div className="px-5 pb-5">
                <Button
                  onClick={scrollToCalc}
                  className="w-full h-12 rounded-2xl text-sm font-bold shadow-md gap-2"
                >
                  <Crown className="h-4 w-4" />
                  Calculate My Investment
                </Button>
              </div>
            </div>
          </div>

          {/* ═══ INVESTMENT CALCULATOR ═══ */}
          <div ref={calcRef} className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <div className="w-1 h-5 rounded-full bg-amber-500" />
              <h2 className="text-sm font-black text-foreground tracking-tight">Investment Calculator</h2>
            </div>
            <AngelCalculator />
          </div>

          {/* ═══ POOL DASHBOARD ═══ */}
          <div ref={poolRef} className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <div className="w-1 h-5 rounded-full bg-success" />
              <h2 className="text-sm font-black text-foreground tracking-tight">Pool Dashboard</h2>
            </div>
            <AngelPoolDashboard />
          </div>

          {/* ═══ LIVE ACTIVITY ═══ */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <div className="w-1 h-5 rounded-full bg-primary" />
              <h2 className="text-sm font-black text-foreground tracking-tight">Live Activity</h2>
            </div>
            <AngelActivityFeed />
          </div>

          {/* ═══ SHARE CARD GENERATOR ═══ */}
          <Collapsible>
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <div className="w-1 h-5 rounded-full bg-amber-500" />
                <h2 className="text-sm font-black text-foreground tracking-tight">Share Card</h2>
              </div>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-card border border-border/60 shadow-sm hover:bg-accent/30 transition-colors touch-manipulation active:scale-[0.98]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <span className="text-lg">🎴</span>
                    </div>
                    <div className="text-left">
                      <span className="font-bold text-sm text-foreground">Generate Share Card</span>
                      <p className="text-[10px] text-muted-foreground">Create & share on WhatsApp</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pt-3">
                  <AngelInvestorCard />
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

        </main>
      </div>

      {showWallet && <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />}
      <MobileBottomNav currentRole={currentRole || 'supporter'} />
    </div>
  );
}
