import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertOctagon, Loader2, Upload, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';

interface ProoflessRow {
  id: string;
  user_id: string | null;
  amount: number;
  payout_method: string | null;
  mobile_money_provider: string | null;
  processed_at: string | null;
  created_at: string;
  full_name?: string | null;
  phone?: string | null;
}

/**
 * Full-page blocking overlay for merchant agents.
 *
 * Every wallet deduction this merchant settled WITHOUT an attached proof of
 * payment overshadows the whole payout page: the merchant cannot keep working
 * until each affected customer has proof on file. Proof is uploaded to the
 * private `payment-proofs` bucket and attached via a guarded RPC.
 */
export function ProoflessPayoutBlocker() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ['merchant-proofless-payouts', user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ProoflessRow[]> => {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('id, user_id, amount, payout_method, mobile_money_provider, processed_at, created_at')
        .eq('processed_by', user!.id)
        .eq('status', 'completed')
        .is('payout_proof_path', null)
        .order('processed_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const list = ((data as any[]) || []).filter((r) => !String(r.payout_proof ?? '').trim());
      const ids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
      let names = new Map<string, { full_name: string | null; phone: string | null }>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', ids);
        names = new Map((profs || []).map((p: any) => [p.id, { full_name: p.full_name, phone: p.phone }]));
      }
      return list.map((r) => ({
        ...r,
        amount: Number(r.amount || 0),
        full_name: r.user_id ? names.get(r.user_id)?.full_name ?? null : null,
        phone: r.user_id ? names.get(r.user_id)?.phone ?? null : null,
      })) as ProoflessRow[];
    },
  });

  async function handleFile(file: File) {
    const id = targetId;
    if (!id) return;
    setBusyId(id);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${user!.id}/payout-proofs/${id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('payment-proofs')
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw new Error(upErr.message || 'Failed to upload proof.');
      const { error } = await (supabase as any).rpc('merchant_attach_payout_proof', {
        p_withdrawal_id: id,
        p_path: path,
        p_bucket: 'payment-proofs',
        p_type: file.type || `image/${ext}`,
      });
      if (error) throw error;
      toast.success('Proof attached — thank you.');
      qc.invalidateQueries({ queryKey: ['merchant-proofless-payouts'] });
    } catch (e: any) {
      toast.error(e?.message || 'Could not attach the proof');
    } finally {
      setBusyId(null);
      setTargetId(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  if (rows.length === 0) return null;

  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="fixed inset-0 z-[80] bg-background/95 backdrop-blur-sm overflow-y-auto">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 space-y-4">
        <div className="rounded-2xl border-2 border-destructive bg-destructive/10 p-4 flex items-start gap-3">
          <AlertOctagon className="h-7 w-7 text-destructive shrink-0 mt-0.5 animate-pulse" />
          <div className="space-y-1">
            <p className="text-lg font-extrabold text-destructive">
              PROOF MISSING ON {rows.length} WALLET DEDUCTION{rows.length > 1 ? 'S' : ''}
            </p>
            <p className="text-xs text-destructive/80">
              These customers had {formatUGX(total)} taken off their wallet but you never attached
              proof of payment. Attach proof for each one to unlock your payout dashboard. Financial
              Ops and the CFO can see this list.
            </p>
          </div>
        </div>

        <ul className="space-y-3 list-none p-0 m-0">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-destructive/40 bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{r.full_name || 'Unnamed customer'}</p>
                  <p className="text-xs text-muted-foreground">{r.phone || 'No phone on file'}</p>
                </div>
                <Badge variant="destructive" className="shrink-0">No proof</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{formatUGX(r.amount)}</span>
                <span>
                  {r.payout_method || r.mobile_money_provider || 'payout'} •{' '}
                  {format(new Date(r.processed_at || r.created_at), 'MMM d • h:mm a')}
                </span>
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="w-full gap-2"
                disabled={busyId === r.id}
                onClick={() => {
                  setTargetId(r.id);
                  inputRef.current?.click();
                }}
              >
                {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Attach proof of payment
              </Button>
            </li>
          ))}
        </ul>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          Every settled payout must carry proof. If you cannot produce proof for a customer, refund
          them and contact Financial Ops immediately.
        </p>
      </div>
    </div>
  );
}
