import { useNavigate, Link } from 'react-router-dom';
import { Users, ArrowRight, Calculator, Zap, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';
import { motion } from 'framer-motion';


interface IntentOption {
  role: 'tenant' | 'agent' | 'landlord' | 'supporter';
  emoji: string;
  intent: string;
  outcome: string;
  gradient: string;
}

const intentOptions: IntentOption[] = [
  {
    role: 'tenant',
    emoji: '🏠',
    intent: 'I need rent help',
    outcome: 'Get funded instantly',
    gradient: 'from-blue-500 to-indigo-600',
  },
  {
    role: 'supporter',
    emoji: '💰',
    intent: 'I want to earn',
    outcome: '15% monthly returns',
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    role: 'agent',
    emoji: '⚡',
    intent: 'I want to hustle',
    outcome: 'Register & earn cash',
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    role: 'landlord',
    emoji: '🏢',
    intent: 'I want guaranteed rent',
    outcome: 'Never chase tenants',
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

export default function Landing() {
  const navigate = useNavigate();

  const handleIntent = (role: string) => {
    hapticTap();
    // During signup pause, let them explore the calculator instead
    navigate('/rent-calculator');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero — minimal, intent-first */}
      <header className="pt-safe-top px-5 pt-10 pb-6 text-center">
        <motion.img
          src={welileColoredLogo}
          alt="Welile"
          className="h-14 w-auto mx-auto"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        />
        <motion.p
          className="text-muted-foreground text-sm mt-2 max-w-[260px] mx-auto leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.3 }}
        >
          Explore housing & funding instantly
        </motion.p>
      </header>

      {/* Intent Selection */}
      <main className="flex-1 px-5 pb-8 flex flex-col justify-center max-w-lg mx-auto w-full">
        <motion.p
          className="text-center text-foreground font-semibold text-lg mb-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          What do you need?
        </motion.p>

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
              {/* Intent emoji */}
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0",
                "bg-gradient-to-br", option.gradient, "shadow-sm"
              )}>
                <span className="drop-shadow-sm">{option.emoji}</span>
              </div>

              {/* Intent text */}
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

        {/* Explore without signing up */}
        <motion.div
          className="mt-6 space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <Link
            to="/rent-calculator"
            className="flex items-center justify-center gap-2 p-2.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
            onClick={() => hapticTap()}
          >
            <Calculator className="h-4 w-4" />
            <span className="text-sm">
              Try Rent Calculator
            </span>
          </Link>
        </motion.div>

        {/* Trust signals */}
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

      {/* Footer — Sign in CTA */}
      <footer className="px-5 py-5 pb-safe-bottom max-w-lg mx-auto w-full">
        <button
          onClick={() => { hapticTap(); navigate('/auth'); }}
          className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-base shadow-md hover:shadow-lg hover:brightness-110 active:scale-[0.97] transition-all touch-manipulation"
        >
          Sign in to your account
          <ArrowRight className="h-5 w-5" />
        </button>
      </footer>
    </div>
  );
}
