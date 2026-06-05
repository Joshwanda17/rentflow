import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Share2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { generateCfoPayoutsPdf, shareCfoPayoutsPdf, type CfoPayoutRow } from '@/lib/cfoPayoutsReportPdf';

// Audit-log action types that represent money actually paid OUT to a person/wallet.
const PAYOUT_ACTIONS = [
  'cfo_direct_credit',
  'cfo_roi_payout_approved',
  'roi_payout',
  'rent_payout_approved',
  'cfo_batch_payout_processed',
  'commission_payout',
  'landlord_payout_cfo_approve',
  'agent_float_funded',
  'cfo_payroll_processed',
  'cfo_service_centre_payout',
];

const ACTION_LABEL: Record<string, string> = {
  cfo_direct_credit: 'Wallet Credit',
  cfo_roi_payout_approved: 'ROI Payout',
  roi_payout: 'ROI Payout',
  rent_payout_approved: 'Rent Payout',
  cfo_batch_payout_processed: 'Batch Payout',
  commission_payout: 'Commission',
  landlord_payout_cfo_approve: 'Landlord Payout',
  agent_float_funded: 'Agent Float',
  cfo_payroll_processed: 'Payroll',
  cfo_service_centre_payout: 'Service Centre',
};

export function CFOPayoutsShareButton() {
  const [busy, setBusy] = useState(false);

  const handleShare = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('action_type, created_at, metadata')
        .in('action_type', PAYOUT_ACTIONS)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      const rows: CfoPayoutRow[] = (data || [])
        .map((a: any) => {
          const meta = a.metadata || {};
          const amount = Number(meta.amount ?? meta.total_amount ?? 0);
          const recipient =
            meta.target_name || meta.target_user_name || meta.user_name ||
            meta.partner_name || meta.agent_name || meta.recipient_name || '—';
          return {
            date: new Date(a.created_at),
            recipient,
            amount,
            type: ACTION_LABEL[a.action_type] || a.action_type,
            reference: meta.reference_id || meta.reference || meta.tid || meta.transaction_id || meta.batch_reference || '',
          } as CfoPayoutRow;
        })
        .filter(r => r.amount > 0);

      if (rows.length === 0) {
        toast.error('No payouts found to share yet.');
        return;
      }

      const blob = await generateCfoPayoutsPdf(rows);
      const filename = `welile-payouts-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      const total = rows.reduce((s, r) => s + r.amount, 0);
      const caption = `Welile Wallet Payouts — ${rows.length} payouts totalling UGX ${total.toLocaleString()} (${format(new Date(), 'dd MMM yyyy')}).`;
      await shareCfoPayoutsPdf(blob, filename, caption);
    } catch (err: any) {
      toast.error('Could not generate payouts PDF', { description: err?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleShare} disabled={busy} className="gap-1.5">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
      Share Payouts PDF
    </Button>
  );
}
