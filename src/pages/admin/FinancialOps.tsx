import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { FinancialOpsCommandCenter } from '@/components/financial-ops/FinancialOpsCommandCenter';

export default function FinancialOpsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/admin/dashboard')}
          className="gap-2 text-sm text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Button>
        <FinancialOpsCommandCenter />
      </div>
    </div>
  );
}
