import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, ShoppingBag, Store, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatUGX } from '@/lib/rentCalculations';
import {
  ServiceCenterSubAgent,
  useServiceCenterCatalog,
  useServiceCenterOverview,
  useServiceCenterTransfers,
} from '@/hooks/useAgentServiceCenter';
import { SubAgentRosterCard } from '@/components/agent/service-center/SubAgentRosterCard';
import {
  SuspendSubAgentDialog,
  TransferTenantDialog,
} from '@/components/agent/service-center/SubAgentActionDialogs';

export default function AgentServiceCenter() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useServiceCenterOverview();
  const { data: transfers = [] } = useServiceCenterTransfers();
  const { data: catalog = [], isLoading: loadingCatalog } = useServiceCenterCatalog();

  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(20);
  const [suspendTarget, setSuspendTarget] = useState<ServiceCenterSubAgent | null>(null);
  const [transferTarget, setTransferTarget] = useState<ServiceCenterSubAgent | null>(null);

  const subAgents = data?.sub_agents ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subAgents;
    return subAgents.filter((s) =>
      [s.full_name, s.phone, s.email].some((v) => (v ?? '').toLowerCase().includes(q)),
    );
  }, [subAgents, query]);

  const totals = useMemo(() => ({
    subAgents: subAgents.length,
    tenants: subAgents.reduce((a, s) => a + s.active_tenants, 0),
    commissions: subAgents.reduce((a, s) => a + Number(s.commission_total || 0), 0),
    pending: transfers.filter((t) => t.status === 'pending').length,
  }), [subAgents, transfers]);

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-lg font-bold text-foreground">
              <Store className="h-5 w-5 text-primary" /> Service Center
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              Your team, their tenants and your supplies in one place
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4 pb-24">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Sub-agents', value: String(totals.subAgents) },
            { label: 'Active tenants', value: String(totals.tenants) },
            { label: 'Team commissions', value: formatUGX(totals.commissions) },
            { label: 'Pending transfers', value: String(totals.pending) },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
                <div className="text-base font-bold text-foreground break-words">{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="team">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="team" className="text-xs sm:text-sm">
              <Users className="mr-1.5 h-4 w-4" /> Team
            </TabsTrigger>
            <TabsTrigger value="transfers" className="text-xs sm:text-sm">Transfers</TabsTrigger>
            <TabsTrigger value="shop" className="text-xs sm:text-sm">
              <ShoppingBag className="mr-1.5 h-4 w-4" /> Shop
            </TabsTrigger>
          </TabsList>

          <TabsContent value="team" className="mt-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, phone or email"
                className="pl-9"
              />
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
              </div>
            ) : error ? (
              <Card><CardContent className="p-6 text-sm text-destructive">
                Could not load your team. Pull down to retry.
              </CardContent></Card>
            ) : filtered.length === 0 ? (
              <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
                {subAgents.length === 0 ? 'You have no sub-agents yet.' : 'No sub-agent matches that search.'}
              </CardContent></Card>
            ) : (
              filtered.slice(0, visible).map((s) => (
                <SubAgentRosterCard
                  key={s.sub_agent_id}
                  subAgent={s}
                  onSuspend={setSuspendTarget}
                  onTransfer={setTransferTarget}
                />
              ))
            )}

            {filtered.length > visible && (
              <Button variant="outline" className="w-full" onClick={() => setVisible((v) => v + 20)}>
                Show more ({filtered.length - visible} left)
              </Button>
            )}
          </TabsContent>

          <TabsContent value="transfers" className="mt-3 space-y-2">
            {transfers.length === 0 ? (
              <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
                No tenant transfer requests yet.
              </CardContent></Card>
            ) : (
              transfers.map((t) => (
                <Card key={t.id}>
                  <CardContent className="space-y-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{t.tenant_name ?? 'Tenant'}</span>
                      <Badge
                        variant={t.status === 'approved' ? 'default' : t.status === 'pending' ? 'outline' : 'destructive'}
                        className="text-[10px] capitalize"
                      >
                        {t.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t.from_name ?? '—'} → {t.to_name ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">Reason: {t.reason}</p>
                    {t.decision_reason && (
                      <p className="text-xs text-muted-foreground">Ops note: {t.decision_reason}</p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="shop" className="mt-3 space-y-2">
            {loadingCatalog ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
            ) : catalog.length === 0 ? (
              <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
                No items are available right now.
              </CardContent></Card>
            ) : (
              catalog.map((item) => (
                <Card key={item.id}>
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">{item.item_name}</div>
                      <div className="text-xs text-muted-foreground">{formatUGX(item.unit_price)}</div>
                    </div>
                    <Button size="sm" onClick={() => navigate(`/merchandise?item=${item.id}`)}>
                      Buy
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>

      <SuspendSubAgentDialog
        subAgent={suspendTarget}
        open={!!suspendTarget}
        onOpenChange={(v) => !v && setSuspendTarget(null)}
      />
      <TransferTenantDialog
        subAgent={transferTarget}
        peers={subAgents}
        open={!!transferTarget}
        onOpenChange={(v) => !v && setTransferTarget(null)}
      />
    </div>
  );
}