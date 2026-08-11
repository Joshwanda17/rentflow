import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FileDown, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type Period = 'daily' | 'weekly' | 'monthly' | 'weekend';

const OPTIONS: { key: Period; label: string; hint: string }[] = [
  { key: 'daily', label: 'Daily report', hint: 'Today only (EAT)' },
  { key: 'weekly', label: 'Weekly report', hint: 'Last 7 days' },
  { key: 'monthly', label: 'Monthly report', hint: 'Month to date' },
  { key: 'weekend', label: 'Weekend report', hint: 'Latest Sat - Sun' },
];

/** Exports the metrics-only Partner Ops PDF for a chosen reporting window. */
export function PartnerOpsReportExportButton() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<Period | null>(null);

  const download = async (period: Period) => {
    setBusy(period);
    try {
      const { data, error } = await supabase.functions.invoke('partner-ops-daily-report', {
        body: { period, pdf: true },
      });
      if (error) throw error;
      const blob = data instanceof Blob ? data : new Blob([data as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Welile_Partner_Ops_${period}_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast({ title: 'Report exported', description: `${period} partnership report downloaded.` });
    } catch (e: any) {
      toast({ title: 'Export failed', description: e?.message || 'Could not build the report.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={!!busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
          Export PDF
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">Partnership metrics report</DropdownMenuLabel>
        {OPTIONS.map(o => (
          <DropdownMenuItem key={o.key} onClick={() => download(o.key)} disabled={!!busy}>
            <div className="flex flex-col">
              <span className="text-sm">{o.label}</span>
              <span className="text-[10px] text-muted-foreground">{o.hint}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
