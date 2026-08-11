import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface PersonalLayoutProps {
  children: ReactNode;
  title?: string;
}

const LINKS = [
  { label: 'My payslips', to: '/me/payslips' },
  { label: 'My work', to: '/me/work' },
  { label: 'My profile', to: '/your-profile' },
  { label: 'Settings', to: '/settings' },
  { label: 'Notifications', to: '/notifications' },
];

const PersonalLayout = ({ children, title }: PersonalLayoutProps) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled && data?.full_name) setDisplayName(data.full_name);
    };
    load();
    return () => { cancelled = true; };
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 relative">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="absolute -top-2 right-2 p-2 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 min-w-0 pt-4">
            <p className="font-bold truncate">{displayName || 'Your Name'}</p>
            <span className="text-xs text-muted-foreground flex-none">My space</span>
          </div>
          <nav className="mt-3 -mx-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {LINKS.map((link) => {
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={cn(
                    'flex-none rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {title && <h1 className="text-xl font-bold tracking-tight">{title}</h1>}
        {children}
      </main>
    </div>
  );
};

export default PersonalLayout;