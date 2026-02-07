import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowRight, Lock, ChevronRight, Download, Share, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { hapticTap } from '@/lib/haptics';
import { useManagerPWAInstall } from '@/hooks/useManagerPWAInstall';
import ManagerPinScreen from '@/components/manager/ManagerPinScreen';

const MANAGER_ACCESS_CODE = 'Manager@welile';
const CACHE_KEY = 'welile_mgr_profiles';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface ManagerProfile {
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
}

// Try to get cached profiles from sessionStorage
function getCachedProfiles(): ManagerProfile[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedProfiles(profiles: ManagerProfile[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: profiles, ts: Date.now() }));
  } catch {}
}

// iOS install instructions overlay
function IOSInstallGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center animate-in fade-in">
      <div className="bg-card rounded-t-3xl w-full max-w-sm p-6 space-y-5 animate-in slide-in-from-bottom">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">Install Manager App</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Share className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">1. Tap the Share button</p>
              <p className="text-xs text-muted-foreground">At the bottom of Safari's toolbar</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Plus className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">2. Tap "Add to Home Screen"</p>
              <p className="text-xs text-muted-foreground">Scroll down in the share menu</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Download className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">3. Tap "Add"</p>
              <p className="text-xs text-muted-foreground">The Manager app will appear on your home screen</p>
            </div>
          </div>
        </div>
        <Button onClick={onClose} className="w-full h-12 rounded-xl">Got it</Button>
      </div>
    </div>
  );
}

export default function ManagerLogin() {
  const cached = getCachedProfiles();
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [verified, setVerified] = useState(false);
  const [managers, setManagers] = useState<ManagerProfile[]>(cached || []);
  const [loadingProfiles, setLoadingProfiles] = useState(!cached);
  const [selectedManager, setSelectedManager] = useState<ManagerProfile | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { switchRole, roles, user } = useAuth();
  const { canInstall, isInstalled, showIOSGuide, setShowIOSGuide, installApp } = useManagerPWAInstall();

  // Fetch profiles — use cache first, then refresh in background
  useEffect(() => {
    const fetchManagers = async () => {
      try {
        const { data } = await supabase.rpc('get_manager_profiles');
        if (data && data.length > 0) {
          const profiles = data.map((p: any) => ({
            user_id: p.user_id,
            full_name: p.full_name || 'Unknown',
            email: p.email || '',
            phone: p.phone || '',
            avatar_url: p.avatar_url
          }));
          setManagers(profiles);
          setCachedProfiles(profiles);
        }
      } catch {} finally {
        setLoadingProfiles(false);
      }
    };

    fetchManagers();
  }, []);

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

  const handleSelectProfile = (manager: ManagerProfile) => {
    hapticTap();
    setSelectedManager(manager);
  };

  const handlePinSuccess = useCallback(() => {
    if (!selectedManager) return;
    
    // Set session data instantly
    sessionStorage.setItem('manager_access_verified', 'true');
    sessionStorage.setItem('manager_selected_id', selectedManager.user_id);
    sessionStorage.setItem('manager_selected_name', selectedManager.full_name);

    // Switch role in background — don't block navigation
    if (roles.includes('manager')) {
      switchRole('manager');
    }

    // Navigate immediately
    navigate('/dashboard');
  }, [selectedManager, roles, switchRole, navigate]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleInstall = async () => {
    hapticTap();
    const success = await installApp();
    if (success) {
      toast({ title: '🎉 Manager App Installed!', description: 'Find "Welile Manager" on your home screen' });
    }
  };

  // Show PIN screen when a manager is selected
  if (selectedManager) {
    return (
      <ManagerPinScreen
        manager={selectedManager}
        onSuccess={handlePinSuccess}
        onBack={() => setSelectedManager(null)}
      />
    );
  }

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
                  type="text"
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
              <div className="space-y-1.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border/50 bg-card animate-pulse">
                    <div className="w-11 h-11 rounded-full bg-muted flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-3/4" />
                      <div className="h-3 bg-muted rounded w-1/2" />
                    </div>
                    <div className="w-4 h-4 bg-muted rounded flex-shrink-0" />
                  </div>
                ))}
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
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border/50 bg-card hover:bg-accent/50 active:scale-[0.98] transition-all text-left group"
                  >
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
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {manager.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {manager.phone || manager.email}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Install as separate app */}
        {canInstall && (
          <Button 
            variant="outline" 
            onClick={handleInstall}
            className="w-full h-12 rounded-xl gap-2 border-dashed border-primary/30 text-primary hover:bg-primary/5"
          >
            <Download className="h-4 w-4" />
            Install Manager App
          </Button>
        )}

        {isInstalled && (
          <div className="text-center">
            <p className="text-xs text-primary font-medium flex items-center justify-center gap-1">
              ✅ Manager App installed on this device
            </p>
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground/60">
          This page is restricted to authorized managers only.
        </p>
      </div>

      {/* iOS Install Guide Overlay */}
      {showIOSGuide && <IOSInstallGuide onClose={() => setShowIOSGuide(false)} />}
    </div>
  );
}
