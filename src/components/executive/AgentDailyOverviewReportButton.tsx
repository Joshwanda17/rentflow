import { useState } from 'react';
import { FileBarChart, Loader2, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import {
  generateAgentDailyOverviewPdf,
  type AgentDailyOverviewRow,
} from '@/lib/agentDailyOverviewPdf';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const PRESETS: { label: string; offset: number }[] = [
  { label: 'Today', offset: 0 },
  { label: 'Yesterday', offset: 1 },
  { label: '2 days ago', offset: 2 },
  { label: '3 days ago', offset: 3 },
  { label: '7 days ago', offset: 7 },
];

// Unified active-book definition shared with activeTenantsReportPdf.ts.
// Keep these in sync so the two reports reconcile on Principal/Outstanding.
const ACTIVE_STATUSES = ['approved', 'disbursed', 'active', 'repaying', 'funded'];
const UNASSIGNED_AGENT_KEY = '__unassigned__';

/**
 * Paged select helper — Supabase caps single requests at 1000 rows. The
 * Agent Ops view spans every active rent plan and every collection logged
 * on the report date, both of which can exceed 1000 in production.
 */
async function fetchAll<T>(
  build: (from: number, to: number) => any,
): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let page = 0; page < 100; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await build(from, to);
    if (error) throw error;
    const rows = (data as T[]) || [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

export function AgentDailyOverviewReportButton() {
  const [busy, setBusy] = useState<number | null>(null);

  const run = async (offset: number) => {
    if (busy !== null) return;
    setBusy(offset);
    try {
      const reportDate = subDays(new Date(), offset);
      const dayStart = startOfDay(reportDate).toISOString();
      const dayEnd = endOfDay(reportDate).toISOString();

      // 1. All active rent plans (paged)
      const requests = await fetchAll<any>((from, to) =>
        supabase
          .from('rent_requests')
          .select('agent_id, tenant_id, rent_amount, daily_repayment, total_repayment, amount_repaid, status, registration_type, initial_outstanding_balance')
          .in('status', ACTIVE_STATUSES)
          .range(from, to),
      );

      // 2. Collections logged on the report date (paged)
      const collections = await fetchAll<any>((from, to) =>
        supabase
          .from('agent_collections')
          .select('agent_id, tenant_id, amount, created_at')
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd)
          .range(from, to),
      );

      // 3. Agent profile lookup
      const agentIds = Array.from(
        new Set([
          ...requests.map((r) => r.agent_id),
          ...collections.map((c) => c.agent_id),
        ].filter(Boolean)),
      );
      const profileMap = new Map<string, { full_name: string | null; phone: string | null }>();
      // Profiles fetched in chunks of 500 ids to stay within URL limits.
      const chunk = 500;
      for (let i = 0; i < agentIds.length; i += chunk) {
        const slice = agentIds.slice(i, i + chunk);
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', slice);
        if (error) throw error;
        (data || []).forEach((p: any) => profileMap.set(p.id, p));
      }

      // 4. Aggregate per agent
      type Agg = AgentDailyOverviewRow & { tenantSet: Set<string>; paidSet: Set<string> };
      const map = new Map<string, Agg>();
      const ensure = (agentId: string): Agg => {
        let a = map.get(agentId);
        if (!a) {
          const isUnassigned = agentId === UNASSIGNED_AGENT_KEY;
          const p = isUnassigned ? null : profileMap.get(agentId);
          a = {
            agentName: isUnassigned ? 'Unassigned' : (p?.full_name || 'Unknown agent'),
            agentPhone: isUnassigned ? '' : (p?.phone || ''),
            activeTenants: 0,
            expectedToday: 0,
            collectedToday: 0,
            tenantsPaidToday: 0,
            paymentsToday: 0,
            principalPaid: 0,
            outstanding: 0,
            tenantSet: new Set<string>(),
            paidSet: new Set<string>(),
          };
          map.set(agentId, a);
        }
        return a;
      };

      requests.forEach((r: any) => {
        const a = ensure(r.agent_id || UNASSIGNED_AGENT_KEY);
        // Outstanding-balance plans are legacy carry-over debts, not new
        // disbursements: principal = expected = initial_outstanding_balance,
        // and the 1.33× formula does not apply. Normal plans use the
        // canonical trigger-computed total_repayment.
        const isOB = r.registration_type === 'outstanding_balance';
        const principal = isOB
          ? Number(r.initial_outstanding_balance || 0)
          : Number(r.rent_amount || 0);
        const expected = isOB
          ? Number(r.initial_outstanding_balance || 0)
          : Number(r.total_repayment || 0);
        a.expectedToday += Number(r.daily_repayment || 0);
        a.principalPaid += principal;
        a.outstanding += Math.max(0, expected - Number(r.amount_repaid || 0));
        if (r.tenant_id) a.tenantSet.add(r.tenant_id);
      });

      collections.forEach((c: any) => {
        const a = ensure(c.agent_id || UNASSIGNED_AGENT_KEY);
        a.collectedToday += Number(c.amount || 0);
        a.paymentsToday += 1;
        if (c.tenant_id) a.paidSet.add(c.tenant_id);
      });

      const rows: AgentDailyOverviewRow[] = Array.from(map.values())
        .map((a) => ({
          agentName: a.agentName,
          agentPhone: a.agentPhone,
          activeTenants: a.tenantSet.size,
          expectedToday: a.expectedToday,
          collectedToday: a.collectedToday,
          tenantsPaidToday: a.paidSet.size,
          paymentsToday: a.paymentsToday,
          principalPaid: a.principalPaid,
          outstanding: a.outstanding,
        }))
        // Show best performers first: highest collection rate, then highest expected
        .sort((x, y) => {
          const rx = x.expectedToday > 0 ? x.collectedToday / x.expectedToday : 1;
          const ry = y.expectedToday > 0 ? y.collectedToday / y.expectedToday : 1;
          if (rx !== ry) return ry - rx;
          return y.expectedToday - x.expectedToday;
        });

      const blob = generateAgentDailyOverviewPdf({
        reportDate,
        generatedAt: new Date(),
        rows,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-daily-performance-${format(reportDate, 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success(`Daily performance report for ${format(reportDate, 'dd MMM yyyy')} downloaded`);
    } catch (err: any) {
      console.error('[AgentDailyOverviewReportButton]', err);
      toast.error(err?.message || 'Failed to generate report');
    } finally {
      setBusy(null);
    }
  };

  const isBusy = busy !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isBusy}
          className="h-9 px-3 rounded-full border border-border bg-card flex items-center gap-1.5 text-xs font-semibold text-foreground hover:border-primary/30 active:scale-95 transition-all touch-manipulation disabled:opacity-60 disabled:cursor-wait"
          aria-label="Download agent daily performance PDF"
        >
          {isBusy ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <FileBarChart className="h-4 w-4 text-primary" />
          )}
          <span className="hidden xs:inline">Daily PDF</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Agent daily performance
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PRESETS.map((p) => (
          <DropdownMenuItem
            key={p.offset}
            disabled={isBusy}
            onClick={() => run(p.offset)}
            className="gap-2 cursor-pointer"
          >
            {busy === p.offset ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <FileBarChart className="h-3.5 w-3.5 text-primary" />
            )}
            <span className="text-sm font-medium">{p.label}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {format(subDays(new Date(), p.offset), 'dd MMM')}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}