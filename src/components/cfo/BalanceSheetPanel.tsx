import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { formatDynamic as formatUGX } from '@/lib/currencyFormat';
import { format, endOfDay } from 'date-fns';
import {
  AlertTriangle, Calendar, CheckCircle2, ChevronDown, ChevronRight,
  Download, FileSpreadsheet, Loader2, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

interface PositionLine {
  label: string;
  value: number;
  source: string;
}

interface ScheduleRow {
  ledger_scope: string;
  category: string;
  groups: number;
  net_debit_less_credit: number;
}

interface Reconciliation {
  suspense_amount: number;
  suspense_side: 'asset' | 'liability' | 'none';
  unresolved_groups: number;
  unresolved_absolute_amount: number;
  schedule: ScheduleRow[];
  excluded_classifications: { classification: string; legs: number; amount: number }[];
  memo_sub_ledgers: PositionLine[];
}

export interface StatementOfFinancialPosition {
  as_at: string;
  generated_at: string;
  currency: string;
  assets: {
    current: PositionLine[];
    non_current: PositionLine[];
    total_current: number;
    total_non_current: number;
    total: number;
  };
  liabilities: {
    current: PositionLine[];
    non_current: PositionLine[];
    total_current: number;
    total_non_current: number;
    total: number;
  };
  equity: {
    lines: PositionLine[];
    revenue_to_date: number;
    expenses_to_date: number;
    total: number;
  };
  trial_balance?: {
    total_debits: number;
    total_credits: number;
    difference: number;
    balanced: boolean;
  };
  reconciliation?: Reconciliation;
  balance_check: {
    total_assets: number;
    total_liabilities_and_equity: number;
    difference: number;
    balanced: boolean;
  };
}

function LineRow({ line, showSources }: { line: PositionLine; showSources: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/40 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between gap-3 py-1.5 text-left"
      >
        <span className="flex items-start gap-1 min-w-0 text-xs text-muted-foreground">
          {showSources
            ? (open ? <ChevronDown className="h-3 w-3 mt-0.5 shrink-0" /> : <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />)
            : null}
          <span className="truncate">{line.label}</span>
        </span>
        <span className={cn('font-mono text-xs shrink-0 text-right', line.value < 0 ? 'text-destructive' : 'text-foreground')}>
          {line.value < 0 ? `(${formatUGX(Math.abs(line.value))})` : formatUGX(line.value)}
        </span>
      </button>
      {showSources && open && (
        <p className="pb-2 pl-4 text-[10px] text-muted-foreground">Derived from {line.source}</p>
      )}
    </div>
  );
}

function TotalRow({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className={cn(
      'flex items-center justify-between gap-3 py-2 border-t',
      emphasis ? 'border-primary/50 mt-1' : 'border-border',
    )}>
      <span className={cn('text-xs', emphasis ? 'font-bold uppercase tracking-wide' : 'font-semibold')}>{label}</span>
      <span className={cn('font-mono', emphasis ? 'text-sm font-bold' : 'text-xs font-semibold')}>
        {value < 0 ? `(${formatUGX(Math.abs(value))})` : formatUGX(value)}
      </span>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-primary mt-4 mb-1">{children}</p>
  );
}

export default function BalanceSheetPanel() {
  const [asAt, setAsAt] = useState<Date>(new Date());
  const [data, setData] = useState<StatementOfFinancialPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (date: Date) => {
    setLoading(true);
    try {
      const { data: res, error } = await (supabase as any).rpc('get_statement_of_financial_position', {
        p_as_at: endOfDay(date).toISOString(),
      });
      if (error) throw error;
      setData(res as StatementOfFinancialPosition);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to generate the statement of financial position');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(asAt); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const title = `WELILE — BALANCE SHEET — As at ${format(asAt, 'dd MMMM yyyy')}`;

  const exportCSV = () => {
    if (!data) return;
    const rows: (string | number)[][] = [[title], []];
    rows.push(['ASSETS', '']);
    rows.push(['Current Assets', '']);
    data.assets.current.forEach(l => rows.push([l.label, l.value]));
    rows.push(['Total Current Assets', data.assets.total_current]);
    rows.push(['Non-Current Assets', '']);
    data.assets.non_current.forEach(l => rows.push([l.label, l.value]));
    rows.push(['Total Non-Current Assets', data.assets.total_non_current]);
    rows.push(['TOTAL ASSETS', data.assets.total]);
    rows.push([]);
    rows.push(['LIABILITIES', '']);
    rows.push(['Current Liabilities', '']);
    data.liabilities.current.forEach(l => rows.push([l.label, l.value]));
    rows.push(['Total Current Liabilities', data.liabilities.total_current]);
    rows.push(['Non-Current Liabilities', '']);
    data.liabilities.non_current.forEach(l => rows.push([l.label, l.value]));
    rows.push(['Total Non-Current Liabilities', data.liabilities.total_non_current]);
    rows.push(['TOTAL LIABILITIES', data.liabilities.total]);
    rows.push([]);
    rows.push(['EQUITY', '']);
    data.equity.lines.forEach(l => rows.push([l.label, l.value]));
    rows.push(['TOTAL EQUITY', data.equity.total]);
    rows.push([]);
    rows.push(['TOTAL LIABILITIES AND EQUITY', data.balance_check.total_liabilities_and_equity]);
    rows.push(['Balance check difference', data.balance_check.difference]);
    rows.push(['Balanced', data.balance_check.balanced ? 'YES' : 'NO']);

    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `welile-statement-of-financial-position-${format(asAt, 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const margin = 14;
      let y = 20;

      pdf.setFillColor(37, 99, 235);
      pdf.rect(0, 0, pw, 12, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('WELILE TECHNOLOGIES LIMITED', margin, 8);
      pdf.text('CONFIDENTIAL', pw - margin - 25, 8);

      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(13);
      pdf.text('BALANCE SHEET', margin, y);
      y += 6;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 100, 100);
      pdf.text(`As at ${format(asAt, 'dd MMMM yyyy')}`, margin, y);
      pdf.text(`Generated: ${format(new Date(data.generated_at), 'dd MMM yyyy, HH:mm')}`, pw - margin - 60, y);
      y += 3;
      pdf.setDrawColor(220, 220, 220);
      pdf.line(margin, y, pw - margin, y);
      y += 6;

      const heading = (t: string) => {
        if (y > ph - 30) { pdf.addPage(); y = 20; }
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(37, 99, 235);
        pdf.text(t.toUpperCase(), margin, y);
        pdf.setTextColor(0, 0, 0);
        y += 5;
      };
      const row = (label: string, value: number, bold = false, indent = true) => {
        if (y > ph - 20) { pdf.addPage(); y = 20; }
        pdf.setFontSize(bold ? 9 : 8);
        pdf.setFont('helvetica', bold ? 'bold' : 'normal');
        pdf.setTextColor(bold ? 0 : 80, bold ? 0 : 80, bold ? 0 : 80);
        pdf.text(label, indent && !bold ? margin + 5 : margin, y);
        const str = value < 0 ? `(${formatUGX(Math.abs(value))})` : formatUGX(value);
        pdf.text(str, pw - margin, y, { align: 'right' });
        if (bold) { pdf.setDrawColor(200, 200, 200); pdf.line(margin, y + 1.5, pw - margin, y + 1.5); }
        y += bold ? 7 : 5;
      };

      heading('Assets — Current');
      data.assets.current.forEach(l => row(l.label, l.value));
      row('Total Current Assets', data.assets.total_current, true);
      heading('Assets — Non-Current');
      data.assets.non_current.forEach(l => row(l.label, l.value));
      row('Total Non-Current Assets', data.assets.total_non_current, true);
      row('TOTAL ASSETS', data.assets.total, true);

      heading('Liabilities — Current');
      data.liabilities.current.forEach(l => row(l.label, l.value));
      row('Total Current Liabilities', data.liabilities.total_current, true);
      heading('Liabilities — Non-Current');
      data.liabilities.non_current.forEach(l => row(l.label, l.value));
      row('Total Non-Current Liabilities', data.liabilities.total_non_current, true);
      row('TOTAL LIABILITIES', data.liabilities.total, true);

      heading('Equity');
      data.equity.lines.forEach(l => row(l.label, l.value));
      row('TOTAL EQUITY', data.equity.total, true);

      heading('Balance Check');
      row('Total Assets', data.balance_check.total_assets);
      row('Total Liabilities and Equity', data.balance_check.total_liabilities_and_equity);
      row('Difference', data.balance_check.difference, true);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...(data.balance_check.balanced ? [22, 163, 74] : [220, 38, 38]) as [number, number, number]);
      pdf.text(
        data.balance_check.balanced
          ? 'BALANCED — Total Assets = Total Liabilities + Equity'
          : 'NOT BALANCED — difference shown above; no figures have been adjusted',
        margin, y,
      );

      pdf.setFillColor(37, 99, 235);
      pdf.rect(0, ph - 8, pw, 8, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(7);
      pdf.text('Welile Technologies Limited — Confidential Financial Report — All figures in UGX', pw / 2, ph - 3, { align: 'center' });

      const fileName = `welile-statement-of-financial-position-${format(asAt, 'yyyy-MM-dd')}.pdf`;
      const blob = pdf.output('blob');
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Welile Balance Sheet', files: [file] });
      } else {
        pdf.save(fileName);
        toast.success('PDF downloaded');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error('PDF export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
              <Calendar className="h-3.5 w-3.5" />
              As at {format(asAt, 'dd MMM yyyy')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 z-[200]" align="start">
            <CalendarPicker
              mode="single"
              selected={asAt}
              onSelect={(d) => { if (d) { setAsAt(d); load(d); } }}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        <Button size="sm" className="h-7 text-xs gap-1" onClick={() => load(asAt)} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {data ? 'Refresh' : 'Generate'}
        </Button>
        <Button
          size="sm"
          variant={showSources ? 'default' : 'outline'}
          className="h-7 text-xs"
          onClick={() => setShowSources(s => !s)}
        >
          {showSources ? 'Hide account detail' : 'Show account detail'}
        </Button>
      </div>

      {loading && !data && (
        <div className="py-10 text-center text-muted-foreground text-xs">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          Building the statement from the general ledger…
        </div>
      )}

      {data && (
        <>
          <div className="text-center pb-2 border-b border-border">
            <p className="text-[11px] font-bold uppercase tracking-widest">Welile — Balance Sheet</p>
            <p className="text-[10px] text-muted-foreground">Balance Sheet — As at {format(asAt, 'dd MMMM yyyy')} · All figures in {data.currency}</p>
          </div>

          <div
            className={cn(
              'rounded-lg border p-3 flex items-start gap-2',
              data.balance_check.balanced ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5',
            )}
          >
            {data.balance_check.balanced
              ? <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
              : <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
            <div className="min-w-0 space-y-1">
              <p className={cn('text-xs font-semibold', data.balance_check.balanced ? 'text-success' : 'text-destructive')}>
                {data.balance_check.balanced ? 'Balanced — Total Assets = Total Liabilities + Equity' : 'Not balanced — difference reported, nothing adjusted'}
              </p>
              <p className="text-[10px] font-mono text-muted-foreground break-words">
                {formatUGX(data.balance_check.total_assets)} vs {formatUGX(data.balance_check.total_liabilities_and_equity)} · Difference {formatUGX(data.balance_check.difference)}
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <Badge variant="outline" className="text-[10px]">Assets</Badge>
              <SectionHeading>Current Assets</SectionHeading>
              <div>{data.assets.current.map(l => <LineRow key={l.label} line={l} showSources={showSources} />)}</div>
              <TotalRow label="Total Current Assets" value={data.assets.total_current} />
              <SectionHeading>Non-Current Assets</SectionHeading>
              <div>{data.assets.non_current.map(l => <LineRow key={l.label} line={l} showSources={showSources} />)}</div>
              <TotalRow label="Total Non-Current Assets" value={data.assets.total_non_current} />
              <TotalRow label="Total Assets" value={data.assets.total} emphasis />
            </div>

            <div>
              <Badge variant="outline" className="text-[10px]">Liabilities & Equity</Badge>
              <SectionHeading>Current Liabilities</SectionHeading>
              <div>{data.liabilities.current.map(l => <LineRow key={l.label} line={l} showSources={showSources} />)}</div>
              <TotalRow label="Total Current Liabilities" value={data.liabilities.total_current} />
              <SectionHeading>Non-Current Liabilities</SectionHeading>
              <div>{data.liabilities.non_current.map(l => <LineRow key={l.label} line={l} showSources={showSources} />)}</div>
              <TotalRow label="Total Non-Current Liabilities" value={data.liabilities.total_non_current} />
              <TotalRow label="Total Liabilities" value={data.liabilities.total} />
              <SectionHeading>Equity</SectionHeading>
              <div>{data.equity.lines.map(l => <LineRow key={l.label} line={l} showSources={showSources} />)}</div>
              <TotalRow label="Total Equity" value={data.equity.total} />
              <TotalRow label="Total Liabilities and Equity" value={data.balance_check.total_liabilities_and_equity} emphasis />
            </div>
          </div>

          <div className="flex gap-2 pt-3 border-t border-border">
            <Button variant="outline" size="sm" className="flex-1 gap-2 text-xs" onClick={exportCSV}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-2 text-xs" onClick={exportPDF} disabled={exporting}>
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              PDF / Print
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground text-center">
            Every figure is generated live from the general ledger and existing operational records. No values are hard-coded and nothing is adjusted to force a balance.
          </p>
        </>
      )}
    </div>
  );
}