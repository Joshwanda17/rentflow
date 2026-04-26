import { useEffect, useMemo, useState } from 'react';
import { History, ArrowUpRight, ArrowDownRight, RotateCcw, ExternalLink, CalendarIcon, Download, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { toast } from 'sonner';

type RangePreset = '7d' | '30d' | '90d' | 'all' | 'custom';

const PRESETS: { value: Exclude<RangePreset, 'custom'>; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
];

function eventLabel(source: string): string {
  switch (source) {
    case 'collection_delete': return 'Collection reversed';
    case 'collection_update': return 'Collection updated';
    case 'collection_insert': return 'Collection recorded';
    case 'backfill': return 'Historical backfill';
    default: return 'Manual recompute';
  }
}

/**
 * AgentVouchHistoryFeed
 * ---------------------------------------------------------------------
 * Lists every collection-driven adjustment to the agent's earned vouch
 * limit (insert, update, delete/reversal). Sourced from the
 * `agent_vouch_limit_history` audit table populated by
 * `recompute_agent_earned_vouch`. RLS already gates rows to
 * `agent_id = auth.uid()`.
 */

interface HistoryRow {
  id: string;
  change_source: string;
  collection_id: string | null;
  collection_amount: number | null;
  previous_effective_limit_ugx: number | null;
  new_effective_limit_ugx: number | null;
  delta_ugx: number | null;
  created_at: string;
}

interface Props {
  agentId: string;
  limit?: number;
}

export function AgentVouchHistoryFeed({ agentId, limit = 10 }: Props) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!agentId) { setLoading(false); return; }
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('agent_vouch_limit_history')
          .select('id, change_source, collection_id, collection_amount, previous_effective_limit_ugx, new_effective_limit_ugx, delta_ugx, created_at')
          .eq('agent_id', agentId)
          .order('created_at', { ascending: false })
          .limit(200);
        if (cancelled) return;
        if (error) {
          setRows([]);
        } else {
          setRows((data ?? []) as HistoryRow[]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  const filteredRows = useMemo(() => {
    let from: Date | null = null;
    let to: Date | null = null;
    const now = new Date();
    if (preset === '7d') { from = new Date(now.getTime() - 7 * 86400000); }
    else if (preset === '30d') { from = new Date(now.getTime() - 30 * 86400000); }
    else if (preset === '90d') { from = new Date(now.getTime() - 90 * 86400000); }
    else if (preset === 'custom') {
      from = customStart ?? null;
      to = customEnd ? new Date(customEnd.getTime() + 86399999) : null;
    }
    if (!from && !to) return rows;
    return rows.filter((r) => {
      const t = new Date(r.created_at).getTime();
      if (from && t < from.getTime()) return false;
      if (to && t > to.getTime()) return false;
      return true;
    });
  }, [rows, preset, customStart, customEnd]);

  const visible = showAll ? filteredRows : filteredRows.slice(0, limit);

  const rangeLabel = (() => {
    if (preset === '7d') return 'Last 7 days';
    if (preset === '30d') return 'Last 30 days';
    if (preset === '90d') return 'Last 90 days';
    if (preset === 'all') return 'All time';
    if (customStart || customEnd) {
      return `${customStart ? format(customStart, 'd MMM yyyy') : '…'} – ${customEnd ? format(customEnd, 'd MMM yyyy') : '…'}`;
    }
    return 'Custom';
  })();

  async function handleExportPdf() {
    if (filteredRows.length === 0) {
      toast.error('No history rows to export for this date range.');
      return;
    }
    setExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTableMod: any = await import('jspdf-autotable');
      const autoTable = autoTableMod.default || autoTableMod;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pw = doc.internal.pageSize.getWidth();
      const margin = 14;
      let y = 16;

      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Welile Technologies Limited', margin, y);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Agent Vouch History', margin, y + 5);
      doc.text(
        new Date().toLocaleString('en-UG', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        pw - margin,
        y + 5,
        { align: 'right' },
      );
      y += 9;

      doc.setDrawColor(59, 130, 246);
      doc.setLineWidth(0.6);
      doc.line(margin, y, pw - margin, y);
      y += 6;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Range:', margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(rangeLabel, margin + 14, y);
      doc.text(`Entries: ${filteredRows.length}`, pw - margin, y, { align: 'right' });
      y += 5;

      const totalDelta = filteredRows.reduce((s, r) => s + Number(r.delta_ugx ?? 0), 0);
      const totalCollected = filteredRows.reduce((s, r) => s + Math.max(0, Number(r.collection_amount ?? 0)), 0);
      doc.text(`Net change: ${totalDelta >= 0 ? '+' : ''}${formatUGX(totalDelta)}`, margin, y);
      doc.text(`Cash collected: ${formatUGX(totalCollected)}`, pw - margin, y, { align: 'right' });
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [['Date', 'Event', 'Cash (UGX)', 'Delta (UGX)', 'New limit (UGX)', 'Collection ID']],
        body: filteredRows.map((r) => [
          new Date(r.created_at).toLocaleString('en-UG', {
            year: '2-digit', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
          }),
          eventLabel(r.change_source),
          formatUGX(Number(r.collection_amount ?? 0)),
          `${Number(r.delta_ugx ?? 0) > 0 ? '+' : ''}${formatUGX(Number(r.delta_ugx ?? 0))}`,
          formatUGX(Number(r.new_effective_limit_ugx ?? 0)),
          r.collection_id ? r.collection_id.slice(0, 8) : '—',
        ]),
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
        },
        margin: { left: margin, right: margin },
      });

      const fileName = `vouch-history-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`;
      doc.save(fileName);
      toast.success('Vouch history PDF downloaded');
    } catch (e) {
      console.error('Vouch history PDF export failed', e);
      toast.error('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-2.5">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-primary" />
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            Vouch history
          </p>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => { setPreset(p.value); setShowAll(false); }}
              className={cn(
                'h-6 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors',
                preset === p.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              )}
            >
              {p.label}
            </button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <button
                onClick={() => setPreset('custom')}
                className={cn(
                  'h-6 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 transition-colors',
                  preset === 'custom'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                )}
              >
                <CalendarIcon className="h-3 w-3" />
                {preset === 'custom' && (customStart || customEnd)
                  ? `${customStart ? format(customStart, 'd MMM') : '…'} – ${customEnd ? format(customEnd, 'd MMM') : '…'}`
                  : 'Custom'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 space-y-3" align="end">
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Start</p>
                <Calendar
                  mode="single"
                  selected={customStart}
                  onSelect={(d) => { setCustomStart(d); setPreset('custom'); setShowAll(false); }}
                  disabled={(d) => d > new Date() || (customEnd ? d > customEnd : false)}
                  className={cn('p-0 pointer-events-auto')}
                />
              </div>
              <div className="space-y-2 border-t border-border/60 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">End</p>
                <Calendar
                  mode="single"
                  selected={customEnd}
                  onSelect={(d) => { setCustomEnd(d); setPreset('custom'); setShowAll(false); }}
                  disabled={(d) => d > new Date() || (customStart ? d < customStart : false)}
                  className={cn('p-0 pointer-events-auto')}
                />
              </div>
              {(customStart || customEnd) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-[10px]"
                  onClick={() => { setCustomStart(undefined); setCustomEnd(undefined); }}
                >
                  Clear dates
                </Button>
              )}
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exporting || loading || filteredRows.length === 0}
            className={cn(
              'h-6 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 transition-colors',
              'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            title="Download history as PDF"
          >
            <Download className="h-3 w-3" />
            {exporting ? 'Exporting…' : 'PDF'}
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-[11px] text-muted-foreground py-2">Loading…</p>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-[11px] text-muted-foreground py-2 leading-snug">
          No collection adjustments yet. Each cash you collect will appear here
          with the resulting vouch change.
        </p>
      )}

      {!loading && rows.length > 0 && filteredRows.length === 0 && (
        <p className="text-[11px] text-muted-foreground py-2 leading-snug">
          No adjustments in the selected date range.
        </p>
      )}

      {!loading && filteredRows.length > 0 && (
        <ul className="divide-y divide-border/50">
          {visible.map((r) => (
            <HistoryItem
              key={r.id}
              row={r}
              onViewCollection={(id) => setActiveCollectionId(id)}
            />
          ))}
        </ul>
      )}

      {!loading && filteredRows.length > limit && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full mt-2 text-[10px] uppercase tracking-wider font-bold text-primary hover:underline"
        >
          {showAll ? 'Show less' : `Show all ${filteredRows.length}`}
        </button>
      )}

      <CollectionDetailDialog
        collectionId={activeCollectionId}
        onClose={() => setActiveCollectionId(null)}
      />
    </div>
  );
}

