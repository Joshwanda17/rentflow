import { useState, useEffect } from 'react';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, User, Phone, Mail, IdCard, Pencil, UserX, UserCheck, CheckCircle2, ArrowRight, X, ShieldAlert, RefreshCw, MessageSquare } from 'lucide-react';
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
  onSaved?: (updated: { full_name: string; phone: string; email: string | null; national_id: string | null; tenant_status?: string | null }) => void;
}

const normalizePhone = (v: string) => v.replace(/[\s-]/g, '');

const editSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100, 'Too long'),
  phone: z
    .string()
    .trim()
    .transform(normalizePhone)
    .pipe(
      z.string().regex(
        /^(\+256[7-9]\d{8}|0[7-9]\d{8})$/,
        'Enter a valid Uganda phone (e.g. +256712345678 or 0772123456)'
      )
    ),
  email: z
    .string()
    .trim()
    .max(255, 'Email too long')
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: 'Enter a valid email (e.g. name@domain.com)',
    })
    .optional()
    .or(z.literal('')),
  national_id: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(
      z.string().regex(
        /^[A-Z0-9]{14}$/,
        'National ID must be exactly 14 letters/numbers (e.g. CM12345678ABCD)'
      )
    )
    .optional()
    .or(z.literal('')),
});

type SavedField = { label: string; oldValue: string; newValue: string; changed: boolean };
type PermissionBlock = {
  scope: 'profile' | 'status';
  message: string;
  fields: { label: string; oldValue: string; attemptedValue: string }[];
  retry: () => void;
};

