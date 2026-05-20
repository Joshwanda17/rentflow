import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

/**
 * Auditable export of bulk proxy-agent assignment history (audit_logs).
 * Filters: date range, from-agent search, to-agent search, action_type, role.
 * Outputs: CSV (download) or PDF (jspdf + autotable).
 * Each row carries the full from→to context already captured by ProxyAgentManager.bulkAssign.
 */

type ActionType = 'all' | 'proxy_bulk_link' | 'proxy_bulk_move';
type RoleFilter = 'all' | 'landlord' | 'supporter';

const ACTIONS: ActionType[] = ['proxy_bulk_link', 'proxy_bulk_move'];

function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProxyAuditExport() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [fromAgentQ, setFromAgentQ] = useState('');
  const [toAgentQ, setToAgentQ] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionType>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [exporting, setExporting] = useState(false);

  /** Pull bulk audit rows (preview window). Server-side date+action filter; client-side text filter. */
  const { data: rows = [], isFetching, refetch } = useQuery({
    queryKey: ['proxy-audit-export', dateFrom, dateTo, actionFilter],
    enabled: open,
    queryFn: async () => {
      let q = supabase
        .from('audit_logs')
        .select('id, created_at, action_type, record_id, user_id, metadata')
        .in('action_type', actionFilter === 'all' ? ACTIONS : [actionFilter])
        .order('created_at', { ascending: false })
        .limit(5000);
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00Z`);
      if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59Z`);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  /** Apply text + role filters client-side against metadata. */
  const filtered = useMemo(() => {
    const fq = fromAgentQ.trim().toLowerCase();
    const tq = toAgentQ.trim().toLowerCase();
    return rows.filter((r: any) => {
      const m = r.metadata || {};
      if (roleFilter !== 'all' && m.beneficiary_role !== roleFilter) return false;
      if (tq) {
        const t = (m.to_agent_name || '').toString().toLowerCase();
        if (!t.includes(tq)) return false;
      }
      if (fq) {
        const fromNames = Array.isArray(m.from_agents)
          ? m.from_agents.map((a: any) => (a.agent_name || '').toString().toLowerCase()).join(' | ')
          : '';
        if (!fromNames.includes(fq)) return false;
      }
      return true;
    });
  }, [rows, fromAgentQ, toAgentQ, roleFilter]);

  const flatRows = useMemo(() => filtered.map((r: any) => {
    const m = r.metadata || {};
    const fromAgents = Array.isArray(m.from_agents) && m.from_agents.length
      ? m.from_agents.map((a: any) => a.agent_name || a.agent_id || '?').join(' | ')
      : '—';
    return {
      timestamp: r.created_at,
      action: r.action_type,
      partner_name: m.beneficiary_name || '—',
      partner_phone: m.beneficiary_phone || '—',
      role: m.beneficiary_role || '—',
      from_agent: fromAgents,
      to_agent: m.to_agent_name || '—',
      managed: m.to_is_managed_account ? 'Yes' : 'No',
      reason: m.reason || '—',
      actor_id: r.user_id || '—',
      record_id: r.record_id || '—',
    };
  }), [filtered]);

  const exportCsv = () => {
    if (flatRows.length === 0) { toast({ title: 'Nothing to export' }); return; }
    const headers = ['Timestamp', 'Action', 'Partner', 'Phone', 'Role', 'From agent(s)', 'To agent', 'Managed', 'Reason', 'Actor ID', 'Record ID'];
    const lines = [headers.map(csvEscape).join(',')];
    flatRows.forEach((r) => {
      lines.push([
        r.timestamp, r.action, r.partner_name, r.partner_phone, r.role,
        r.from_agent, r.to_agent, r.managed, r.reason, r.actor_id, r.record_id,
      ].map(csvEscape).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `proxy-audit_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    toast({ title: 'CSV exported', description: `${flatRows.length} rows` });
  };

  const exportPdf = async () => {
    if (flatRows.length === 0) { toast({ title: 'Nothing to export' }); return; }
    setExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTableMod: any = await import('jspdf-autotable');
      const autoTable = autoTableMod.default || autoTableMod;
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;

      // Header band
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold').setFontSize(14);
      doc.text('WELILE', margin, 10);
      doc.setFont('helvetica', 'normal').setFontSize(10);
      doc.text('Proxy Agent Assignment — Audit Trail', margin, 16);
      doc.setFontSize(8);
      doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pageWidth - margin, 10, { align: 'right' });
      doc.text('Partner Ops / CFO Export — Confidential', pageWidth - margin, 16, { align: 'right' });

      // Criteria block
      doc.setTextColor(0, 0, 0).setFontSize(9);
      let y = 28;
      doc.setFont('helvetica', 'bold').text('Criteria', margin, y);
      doc.setFont('helvetica', 'normal');
      y += 5;
      const crit = [
        `Range: ${dateFrom || 'earliest'} → ${dateTo || 'latest'}`,
        `Action: ${actionFilter === 'all' ? 'All bulk actions' : actionFilter}`,
        `Role: ${roleFilter}`,
        `From agent contains: "${fromAgentQ || '—'}"`,
        `To agent contains: "${toAgentQ || '—'}"`,
        `Rows: ${flatRows.length}`,
      ];
      crit.forEach((c) => { doc.text(c, margin, y); y += 4; });
      y += 2;

      autoTable(doc, {
        startY: y,
        head: [['Timestamp', 'Action', 'Partner', 'Phone', 'Role', 'From agent(s)', 'To agent', 'Managed', 'Reason']],
        body: flatRows.map((r) => [
          format(parseISO(r.timestamp), 'dd MMM yy HH:mm'),
          r.action.replace('proxy_bulk_', ''),
          r.partner_name,
          r.partner_phone,
          r.role,
          r.from_agent,
          r.to_agent,
          r.managed,
          r.reason,
        ]),
        styles: { fontSize: 7, cellPadding: 1.2, overflow: 'linebreak' },
        headStyles: { fillColor: [15, 23, 42], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 26 },
          1: { cellWidth: 14 },
          2: { cellWidth: 32 },
          3: { cellWidth: 22 },
          4: { cellWidth: 18 },
          5: { cellWidth: 45 },
          6: { cellWidth: 32 },
          7: { cellWidth: 14 },
          8: { cellWidth: 'auto' },
        },
        margin: { left: margin, right: margin },
      });

      doc.save(`proxy-audit_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
      toast({ title: 'PDF exported', description: `${flatRows.length} rows` });
    } catch (e: any) {
      console.error('[ProxyAuditExport] PDF failed', e);
      toast({ title: 'PDF export failed', description: e.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Download className="h-4 w-4" /> Export Audit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export Bulk Assignment Audit Trail</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Pulls <code>audit_logs</code> rows written by bulk proxy assignments, with full from→to agent context.
          Filter, preview the row count, then download CSV or PDF.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">From date</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">To date</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Action</Label>
            <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as ActionType)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All bulk actions</SelectItem>
                <SelectItem value="proxy_bulk_link">New links</SelectItem>
                <SelectItem value="proxy_bulk_move">Moved from prior agent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Beneficiary role</Label>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="landlord">Landlord</SelectItem>
                <SelectItem value="supporter">Partner / Funder</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From agent (name contains)</Label>
            <Input
              placeholder="e.g. Mukasa"
              value={fromAgentQ}
              onChange={(e) => setFromAgentQ(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs">To agent (name contains)</Label>
            <Input
              placeholder="e.g. Namatovu"
              value={toAgentQ}
              onChange={(e) => setToAgentQ(e.target.value)}
              className="h-9"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
          <div className="text-xs flex items-center gap-2">
            {isFetching ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Loading audit rows…</>
            ) : (
              <>
                <Badge variant="secondary" className="tabular-nums">{flatRows.length}</Badge>
                <span className="text-muted-foreground">rows match these filters</span>
                {rows.length >= 5000 && (
                  <span className="text-amber-600 dark:text-amber-400">· capped at 5,000 — narrow date range for older history</span>
                )}
              </>
            )}
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            className="flex-1 gap-1.5"
            disabled={isFetching || flatRows.length === 0}
            onClick={exportCsv}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Download CSV
          </Button>
          <Button
            className="flex-1 gap-1.5"
            disabled={isFetching || exporting || flatRows.length === 0}
            onClick={exportPdf}
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Download PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}