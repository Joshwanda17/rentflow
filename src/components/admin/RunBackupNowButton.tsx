import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Database, Loader2, ExternalLink, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BackupResult {
  signedUrl: string;
  fileName: string;
  sizeBytes: number;
  tableCount: number;
  rowCount: number;
  generatedAt: string;
}

export default function RunBackupNowButton() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<BackupResult | null>(null);

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    setElapsed(0);
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    try {
      const { data, error } = await supabase.functions.invoke('weekly-database-backup', {
        body: { manual: true },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Backup failed');
      setResult({
        signedUrl: data.signedUrl,
        fileName: data.fileName,
        sizeBytes: data.sizeBytes,
        tableCount: data.tableCount,
        rowCount: data.rowCount,
        generatedAt: data.generatedAt,
      });
      toast.success('Backup completed');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Backup failed');
    } finally {
      clearInterval(timer);
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3 p-4 rounded-xl border-2 bg-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
            <Database className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">Database Backup</p>
            <p className="text-xs text-muted-foreground">Run a fresh backup now (also runs weekly)</p>
          </div>
        </div>
        <Button onClick={handleRun} disabled={running} size="sm" className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          {running ? 'Running…' : 'Run backup now'}
        </Button>
      </div>

      {running && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Generating dump, uploading, and signing link… {elapsed}s elapsed (typical 30–90s)
        </div>
      )}

      {result && (
        <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            Backup ready
          </div>
          <div className="text-xs text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
            <span>File: <span className="font-mono">{result.fileName}</span></span>
            <span>Size: {(result.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
            <span>Tables: {result.tableCount}</span>
            <span>Rows: {result.rowCount.toLocaleString()}</span>
          </div>
          <a
            href={result.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            Download signed link (valid 7 days)
          </a>
        </div>
      )}
    </div>
  );
}