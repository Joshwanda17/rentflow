import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { FinancialOpsCommandCenter } from '@/components/financial-ops/FinancialOpsCommandCenter';

export default function FinancialOpsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-2 sm:py-6 space-y-2 sm:space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin/dashboard')}
          className="gap-1.5 text-xs sm:text-sm text-muted-foreground hover:text-foreground h-8 sm:h-9"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <FinancialOpsCommandCenter />
      </div>
    </div>
  );
}
