import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowRight, Lock, User, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { hapticTap } from '@/lib/haptics';

const MANAGER_ACCESS_CODE = 'Manager@welile';

interface ManagerProfile {
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
}

export default function ManagerLogin() {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [verified, setVerified] = useState(false);
  const [managers, setManagers] = useState<ManagerProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [signingIn, setSigningIn] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { switchRole, roles, user } = useAuth();

  // Fetch manager profiles after code verification
  useEffect(() => {
    if (!verified) return;

    const fetchManagers = async () => {
      setLoadingProfiles(true);
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'manager')
        .or('enabled.is.null,enabled.eq.true');

      if (error || !data) {
        setLoadingProfiles(false);
        return;
      }

      const userIds = data.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, avatar_url')
        .in('id', userIds)
        .order('full_name');

      if (profiles) {
        setManagers(profiles.map(p => ({
          user_id: p.id,
          full_name: p.full_name || 'Unknown',
          email: p.email || '',
          phone: p.phone || '',
          avatar_url: p.avatar_url
        })));
      }
      setLoadingProfiles(false);
    };

    fetchManagers();
  }, [verified]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    hapticTap();

    if (code === MANAGER_ACCESS_CODE) {
      sessionStorage.setItem('manager_access_verified', 'true');
      setVerified(true);
      toast({ title: '✅ Access Granted', description: 'Select your profile to continue' });
    } else {
      setError(true);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      toast({ title: 'Invalid Code', description: 'Please check your access code and try again.', variant: 'destructive' });
    }
  };

  const handleSelectProfile = async (manager: ManagerProfile) => {
    hapticTap();
    setSigningIn(manager.user_id);

    // If the current user is already the selected manager, just switch role
    if (user && user.id === manager.user_id) {
      if (roles.includes('manager')) {
        switchRole('manager');
      }
      toast({ title: `Welcome, ${manager.full_name}`, description: 'Entering Manager Dashboard' });
      navigate('/dashboard');
      return;
    }

    // Otherwise, store selected manager info and navigate to dashboard
    // The manager will need to be logged into their own account
    sessionStorage.setItem('manager_selected_id', manager.user_id);
    sessionStorage.setItem('manager_selected_name', manager.full_name);
    
    // If user is already logged in but as a different account, let them know
    if (user) {
      toast({ 
        title: `Signed in as ${manager.full_name}`,
        description: 'Switching to Manager Dashboard'
      });
      // Switch role if available
      if (roles.includes('manager')) {
        switchRole('manager');
      }
      navigate('/dashboard');
    } else {
      // Not logged in - redirect to auth with a note
      toast({ 
        title: 'Please sign in',
        description: `Sign in as ${manager.email} to access the Manager Dashboard`
      });
      navigate('/auth');
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {verified ? 'Select Your Profile' : 'Manager Access'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {verified ? 'Tap your name to continue' : 'Enter your access code to continue'}
            </p>
          </div>
        </div>

        {!verified ? (
          /* Code Input */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className={`transition-transform ${isShaking ? 'animate-shake' : ''}`}>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Enter access code"
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setError(false); }}
                  className={`pl-10 h-14 text-base rounded-xl ${error ? 'border-destructive ring-destructive/20 ring-2' : ''}`}
                  autoFocus
                  autoComplete="off"
                />
              </div>
              {error && (
                <p className="text-xs text-destructive mt-1.5 pl-1">Incorrect code. Try again.</p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-14 text-base font-semibold rounded-xl gap-2"
              disabled={!code.trim()}
            >
              Access Dashboard
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          /* Manager Profile List */
          <div className="space-y-2">
            {loadingProfiles ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : managers.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                No manager profiles found.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                {managers.map((manager) => (
                  <button
                    key={manager.user_id}
                    onClick={() => handleSelectProfile(manager)}
                    disabled={signingIn !== null}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border/50 bg-card hover:bg-accent/50 active:scale-[0.98] transition-all text-left group disabled:opacity-60"
                  >
                    {/* Avatar */}
                    {manager.avatar_url ? (
                      <img 
                        src={manager.avatar_url} 
                        alt={manager.full_name}
                        className="w-11 h-11 rounded-full object-cover flex-shrink-0 ring-2 ring-primary/10"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 ring-2 ring-primary/10">
                        <span className="text-sm font-bold text-primary">{getInitials(manager.full_name)}</span>
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {manager.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {manager.phone || manager.email}
                      </p>
                    </div>

                    {/* Arrow / Loading */}
                    {signingIn === manager.user_id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground/60">
          This page is restricted to authorized managers only.
        </p>
      </div>
    </div>
  );
}
