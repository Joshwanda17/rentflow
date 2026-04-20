import { useState, useEffect } from 'react';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, User, Phone, Mail, IdCard, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface EditTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    national_id: string | null;
    tenant_status?: string | null;
    evicted_at?: string | null;
  };
  onSaved?: (updated: { full_name: string; phone: string; email: string | null; national_id: string | null }) => void;
}

const editSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100, 'Too long'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{7,15}$/, 'Enter a valid phone (e.g. +256712345678)'),
  email: z
    .string()
    .trim()
    .email('Invalid email')
    .max(255)
    .optional()
    .or(z.literal('')),
  national_id: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{10,14}$/, 'National ID must be 10-14 letters/numbers')
    .optional()
    .or(z.literal('')),
});

export function EditTenantDialog({ open, onOpenChange, tenant, onSaved }: EditTenantDialogProps) {
  const [fullName, setFullName] = useState(tenant.full_name);
  const [phone, setPhone] = useState(tenant.phone);
  const [email, setEmail] = useState(tenant.email || '');
  const [nationalId, setNationalId] = useState(tenant.national_id || '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setFullName(tenant.full_name);
      setPhone(tenant.phone);
      setEmail(tenant.email || '');
      setNationalId(tenant.national_id || '');
      setErrors({});
    }
  }, [open, tenant]);

  const handleSave = async () => {
    const parsed = editSchema.safeParse({
      full_name: fullName,
      phone,
      email: email || undefined,
      national_id: nationalId || undefined,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as string;
        if (!fieldErrors[k]) fieldErrors[k] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        full_name: parsed.data.full_name,
        phone: parsed.data.phone,
        email: parsed.data.email || null,
        national_id: parsed.data.national_id || null,
      };
      const { error } = await supabase.from('profiles').update(payload).eq('id', tenant.id);
      if (error) throw error;
      toast.success('Tenant details updated', { description: parsed.data.full_name });
      onSaved?.(payload);
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Failed to update', { description: err.message || 'Please try again' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Edit Tenant Details
          </DialogTitle>
          <DialogDescription>
            Update contact information for this tenant. Other fields (verification, balances) cannot be changed here.
          </DialogDescription>
        </DialogHeader>

        {tenant.tenant_status === 'evicted' && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            This tenant is marked <strong>Evicted</strong>{tenant.evicted_at ? ` as of ${new Date(tenant.evicted_at).toLocaleDateString()}` : ''} — record locked for audit. Identity fields cannot be changed.
          </div>
        )}

        <fieldset disabled={tenant.tenant_status === 'evicted'} className="space-y-3 pt-2 disabled:opacity-60">
          <div>
            <Label className="text-xs flex items-center gap-1.5">
              <User className="h-3 w-3" /> Full Name *
            </Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              maxLength={100}
            />
            {errors.full_name && <p className="text-xs text-destructive mt-1">{errors.full_name}</p>}
          </div>

          <div>
            <Label className="text-xs flex items-center gap-1.5">
              <Phone className="h-3 w-3" /> Phone Number *
            </Label>
            <PhoneInput
              value={phone}
              onChange={(v) => setPhone(v)}
              onContactPicked={({ name }) => {
                if (name && !fullName.trim()) setFullName(name);
              }}
              placeholder="+256712345678"
            />
            {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
          </div>

          <div>
            <Label className="text-xs flex items-center gap-1.5">
              <Mail className="h-3 w-3" /> Email <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              maxLength={255}
            />
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
          </div>

          <div>
            <Label className="text-xs flex items-center gap-1.5">
              <IdCard className="h-3 w-3" /> National ID <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value.toUpperCase())}
              placeholder="CM12345678ABCD"
              maxLength={14}
            />
            {errors.national_id && <p className="text-xs text-destructive mt-1">{errors.national_id}</p>}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
