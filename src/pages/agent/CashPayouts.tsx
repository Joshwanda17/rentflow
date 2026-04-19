import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { AgentCashPayoutsTab } from '@/components/agent/AgentCashPayoutsTab';

export default function AgentCashPayoutsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-3 py-3 space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="gap-1.5 text-xs text-muted-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <div>
          <h1 className="text-lg font-bold">💸 Merchant Payouts</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">Mobile Money · Bank · Cash — claim, execute, confirm</p>
        </div>
        <AgentCashPayoutsTab />
      </div>
    </div>
  );
}
