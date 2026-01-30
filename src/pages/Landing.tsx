import { useNavigate, Link } from 'react-router-dom';
import { Home, Users, Building2, Wallet, ArrowRight, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';

interface RoleOption {
  role: 'tenant' | 'agent' | 'landlord' | 'supporter';
  icon: React.ReactNode;
  emoji: string;
  title: string;
  hook: string;
  gradient: string;
  bgColor: string;
}

const roleOptions: RoleOption[] = [
  {
    role: 'tenant',
    icon: <Home className="h-6 w-6" />,
    emoji: '🏠',
    title: 'Get Rent Help',
    hook: 'Pay rent stress-free',
    gradient: 'from-blue-500 to-blue-600',
    bgColor: 'bg-blue-500/10',
  },
  {
    role: 'supporter',
    icon: <Wallet className="h-6 w-6" />,
    emoji: '💰',
    title: 'Earn 15%/month',
    hook: 'Support & earn passively',
    gradient: 'from-emerald-500 to-emerald-600',
    bgColor: 'bg-emerald-500/10',
  },
  {
    role: 'agent',
    icon: <Users className="h-6 w-6" />,
    emoji: '👥',
    title: 'Become Agent',
    hook: 'Register users, earn cash',
    gradient: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-500/10',
  },
  {
    role: 'landlord',
    icon: <Building2 className="h-6 w-6" />,
    emoji: '🏢',
    title: 'Landlord',
    hook: 'Get rent on time, always',
    gradient: 'from-purple-500 to-purple-600',
    bgColor: 'bg-purple-500/10',
  },
];

export default function Landing() {
  const navigate = useNavigate();

  const handleRoleSelect = (role: string) => {
    hapticTap();
    // Navigate to auth with the selected role as a query param
    navigate(`/auth?role=${role}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 flex flex-col">
      {/* Header */}
      <header className="pt-safe-top px-4 py-6 text-center">
        <h1 
          className="text-4xl font-bold text-primary tracking-tight"
          style={{ fontFamily: "'Chewy', cursive" }}
        >
          Welile
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Rent made easy</p>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 pb-8 flex flex-col justify-center max-w-lg mx-auto w-full">
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold text-foreground mb-2">
            What brings you here?
          </h2>
          <p className="text-muted-foreground text-sm">
            Tap to get started
          </p>
        </div>

        {/* Role Cards */}
        <div className="grid grid-cols-2 gap-3">
          {roleOptions.map((option) => (
            <button
              key={option.role}
              onClick={() => handleRoleSelect(option.role)}
              className={cn(
                "relative overflow-hidden rounded-2xl p-4 text-left transition-all duration-200",
                "bg-card border border-border/50 shadow-sm",
                "hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
                "touch-manipulation min-h-[120px] flex flex-col justify-between"
              )}
            >
              {/* Gradient accent */}
              <div className={cn(
                "absolute top-0 left-0 right-0 h-1 bg-gradient-to-r",
                option.gradient
              )} />
              
              {/* Icon */}
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center text-2xl",
                option.bgColor
              )}>
                {option.emoji}
              </div>

              {/* Text */}
              <div className="mt-3">
                <h3 className="font-bold text-foreground text-sm leading-tight">
                  {option.title}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                  {option.hook}
                </p>
              </div>

              {/* Arrow indicator */}
              <ArrowRight className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground/50" />
            </button>
          ))}
        </div>

        {/* Supporter highlight */}
        <div className="mt-6 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20">
          <div className="flex items-center gap-3">
            <span className="text-3xl">💵</span>
            <div className="flex-1">
              <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                Earn 15% monthly!
              </p>
              <p className="text-xs text-muted-foreground">
                Support a tenant, get paid every month
              </p>
            </div>
            <button
              onClick={() => handleRoleSelect('supporter')}
              className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-full hover:bg-emerald-600 transition-colors"
            >
              Start
            </button>
          </div>
        </div>

        {/* Rent Calculator Link */}
        <Link
          to="/rent-calculator"
          className="mt-4 flex items-center justify-center gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors touch-manipulation"
          onClick={() => hapticTap()}
        >
          <Calculator className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <span className="font-medium text-blue-600 dark:text-blue-400 text-sm">
            Try the Rent Calculator
          </span>
          <ArrowRight className="h-4 w-4 text-blue-600/50 dark:text-blue-400/50" />
        </Link>
      </main>

      {/* Footer */}
      <footer className="px-4 py-4 text-center pb-safe-bottom">
        <button
          onClick={() => navigate('/auth')}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Already have an account? <span className="font-semibold text-primary">Sign in</span>
        </button>
      </footer>
    </div>
  );
}
