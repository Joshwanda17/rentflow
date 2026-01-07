import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, Eye, EyeOff, ArrowRight } from 'lucide-react';
import WelileLogo from '@/components/WelileLogo';

export default function ActivateSupporter() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isActivated, setIsActivated] = useState(false);
  const [activatedEmail, setActivatedEmail] = useState('');
  const [inviteDetails, setInviteDetails] = useState<{ full_name: string } | null>(null);

  useEffect(() => {
    if (!token) {
      toast({
        title: 'Invalid Link',
        description: 'This activation link is invalid or expired.',
        variant: 'destructive',
      });
      navigate('/');
      return;
    }

    // Fetch invite details
    const fetchInvite = async () => {
      const { data } = await supabase
        .from('supporter_invites')
        .select('full_name, status')
        .eq('activation_token', token)
        .single();

      if (data) {
        if (data.status === 'activated') {
          toast({
            title: 'Already Activated',
            description: 'This account has already been activated. Please log in.',
          });
          navigate('/auth');
        } else {
          setInviteDetails({ full_name: data.full_name });
        }
      } else {
        toast({
          title: 'Invalid Link',
          description: 'This activation link is invalid or expired.',
          variant: 'destructive',
        });
        navigate('/');
      }
    };

    fetchInvite();
  }, [token, navigate, toast]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !password) return;

    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke('activate-supporter', {
        body: { token, password },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Activation failed');
      }

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      setIsActivated(true);
      setActivatedEmail(response.data.email);

      toast({
        title: '🎉 Account Activated!',
        description: 'Your supporter account is now active.',
      });
    } catch (error: any) {
      toast({
        title: 'Activation Failed',
        description: error.message || 'Please check your password and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: activatedEmail,
        password,
      });

      if (error) throw error;

      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: 'Login Failed',
        description: error.message || 'Please try logging in manually.',
        variant: 'destructive',
      });
      navigate('/auth');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token || !inviteDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <WelileLogo linkToHome={false} />
          </div>
          <CardTitle className="text-2xl">
            {isActivated ? 'Account Activated!' : 'Activate Your Account'}
          </CardTitle>
          <CardDescription>
            {isActivated 
              ? 'Welcome to Welile! You can now start investing.'
              : `Welcome ${inviteDetails.full_name}! Enter your password to activate.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isActivated ? (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Your supporter account is ready. Start earning 15% monthly returns!
                </p>
              </div>
              <Button onClick={handleLogin} className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                Go to Dashboard
              </Button>
            </div>
          ) : (
            <form onSubmit={handleActivate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter the password you received"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use the password shared with you by the manager
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Activating...
                  </>
                ) : (
                  'Activate Account'
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
