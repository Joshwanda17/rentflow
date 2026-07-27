import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Users, ArrowRight, Calculator, Zap, Shield, ArrowLeft, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';
import { motion, AnimatePresence } from 'framer-motion';
import welileLogo from '@/assets/welile-logo.png';
import { PublicHousesPreview } from '@/components/landing/PublicHousesPreview';
import { Helmet } from 'react-helmet-async';

interface IntentOption {
  role: 'tenant' | 'agent' | 'landlord' | 'supporter';
  emoji: string;
  title: string;
  intent: string;
  outcome: string;
  bullets: string[];
  gradient: string;
}

const intentOptions: IntentOption[] = [
  {
    role: 'tenant',
    emoji: '🏠',
    title: 'Tenant',
    intent: 'I need rent help',
    outcome: 'Move in today, pay daily.',
    bullets: [
      'Get your rent funded instantly',
      'Pay small daily amounts',
      'Build trust every time you pay',
    ],
    gradient: 'from-blue-500 to-indigo-600',
  },
  {
    role: 'supporter',
    emoji: '💰',
    title: 'Funder / Supporter',
    intent: 'I want to earn',
    outcome: 'Earn monthly returns backing real tenants.',
    bullets: [
      'Fund a tenant’s rent',
      'Earn monthly returns',
      'Withdraw with 90-day notice',
    ],
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    role: 'agent',
    emoji: '⚡',
    title: 'Agent',
    intent: 'I want to earn and learn',
    outcome: 'Earn cash connecting landlords, houses and tenants.',
    bullets: [
      'List houses & landlords',
      'Post tenant rent requests',
      'Earn commissions & bonuses',
    ],
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    role: 'landlord',
    emoji: '🏢',
    title: 'Landlord',
    intent: 'I want guaranteed rent',
    outcome: 'Guaranteed rent, no chasing.',
    bullets: [
      'List your house for free',
      'Get paid upfront by Welile',
      'Tenants managed for you',
    ],
    gradient: 'from-purple-500 to-violet-600',
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const ONBOARDING_KEY = 'welile_onboarding_seen';

export default function Landing() {
  const navigate = useNavigate();
  const totalSlides = intentOptions.length;
  const [step, setStep] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return window.localStorage.getItem(ONBOARDING_KEY) ? totalSlides : 0;
  });

  const markSeen = () => {
    try { window.localStorage.setItem(ONBOARDING_KEY, 'true'); } catch { /* ignore */ }
  };

  const goNext = () => {
    hapticTap();
    if (step < totalSlides - 1) {
      setStep(step + 1);
    } else {
      markSeen();
      setStep(totalSlides);
    }
  };

  const goBack = () => {
    hapticTap();
    if (step > 0) setStep(step - 1);
  };

  const skipOnboarding = () => {
    hapticTap();
    markSeen();
    setStep(totalSlides);
  };

  const replayIntro = () => {
    hapticTap();
    setStep(0);
  };

  const handleIntent = (role: string) => {
    hapticTap();
    markSeen();
    navigate(`/auth?role=${role}`);
  };

  const onPicker = step >= totalSlides;
  const currentSlide = !onPicker ? intentOptions[step] : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Helmet>
        <title>Welile — Housing & Funding for Everyone</title>
        <meta name="description" content="Meet the four Welile roles — Tenant, Funder, Agent, Landlord — and pick the one that fits you." />
        <link rel="canonical" href="https://welileapp.com/welcome" />
        <meta property="og:title" content="Welile — Housing & Funding for Everyone" />
        <meta property="og:description" content="Meet the four Welile roles — Tenant, Funder, Agent, Landlord — and pick the one that fits you." />
        <meta property="og:url" content="https://welileapp.com/welcome" />
      </Helmet>

      {/* Header — logo + skip on onboarding, title on picker */}
      <header className="pt-safe-top px-5 pt-8 pb-4 max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between">
          <img
            src={welileLogo}
            alt="Welile"
            width={640}
            height={640}
            fetchPriority="high"
            loading="eager"
            decoding="async"
            className="h-10 w-auto"
          />
          {!onPicker && (
            <button
              onClick={skipOnboarding}
              className="text-sm text-muted-foreground hover:text-foreground touch-manipulation px-2 py-1"
            >
              Skip
            </button>
          )}
        </div>

        {onPicker && (
          <div className="text-center mt-4">
            <h1 className="text-foreground text-xl font-bold leading-snug">
              Welile — Housing & Funding Instantly
            </h1>
            <p className="text-muted-foreground text-sm mt-2">
              Pick the role that fits you
            </p>
          </div>
        )}
      </header>

      {/* Onboarding slides */}
      {!onPicker && currentSlide && (
        <main className="flex-1 px-5 pb-6 flex flex-col max-w-lg mx-auto w-full">
          <div className="flex-1 flex flex-col justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide.role}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.25 }}
                className="text-center"
              >
                <div className={cn(
                  "w-24 h-24 rounded-3xl flex items-center justify-center text-5xl mx-auto shadow-lg",
                  "bg-gradient-to-br", currentSlide.gradient
                )}>
                  <span className="drop-shadow">{currentSlide.emoji}</span>
                </div>
                <h1 className="text-foreground text-2xl font-bold mt-6">
                  {currentSlide.title}
                </h1>
                <p className="text-foreground/80 text-base mt-2 max-w-[300px] mx-auto leading-relaxed">
                  {currentSlide.outcome}
                </p>

                <ul className="mt-6 space-y-3 text-left max-w-[320px] mx-auto">
                  {currentSlide.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <span className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-sm text-foreground">{b}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 py-4">
            {intentOptions.map((opt, i) => (
              <button
                key={opt.role}
                onClick={() => { hapticTap(); setStep(i); }}
                aria-label={`Go to slide ${i + 1}`}
                className={cn(
                  "h-2 rounded-full transition-all touch-manipulation",
                  i === step ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"
                )}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              disabled={step === 0}
              className={cn(
                "h-12 px-4 rounded-2xl border border-border flex items-center justify-center gap-1 text-sm font-medium touch-manipulation transition-all",
                step === 0 ? "opacity-40 cursor-not-allowed" : "hover:bg-muted active:scale-[0.97]"
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={goNext}
              className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-base shadow-md hover:brightness-110 active:scale-[0.97] transition-all touch-manipulation flex items-center justify-center gap-2"
            >
              {step === totalSlides - 1 ? 'Get started' : 'Next'}
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </main>
      )}

      {/* Intent Selection */}
      {onPicker && (
      <main className="flex-1 px-5 pb-8 flex flex-col justify-center max-w-lg mx-auto w-full">
        {/* Live preview of real listed houses — visible to new visitors before signup */}
        <PublicHousesPreview />

        <motion.h2
          className="text-center text-foreground font-semibold text-lg mb-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          What do you need?
        </motion.h2>

        <motion.div
          className="space-y-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {intentOptions.map((option) => (
            <motion.button
              key={option.role}
              variants={itemVariants}
              onClick={() => handleIntent(option.role)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all duration-150",
                "bg-card border border-border/50 shadow-sm",
                "hover:shadow-md hover:scale-[1.01] active:scale-[0.98]",
                "touch-manipulation"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0",
                "bg-gradient-to-br", option.gradient, "shadow-sm"
              )}>
                <span className="drop-shadow-sm">{option.emoji}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground text-[15px] leading-tight">
                  {option.intent}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {option.outcome}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            </motion.button>
          ))}
        </motion.div>

        {/* Explore without signing up + replay intro */}
        <motion.div
          className="mt-6 flex items-center justify-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <Link
            to="/rent-calculator"
            className="flex items-center gap-2 p-2.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
            onClick={() => hapticTap()}
          >
            <Calculator className="h-4 w-4" />
            <span className="text-sm">
              Rent Calculator
            </span>
          </Link>
          <button
            onClick={replayIntro}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors touch-manipulation p-2.5"
          >
            Replay intro
          </button>
        </motion.div>

        {/* Trust signals */}
        <h2 className="sr-only">Why choose Welile</h2>
        <motion.div
          className="mt-8 flex items-center justify-center gap-6 text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <div className="flex items-center gap-1.5 text-xs">
            <Zap className="h-3.5 w-3.5" />
            <span>Instant</span>
          </div>
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <div className="flex items-center gap-1.5 text-xs">
            <Shield className="h-3.5 w-3.5" />
            <span>Secure</span>
          </div>
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <div className="flex items-center gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" />
            <span>40M+ ready</span>
          </div>
        </motion.div>
      </main>
      )}

      {/* Footer — Sign in CTA */}
      {onPicker && (
      <footer className="px-5 py-5 pb-safe-bottom max-w-lg mx-auto w-full">
        <button
          onClick={() => { hapticTap(); markSeen(); navigate('/auth'); }}
          className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-base shadow-md hover:shadow-lg hover:brightness-110 active:scale-[0.97] transition-all touch-manipulation"
        >
          Sign in to your account
          <ArrowRight className="h-5 w-5" />
        </button>
      </footer>
      )}
    </div>
  );
}