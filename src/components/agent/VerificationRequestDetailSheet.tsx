import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ShieldQuestion, Phone, UserCircle, Loader2, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface VerificationRequest {
  id: string;
  landlord_id: string;
  landlord_name: string | null;
  landlord_phone: string | null;
  requested_by: string;
  agent_name: string | null;
  agent_phone: string | null;
  note: string | null;
  status: 'pending' | 'verified' | 'rejected' | string;
  reject_comment: string | null;
  resolved_at: string | null;
  created_at: string;
}

const statusBadge: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending review', className: 'bg-amber-600 text-white hover:bg-amber-600' },
  verified: { label: '✅ Verified', className: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  rejected: { label: 'Rejected', className: 'bg-rose-600 text-white hover:bg-rose-600' },
};

interface Props {
  requestId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Read-only side panel showing a single landlord verification request.
 * Opened from the "View details" toast action so the agent can review the
 * request without leaving (and resetting) the List Empty House dialog.
 */
export default function VerificationRequestDetailSheet({ requestId, open, onOpenChange }: Props) {
  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    const { data } = await supabase
      .from('landlord_verification_requests')
      .select('id, landlord_id, landlord_name, landlord_phone, requested_by, agent_name, agent_phone, note, status, reject_comment, resolved_at, created_at')
      .eq('id', requestId)
      .maybeSingle();
    setRequest((data as VerificationRequest) ?? null);
    setLoading(false);
  }, [requestId]);

  useEffect(() => {
    if (open && requestId) load();
  }, [open, requestId, load]);

  // Keep the panel live while it's open.
  useEffect(() => {
    if (!open || !requestId) return;
    const channel = supabase
      .channel(`verification-request-sheet-${requestId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'landlord_verification_requests', filter: `id=eq.${requestId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, requestId, load]);

  const badge = request ? (statusBadge[request.status] ?? statusBadge.pending) : statusBadge.pending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Verification request</SheetTitle>
          <SheetDescription>Landlord verification status and details.</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !request ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <ShieldQuestion className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              This request may have been removed, or you don&apos;t have access to view it.
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border-2 border-amber-500/40 bg-amber-50/50 dark:bg-amber-500/5 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-amber-500/15 shrink-0">
                  <ShieldQuestion className="h-[18px] w-[18px] text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-base leading-tight truncate">{request.landlord_name || 'Unnamed landlord'}</p>
                  <p className="text-[11px] text-muted-foreground">Landlord verification</p>
                </div>
              </div>
              <Badge className={`${badge.className} shrink-0`}>{badge.label}</Badge>
            </div>

            {request.landlord_phone && (
              <p className="text-sm text-foreground flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> {request.landlord_phone}
              </p>
            )}
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <UserCircle className="h-3.5 w-3.5 shrink-0" />
              Requested by <span className="font-medium text-foreground">{request.agent_name || 'Agent'}</span>
              {request.agent_phone ? ` · ${request.agent_phone}` : ''}
            </p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" />
              {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
              {request.resolved_at ? ` · resolved ${formatDistanceToNow(new Date(request.resolved_at), { addSuffix: true })}` : ''}
            </p>

            {request.note && (
              <div className="rounded-xl border border-border/60 bg-background p-3">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Agent note</p>
                <p className="text-sm text-foreground">{request.note}</p>
              </div>
            )}

            {request.status === 'rejected' && request.reject_comment && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-50/60 dark:bg-rose-500/5 p-3">
                <p className="text-[11px] font-medium text-rose-700 mb-1">Rejection reason</p>
                <p className="text-sm text-foreground">{request.reject_comment}</p>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}