function HistoryItem({ row, onViewCollection }: { row: HistoryRow; onViewCollection: (id: string) => void }) {
  const delta = Number(row.delta_ugx ?? 0);
  const isReversal = row.change_source === 'collection_delete';
  const isUpdate = row.change_source === 'collection_update';
  const isPositive = delta > 0;
  const isNeutral = delta === 0;

  const Icon = isReversal ? RotateCcw : isPositive ? ArrowUpRight : ArrowDownRight;
  const tone = isReversal
    ? 'text-amber-600 dark:text-amber-400'
    : isPositive
      ? 'text-emerald-600 dark:text-emerald-400'
      : isNeutral
        ? 'text-muted-foreground'
        : 'text-rose-600 dark:text-rose-400';

  const label = isReversal
    ? 'Collection reversed'
    : isUpdate
      ? 'Collection updated'
      : row.change_source === 'collection_insert'
        ? 'Collection recorded'
        : row.change_source === 'backfill'
          ? 'Historical backfill'
          : 'Manual recompute';

  const date = new Date(row.created_at);
  const dateStr = date.toLocaleString(undefined, {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  const amount = Number(row.collection_amount ?? 0);
  const newLimit = Number(row.new_effective_limit_ugx ?? 0);

  return (
    <li className="py-2 flex items-start gap-2">
      <div className={cn('h-7 w-7 shrink-0 rounded-lg bg-muted/60 flex items-center justify-center', tone)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-foreground truncate">{label}</p>
          <p className={cn('text-[11px] font-bold tabular-nums shrink-0', tone)}>
            {delta > 0 ? '+' : ''}{formatUGX(delta)}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-[10px] text-muted-foreground">
            {amount > 0 && (
              <>Cash {formatUGX(amount)} <span className="mx-1">·</span></>
            )}
            {dateStr}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            New: <span className="font-semibold text-foreground">{formatUGX(newLimit)}</span>
          </p>
        </div>
        {row.collection_id && (
          <button
            type="button"
            onClick={() => onViewCollection(row.collection_id!)}
            className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            View collection
          </button>
        )}
      </div>
    </li>
  );
}

interface CollectionDetail {
  id: string;
  amount: number;
  created_at: string;
  payment_method: string;
  location_name: string | null;
  notes: string | null;
  momo_provider: string | null;
  momo_phone: string | null;
  momo_payer_name: string | null;
  momo_transaction_id: string | null;
  tenant_id: string;
  tenant_name?: string | null;
}

function CollectionDetailDialog({
  collectionId,
  onClose,
}: {
  collectionId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!collectionId) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: c } = await (supabase as any)
        .from('ln')
        .select('id, amount, created_at, payment_method, location_name, notes, momo_provider, momo_phone, momo_payer_name, momo_transaction_id, tenant_id')
        .eq('id', collectionId)
        .maybeSingle();
      if (cancelled) return;
      if (!c) { setData(null); setLoading(false); return; }
      const { data: tenant } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', c.tenant_id)
        .maybeSingle();
      if (cancelled) return;
      setData({ ...c, tenant_name: tenant?.full_name ?? null } as CollectionDetail);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [collectionId]);

  const open = !!collectionId;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Collection detail</DialogTitle>
          <DialogDescription>
            Field collection record linked to this vouch adjustment.
          </DialogDescription>
        </DialogHeader>
        {loading && <p className="text-sm text-muted-foreground py-4">Loading…</p>}
        {!loading && !data && (
          <p className="text-sm text-muted-foreground py-4">
            Collection not found or no longer accessible.
          </p>
        )}
        {!loading && data && (
          <dl className="text-sm space-y-2">
            <ReferenceRow id={data.id} />
            <Row label="Amount" value={formatUGX(Number(data.amount))} strong />
            <Row label="Date" value={new Date(data.created_at).toLocaleString()} />
            <Row label="Tenant" value={data.tenant_name || data.tenant_id.slice(0, 8)} />
            <Row label="Method" value={data.payment_method} />
            {data.location_name && <Row label="Location" value={data.location_name} />}
            {data.momo_provider && <Row label="MoMo provider" value={data.momo_provider} />}
            {data.momo_phone && <Row label="MoMo phone" value={data.momo_phone} />}
            {data.momo_payer_name && <Row label="Payer" value={data.momo_payer_name} />}
            {data.momo_transaction_id && <Row label="Txn ID" value={data.momo_transaction_id} />}
            {data.notes && <Row label="Notes" value={data.notes} />}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn('text-right break-all', strong ? 'font-bold text-foreground' : 'text-foreground')}>
        {value}
      </dd>
    </div>
  );
}

function ReferenceRow({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
      } else {
        const ta = document.createElement('textarea');
        ta.value = id;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success('Reference ID copied');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy reference ID');
    }
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">Reference ID</dt>
      <dd className="flex items-center gap-1.5 min-w-0">
        <code className="text-[11px] font-mono text-foreground truncate max-w-[180px]" title={id}>
          {id}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'h-6 px-1.5 rounded-md inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-colors shrink-0',
            copied
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
          title="Copy reference ID"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </dd>
    </div>
  );
}

export default AgentVouchHistoryFeed;