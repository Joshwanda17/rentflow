import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle,
  XCircle, ArrowLeft, ArrowRight, Users, Briefcase, ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── Types ─── */
interface ParsedRow {
  rowNum: number;
  partnerName: string;
  phone: string;
  email: string;
  investmentAmount: number;
  roiPercentage: number;
  durationMonths: number;
  roiMode: string;
  errors: string[];
}

interface ImportGroup {
  partnerName: string;
  phone: string;
  email: string;
  portfolios: {
    amount: number;
    roiPercentage: number;
    durationMonths: number;
    roiMode: string;
  }[];
  isDuplicate: boolean;
  errors: string[];
}

interface ImportResult {
  partnersCreated: number;
  portfoliosCreated: number;
  skippedDuplicates: number;
  errors: { partner: string; error: string }[];
}

type Step = 'upload' | 'preview' | 'confirm' | 'processing' | 'results';

/* ─── Constants ─── */
const VALID_ROI_MODES = ['monthly_payout', 'monthly_compounding'];
function downloadTemplate() {
  const headers = ['Partner Name', 'Phone', 'Email', 'Investment Amount', 'ROI %', 'Duration (Months)', 'ROI Mode'];
  const samples = [
    ['Ssenkaali Pius', '0700123456', 'pius@example.com', 500000, 15, 12, 'monthly_compounding'],
    ['Ssenkaali Pius', '0700123456', 'pius@example.com', 300000, 15, 12, 'monthly_payout'],
    ['Namukisha Esther', '0754155112', 'esther@example.com', 1000000, 15, 12, 'monthly_compounding'],
    ['John Doe', '0771234567', '', 200000, 15, 6, 'monthly_payout'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...samples]);
  ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 18 }, { wch: 8 }, { wch: 18 }, { wch: 22 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Partners');
  XLSX.writeFile(wb, 'partner-import-template.xlsx');
}

/* ─── Helpers ─── */
function normalizePhone(raw: string): string {
  const cleaned = String(raw || '').replace(/[\s\-\+]/g, '');
  if (cleaned.startsWith('256') && cleaned.length === 12) return '0' + cleaned.slice(3);
  if (cleaned.startsWith('+256')) return '0' + cleaned.slice(4);
  return cleaned;
}

function validateRow(row: any, rowNum: number): ParsedRow {
  const errors: string[] = [];
  const name = String(row['Partner Name'] || '').trim();
  const phone = normalizePhone(row['Phone'] || '');
  const email = String(row['Email'] || '').trim();
  const amount = Number(row['Investment Amount']);
  const roi = Number(row['ROI %']);
  const duration = Number(row['Duration (Months)']);
  const roiMode = String(row['ROI Mode'] || 'monthly_payout').trim().toLowerCase().replace(/\s+/g, '_');

  if (!name) errors.push('Missing partner name');
  if (!phone || phone.length < 10) errors.push('Invalid phone');
  if (isNaN(amount) || amount < 50000) errors.push('Amount must be ≥ 50,000');
  if (isNaN(roi) || roi < 1 || roi > 30) errors.push('ROI must be 1-30%');
  if (isNaN(duration) || duration < 1 || duration > 36) errors.push('Duration must be 1-36 months');
  if (!VALID_ROI_MODES.includes(roiMode)) errors.push(`ROI mode must be: ${VALID_ROI_MODES.join(' or ')}`);

  return { rowNum, partnerName: name, phone, email, investmentAmount: amount, roiPercentage: roi, durationMonths: duration, roiMode, errors };
}

function groupByPartner(rows: ParsedRow[]): ImportGroup[] {
  const map = new Map<string, ImportGroup>();
  for (const row of rows) {
    const key = row.phone;
    if (!map.has(key)) {
      map.set(key, {
        partnerName: row.partnerName,
        phone: row.phone,
        email: row.email,
        portfolios: [],
        isDuplicate: false,
        errors: [...row.errors.filter(e => e.includes('name') || e.includes('phone'))],
      });
    }
    const group = map.get(key)!;
    if (row.errors.length === 0 || row.errors.every(e => !e.includes('name') && !e.includes('phone'))) {
      group.portfolios.push({
        amount: row.investmentAmount,
        roiPercentage: row.roiPercentage,
        durationMonths: row.durationMonths,
        roiMode: row.roiMode,
      });
    }
    // Collect portfolio-level errors
    const portfolioErrors = row.errors.filter(e => !e.includes('name') && !e.includes('phone'));
    if (portfolioErrors.length > 0) {
      group.errors.push(`Row ${row.rowNum}: ${portfolioErrors.join(', ')}`);
    }
  }
  return Array.from(map.values());
}

