// ═══════════════════════════════════════════════════════════════════════════
// Invited Portfolios Panel
// Lists portfolios in the invite pipeline (statuses `awaiting_partner_details`
// and `pending_ops_approval`). Searchable by partner name/phone or portfolio
// code. For `pending_ops_approval` rows, Ops can Approve inline — the call
// goes to the `approve-pending-portfolio` edge function which flips the
// portfolio to `active` and dispatches the final signed agreement.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { extractFromErrorObject } from '@/lib/extractEdgeFunctionError';
import { formatDistanceToNow, format } from 'date-fns';
import { Loader2, Search, Mail, MailWarning, ShieldCheck, RefreshCw, Inbox, Eye, Phone, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import AgreementHtmlPreview, { type AgreementPreviewData } from '@/components/partner/AgreementHtmlPreview';
import { buildAgreementHtml } from '@/components/partner/agreementTemplate';
import { renderAgreementPdfBase64 } from '@/components/partner/renderAgreementPdf';
import { buildPartnerReference } from '@/lib/partnerReference';

type InviteStatus = 'awaiting_partner_details' | 'pending_ops_approval';

interface Row {
  id: string;
  portfolio_code: string;
  investment_amount: number;
  roi_percentage: number;
  roi_mode: string | null;
  duration_months: number | null;
  status: InviteStatus;
  created_at: string;
  investor_id: string;
  partner_name: string;
  partner_phone: string | null;
  partner_email: string | null;
  token_expires_at: string | null;
  token_consumed_at: string | null;
}

type Filter = 'all' | InviteStatus;

export function InvitedPortfoliosPanel() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [reviewRow, setReviewRow] = useState<Row | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery<Row[]>({
    queryKey: ['invited-portfolios'],
    queryFn: async () => {
      // Single round-trip: pull portfolios in the invite pipeline, then batch
      // the partner profiles + latest token per portfolio.
      const { data: portfolios, error } = await supabase
        .from('investor_portfolios')
        .select('id, portfolio_code, investment_amount, roi_percentage, roi_mode, duration_months, status, created_at, investor_id')
        .in('status', ['awaiting_partner_details', 'pending_ops_approval'])
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      if (!portfolios || portfolios.length === 0) return [];

      const partnerIds = Array.from(new Set(portfolios.map(p => p.investor_id).filter(Boolean)));
      const portfolioIds = portfolios.map(p => p.id);

      const [{ data: profiles }, { data: tokens }] = await Promise.all([
        (supabase.from('profiles') as any)
          .select('id, full_name, phone, email')
          .in('id', partnerIds),
        (supabase.from('portfolio_completion_tokens') as any)
          .select('portfolio_id, expires_at, consumed_at')
          .in('portfolio_id', portfolioIds),
      ]);

      const nameMap = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]));
      const tokenMap = new Map<string, any>((tokens || []).map((t: any) => [t.portfolio_id, t]));

      return portfolios.map((p): Row => {
        const prof = nameMap.get(p.investor_id) || {};
        const tok = tokenMap.get(p.id) || {};
        return {
          id: p.id,
          portfolio_code: p.portfolio_code,
          investment_amount: Number(p.investment_amount) || 0,
          roi_percentage: Number(p.roi_percentage) || 0,
          roi_mode: p.roi_mode,
          duration_months: p.duration_months,
          status: p.status as InviteStatus,
          created_at: p.created_at,
          investor_id: p.investor_id,
          partner_name: prof.full_name || '—',
          partner_phone: prof.phone || null,
          partner_email: prof.email || null,
          token_expires_at: tok.expires_at || null,
          token_consumed_at: tok.consumed_at || null,
        };
      });
    },
    staleTime: 15000,
  });

  // Client-side search + filter (list is capped at 200 rows on the server).
  const filtered = useMemo(() => {
    const rows = data || [];
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.partner_name.toLowerCase().includes(q) ||
        (r.partner_phone || '').toLowerCase().includes(q) ||
        (r.partner_email || '').toLowerCase().includes(q) ||
        r.portfolio_code.toLowerCase().includes(q)
      );
    });
  }, [data, search, filter]);

  const counts = useMemo(() => {
    const rows = data || [];
    return {
      all: rows.length,
      awaiting_partner_details: rows.filter(r => r.status === 'awaiting_partner_details').length,
      pending_ops_approval: rows.filter(r => r.status === 'pending_ops_approval').length,
    };
  }, [data]);

  const handleApprove = async (
    row: Row,
    countersign?: {
      repName: string;
      repPosition: string;
      repContact: string;
      sigDataUrl?: string;
      previewData: AgreementPreviewData;
    },
  ) => {
    setApprovingId(row.id);
    try {
      const { data: res, error } = await supabase.functions.invoke('approve-pending-portfolio', {
        body: { portfolio_id: row.id },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);

      // If Partner Ops filled in the Welile counter-signature fields, render
      // the executed PDF from the exact same HTML shown in the preview and
      // store/email it via `generate-partner-agreement`. This mirrors the
      // Sign-off dialog flow so the counter-signed contract is produced in
      // the same request.
      if (countersign && countersign.repName.trim()) {
        try {
          const pdfBase64 = await renderAgreementPdfBase64(
            buildAgreementHtml(countersign.previewData),
          );
          await supabase.functions.invoke('generate-partner-agreement', {
            body: {
              partnerId: row.investor_id,
              countersign: true,
              pdfBase64,
              rep: {
                name: countersign.repName.trim(),
                position: countersign.repPosition.trim(),
                contact: countersign.repContact.trim(),
                signatureBase64: countersign.sigDataUrl || undefined,
              },
            },
          });
        } catch (e: any) {
          console.warn('[approve] counter-signature dispatch failed:', e?.message);
          toast.warning('Portfolio approved, but counter-signed PDF failed to generate.', {
            description: e?.message || 'Retry from the Sign-off dialog.',
          });
        }
      }

      toast.success('Portfolio approved', {
        description: `${row.portfolio_code} is now active. Final agreement sent to ${row.partner_name}.`,
      });
      await queryClient.invalidateQueries({ queryKey: ['invited-portfolios'] });
      await queryClient.invalidateQueries({ queryKey: ['exec-partner-portfolios'] });
      setReviewRow(null);
    } catch (err: any) {
      toast.error('Approval failed', { description: extractFromErrorObject(err) || err.message });
    } finally {
      setApprovingId(null);
    }
  };

  const isExpired = (row: Row) =>
    row.status === 'awaiting_partner_details' &&
    row.token_expires_at &&
    new Date(row.token_expires_at) < new Date() &&
    !row.token_consumed_at;

  return (
    <div className="space-y-3">
      {/* Header + refresh */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" />
            Invited Portfolios
          </h2>
          <p className="text-xs text-muted-foreground">
            Portfolios awaiting partner completion or Ops approval. Active portfolios move to the Portfolios tab.
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </Button>
      </div>

      {/* Search + status filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search partner name, phone, email, or portfolio code"
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {([
            { key: 'all', label: 'All' },
            { key: 'awaiting_partner_details', label: 'Awaiting partner' },
            { key: 'pending_ops_approval', label: 'Pending approval' },
          ] as { key: Filter; label: string }[]).map(({ key, label }) => {
            const count = counts[key];
            const active = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                )}
              >
                {label}
                <span className={cn('ml-1.5 text-[10px] font-bold', active ? 'opacity-80' : 'text-muted-foreground')}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Inbox className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium">No invited portfolios</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search || filter !== 'all'
                ? 'Nothing matches this filter.'
                : 'Send an invite from a partner\'s detail view to see it here.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const expired = isExpired(row);
            return (
              <Card key={row.id} className={cn('overflow-hidden', expired && 'border-destructive/40 bg-destructive/[0.02]')}>
                <CardContent className="p-3.5 space-y-3">
                  {/* Top: partner + status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{row.partner_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {row.partner_phone || row.partner_email || 'No contact on file'}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{row.portfolio_code}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {row.status === 'awaiting_partner_details' ? (
                        <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                          <Mail className="h-3 w-3" /> Awaiting partner
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] gap-1 border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400">
                          <ShieldCheck className="h-3 w-3" /> Pending Ops approval
                        </Badge>
                      )}
                      {expired && (
                        <Badge variant="outline" className="text-[10px] gap-1 border-destructive/40 bg-destructive/10 text-destructive">
                          <MailWarning className="h-3 w-3" /> Invite expired
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Amount</p>
                      <p className="font-bold">{formatUGX(row.investment_amount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">ROI</p>
                      <p className="font-semibold">{row.roi_percentage}%{row.roi_mode ? ` · ${row.roi_mode.replace(/_/g, ' ')}` : ''}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tenor</p>
                      <p className="font-semibold">{row.duration_months ?? '—'} mo</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Invited</p>
                      <p className="font-semibold" title={format(new Date(row.created_at), 'PPpp')}>
                        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => setReviewRow(row)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View details & contract
                    </Button>
                  </div>

                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ReviewSubmissionDialog
        row={reviewRow}
        onClose={() => setReviewRow(null)}
        onApprove={handleApprove}
        approving={approvingId === reviewRow?.id}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Review dialog: pulls what the partner submitted (NIN, mobile-money name,
// signature) + portfolio terms so Ops can verify BEFORE approving — the
// same "see everything then approve/reject" flow as funder-onboarding.
// ─────────────────────────────────────────────────────────────────────────
function ReviewSubmissionDialog({
  row,
  onClose,
  onApprove,
  approving,
}: {
  row: Row | null;
  onClose: () => void;
  onApprove: (
    row: Row,
    countersign?: {
      repName: string;
      repPosition: string;
      repContact: string;
      sigDataUrl?: string;
      previewData: AgreementPreviewData;
    },
  ) => void;
  approving: boolean;
}) {
  const open = !!row;
  // Welile counter-signature fields — filled by Partner Ops before approval.
  // Prefilled from `partner_agreement_company_defaults` so common admin
  // details don't need re-typing. Hooks stay above any early return.
  const [repName, setRepName] = useState('');
  const [repPosition, setRepPosition] = useState('');
  const [repContact, setRepContact] = useState('');
  const [sigDataUrl, setSigDataUrl] = useState<string | undefined>();

  const { data: submission, isLoading } = useQuery({
    queryKey: ['invited-portfolio-submission', row?.id, row?.investor_id],
    enabled: open && !!row?.investor_id,
    queryFn: async () => {
      const [{ data: profile }, { data: agreement }, { data: token }, { data: defaults }] = await Promise.all([
        (supabase.from('profiles') as any)
          .select('full_name, phone, email, national_id, mobile_money_name')
          .eq('id', row!.investor_id).maybeSingle(),
        (supabase.from('partner_agreements') as any)
          .select('*')
          .eq('partner_id', row!.investor_id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase.from('portfolio_completion_tokens') as any)
          .select('consumed_at')
          .eq('portfolio_id', row!.id)
          .maybeSingle(),
        (supabase.from('partner_agreement_company_defaults') as any)
          .select('*')
          .limit(1)
          .maybeSingle(),
      ]);
      let defaultSigUrl: string | undefined;
      if (defaults?.signature_path) {
        const { data: sig } = await supabase.storage
          .from('partner-agreements')
          .createSignedUrl(defaults.signature_path, 60 * 60);
        defaultSigUrl = sig?.signedUrl || undefined;
      }
      return { profile, agreement, token, defaults, defaultSigUrl };
    },
    staleTime: 15000,
  });

  const profile: any = submission?.profile || {};
  const agreement: any = submission?.agreement || {};
  const signature = agreement.partner_signature_data_url as string | undefined;
  const submittedAt = submission?.token?.consumed_at as string | undefined;
  const defaults: any = submission?.defaults || {};
  const defaultSigUrl: string | undefined = submission?.defaultSigUrl;

  // Seed rep fields from stored company defaults when a new row opens.
  useEffect(() => {
    if (!row) return;
    setRepName(defaults?.rep_name || '');
    setRepPosition(defaults?.rep_position || '');
    setRepContact(defaults?.rep_contact || '');
    setSigDataUrl(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id, defaults?.rep_name, defaults?.rep_position, defaults?.rep_contact]);

  const onSignatureFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Use an image file', { description: 'Upload a PNG or JPG of the signature.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSigDataUrl(typeof reader.result === 'string' ? reader.result : undefined);
    reader.readAsDataURL(file);
  };

  if (!row) return null;

  const hasAgreement = !!(agreement && (
    agreement.address || agreement.national_id || agreement.kin_name ||
    agreement.bank_account_number || agreement.momo_number ||
    agreement.partner_signature_data_url
  ));
  const previewData: AgreementPreviewData | null = hasAgreement ? {
    partnerName: profile.full_name || agreement.full_name || row.partner_name || '',
    partnerId: agreement.national_id || profile.national_id || '',
    partnerAddress: agreement.address || '',
    partnerPhone: agreement.phone || profile.phone || row.partner_phone || '',
    partnerEmail: agreement.email || profile.email || row.partner_email || '',
    partnershipAmount: Number(agreement.partnership_amount) || Number(row.investment_amount) || 0,
    payoutMode: agreement.payout_mode === 'momo' ? 'momo' : 'bank',
    bankName: agreement.bank_name || '',
    bankAccountName: agreement.bank_account_name || '',
    bankAccountNumber: agreement.bank_account_number || '',
    momoProvider: agreement.momo_provider || '',
    momoNumber: agreement.momo_number || '',
    momoName: agreement.momo_name || profile.mobile_money_name || '',
    kinName: agreement.kin_name || '',
    kinContact: agreement.kin_contact || '',
    agreementDate: agreement.agreement_date ? new Date(agreement.agreement_date) : new Date(),
    partnerSignatureDataUrl: signature,
    welileRepName: repName,
    welileRepPosition: repPosition,
    welileRepContact: repContact,
    welileSignatureDataUrl: sigDataUrl || defaultSigUrl,
    includeStamp: true,
  } : null;

  const partnerName = profile.full_name || row.partner_name;
  const payoutLabel = agreement.payout_mode === 'momo'
    ? [agreement.momo_provider, agreement.momo_number].filter(Boolean).join(' ') || 'Mobile money'
    : [agreement.bank_name, agreement.bank_account_number].filter(Boolean).join(' ') || '—';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-6xl w-[97vw] h-[94vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" /> Review partner submission
          </DialogTitle>
          <DialogDescription className="text-xs">
            Review what {partnerName} submitted for portfolio {row.portfolio_code}, then approve to activate it and email the final agreement.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[360px_1fr]">
          {/* LEFT — partner + submission summary */}
          <div className="border-r overflow-y-auto p-4 space-y-4 bg-muted/20">
            <div className="rounded-xl bg-background border p-3 space-y-1">
              <p className="text-sm font-bold">{partnerName || 'Unknown partner'}</p>
              <p className="text-[11px] font-mono text-muted-foreground">
                Ref: {buildPartnerReference(row.investor_id, row.created_at)}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{profile.phone || row.partner_phone || '—'}</span>
                {(profile.email || row.partner_email) && (
                  <span className="truncate inline-flex items-center gap-1"><Mail className="h-3 w-3" />{profile.email || row.partner_email}</span>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <>
                <section className="space-y-1.5">
                  <p className="text-xs font-semibold text-foreground">Partner submitted</p>
                  <ReadRow label="National ID" value={agreement.national_id || profile.national_id || '—'} />
                  <ReadRow label="Address" value={agreement.address || '—'} />
                  <ReadRow label="Payout" value={payoutLabel} />
                  <ReadRow
                    label="Next of kin"
                    value={[agreement.kin_name, agreement.kin_contact].filter(Boolean).join(' · ') || '—'}
                  />
                  <ReadRow label="MoMo name" value={profile.mobile_money_name || agreement.momo_name || '—'} />
                </section>

                <Separator />

                <section className="space-y-1.5">
                  <p className="text-xs font-semibold text-foreground">Portfolio terms</p>
                  <ReadRow label="Code" value={row.portfolio_code} />
                  <ReadRow label="Amount" value={formatUGX(row.investment_amount)} />
                  <ReadRow
                    label="ROI"
                    value={`${row.roi_percentage}%${row.roi_mode ? ` · ${row.roi_mode.replace(/_/g, ' ')}` : ''}`}
                  />
                  <ReadRow label="Tenor" value={`${row.duration_months ?? '—'} mo`} />
                  {submittedAt && (
                    <p className="text-[10px] text-muted-foreground pt-1">
                      Submitted {format(new Date(submittedAt), 'PPp')} · {formatDistanceToNow(new Date(submittedAt), { addSuffix: true })}
                    </p>
                  )}
                </section>

                <Separator />

                <section className="space-y-2">
                  <p className="text-xs font-semibold text-foreground">Signature</p>
                  {signature ? (
                    <div className="bg-white rounded border p-2 flex items-center justify-center">
                      <img src={signature} alt="Partner signature" className="max-h-24 object-contain" />
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-600 italic">No signature captured — partner may have typed their name only.</p>
                  )}
                </section>

                <Separator />

                <div className="flex flex-col gap-2 pb-2">
                  <Button onClick={() => onApprove(row)} disabled={approving} className="gap-1.5">
                    {approving
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Approving…</>
                      : <><ShieldCheck className="h-4 w-4" /> Approve &amp; send final agreement</>}
                  </Button>
                  <Button variant="outline" size="sm" onClick={onClose} disabled={approving}>Close</Button>
                  <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Activates the portfolio and emails the executed agreement.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* RIGHT — live agreement preview */}
          <div className="overflow-y-auto bg-slate-100 p-3 sm:p-6">
            <div className="mx-auto max-w-[760px] bg-white shadow-lg rounded-sm">
              {previewData ? (
                <AgreementHtmlPreview data={previewData} />
              ) : (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  {isLoading ? 'Loading agreement…' : 'No agreement submitted yet.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-foreground text-right break-words">{value}</span>
    </div>
  );
}