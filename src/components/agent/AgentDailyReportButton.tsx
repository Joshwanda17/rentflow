import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import {
  generateAgentDailyPerformancePdf,
  type AgentDailyTenantRow,
  type AgentDailyCollectionRow,
} from '@/lib/agentDailyPerformancePdf';

interface Props {
  agentId: string;
  agentName: string;
  agentPhone: string;
}

const PRESETS: { label: string; offset: number }[] = [
  { label: 'Today', offset: 0 },
  { label: 'Yesterday', offset: 1 },
  { label: '2 days ago', offset: 2 },
  { label: '3 days ago', offset: 3 },
  { label: '7 days ago', offset: 7 },
];

export function AgentDailyReportButton({ agentId, agentName, agentPhone }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const run = async (offset: number) => {
    if (busy !== null) return;
    setBusy(offset);
    try {
      const reportDate = subDays(new Date(), offset);
      const dayStart = startOfDay(reportDate).toISOString();
      const dayEnd = endOfDay(reportDate).toISOString();

      // Active rent requests for this agent
      const { data: requests, error: rrErr } = await supabase
        .from('rent_requests')
        .select('id, tenant_id, rent_amount, daily_repayment, total_repayment, amount_repaid, status')
        .eq('agent_id', agentId)
        .in('status', ['approved', 'disbursed', 'active', 'repaying', 'funded']);
      if (rrErr) throw rrErr;
      const reqs = requests || [];

      const tenantIds = Array.from(new Set(reqs.map((r: any) => r.tenant_id).filter(Boolean)));
      const profileMap = new Map<string, { full_name: string | null; phone: string | null }>();
      if (tenantIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', tenantIds);
        (profiles || []).forEach((p: any) => profileMap.set(p.id, p));
      }

      // Collections logged on report date
      const { data: collections, error: cErr } = await supabase
        .from('agent_collections')
        .select('id, tenant_id, amount, payment_method, tracking_id, momo_transaction_id, created_at')
        .eq('agent_id', agentId)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)
        .order('created_at', { ascending: true });
      if (cErr) throw cErr;
      const cols = collections || [];

      // Per-tenant collected sums
      const collectedByTenant = new Map<string, number>();
      cols.forEach((c: any) => {
        const cur = collectedByTenant.get(c.tenant_id) || 0;
        collectedByTenant.set(c.tenant_id, cur + Number(c.amount || 0));
      });

      // Group rent_requests by tenant (sum across all active plans for the tenant)
      const tenantAgg = new Map<string, AgentDailyTenantRow>();
      reqs.forEach((r: any) => {
        const p = profileMap.get(r.tenant_id);
        const existing = tenantAgg.get(r.tenant_id);
        const row: AgentDailyTenantRow = existing || {
          tenantName: p?.full_name || 'Tenant',
          tenantPhone: p?.phone || '',
          rentPrincipal: 0,
          totalRepayment: 0,
          amountRepaid: 0,
          dailyExpected: 0,
          collectedToday: collectedByTenant.get(r.tenant_id) || 0,
          paidToday: (collectedByTenant.get(r.tenant_id) || 0) > 0,
        };
        row.rentPrincipal += Number(r.rent_amount || 0);
        row.totalRepayment += Number(r.total_repayment || 0);
        row.amountRepaid += Number(r.amount_repaid || 0);
        row.dailyExpected += Number(r.daily_repayment || 0);
        tenantAgg.set(r.tenant_id, row);
      });

      const rows: AgentDailyTenantRow[] = Array.from(tenantAgg.values()).sort((a, b) => {
        // Pending first, then highest expected
        if (a.paidToday !== b.paidToday) return a.paidToday ? 1 : -1;
        return b.dailyExpected - a.dailyExpected;
      });

      const collectionRows: AgentDailyCollectionRow[] = cols.map((c: any) => {
        const p = profileMap.get(c.tenant_id);
        return {
          time: format(new Date(c.created_at), 'HH:mm'),
          tenantName: p?.full_name || 'Tenant',
          amount: Number(c.amount || 0),
          method: c.payment_method || '—',
          reference: c.momo_transaction_id || c.tracking_id || '—',
        };
      });

      const blob = generateAgentDailyPerformancePdf({
        agentName,
        agentPhone,
        reportDate,
        generatedAt: new Date(),
        rows,
        collections: collectionRows,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-daily-${format(reportDate, 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success(`Daily report for ${format(reportDate, 'dd MMM yyyy')} downloaded`);
      setOpen(false);
    } catch (err: any) {
      console.error('[AgentDailyReportButton]', err);
      toast.error(err?.message || 'Failed to generate report');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left touch-manipulation min-h-[52px] hover:bg-accent/40 transition-colors"
        style={{ WebkitTapHighlightColor: 'transparent' }}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
            <FileText className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-foreground truncate">Daily performance report</div>
            <div className="text-[11px] text-muted-foreground truncate">
              Per-tenant PDF: expected vs collected, principal & outstanding
            </div>
          </div>
        </div>
        <span className="text-xs font-medium text-primary shrink-0">{open ? 'Close' : 'Download →'}</span>
      </button>
      {open && (
        <div className="border-t border-border/60 bg-muted/30 p-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active = busy === p.offset;
            return (
              <button
                key={p.offset}
                type="button"
                disabled={busy !== null}
                onClick={() => run(p.offset)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-xs font-semibold text-foreground hover:bg-accent/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[40px]"
              >
                {active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                {p.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}