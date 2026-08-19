import { ReactNode, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { X, ArrowLeft } from 'lucide-react';
import workInProgressIllustration from '@/assets/work-in-progress.svg.asset.json';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


const getInitials = (name: string) => {
  if (!name) return 'Me';
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

interface PersonalLayoutProps {
  children: ReactNode;
  title?: string;
}



const PersonalLayout = ({ children, title }: PersonalLayoutProps) => {
  const { user, roles, switchRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [displayName, setDisplayName] = useState('');

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) {
        if (data?.full_name) setDisplayName(data.full_name);
        setAvatarUrl(data?.avatar_url || null);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user]);

  const goToFunderDashboard = () => {
    if (roles?.includes('supporter')) switchRole('supporter');
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 relative">
          {location.pathname !== '/me' && (
            <button
              type="button"
              onClick={() => navigate('/me')}
              className="absolute top-2 left-2 p-2 mt-2 mb-2 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Back to My space"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={goToFunderDashboard}
            className="absolute top-2 right-2 p-2 mt-2 mb-2 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to funder dashboard"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3 min-w-0 pt-4 mx-12">
            <Avatar className="h-11 w-11 border-2 border-primary/10 shrink-0">

              <AvatarImage src={avatarUrl || ''} alt={displayName || 'Your profile'} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-bold truncate leading-tight">{displayName || 'Your Name'}</p>
              <span className="text-xs text-muted-foreground">My space</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {title && (
          <div className="flex items-center gap-3">
            <img
              src={workInProgressIllustration.url}
              alt="Work in progress illustration"
              loading="lazy"
              className="h-10 w-10 flex-none sm:h-12 sm:w-12"
            />
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          </div>
        )}
        {children}
      </main>
    </div>
  );
};

export default PersonalLayout;