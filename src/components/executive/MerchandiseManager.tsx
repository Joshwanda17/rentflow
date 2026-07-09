import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { KPICard } from './KPICard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import {
  Package, ShoppingCart, Boxes, TrendingUp, Wallet, Coins, Users, HandCoins,
  Plus, ArrowDownCircle, ArrowUpCircle, Trash2, Warehouse, Receipt,
  Repeat, CheckCircle2, CircleDollarSign, Store, ShoppingBag, Power,
} from 'lucide-react';

// The merchandise tables are new; the generated Supabase types don't include
// them yet, so we reach them through an untyped client alias.
const db = supabase as any;

interface Purchase {
  id: string;
  item_name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  purchase_date: string;
  supplier: string | null;
  notes: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  created_at: string;
}

interface Sale {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  total_revenue: number;
  client_name: string | null;
  client_phone: string | null;
  payment_status: 'paid' | 'credit' | 'partial';
  amount_paid: number;
  amount_outstanding: number;
  sale_date: string;
  notes: string | null;
  created_at: string;
}

interface RecoveryPlan {
  id: string;
  customer_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  item_name: string;
  original_amount: number;
  outstanding_balance: number;
  amount_recovered: number;
  daily_rate: number;
  status: 'active' | 'completed' | 'cancelled';
  last_recovery_at: string | null;
  created_at: string;
}