export function EditTenantDialog({ open, onOpenChange, tenant, onSaved }: EditTenantDialogProps) {
  const [fullName, setFullName] = useState(tenant.full_name);
  const [phone, setPhone] = useState(tenant.phone);
  const [email, setEmail] = useState(tenant.email || '');
  const [nationalId, setNationalId] = useState(tenant.national_id || '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statusBusy, setStatusBusy] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string | null | undefined>(tenant.tenant_status);
  const [savedSummary, setSavedSummary] = useState<SavedField[] | null>(null);
  const [statusSummary, setStatusSummary] = useState<{ oldStatus: string; newStatus: string } | null>(null);
  const [permissionBlock, setPermissionBlock] = useState<PermissionBlock | null>(null);

  useEffect(() => {
    if (open) {
      setFullName(tenant.full_name);
      setPhone(tenant.phone);
      setEmail(tenant.email || '');
      setNationalId(tenant.national_id || '');
      setErrors({});
      setCurrentStatus(tenant.tenant_status);
      setSavedSummary(null);
      setStatusSummary(null);
      setPermissionBlock(null);
    }
  }, [open, tenant]);

  const isPermissionError = (err: any, rowsReturned: number | null) => {
    if (rowsReturned === 0) return true;
    const code = err?.code || '';
    const msg = (err?.message || '').toLowerCase();
    return (
      code === '42501' ||
      code === 'PGRST301' ||
      msg.includes('row-level security') ||
      msg.includes('permission') ||
      msg.includes("don't have permission")
    );
  };

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
      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', tenant.id)
        .select('id, full_name, phone, email, national_id');
      const rowsReturned = data?.length ?? 0;
      if (error || rowsReturned === 0) {
        if (isPermissionError(error, rowsReturned)) {
          const attempted = {
            'Full Name': parsed.data.full_name,
            'Phone Number': parsed.data.phone,
            'Email': parsed.data.email || '—',
            'National ID': parsed.data.national_id || '—',
          };
          const original = {
            'Full Name': tenant.full_name,
            'Phone Number': tenant.phone,
            'Email': tenant.email || '—',
            'National ID': tenant.national_id || '—',
          };
          const blockedFields = (Object.keys(attempted) as (keyof typeof attempted)[])
            .filter((k) => attempted[k] !== original[k])
            .map((k) => ({ label: k, oldValue: original[k], attemptedValue: attempted[k] }));
          setPermissionBlock({
            scope: 'profile',
            message:
              error?.message ||
              "Your role doesn't allow editing this tenant's identity fields. A manager must approve or apply these changes.",
            fields: blockedFields.length
              ? blockedFields
              : [{ label: 'Tenant profile', oldValue: '—', attemptedValue: '—' }],
            retry: () => {
              setPermissionBlock(null);
              void handleSave();
            },
          });
          toast.error('Permission blocked', { description: 'Escalate to a manager to save these changes.' });
          return;
        }
        throw error || new Error('Update did not return any rows.');
      }

      const oldVals = {
        'Full Name': tenant.full_name,
        'Phone Number': tenant.phone,
        'Email': tenant.email || '—',
        'National ID': tenant.national_id || '—',
      };
      const newVals = {
        'Full Name': parsed.data.full_name,
        'Phone Number': parsed.data.phone,
        'Email': parsed.data.email || '—',
        'National ID': parsed.data.national_id || '—',
      };
      const summary: SavedField[] = [
        { label: 'Full Name', oldValue: oldVals['Full Name'], newValue: newVals['Full Name'], changed: oldVals['Full Name'] !== newVals['Full Name'] },
        { label: 'Phone Number', oldValue: oldVals['Phone Number'], newValue: newVals['Phone Number'], changed: oldVals['Phone Number'] !== newVals['Phone Number'] },
        { label: 'Email', oldValue: oldVals['Email'], newValue: newVals['Email'], changed: oldVals['Email'] !== newVals['Email'] },
        { label: 'National ID', oldValue: oldVals['National ID'], newValue: newVals['National ID'], changed: oldVals['National ID'] !== newVals['National ID'] },
      ];
      setSavedSummary(summary);
      toast.success('Tenant details saved', { description: parsed.data.full_name });
      onSaved?.(payload);
    } catch (err: any) {
      toast.error('Failed to update', { description: err.message || 'Please try again' });
    } finally {
      setSaving(false);
    }
  };

  const isInactive = currentStatus === 'inactive';
  const isEvicted = currentStatus === 'evicted';

  const handleToggleActive = async () => {
    if (isEvicted) return;
    const nextStatus = isInactive ? 'active' : 'inactive';
    if (nextStatus === 'inactive') {
      const reason = window.prompt(
        'Why is this tenant no longer active? (e.g. moved out, defaulted, wrong number)\nThis will be visible to Tenant Ops.',
        '',
      );
      if (reason === null) return; // user cancelled
      if (reason.trim().length < 4) {
        toast.error('Please give a short reason (4+ characters).');
        return;
      }
    } else {
      const ok = window.confirm('Reactivate this tenant? They will be counted as active again.');
      if (!ok) return;
    }
    setStatusBusy(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ tenant_status: nextStatus })
        .eq('id', tenant.id)
        .select('id');
      const rowsReturned = data?.length ?? 0;
      if (error || rowsReturned === 0) {
        if (isPermissionError(error, rowsReturned)) {
          const prev = currentStatus || 'active';
          setPermissionBlock({
            scope: 'status',
            message:
              error?.message ||
              "Your role doesn't allow changing tenant status. Ask a manager to approve this change.",
            fields: [{ label: 'Tenant Status', oldValue: prev, attemptedValue: nextStatus }],
            retry: () => {
              setPermissionBlock(null);
              void handleToggleActive();
            },
          });
          toast.error('Permission blocked', { description: 'Escalate to a manager to change status.' });
          return;
        }
        throw error || new Error('Status update did not return any rows.');
      }
      const prev = currentStatus || 'active';
      setCurrentStatus(nextStatus);
      setStatusSummary({ oldStatus: prev, newStatus: nextStatus });
      onSaved?.({
        full_name: fullName,
        phone,
        email: email || null,
        national_id: nationalId || null,
        tenant_status: nextStatus,
      });
      toast.success(nextStatus === 'inactive' ? 'Tenant marked as not active' : 'Tenant reactivated');
    } catch (err: any) {
      toast.error('Could not update status', { description: err?.message || 'Please try again' });
    } finally {
      setStatusBusy(false);
    }
  };

  const handleCloseConfirmation = () => {
    setSavedSummary(null);
    setStatusSummary(null);
    setPermissionBlock(null);
    onOpenChange(false);
  };

  const showingConfirmation = savedSummary !== null || statusSummary !== null;
  const showingPermissionBlock = permissionBlock !== null;

  const notifyManager = () => {
    if (!permissionBlock) return;
    const lines = [
      `Manager approval needed for tenant ${tenant.full_name} (${tenant.phone}).`,
      permissionBlock.scope === 'profile'
        ? 'Requested profile edits:'
        : 'Requested status change:',
      ...permissionBlock.fields.map(
        (f) => `• ${f.label}: "${f.oldValue}" → "${f.attemptedValue}"`,
      ),
      '',
      'Reason from system: ' + permissionBlock.message,
    ];
    const text = lines.join('\n');
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, '_blank');
    toast.success('Manager notification drafted', { description: 'Send it via WhatsApp to your manager.' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {showingPermissionBlock && permissionBlock ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-5 w-5" />
                Manager Approval Required
              </DialogTitle>
              <DialogDescription>
                Your role isn't allowed to save these changes directly. Escalate to a manager or retry.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-2">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-destructive uppercase tracking-wide">
                  {permissionBlock.scope === 'profile' ? 'Blocked Field Changes' : 'Blocked Status Change'}
                </p>
                {permissionBlock.fields.map((field) => (
                  <div key={field.label} className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground">{field.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm flex-1 line-through text-muted-foreground">
                        {field.oldValue}
                      </span>
                      <ArrowRight className="h-3 w-3 text-destructive shrink-0" />
                      <span className="text-sm font-semibold text-destructive flex-1 capitalize">
                        {field.attemptedValue}
                      </span>
                      <span className="text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                        BLOCKED
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Reason:</span> {permissionBlock.message}
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <Button onClick={notifyManager} className="w-full">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Notify manager via WhatsApp
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setPermissionBlock(null)}
                    disabled={saving || statusBusy}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={permissionBlock.retry}
                    disabled={saving || statusBusy}
                  >
                    {(saving || statusBusy) ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Retry save
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : showingConfirmation ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
                Changes Saved
              </DialogTitle>
              <DialogDescription>
                Here is exactly what was updated for this tenant.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-2">
              {savedSummary && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                    Updated Fields
                  </p>
                  {savedSummary.map((field) => (
                    <div key={field.label} className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-muted-foreground">{field.label}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm flex-1 ${field.changed ? 'line-through text-muted-foreground' : ''}`}>
                          {field.oldValue}
                        </span>
                        {field.changed && (
                          <>
                            <ArrowRight className="h-3 w-3 text-emerald-500 shrink-0" />
                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex-1">
                              {field.newValue}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded">
                              CHANGED
                            </span>
                          </>
                        )}
                        {!field.changed && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            UNCHANGED
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {statusSummary && (
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                    Status Change
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground capitalize">{statusSummary.oldStatus}</span>
                    <ArrowRight className="h-3 w-3 text-blue-500 shrink-0" />
                    <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 capitalize">
                      {statusSummary.newStatus}
                    </span>
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded">
                      CHANGED
                    </span>
                  </div>
                </div>
              )}

              <Button className="w-full mt-2" onClick={handleCloseConfirmation}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-primary" />
                Edit Tenant Details
              </DialogTitle>
              <DialogDescription>
                Update contact information for this tenant. Other fields (verification, balances) cannot be changed here.
              </DialogDescription>
            </DialogHeader>

            {isEvicted && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                This tenant is marked <strong>Evicted</strong>{tenant.evicted_at ? ` as of ${new Date(tenant.evicted_at).toLocaleDateString()}` : ''} — record locked for audit. Identity fields cannot be changed.
              </div>
            )}

            {isInactive && !isEvicted && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                This tenant is currently marked <strong>Not active</strong>. Tenant Ops will see this status.
              </div>
            )}

            <fieldset disabled={isEvicted} className="space-y-3 pt-2 disabled:opacity-60">
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
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Changes
                </Button>
              </div>

              {!isEvicted && (
                <div className="border-t pt-3 mt-1">
                  <Button
                    type="button"
                    variant={isInactive ? 'default' : 'outline'}
                    className={`w-full ${isInactive ? '' : 'text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive'}`}
                    onClick={handleToggleActive}
                    disabled={statusBusy}
                  >
                    {statusBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : isInactive ? (
                      <UserCheck className="h-4 w-4 mr-2" />
                    ) : (
                      <UserX className="h-4 w-4 mr-2" />
                    )}
                    {isInactive ? 'Reactivate tenant' : 'Mark as not active'}
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
                    {isInactive
                      ? 'Tenant currently hidden from active counts. Tenant Ops still sees them flagged as Inactive.'
                      : 'Use this if the tenant moved out, stopped paying, or the number is wrong.'}
                  </p>
                </div>
              )}
            </fieldset>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
