import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { X } from 'lucide-react';
import workInProgressIllustration from '@/assets/work-in-progress.svg.asset.json';

interface PersonalLayoutProps {
  children: ReactNode;
  title?: string;
}



const PersonalLayout = ({ children, title }: PersonalLayoutProps) => {
  const { user } = useAuth();
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