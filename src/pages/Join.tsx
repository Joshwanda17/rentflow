import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, UserPlus, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import WelileLogo from '@/components/WelileLogo';
import { CurrencySwitcher } from '@/components/CurrencySwitcher';
import SignupPauseBanner, { SIGNUP_PAUSED, SIGNUP_RESUME_DATE } from '@/components/SignupPauseBanner';

/**
 * Universal Join Page - Handles all invite and referral links
 * 
 * Short link formats:
 * - /join?t=TOKEN     - User activation (tenant, landlord, agent, supporter)
 * - /join?r=USER_ID   - Referral signup
 * - /join?s=USER_ID   - Supporter referral (become-supporter)
 * 
 * Uses sessionStorage as backup for URL params to handle mobile browser issues
 */
export default function Join() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isRedirecting, setIsRedirecting] = useState(true);

  // Get params from URL first, then fallback to sessionStorage for reliability on mobile
  const token = searchParams.get('t') || sessionStorage.getItem('signup_token');
  const referral = searchParams.get('r') || sessionStorage.getItem('signup_ref');
  const supporterRef = searchParams.get('s') || sessionStorage.getItem('signup_supporter_ref');

  useEffect(() => {
    // Store params in sessionStorage for recovery if page reloads (common on mobile)
    const t = searchParams.get('t');
    const r = searchParams.get('r');
    const s = searchParams.get('s');
    if (t) sessionStorage.setItem('signup_token', t);
    if (r) sessionStorage.setItem('signup_ref', r);
    if (s) sessionStorage.setItem('signup_supporter_ref', s);
    
    // Instant redirect - no delay for faster UX
    if (token) {
      sessionStorage.removeItem('signup_token'); // Clean up after use
      navigate(`/activate-supporter?token=${token}`, { replace: true });
    } else if (supporterRef) {
      sessionStorage.removeItem('signup_supporter_ref');
      navigate(`/become-supporter?ref=${supporterRef}`, { replace: true });
    } else if (referral) {
      sessionStorage.removeItem('signup_ref');
      navigate(`/auth?ref=${referral}`, { replace: true });
    } else {
      // No valid params, show welcome page immediately
      setIsRedirecting(false);
    }
  }, [searchParams, navigate, token, referral, supporterRef]);

  // Show loading while redirecting
  if (isRedirecting && (token || referral || supporterRef)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <WelileLogo linkToHome={false} />
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Preparing your invitation...</p>
      </div>
    );
  }

  // Show welcome page when no params
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex flex-col items-center justify-center p-4">
      <SignupPauseBanner />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <WelileLogo linkToHome={false} />
          </div>
          <div className="mx-auto p-3 rounded-full bg-primary/10 w-fit mb-4">
            <UserPlus className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Welcome to Welile!</CardTitle>
          <CardDescription>
            Join our platform to access rent support, invest as a supporter, or manage properties.
          </CardDescription>
          
          {/* Currency Selector */}
          <div className="flex items-center justify-center mt-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border/50">
              <span className="text-xs text-muted-foreground">Currency:</span>
              <CurrencySwitcher variant="compact" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link to="/auth" className="block">
            <Button className="w-full gap-2">
              <ArrowRight className="h-4 w-4" />
              Sign Up / Sign In
            </Button>
          </Link>
          <Link to="/become-supporter" className="block">
            <Button variant="outline" className="w-full gap-2">
              Become a Supporter
            </Button>
          </Link>
          <p className="text-xs text-center text-muted-foreground">
            If you received an invitation link, please use that link to activate your account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
