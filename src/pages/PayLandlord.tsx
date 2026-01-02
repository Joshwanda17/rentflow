import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PayLandlordDialog } from '@/components/wallet/PayLandlordDialog';

export default function PayLandlord() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(true);

  const handleClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      navigate(-1);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 glass-card border-b border-border/50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-lg font-semibold">Pay Landlord</h1>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <PayLandlordDialog open={dialogOpen} onOpenChange={handleClose} />
    </div>
  );
}