import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, Search, Share2, User, Home, Receipt, FileDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { LandlordPayoutShareCard, type LandlordPayoutShareData } from './LandlordPayoutShareCard';
import { buildBulkPayoutsPdfBlob, downloadBlob } from './landlordPayoutPdf';
import { toast } from 'sonner';

type Row = {
  id: string;
  agent_id: string;
  tenant_id: string | null;
  landlord_id: string;
  landlord_name: string;
  landlord_phone: string;
  mobile_money_provider: string;
  amount: number;
  status: string;
  finops_disbursed_at: string | null;
  finops_momo_reference: string | null;
  external_reference: string | null;
  created_at: string;
  agent_profile?: { full_name: string | null; phone: string | null } | null;
  tenant_profile?: { full_name: string | null } | null;
};

const FUNDED_STATUSES = ['awaiting_agent_receipt', 'completed', 'disbursed'] as const;

function formatUGX(n: number) {
  return `UGX ${Number(n).toLocaleString()}`;
}

export function FundedTenantsList() {
  const [q, setQ] = useState('');
  const [share, setShare] = useState<LandlordPayoutShareData | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['finops-funded-landlord-payouts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('landlord_payouts')
        .select(
          'id, agent_id, tenant_id, landlord_id, landlord_name, landlord_phone, mobile_money_provider, amount, status, finops_disbursed_at, finops_momo_reference, external_reference, created_at',
        )
        .in('status', FUNDED_STATUSES as unknown as string[])
        .order('finops_disbursed_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const list = (data ?? []) as Row[];

      const ids = Array.from(
        new Set([
          ...list.map((r) => r.agent_id),
          ...list.map((r) => r.tenant_id).filter(Boolean) as string[],
        ]),
      );
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', ids);
        const map = new Map((profs ?? []).map((p) => [p.id, p]));
        list.forEach((r) => {
          r.agent_profile = (map.get(r.agent_id) as any) ?? null;
          if (r.tenant_id) r.tenant_profile = (map.get(r.tenant_id) as any) ?? null;
        });
      }
      return list;
    },
    refetchInterval: 60_000,
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const hay = [
        r.landlord_name,
        r.landlord_phone,
        r.tenant_profile?.full_name ?? '',
        r.agent_profile?.full_name ?? '',
        r.finops_momo_reference ?? '',
        r.external_reference ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const totalAmount = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.amount || 0), 0),
    [filtered],
  );

  const rowToShareData = (r: Row): LandlordPayoutShareData => ({
    amount: r.amount,
    landlord_name: r.landlord_name,
    landlord_phone: r.landlord_phone,
    mobile_money_provider: r.mobile_money_provider,
    tenant_name: r.tenant_profile?.full_name ?? null,
    agent_name: r.agent_profile?.full_name ?? null,
    agent_phone: r.agent_profile?.phone ?? null,
    momo_reference: r.finops_momo_reference ?? r.external_reference ?? '—',
    paid_at: r.finops_disbursed_at ?? r.created_at,
  });

  const handleBulkPdf = async () => {
    if (!filtered.length) return;
    if (filtered.length > 50) {
      const ok = window.confirm(
        `You're about to export ${filtered.length} payouts into one PDF. This may take a minute. Continue?`,
      );
      if (!ok) return;
    }
    setBulk({ done: 0, total: filtered.length });
    try {
      const blob = await buildBulkPayoutsPdfBlob(
        filtered.map(rowToShareData),
        (done, total) => setBulk({ done, total }),
      );
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `welile-funded-landlord-payouts-${stamp}-x${filtered.length}.pdf`);
      toast.success(`Exported ${filtered.length} payouts to PDF`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to build bulk PDF');
    } finally {
      setBulk(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading funded payouts…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2.5">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          Tenants Whose Landlords Were Funded
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Every landlord payout Financial Ops has settled — most recent first.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tenant, landlord, agent or MoMo TID"
            className="pl-9"
          />
        </div>
        <Badge variant="outline" className="shrink-0">
          {filtered.length} · {formatUGX(totalAmount)}
        </Badge>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          onClick={handleBulkPdf}
          disabled={!filtered.length || !!bulk}
          title="Download a single PDF containing every visible payout (one card per page)"
        >
          {bulk ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {bulk.done}/{bulk.total}
            </>
          ) : (
            <>
              <FileDown className="h-3.5 w-3.5" />
              Bulk PDF
            </>
          )}
        </Button>
      </div>

      {bulk && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Building combined PDF — {bulk.done} of {bulk.total} cards rendered…
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <p className="text-sm">No funded landlord payouts match your search.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={r.id} className="p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-sm font-semibold truncate">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {r.tenant_profile?.full_name ?? 'Unallocated tenant'}
                    </span>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary truncate">
                      <Home className="h-3.5 w-3.5" />
                      {r.landlord_name}
                    </span>
                    {r.status === 'completed' ? (
                      <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">
                        Completed
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">
                        Awaiting receipt
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                    <span>Agent: <b className="text-foreground">{r.agent_profile?.full_name ?? '—'}</b></span>
                    <span>{r.mobile_money_provider}: <span className="font-mono">{r.landlord_phone}</span></span>
                    {(r.finops_momo_reference || r.external_reference) && (
                      <span className="inline-flex items-center gap-1">
                        <Receipt className="h-3 w-3" />
                        TID: <span className="font-mono">{r.finops_momo_reference ?? r.external_reference}</span>
                      </span>
                    )}
                    <span>
                      {r.finops_disbursed_at
                        ? `Paid ${formatDistanceToNow(new Date(r.finops_disbursed_at), { addSuffix: true })}`
                        : `Submitted ${formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}`}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base sm:text-lg font-bold">{formatUGX(r.amount)}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 h-7 text-xs"
                    onClick={() =>
                      setShare({
                        amount: r.amount,
                        landlord_name: r.landlord_name,
                        landlord_phone: r.landlord_phone,
                        mobile_money_provider: r.mobile_money_provider,
                        tenant_name: r.tenant_profile?.full_name ?? null,
                        agent_name: r.agent_profile?.full_name ?? null,
                        agent_phone: r.agent_profile?.phone ?? null,
                        momo_reference:
                          r.finops_momo_reference ?? r.external_reference ?? '—',
                        paid_at: r.finops_disbursed_at ?? r.created_at,
                      })
                    }
                  >
                    <Share2 className="h-3 w-3 mr-1" /> Share
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <LandlordPayoutShareCard
        open={!!share}
        onOpenChange={(o) => !o && setShare(null)}
        data={share}
      />
    </div>
  );
}
