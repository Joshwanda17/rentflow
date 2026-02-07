import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowRight, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { hapticTap } from '@/lib/haptics';

const MANAGER_ACCESS_CODE = 'Manager@welile';

export default function ManagerLogin() {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { switchRole, roles } = useAuth();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    hapticTap();

    if (code === MANAGER_ACCESS_CODE) {
      sessionStorage.setItem('manager_access_verified', 'true');
      // Switch to manager role if user has it
      if (roles.includes('manager')) {
        switchRole('manager');
      }
      toast({ title: '✅ Access Granted', description: 'Welcome to the Manager Suite' });
      navigate('/dashboard');
    } else {
      setError(true);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      toast({ title: 'Invalid Code', description: 'Please check your access code and try again.', variant: 'destructive' });
    }
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
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Manager Access</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your access code to continue</p>
          </div>
        </div>

        {/* Code Input */}
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

        <p className="text-xs text-center text-muted-foreground/60">
          This page is restricted to authorized managers only.
        </p>
      </div>
    </div>
  );
}
