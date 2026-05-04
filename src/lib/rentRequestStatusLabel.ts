/**
 * Shared label helper for `rent_requests.status`.
 *
 * The DB pipeline status `completed` strictly means "fully repaid".
 * The earlier approval-pipeline statuses (agent_ops_approved, tenant_ops_approved,
 * landlord_ops_approved, coo_approved) are *in-pipeline* states — they should NEVER
 * surface to the user as "Completed".
 *
 * To keep the UI honest even if a row is mis-labelled in the DB, callers can pass
 * `amount_repaid` and `total_repayment` so we only show "Fully repaid" when the
 * numbers actually back it up.
 */
export type RentRequestStatusTone =
  | 'pending'
  | 'in-review'
  | 'approved'
  | 'funded'
  | 'active'
  | 'completed'
  | 'rejected'
  | 'unknown';

export interface RentRequestStatusLabel {
  label: string;
  tone: RentRequestStatusTone;
}

export function getRentRequestStatusLabel(
  status: string | null | undefined,
  opts?: { amountRepaid?: number | null; totalRepayment?: number | null },
): RentRequestStatusLabel {
  const s = (status || '').toLowerCase();
  const repaid = Number(opts?.amountRepaid ?? 0);
  const total = Number(opts?.totalRepayment ?? 0);
  const fullyRepaid = total > 0 && repaid >= total;

  switch (s) {
    case 'pending':
      return { label: 'In review', tone: 'in-review' };
    case 'agent_ops_approved':
    case 'tenant_ops_approved':
    case 'landlord_ops_approved':
    case 'coo_approved':
    case 'agent_verified': // legacy
      return { label: 'Approved', tone: 'approved' };
    case 'approved':
      return { label: 'Approved', tone: 'approved' };
    case 'funded':
      return { label: 'Funded', tone: 'funded' };
    case 'disbursed':
    case 'repaying':
      return { label: 'Active', tone: 'active' };
    case 'completed':
    case 'fully_repaid':
      // Defensive: only claim fully-repaid when the numbers prove it.
      if (opts && (opts.amountRepaid != null || opts.totalRepayment != null) && !fullyRepaid) {
        return { label: 'Active', tone: 'active' };
      }
      return { label: 'Fully repaid', tone: 'completed' };
    case 'rejected':
      return { label: 'Rejected', tone: 'rejected' };
    default:
      if (!s) return { label: '—', tone: 'unknown' };
      return { label: s.replace(/_/g, ' '), tone: 'unknown' };
  }
}

export const RENT_STATUS_TONE_CLASS: Record<RentRequestStatusTone, string> = {
  'pending': 'bg-warning/10 text-warning border-warning/30',
  'in-review': 'bg-warning/10 text-warning border-warning/30',
  'approved': 'bg-primary/10 text-primary border-primary/30',
  'funded': 'bg-success/10 text-success border-success/30',
  'active': 'bg-chart-5/10 text-chart-5 border-chart-5/30',
  'completed': 'bg-success text-success-foreground border-transparent',
  'rejected': 'bg-destructive/10 text-destructive border-destructive/30',
  'unknown': 'bg-muted text-muted-foreground border-border',
};