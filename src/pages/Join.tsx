import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

/**
 * Universal Join Page - Handles all invite and referral links
 * 
 * Short link formats:
 * - /join?t=TOKEN     - User activation (tenant, landlord, agent, supporter)
 * - /join?r=USER_ID   - Referral signup
 * - /join?s=USER_ID   - Supporter referral (become-supporter)
 */
export default function Join() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('t');
    const referral = searchParams.get('r');
    const supporterRef = searchParams.get('s');

    if (token) {
      // Redirect to activation page
      navigate(`/activate-supporter?token=${token}`, { replace: true });
    } else if (supporterRef) {
      // Redirect to become-supporter with referral
      navigate(`/become-supporter?ref=${supporterRef}`, { replace: true });
    } else if (referral) {
      // Redirect to auth with referral
      navigate(`/auth?ref=${referral}`, { replace: true });
    } else {
      // No valid params, go to auth
      navigate('/auth', { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
