import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface QuickRegisterTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillPhone?: string;
  /** Called with the new tenant's phone after successful registration */
  onRegistered?: (phone: string) => void;
}

/**
 * Lightweight tenant registration used inline when an agent attempts
 * a payment for a phone number that is not yet on the platform.
 * Captures the minimum required to create the profile (name, phone, national ID).
 */
export function QuickRegisterTenantDialog({
  open,
  onOpenChange,
  prefillPhone,
  onRegistered,
}: QuickRegisterTenantDialogProps) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setPhone(prefillPhone?.trim() || '');
      setFullName('');
      setNationalId('');
      setDone(false);
    }
  }, [open, prefillPhone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim() || !nationalId.trim()) {
      toast.error('Please fill in name, phone and national ID');
      return;
    }
    if (nationalId.trim().length < 10) {
      toast.error('National ID must be 10–14 characters');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('register-tenant', {
        body: {
          full_name: fullName.trim(),
          phone: phone.trim(),
          national_id: nationalId.trim().toUpperCase(),
        },
      });

      if (error) {
        const msg = error?.context
          ? await error.context.json().then((r: any) => r.error).catch(() => error.message)
          : error.message;
        throw new Error(msg || 'Failed to register tenant');
      }
      if (data?.error) throw new Error(data.error);

      setDone(true);
      toast.success(`${fullName.trim()} registered successfully`);
      onRegistered?.(phone.trim());
    } catch (err: any) {
      toast.error(err.message || 'Failed to register tenant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Quick Register Tenant
          </DialogTitle>
          <DialogDescription>
            Add this tenant to the platform so you can process their payment.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 mx-auto bg-success/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <p className="font-semibold">{fullName} is now on the platform</p>
            <p className="text-sm text-muted-foreground">
              You can now retry the payment using {phone}.
            </p>
            <Button onClick={() => onOpenChange(false)} className="w-full h-12">
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qr-name">Full Name</Label>
              <Input
                id="qr-name"
                placeholder="e.g. Akram Kiggundu"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading}
                className="h-12"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qr-phone">Phone Number</Label>
              <PhoneInput
                id="qr-phone"
                placeholder="e.g. 0700123456"
                value={phone}
                onChange={(v) => setPhone(v)}
                onContactPicked={({ name }) => {
                  if (name && !fullName.trim()) setFullName(name);
                }}
                disabled={loading}
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qr-nid">National ID</Label>
              <Input
                id="qr-nid"
                placeholder="10–14 alphanumeric characters"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value.toUpperCase())}
                disabled={loading}
                className="h-12 font-mono uppercase"
                maxLength={14}
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 h-12"
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1 h-12" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Register Tenant'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
