import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RentOpportunities } from '@/components/supporter/RentOpportunities';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useConfetti } from '@/components/Confetti';
import { useSupporterAgreement } from '@/hooks/useSupporterAgreement';
import { SupporterAgreementModal } from '@/components/supporter/agreement';

export default function Opportunities() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { fireSuccess } = useConfetti();
  const { hasAccepted: hasAcceptedAgreement, acceptAgreement } = useSupporterAgreement();
  const [showAgreementModal, setShowAgreementModal] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const handleFundRequest = async (requestId: string, rentAmount: number) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('rent_requests')
        .update({
          status: 'funded',
          supporter_id: user.id,
          funded_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;

      fireSuccess();
      toast({
        title: '🎉 Investment Successful!',
        description: `You funded UGX ${rentAmount.toLocaleString()} rent request.`
      });
    } catch (error: any) {
      toast({
        title: 'Funding Failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleLockedClick = () => {
    setShowAgreementModal(true);
  };

  const handleAcceptAgreement = async () => {
    const success = await acceptAgreement();
    if (success) {
      setShowAgreementModal(false);
      toast({ title: '✅ Agreement Accepted', description: 'You can now fund rent requests.' });
    }
    return success;
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-border/50 px-4 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/dashboard')}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">Investment Opportunities</h1>
      </div>

      {/* Full-screen opportunities list */}
      <div className="flex-1 overflow-auto">
        <RentOpportunities
          onFund={handleFundRequest}
          isLocked={!hasAcceptedAgreement}
          onLockedClick={handleLockedClick}
        />
      </div>

      {/* Agreement Modal */}
      <SupporterAgreementModal
        open={showAgreementModal}
        onOpenChange={setShowAgreementModal}
        onAccept={handleAcceptAgreement}
      />
    </div>
  );
}
