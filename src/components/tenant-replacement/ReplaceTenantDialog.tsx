import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserX, AlertTriangle, Search, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ReplaceTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  oldRentRequestId: string;
  oldTenantName: string;
  outstandingBalance: number;
  propertyLabel?: string;
  onReplaced?: (newRentRequestId: string) => void;
}

interface FoundTenant {
  id: string;
  full_name: string;
  phone: string;
  national_id: string | null;
  tenant_status: string | null;
}

export function ReplaceTenantDialog({
  open,
  onOpenChange,
  oldRentRequestId,
  oldTenantName,
  outstandingBalance,
  propertyLabel,
  onReplaced,
}: ReplaceTenantDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [reason, setReason] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<FoundTenant[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FoundTenant | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setReason('');
      setEffectiveDate(new Date().toISOString().slice(0, 10));
      setSearch('');
      setResults([]);
      setSelected(null);
    }
  }, [open]);

  const reasonValid = reason.trim().length >= 10;

  const formattedOutstanding = useMemo(
    () => new Intl.NumberFormat('en-UG').format(Math.max(0, Math.round(outstandingBalance || 0))),
    [outstandingBalance],
  );

  const runSearch = async () => {
    const q = search.trim();
    if (q.length < 3) {
      toast.error('Enter at least 3 characters');
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone, national_id, tenant_status')
        .or(`phone.ilike.%${q}%,national_id.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(10);
      if (error) throw error;
      setResults((data || []) as FoundTenant[]);
    } catch (err: any) {
      toast.error('Search failed', { description: err.message });
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    if (!selected) return;
    if (!reasonValid) {
      toast.error('Reason must be at least 10 characters');
      setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('replace-tenant', {
        body: {
          old_rent_request_id: oldRentRequestId,
          new_tenant_id: selected.id,
          reason: reason.trim(),
          effective_at: new Date(effectiveDate).toISOString(),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Tenant replaced', { description: `${selected.full_name} is now the active tenant` });
      onReplaced?.((data as any).new_rent_request_id);
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Replacement failed', { description: err.message || 'Try again' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-destructive" />
            End Tenancy & Replace Tenant
          </DialogTitle>
          <DialogDescription>
            {propertyLabel ? `Property: ${propertyLabel}. ` : ''}
            The current tenant's record and debts are preserved. The new tenant starts with a zero balance.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 text-xs">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`flex-1 h-1.5 rounded-full ${step >= (s as 1 | 2 | 3) ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm flex gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">{oldTenantName} will be marked Evicted.</div>
                <div className="text-muted-foreground">Outstanding: <span className="font-mono">UGX {formattedOutstanding}</span> — remains the old tenant's debt.</div>
              </div>
            </div>

            <div>
              <Label className="text-xs">Eviction date</Label>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>

            <div>
              <Label className="text-xs">Reason (min 10 characters) *</Label>
              <Textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Non-payment of rent for 3 consecutive months despite reminders"
              />
              <div className="text-xs text-muted-foreground mt-1">{reason.trim().length} / 10</div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button className="flex-1" onClick={() => setStep(2)} disabled={!reasonValid}>
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Label className="text-xs">Find new tenant by phone, National ID, or name</Label>
            <div className="flex gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="+256712345678 or CM1234..."
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              />
              <Button onClick={runSearch} disabled={searching}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {results.length === 0 && !searching && (
                <p className="text-xs text-muted-foreground text-center py-4">No results yet — search above.</p>
              )}
              {results.map((r) => {
                const isEvicted = r.tenant_status === 'evicted';
                const isSelected = selected?.id === r.id;
                return (
                  <button
                    key={r.id}
                    disabled={isEvicted}
                    onClick={() => setSelected(r)}
                    className={`w-full text-left rounded-md border p-2.5 transition ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    } ${isEvicted ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{r.full_name}</div>
                        <div className="text-xs text-muted-foreground">{r.phone} {r.national_id && `· ${r.national_id}`}</div>
                      </div>
                      {isEvicted ? (
                        <Badge variant="destructive" className="text-[10px]">Evicted</Badge>
                      ) : isSelected ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button className="flex-1" onClick={() => setStep(3)} disabled={!selected}>
                Review <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && selected && (
          <div className="space-y-3">
            <div className="rounded-md border p-3 text-sm space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Old tenant</span><span className="font-medium">{oldTenantName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Outstanding (sealed)</span><span className="font-mono">UGX {formattedOutstanding}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Eviction date</span><span>{effectiveDate}</span></div>
              <div className="border-t pt-2 flex justify-between"><span className="text-muted-foreground">New tenant</span><span className="font-medium">{selected.full_name}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Phone</span><span>{selected.phone}</span></div>
              <div className="border-t pt-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Reason: </span>{reason.trim()}</div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button className="flex-1" onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserX className="h-4 w-4 mr-2" />}
                Confirm Replacement
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