interface CatalogItem {
  id: string;
  item_name: string;
  description: string | null;
  unit_price: number;
  unit_cost: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
}

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export function MerchandiseManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ---- Filters ----
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [productFilter, setProductFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');

  const { data: purchases = [], isLoading: loadingPurchases } = useQuery<Purchase[]>({
    queryKey: ['merchandise-purchases'],
    queryFn: async () => {
      const { data, error } = await db
        .from('merchandise_purchases')
        .select('*')
        .order('purchase_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  const { data: sales = [], isLoading: loadingSales } = useQuery<Sale[]>({
    queryKey: ['merchandise-sales'],
    queryFn: async () => {
      const { data, error } = await db
        .from('merchandise_sales')
        .select('*')
        .order('sale_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  const { data: recoveryPlans = [], isLoading: loadingRecovery } = useQuery<RecoveryPlan[]>({
    queryKey: ['merchandise-recovery-plans'],
    queryFn: async () => {
      const { data, error } = await db
        .from('merchandise_recovery_plans')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  const { data: catalog = [], isLoading: loadingCatalog } = useQuery<CatalogItem[]>({
    queryKey: ['merchandise-catalog-admin'],
    queryFn: async () => {
      const { data, error } = await db
        .from('merchandise_catalog')
        .select('*')
        .order('item_name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  // ---- Product & client option lists (for filters + autocomplete) ----
  const productNames = useMemo(() => {
    const set = new Set<string>();
    purchases.forEach((p) => set.add(p.item_name));
    sales.forEach((s) => set.add(s.item_name));
    return Array.from(set).sort();
  }, [purchases, sales]);

  const clientNames = useMemo(() => {
    const set = new Set<string>();
    sales.forEach((s) => { if (s.client_name) set.add(s.client_name); });
    return Array.from(set).sort();
  }, [sales]);

  // ---- Apply filters ----
  const inRange = (dateStr: string) => {
    if (fromDate && dateStr < fromDate) return false;
    if (toDate && dateStr > toDate) return false;
    return true;
  };

  const filteredPurchases = useMemo(
    () => purchases.filter((p) =>
      inRange(p.purchase_date) &&
      (productFilter === 'all' || p.item_name === productFilter),
    ),
    [purchases, fromDate, toDate, productFilter],
  );

  const filteredSales = useMemo(
    () => sales.filter((s) =>
      inRange(s.sale_date) &&
      (productFilter === 'all' || s.item_name === productFilter) &&
      (clientFilter === 'all' || s.client_name === clientFilter),
    ),
    [sales, fromDate, toDate, productFilter, clientFilter],
  );

  // ---- Financial roll-ups ----
  const totals = useMemo(() => {
    const totalInvested = filteredPurchases.reduce((s, p) => s + Number(p.total_cost), 0);
    const totalQtyPurchased = filteredPurchases.reduce((s, p) => s + Number(p.quantity), 0);
    const totalRevenue = filteredSales.reduce((s, x) => s + Number(x.total_revenue), 0);
    const totalQtySold = filteredSales.reduce((s, x) => s + Number(x.quantity), 0);
    const cogs = filteredSales.reduce((s, x) => s + Number(x.unit_cost) * Number(x.quantity), 0);
    const grossProfit = totalRevenue - cogs;
    const outstanding = filteredSales.reduce((s, x) => s + Number(x.amount_outstanding), 0);
    const currentStock = totalQtyPurchased - totalQtySold;

    // Weighted average unit cost across all purchases (for inventory valuation).
    const allInvested = purchases.reduce((s, p) => s + Number(p.total_cost), 0);
    const allQty = purchases.reduce((s, p) => s + Number(p.quantity), 0);
    const avgUnitCost = allQty > 0 ? allInvested / allQty : 0;
    const inventoryValue = Math.max(0, currentStock) * avgUnitCost;

    return {
      totalInvested, totalQtyPurchased, totalRevenue, totalQtySold,
      cogs, grossProfit, outstanding, currentStock, inventoryValue,
    };
  }, [filteredPurchases, filteredSales, purchases]);

  // ---- Per-item inventory table ----
  const inventoryByItem = useMemo(() => {
    const map = new Map<string, { purchased: number; sold: number; invested: number; revenue: number }>();
    filteredPurchases.forEach((p) => {
      const e = map.get(p.item_name) || { purchased: 0, sold: 0, invested: 0, revenue: 0 };
      e.purchased += Number(p.quantity);
      e.invested += Number(p.total_cost);
      map.set(p.item_name, e);
    });
    filteredSales.forEach((s) => {
      const e = map.get(s.item_name) || { purchased: 0, sold: 0, invested: 0, revenue: 0 };
      e.sold += Number(s.quantity);
      e.revenue += Number(s.total_revenue);
      map.set(s.item_name, e);
    });
    return Array.from(map.entries())
      .map(([item_name, e]) => ({ item_name, ...e, stock: e.purchased - e.sold }))
      .sort((a, b) => a.item_name.localeCompare(b.item_name));
  }, [filteredPurchases, filteredSales]);

  // ---- Accounts receivable (clients who owe) ----
  const receivables = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; outstanding: number; count: number }>();
    filteredSales.forEach((s) => {
      if (Number(s.amount_outstanding) <= 0) return;
      const key = (s.client_phone || s.client_name || 'Unknown').trim();
      const e = map.get(key) || {
        name: s.client_name || 'Unknown',
        phone: s.client_phone || '',
        outstanding: 0,
        count: 0,
      };
      e.outstanding += Number(s.amount_outstanding);
      e.count += 1;
      map.set(key, e);
    });
    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding);
  }, [filteredSales]);

  const clearFilters = () => {
    setFromDate(''); setToDate(''); setProductFilter('all'); setClientFilter('all');
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['merchandise-purchases'] });
    queryClient.invalidateQueries({ queryKey: ['merchandise-sales'] });
    queryClient.invalidateQueries({ queryKey: ['merchandise-recovery-plans'] });
    queryClient.invalidateQueries({ queryKey: ['merchandise-catalog-admin'] });
  };

  // ---- Wallet-recovery roll-ups ----
  const recovery = useMemo(() => {
    const active = recoveryPlans.filter((p) => p.status === 'active');
    const completed = recoveryPlans.filter((p) => p.status === 'completed');
    const recoveredToDate = recoveryPlans.reduce((s, p) => s + Number(p.amount_recovered), 0);
    const remaining = active.reduce((s, p) => s + Number(p.outstanding_balance), 0);
    return { active, completed, recoveredToDate, remaining, count: active.length };
  }, [recoveryPlans]);

  const deletePurchase = async (id: string) => {
    const { error } = await db.from('merchandise_purchases').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Purchase removed');
    refresh();
  };

  const deleteSale = async (id: string) => {
    const { error } = await db.from('merchandise_sales').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Sale removed');
    refresh();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-primary" /> Merchandise Management
          </h2>
          <p className="text-xs text-muted-foreground">
            Track branded merchandise purchases, sales, inventory and receivables.
          </p>
        </div>
        <div className="flex gap-2">
          <RecordPurchaseDialog userId={user?.id} productNames={productNames} onSaved={refresh} />
          <RecordSaleDialog userId={user?.id} inventory={inventoryByItem} purchases={purchases} onSaved={refresh} />
          <AddCatalogItemDialog userId={user?.id} onSaved={refresh} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Product</Label>
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              {productNames.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Client</Label>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clientNames.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={clearFilters}>Clear</Button>
      </div>

      {/* Financial summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <KPICard title="Total Invested" value={formatUGX(totals.totalInvested)} icon={Wallet} loading={loadingPurchases} color="bg-blue-500/10 text-blue-600" />
        <KPICard title="Total Revenue" value={formatUGX(totals.totalRevenue)} icon={Coins} loading={loadingSales} color="bg-green-500/10 text-green-600" />
        <KPICard title="Gross Profit" value={formatUGX(totals.grossProfit)} icon={TrendingUp} loading={loadingSales} color={totals.grossProfit >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'} />
        <KPICard title="Outstanding Receivables" value={formatUGX(totals.outstanding)} icon={HandCoins} loading={loadingSales} color="bg-amber-500/10 text-amber-600" subtitle={`${receivables.length} client${receivables.length === 1 ? '' : 's'} owing`} />
      </div>

      {/* Inventory KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <KPICard title="Quantity Purchased" value={totals.totalQtyPurchased.toLocaleString()} icon={ArrowDownCircle} color="bg-blue-500/10 text-blue-600" />
        <KPICard title="Quantity Sold" value={totals.totalQtySold.toLocaleString()} icon={ArrowUpCircle} color="bg-purple-500/10 text-purple-600" />
        <KPICard title="Current Stock" value={totals.currentStock.toLocaleString()} icon={Boxes} color="bg-indigo-500/10 text-indigo-600" />
        <KPICard title="Inventory Value" value={formatUGX(totals.inventoryValue)} icon={Package} color="bg-cyan-500/10 text-cyan-600" subtitle="Stock at avg cost" />
      </div>

      {/* Cost of goods sold callout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <KPICard title="Cost of Merchandise Sold" value={formatUGX(totals.cogs)} icon={Receipt} color="bg-orange-500/10 text-orange-600" />
        <KPICard title="Total Accounts Receivable" value={formatUGX(totals.outstanding)} icon={Users} color="bg-amber-500/10 text-amber-600" />
      </div>

      {/* Wallet-recovery KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <KPICard title="Recovered to Date" value={formatUGX(recovery.recoveredToDate)} icon={CircleDollarSign} loading={loadingRecovery} color="bg-emerald-500/10 text-emerald-600" subtitle="Via daily wallet deductions" />
        <KPICard title="Customers Repaying" value={recovery.count.toLocaleString()} icon={Repeat} loading={loadingRecovery} color="bg-purple-500/10 text-purple-600" subtitle="Active recovery plans" />
        <KPICard title="Remaining to Recover" value={formatUGX(recovery.remaining)} icon={HandCoins} loading={loadingRecovery} color="bg-amber-500/10 text-amber-600" />
        <KPICard title="Fully Paid Accounts" value={recovery.completed.length.toLocaleString()} icon={CheckCircle2} loading={loadingRecovery} color="bg-green-500/10 text-green-600" />
      </div>

      {/* Merchandise wallet recovery */}
      <Section title="Merchandise Wallet Recovery (15% · up to 4×/day)" icon={Repeat}>
        {recoveryPlans.length === 0 ? (
          <EmptyRow text="No wallet-recovery plans yet. Credit sales to registered customers are recovered automatically." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3 text-right">Original</th>
                  <th className="py-2 px-3 text-right">Recovered</th>
                  <th className="py-2 px-3 text-right">Remaining</th>
                  <th className="py-2 px-3">Last Recovery</th>
                  <th className="py-2 pl-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {recoveryPlans.map((p) => (
                  <tr key={p.id} className="border-b border-border/40">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{p.customer_name || 'Customer'}</div>
                      <div className="text-[11px] text-muted-foreground">{p.customer_phone || '—'}</div>
                    </td>
                    <td className="py-2 px-3">{p.item_name}</td>
                    <td className="py-2 px-3 text-right">{formatUGX(Number(p.original_amount))}</td>
                    <td className="py-2 px-3 text-right text-emerald-600">{formatUGX(Number(p.amount_recovered))}</td>
                    <td className="py-2 px-3 text-right font-semibold text-amber-600">{formatUGX(Number(p.outstanding_balance))}</td>
                    <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">
                      {p.last_recovery_at ? format(new Date(p.last_recovery_at), 'dd MMM yy') : '—'}
                    </td>
                    <td className="py-2 pl-3"><RecoveryBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Inventory by item */}
      <Section title="Inventory by Item" icon={Boxes}>
        {inventoryByItem.length === 0 ? (
          <EmptyRow text="No merchandise recorded yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 px-3 text-right">Purchased</th>
                  <th className="py-2 px-3 text-right">Sold</th>
                  <th className="py-2 px-3 text-right">In Stock</th>
                  <th className="py-2 px-3 text-right">Invested</th>
                  <th className="py-2 pl-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {inventoryByItem.map((r) => (
                  <tr key={r.item_name} className="border-b border-border/40">
                    <td className="py-2 pr-3 font-medium">{r.item_name}</td>
                    <td className="py-2 px-3 text-right">{r.purchased.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">{r.sold.toLocaleString()}</td>
                    <td className={`py-2 px-3 text-right font-semibold ${r.stock <= 0 ? 'text-red-500' : ''}`}>{r.stock.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">{formatUGX(r.invested)}</td>
                    <td className="py-2 pl-3 text-right">{formatUGX(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Accounts receivable */}
      <Section title="Clients Owing (Accounts Receivable)" icon={HandCoins}>
        {receivables.length === 0 ? (
          <EmptyRow text="No outstanding merchandise credit." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 px-3">Phone</th>
                  <th className="py-2 px-3 text-right">Credit Sales</th>
                  <th className="py-2 pl-3 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {receivables.map((r, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="py-2 pr-3 font-medium">{r.name}</td>
                    <td className="py-2 px-3 text-muted-foreground">{r.phone || '—'}</td>
                    <td className="py-2 px-3 text-right">{r.count}</td>
                    <td className="py-2 pl-3 text-right font-semibold text-amber-600">{formatUGX(r.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Recent sales */}
      <Section title="Sales Transactions" icon={ShoppingCart}>
        {filteredSales.length === 0 ? (
          <EmptyRow text="No sales recorded for the selected filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3 text-right">Qty</th>
                  <th className="py-2 px-3 text-right">Revenue</th>
                  <th className="py-2 px-3">Client</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Owed</th>
                  <th className="py-2 pl-3" />
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((s) => (
                  <tr key={s.id} className="border-b border-border/40">
                    <td className="py-2 pr-3 whitespace-nowrap">{format(new Date(s.sale_date), 'dd MMM yy')}</td>
                    <td className="py-2 px-3">{s.item_name}</td>
                    <td className="py-2 px-3 text-right">{s.quantity}</td>
                    <td className="py-2 px-3 text-right">{formatUGX(Number(s.total_revenue))}</td>
                    <td className="py-2 px-3">{s.client_name || '—'}</td>
                    <td className="py-2 px-3"><StatusBadge status={s.payment_status} /></td>
                    <td className="py-2 px-3 text-right">{Number(s.amount_outstanding) > 0 ? formatUGX(Number(s.amount_outstanding)) : '—'}</td>
                    <td className="py-2 pl-3 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteSale(s.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Recent purchases */}
      <Section title="Purchase History" icon={Package}>
        {filteredPurchases.length === 0 ? (
          <EmptyRow text="No purchases recorded for the selected filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3 text-right">Qty</th>
                  <th className="py-2 px-3 text-right">Unit Cost</th>
                  <th className="py-2 px-3 text-right">Total</th>
                  <th className="py-2 px-3">Supplier</th>
                  <th className="py-2 pl-3" />
                </tr>
              </thead>
              <tbody>
                {filteredPurchases.map((p) => (
                  <tr key={p.id} className="border-b border-border/40">
                    <td className="py-2 pr-3 whitespace-nowrap">{format(new Date(p.purchase_date), 'dd MMM yy')}</td>
                    <td className="py-2 px-3">{p.item_name}</td>
                    <td className="py-2 px-3 text-right">{p.quantity}</td>
                    <td className="py-2 px-3 text-right">{formatUGX(Number(p.unit_cost))}</td>
                    <td className="py-2 px-3 text-right">{formatUGX(Number(p.total_cost))}</td>
                    <td className="py-2 px-3">{p.supplier || '—'}</td>
                    <td className="py-2 pl-3 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deletePurchase(p.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Package; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-6 text-center">{text}</p>;
}

function StatusBadge({ status }: { status: 'paid' | 'credit' | 'partial' }) {
  const map = {
    paid: 'bg-green-500/10 text-green-600',
    credit: 'bg-red-500/10 text-red-600',
    partial: 'bg-amber-500/10 text-amber-600',
  } as const;
  const label = { paid: 'Paid', credit: 'On Credit', partial: 'Partial' }[status];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{label}</span>;
}

function RecoveryBadge({ status }: { status: 'active' | 'completed' | 'cancelled' }) {
  const map = {
    active: 'bg-purple-500/10 text-purple-600',
    completed: 'bg-green-500/10 text-green-600',
    cancelled: 'bg-muted text-muted-foreground',
  } as const;
  const label = { active: 'Recovering', completed: 'Fully Paid', cancelled: 'Cancelled' }[status];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Record Purchase dialog
// ---------------------------------------------------------------------------
function RecordPurchaseDialog({ userId, productNames, onSaved }: { userId?: string; productNames: string[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');

  const qty = num(quantity);
  const cost = num(unitCost);
  const total = qty * cost;

  const reset = () => {
    setItemName(''); setQuantity(''); setUnitCost('');
    setPurchaseDate(format(new Date(), 'yyyy-MM-dd')); setSupplier(''); setNotes('');
    setBuyerName(''); setBuyerPhone('');
  };

  const save = async () => {
    if (!itemName.trim()) { toast.error('Item name is required'); return; }
    if (qty <= 0) { toast.error('Quantity must be greater than 0'); return; }
    if (cost < 0) { toast.error('Unit cost cannot be negative'); return; }
    setSaving(true);
    const { error } = await db.from('merchandise_purchases').insert({
      item_name: itemName.trim(),
      quantity: qty,
      unit_cost: cost,
      total_cost: total,
      purchase_date: purchaseDate,
      supplier: supplier.trim() || null,
      notes: notes.trim() || null,
      buyer_name: buyerName.trim() || null,
      buyer_phone: buyerPhone.trim() || null,
      created_by: userId ?? null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(
      buyerPhone.trim()
        ? 'Purchase recorded. If the buyer is a registered user, their wallet will be debited daily.'
        : 'Purchase recorded',
    );
    reset();
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5"><Plus className="h-4 w-4" /> Record Purchase</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record Merchandise Purchase</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Item name</Label>
            <Input list="merch-products" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Branded T-shirt" />
            <datalist id="merch-products">{productNames.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Quantity</Label>
              <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unit cost (UGX)</Label>
              <Input type="number" min={0} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm flex justify-between">
            <span className="text-muted-foreground">Total investment</span>
            <span className="font-semibold">{formatUGX(total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Purchase date</Label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Supplier</Label>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Buyer / Purchaser name</Label>
              <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Who bought it" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Buyer phone</Label>
              <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="For wallet debit" />
            </div>
          </div>
          {buyerPhone.trim() && total > 0 && (
            <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
              If this phone belongs to a registered user, {formatUGX(total)} will be recovered
              automatically — 15% of their Withdrawable Wallet each day until fully paid.
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Purchase'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Record Sale dialog
// ---------------------------------------------------------------------------
function RecordSaleDialog({
  userId, inventory, purchases, onSaved,
}: {
  userId?: string;
  inventory: { item_name: string; stock: number }[];
  purchases: Purchase[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [saleDate, setSaleDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'credit' | 'partial'>('paid');
  const [amountPaid, setAmountPaid] = useState('');
  const [notes, setNotes] = useState('');

  const qty = num(quantity);
  const price = num(unitPrice);
  const totalRevenue = qty * price;
  const paid = paymentStatus === 'paid' ? totalRevenue : paymentStatus === 'partial' ? num(amountPaid) : 0;
  const outstanding = Math.max(0, totalRevenue - paid);

  const stockForItem = inventory.find((i) => i.item_name === itemName)?.stock ?? null;

  // Auto-fill cost from weighted average purchase cost for the chosen item.
  const suggestCost = (name: string) => {
    const rows = purchases.filter((p) => p.item_name === name);
    const invested = rows.reduce((s, p) => s + Number(p.total_cost), 0);
    const q = rows.reduce((s, p) => s + Number(p.quantity), 0);
    return q > 0 ? String(Math.round(invested / q)) : '';
  };

  const reset = () => {
    setItemName(''); setQuantity(''); setUnitPrice(''); setUnitCost('');
    setSaleDate(format(new Date(), 'yyyy-MM-dd')); setClientName(''); setClientPhone('');
    setPaymentStatus('paid'); setAmountPaid(''); setNotes('');
  };

  const save = async () => {
    if (!itemName.trim()) { toast.error('Item name is required'); return; }
    if (qty <= 0) { toast.error('Quantity must be greater than 0'); return; }
    if (price < 0) { toast.error('Unit price cannot be negative'); return; }
    if ((paymentStatus === 'credit' || paymentStatus === 'partial') && !clientName.trim() && !clientPhone.trim()) {
      toast.error('Credit sales need a client name or phone'); return;
    }
    setSaving(true);
    const { error } = await db.from('merchandise_sales').insert({
      item_name: itemName.trim(),
      quantity: qty,
      unit_price: price,
      unit_cost: num(unitCost),
      total_revenue: totalRevenue,
      client_name: clientName.trim() || null,
      client_phone: clientPhone.trim() || null,
      payment_status: paymentStatus,
      amount_paid: paid,
      amount_outstanding: outstanding,
      sale_date: saleDate,
      notes: notes.trim() || null,
      created_by: userId ?? null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Sale recorded');
    reset();
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><ShoppingCart className="h-4 w-4" /> Record Sale</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Record Merchandise Sale</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Item</Label>
            <Select value={itemName} onValueChange={(v) => { setItemName(v); if (!unitCost) setUnitCost(suggestCost(v)); }}>
              <SelectTrigger><SelectValue placeholder="Select an item" /></SelectTrigger>
              <SelectContent>
                {inventory.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Record a purchase first</div>}
                {inventory.map((i) => (
                  <SelectItem key={i.item_name} value={i.item_name}>{i.item_name} ({i.stock} in stock)</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {stockForItem !== null && qty > stockForItem && (
              <p className="text-[11px] text-amber-600">Warning: selling {qty} but only {stockForItem} in stock.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Quantity</Label>
              <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Selling price / unit</Label>
              <Input type="number" min={0} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cost / unit (for profit)</Label>
            <Input type="number" min={0} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="Auto from purchases" />
          </div>
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm flex justify-between">
            <span className="text-muted-foreground">Total revenue</span>
            <span className="font-semibold">{formatUGX(totalRevenue)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Client name</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Client phone</Label>
              <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Payment</Label>
              <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid in full</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="credit">On credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sale date</Label>
              <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
            </div>
          </div>
          {paymentStatus === 'partial' && (
            <div className="space-y-1">
              <Label className="text-xs">Amount paid now</Label>
              <Input type="number" min={0} value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0" />
            </div>
          )}
          {(paymentStatus === 'credit' || paymentStatus === 'partial') && (
            <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm flex justify-between">
              <span className="text-amber-700">Outstanding balance</span>
              <span className="font-semibold text-amber-700">{formatUGX(outstanding)}</span>
            </div>
          )}
          {(paymentStatus === 'credit' || paymentStatus === 'partial') && outstanding > 0 && clientPhone.trim() && (
            <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
              If this phone belongs to a registered customer, the outstanding balance will be
              recovered automatically — 15% of their Withdrawable Wallet each day until fully paid.
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Sale'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}