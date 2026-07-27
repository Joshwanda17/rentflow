import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Paperclip } from 'lucide-react';

interface Req {
  id: string;
  employee_name: string;
  employee_email: string;
  employee_phone: string | null;
  employee_id: string | null;
  department: string | null;
  purpose: string;
  category: string;
  amount: number;
  currency: string;
  priority: string;
  required_by: string | null;
  description: string | null;
  attachment_urls: string[];
  status: string;
  submitted_at: string;
  rejection_reason: string | null;
}

const STATUS_TONES: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-700',
  approved: 'bg-emerald-500/15 text-emerald-700',
  rejected: 'bg-destructive/15 text-destructive',
  paid: 'bg-primary/15 text-primary',
  cancelled: 'bg-muted text-muted-foreground',
};

export function EmployeeRequisitionQueuePanel() {
  const [rows, setRows] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [amountEdits, setAmountEdits] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    let q = supabase.from('employee_requisitions').select('*').order('submitted_at', { ascending: false }).limit(200);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as Req[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

  const decide = async (
    id: string,
    action: 'approve' | 'reject',
    reason?: string,
    amount?: number,
  ) => {
    setBusyId(id);
    const { data, error } = await supabase.functions.invoke('requisition-decide', {
      body: { id, action, reason, amount },
    });
    setBusyId(null);
    if (error || (data as { error?: string })?.error) {
      toast.error((data as { error?: string })?.error ?? error?.message ?? 'Failed');
      return;
    }
    const creditErr = (data as { credit_error?: string | null })?.credit_error;
    if (action === 'approve') {
      if (creditErr) toast.warning(`Approved, but wallet credit failed: ${creditErr}`);
      else toast.success('Approved — wallet credited');
    } else {
      toast.success('Requisition rejected');
    }
    setExpanded(null);
    setRejectReason('');
    load();
  };

  const openAttachment = async (path: string) => {
    const { data } = await supabase.storage.from('requisition-attachments').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {['pending', 'approved', 'rejected', 'all'].map(s => (
          <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'} onClick={() => setStatusFilter(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={load}>Refresh</Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">No requisitions.</Card>
      ) : (
        <ul className="space-y-2">
          {rows.map(r => {
            const isOpen = expanded === r.id;
            return (
              <Card key={r.id} className="p-3">
                <button className="w-full text-left" onClick={() => setExpanded(isOpen ? null : r.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{r.employee_name} · {r.currency} {Number(r.amount).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.department ?? '—'} • {r.category} • {r.purpose}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(r.submitted_at).toLocaleString()} • {r.priority}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[11px] px-2 py-0.5 rounded ${STATUS_TONES[r.status] ?? ''}`}>{r.status}</span>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Email:</span> {r.employee_email}</div>
                      <div><span className="text-muted-foreground">Phone:</span> {r.employee_phone ?? '—'}</div>
                      <div><span className="text-muted-foreground">Employee ID:</span> {r.employee_id ?? '—'}</div>
                      <div><span className="text-muted-foreground">Required by:</span> {r.required_by ?? '—'}</div>
                    </div>
                    {r.description && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Description</p>
                        <p className="text-sm whitespace-pre-wrap">{r.description}</p>
                      </div>
                    )}
                    {r.attachment_urls?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Attachments</p>
                        <div className="flex flex-wrap gap-2">
                          {r.attachment_urls.map(p => (
                            <Button key={p} size="sm" variant="outline" onClick={() => openAttachment(p)}>
                              <Paperclip className="h-3.5 w-3.5 mr-1" /> {p.split('/').pop()}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                    {r.status === 'rejected' && r.rejection_reason && (
                      <div className="text-xs text-destructive">
                        <strong>Rejection reason:</strong> {r.rejection_reason}
                      </div>
                    )}

                    {r.status === 'pending' && (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Approved amount ({r.currency})</Label>
                          <Input
                            type="number"
                            min={1}
                            step="1"
                            value={amountEdits[r.id] ?? String(r.amount)}
                            onChange={e => setAmountEdits(prev => ({ ...prev, [r.id]: e.target.value }))}
                            className="h-9"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Requested: {r.currency} {Number(r.amount).toLocaleString()}. Edit before approving to credit a different amount.
                          </p>
                        </div>
                        <Textarea
                          rows={2}
                          placeholder="Rejection reason (required to reject, min 10 chars)"
                          value={busyId === r.id ? rejectReason : (expanded === r.id ? rejectReason : '')}
                          onChange={e => setRejectReason(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={busyId === r.id}
                            onClick={() => {
                              const raw = amountEdits[r.id];
                              const parsed = raw != null && raw !== '' ? Number(raw) : Number(r.amount);
                              if (!Number.isFinite(parsed) || parsed <= 0) {
                                toast.error('Enter a valid amount greater than 0');
                                return;
                              }
                              const changed = Math.abs(parsed - Number(r.amount)) > 0.001;
                              decide(r.id, 'approve', undefined, changed ? parsed : undefined);
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busyId === r.id || rejectReason.trim().length < 10}
                            onClick={() => decide(r.id, 'reject', rejectReason.trim())}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
