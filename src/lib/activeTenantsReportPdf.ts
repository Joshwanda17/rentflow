import { format } from 'date-fns';
import { generateTenantOpsExtractPdf, downloadPdfBlob } from './generateTenantOpsExtractPdf';
import { supabase } from '@/integrations/supabase/client';

interface ActiveTenantRow {
  tenant_name: string;
  tenant_phone: string;
  agent_name: string;
  agent_phone: string;
  principal: number;
  expected: number;
  repaid: number;
  outstanding: number;
  start_date: string | null;
  end_date: string | null;
}

const ACTIVE_STATUSES = ['funded', 'disbursed', 'repaying', 'active', 'approved'];

async function fetchAllRentRequests() {
  const PAGE = 1000;
  let from = 0;
  const all: any[] = [];
  while (true) {
    const { data, error } = await supabase
      .from('rent_requests')
      .select('id, tenant_id, agent_id, assigned_agent_id, rent_amount, total_repayment, amount_repaid, disbursed_at, duration_days, status')
      .in('status', ACTIVE_STATUSES)
      .not('disbursed_at', 'is', null)
      .order('disbursed_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function fetchProfilesMap(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, { name: string; phone: string }>();
  const PAGE = 500;
  for (let i = 0; i < unique.length; i += PAGE) {
    const slice = unique.slice(i, i + PAGE);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', slice);
    if (error) throw error;
    (data ?? []).forEach((p: any) => {
      map.set(p.id, { name: p.full_name ?? '—', phone: p.phone ?? '—' });
    });
  }
  return map;
}

export async function generateAndDownloadActiveTenantsPdf() {
  const requests = await fetchAllRentRequests();

  const personIds: string[] = [];
  requests.forEach((r) => {
    if (r.tenant_id) personIds.push(r.tenant_id);
    const aid = r.assigned_agent_id || r.agent_id;
    if (aid) personIds.push(aid);
  });
  const profiles = await fetchProfilesMap(personIds);

  const rows: ActiveTenantRow[] = requests.map((r) => {
    const tenant = profiles.get(r.tenant_id) ?? { name: '—', phone: '—' };
    const agentId = r.assigned_agent_id || r.agent_id;
    const agent = (agentId && profiles.get(agentId)) || { name: 'Unassigned', phone: '—' };
    const principal = Number(r.rent_amount ?? 0);
    const expected = Number(r.total_repayment ?? 0);
    const repaid = Number(r.amount_repaid ?? 0);
    const outstanding = Math.max(0, expected - repaid);
    let endDate: string | null = null;
    if (r.disbursed_at && r.duration_days) {
      const d = new Date(r.disbursed_at);
      d.setDate(d.getDate() + Number(r.duration_days));
      endDate = d.toISOString();
    }
    return {
      tenant_name: tenant.name,
      tenant_phone: tenant.phone,
      agent_name: agent.name,
      agent_phone: agent.phone,
      principal,
      expected,
      repaid,
      outstanding,
      start_date: r.disbursed_at,
      end_date: endDate,
    };
  });

  rows.sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''));

  const totalPrincipal = rows.reduce((s, r) => s + r.principal, 0);
  const totalExpected = rows.reduce((s, r) => s + r.expected, 0);
  const totalRepaid = rows.reduce((s, r) => s + r.repaid, 0);
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  const collectionRate = totalExpected > 0 ? Math.round((totalRepaid / totalExpected) * 100) : 0;

  const tableRows = rows.map((r, i) => [
    i + 1,
    r.tenant_name,
    r.tenant_phone,
    `${r.agent_name}\n${r.agent_phone}`,
    r.principal,
    r.expected,
    r.outstanding,
    r.start_date,
    r.end_date,
  ]);

  const blob = generateTenantOpsExtractPdf({
    title: 'Active Tenants — Rent Plan Repayments',
    subtitle: 'Snapshot of all tenants currently repaying a rent plan, with their assigned agent and outstanding balance.',
    kpis: [
      { label: 'Active Tenants', value: String(rows.length) },
      { label: 'Principal Disbursed', value: `UGX ${Math.round(totalPrincipal).toLocaleString()}` },
      { label: 'Total Expected', value: `UGX ${Math.round(totalExpected).toLocaleString()}` },
      { label: 'Collected', value: `UGX ${Math.round(totalRepaid).toLocaleString()}`, color: [22, 130, 80] },
      { label: 'Outstanding', value: `UGX ${Math.round(totalOutstanding).toLocaleString()}`, color: [180, 60, 50] },
      { label: 'Collection Rate', value: `${collectionRate}%` },
    ],
    columns: [
      { label: '#', width: 8, align: 'right', format: 'number' },
      { label: 'Tenant Name', width: 40 },
      { label: 'Phone', width: 26 },
      { label: 'Agent (name / phone)', width: 42 },
      { label: 'Principal Paid', width: 28, format: 'ugx' },
      { label: 'Expected', width: 28, format: 'ugx' },
      { label: 'Outstanding', width: 28, format: 'ugx' },
      { label: 'Start', width: 22, format: 'date' },
      { label: 'End', width: 22, format: 'date' },
    ],
    rows: tableRows,
    totals: ['', 'TOTALS', '', '', totalPrincipal, totalExpected, totalOutstanding, '', ''],
    footerNote: 'Outstanding = Expected (total repayment) − Amount repaid. End date = Start + duration. Confidential — Welile internal report.',
  });

  downloadPdfBlob(blob, `active-tenants-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  return rows.length;
}