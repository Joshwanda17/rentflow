import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Building2, Share2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import LandlordRegistrationForm from '@/components/shared/LandlordRegistrationForm';
import {
  generateLandlordRegistrationFormPdf,
  shareLandlordRegistrationFormPdf,
} from '@/lib/landlordRegistrationFormPdf';

interface RegisterLandlordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (landlord?: {
    id: string;
    name: string;
    phone: string;
    property_address: string | null;
    house_category?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }) => void;
  minimal?: boolean;
}

export default function RegisterLandlordDialog({ open, onOpenChange, onSuccess, minimal }: RegisterLandlordDialogProps) {
  const [sharing, setSharing] = useState(false);

  const handleSharePrintableForm = async () => {
    setSharing(true);
    try {
      const blob = await generateLandlordRegistrationFormPdf();
      await shareLandlordRegistrationFormPdf(blob);
    } catch {
      toast.error('Could not create the form', {
        description: 'Please try again in a moment.',
      });
    } finally {
      setSharing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Register Landlord
          </DialogTitle>
          <DialogDescription>
            Register a property owner for your portfolio
          </DialogDescription>
        </DialogHeader>
        <Button
          type="button"
          variant="outline"
          onClick={handleSharePrintableForm}
          disabled={sharing}
          className="w-full h-11 gap-2 border-primary/30 text-primary hover:bg-primary/5 touch-manipulation select-none"
        >
          {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
          {sharing ? 'Preparing form…' : 'Share printable form (WhatsApp)'}
        </Button>
        <p className="text-[11px] text-muted-foreground -mt-2">
          Print, have the landlord fill it in, then register them here.
        </p>
        <LandlordRegistrationForm
          registeredByRole="agent"
          onSuccess={onSuccess}
          onClose={() => onOpenChange(false)}
          toastFn={(opts) => {
            if (opts.variant === 'destructive') {
              toast.error(opts.title, { description: opts.description });
            } else {
              toast.success(opts.title, { description: opts.description });
            }
          }}
          minimal={minimal}
        />
      </DialogContent>
    </Dialog>
  );
}