/* ─── Component ─── */
interface PartnerImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function PartnerImportDialog({ open, onOpenChange, onSuccess }: PartnerImportDialogProps) {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [groups, setGroups] = useState<ImportGroup[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setStep('upload');
    setFileName('');
    setParsedRows([]);
    setGroups([]);
    setImportResult(null);
    onOpenChange(false);
  };

  /* ── File Parse ── */
  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json(ws);

      if (jsonRows.length === 0) {
        toast.error('The file has no data rows');
        return;
      }
      if (jsonRows.length > 500) {
        toast.error('Maximum 500 rows per import');
        return;
      }

      const validated = jsonRows.map((row, i) => validateRow(row, i + 2)); // +2 for header offset
      setParsedRows(validated);
      setFileName(file.name);

      // Check duplicates against existing profiles
      const phones = [...new Set(validated.map(r => r.phone).filter(Boolean))];
      const { data: existingProfiles } = await supabase
        .from('profiles')
        .select('phone')
        .in('phone', phones);

      const existingPhones = new Set((existingProfiles || []).map(p => p.phone));
      const grouped = groupByPartner(validated);
      grouped.forEach(g => {
        if (existingPhones.has(g.phone)) g.isDuplicate = true;
      });

      setGroups(grouped);
      setStep('preview');
    } catch (e: any) {
      toast.error('Failed to parse file: ' + (e.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Stats ── */
  const validGroups = groups.filter(g => !g.isDuplicate && g.errors.length === 0 && g.portfolios.length > 0);
  const duplicateCount = groups.filter(g => g.isDuplicate).length;
  const errorGroups = groups.filter(g => !g.isDuplicate && (g.errors.length > 0 || g.portfolios.length === 0));
  const totalPortfolios = validGroups.reduce((s, g) => s + g.portfolios.length, 0);
  const totalAmount = validGroups.reduce((s, g) => s + g.portfolios.reduce((ps, p) => ps + p.amount, 0), 0);

  /* ── Import ── */
  const handleImport = async () => {
    setStep('processing');
    setLoading(true);

    try {
      const payload = validGroups.map(g => ({
        partner_name: g.partnerName,
        phone: g.phone,
        email: g.email || null,
        portfolios: g.portfolios,
      }));

      const { data, error } = await supabase.functions.invoke('import-partners', {
        body: { partners: payload },
      });

      if (error) {
        const errMsg = error?.context
          ? await error.context.json().then((r: any) => r.error).catch(() => error.message)
          : error.message;
        throw new Error(errMsg || 'Import failed');
      }

      setImportResult(data);
      setStep('results');
      toast.success(`Import complete! ${data.partnersCreated} partners, ${data.portfoliosCreated} portfolios created.`);
      onSuccess?.();
    } catch (e: any) {
      toast.error(e.message || 'Import failed');
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import Partners & Portfolios
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload an Excel file with partner and portfolio data'}
            {step === 'preview' && `Reviewing ${fileName}`}
            {step === 'confirm' && 'Confirm import details before processing'}
            {step === 'processing' && 'Creating accounts and portfolios…'}
            {step === 'results' && 'Import completed'}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step: Upload ── */}
        {step === 'upload' && (
          <div className="space-y-4 py-2">
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => document.getElementById('import-file-input')?.click()}
            >
              {loading ? (
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="font-semibold text-sm">Drop Excel file here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports .xlsx files, max 500 rows</p>
                </>
              )}
              <input
                id="import-file-input"
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            <div className="flex items-center justify-center">
              <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium">
                <Download className="h-3.5 w-3.5" /> Download Template
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Preview ── */}
        {step === 'preview' && (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard icon={<Users className="h-4 w-4" />} label="New Partners" value={validGroups.length} color="text-primary" />
              <StatCard icon={<Briefcase className="h-4 w-4" />} label="Portfolios" value={totalPortfolios} color="text-emerald-600" />
              <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Duplicates" value={duplicateCount} color="text-amber-600" />
              <StatCard icon={<XCircle className="h-4 w-4" />} label="Errors" value={errorGroups.length} color="text-destructive" />
            </div>

            {/* Partner Groups */}
            <div className="max-h-[300px] overflow-y-auto space-y-2 rounded-lg border border-border p-2">
              {groups.map((g, i) => (
                <div key={i} className={cn(
                  'rounded-lg p-3 text-xs border',
                  g.isDuplicate ? 'bg-amber-500/5 border-amber-500/20' :
                  g.errors.length > 0 ? 'bg-destructive/5 border-destructive/20' :
                  'bg-card border-border'
                )}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {g.isDuplicate ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" /> :
                       g.errors.length > 0 ? <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" /> :
                       <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                      <span className="font-semibold truncate">{g.partnerName}</span>
                      <span className="text-muted-foreground">{g.phone}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px]">{g.portfolios.length} portfolio{g.portfolios.length !== 1 ? 's' : ''}</Badge>
                      {g.isDuplicate && <Badge variant="secondary" className="text-[9px] bg-amber-500/15 text-amber-700">Duplicate</Badge>}
                    </div>
                  </div>
                  {g.portfolios.length > 0 && (
                    <div className="mt-1.5 pl-5 space-y-0.5 text-muted-foreground">
                      {g.portfolios.map((p, j) => (
                        <div key={j} className="flex gap-3">
                          <span>{formatUGX(p.amount)}</span>
                          <span>{p.roiPercentage}% ROI</span>
                          <span>{p.durationMonths}mo</span>
                          <span className="capitalize">{p.roiMode.replace('_', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {g.errors.length > 0 && (
                    <div className="mt-1.5 pl-5 text-destructive">
                      {g.errors.map((e, j) => <p key={j}>{e}</p>)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('upload')} className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
              <Button onClick={() => setStep('confirm')} disabled={validGroups.length === 0} className="flex-1 gap-1.5">
                Review & Confirm <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: Confirm ── */}
        {step === 'confirm' && (
          <div className="space-y-4 py-2">
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-sm">COO Confirmation Required</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                You are about to create <strong>{validGroups.length} partner accounts</strong> with{' '}
                <strong>{totalPortfolios} investment portfolios</strong> totaling{' '}
                <strong>{formatUGX(totalAmount)}</strong>.
              </p>
              {duplicateCount > 0 && (
                <p className="text-xs text-amber-700">⚠ {duplicateCount} duplicate(s) will be skipped.</p>
              )}
              {errorGroups.length > 0 && (
                <p className="text-xs text-destructive">⚠ {errorGroups.length} partner(s) with errors will be skipped.</p>
              )}
              <Separator />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Full user accounts will be created (can log in)</p>
                <p>• Portfolios start with <strong>pending_approval</strong> status</p>
                <p>• No wallet deductions — portfolios are record-only until activated</p>
                <p>• Each partner gets a unique activation token</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('preview')} className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
              <Button onClick={handleImport} disabled={loading} className="flex-1 gap-1.5">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldCheck className="h-4 w-4" /> Confirm & Import</>}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: Processing ── */}
        {step === 'processing' && (
          <div className="text-center py-12 space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-sm font-semibold">Creating accounts and portfolios…</p>
            <p className="text-xs text-muted-foreground">This may take a moment for large imports.</p>
          </div>
        )}

        {/* ── Step: Results ── */}
        {step === 'results' && importResult && (
          <div className="space-y-4 py-2">
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto bg-emerald-500/15 rounded-full flex items-center justify-center mb-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold">Import Complete!</h3>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <StatCard icon={<Users className="h-4 w-4" />} label="Partners Created" value={importResult.partnersCreated} color="text-primary" />
              <StatCard icon={<Briefcase className="h-4 w-4" />} label="Portfolios Created" value={importResult.portfoliosCreated} color="text-emerald-600" />
              <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Skipped" value={importResult.skippedDuplicates} color="text-amber-600" />
            </div>

            {importResult.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 max-h-[150px] overflow-y-auto">
                <p className="text-xs font-semibold text-destructive mb-1.5">Errors:</p>
                {importResult.errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive/80">{e.partner}: {e.error}</p>
                ))}
              </div>
            )}

            <Button onClick={handleClose} className="w-full">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Stat Card ── */
function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <div className={cn('mx-auto mb-1', color)}>{icon}</div>
      <p className="text-lg font-black tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
