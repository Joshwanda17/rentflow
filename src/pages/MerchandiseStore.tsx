import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAgentBalances } from '@/hooks/useAgentBalances';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  ArrowLeft, ShoppingBag, Package, Wallet, CheckCircle2, Repeat, Info, Smartphone,
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import SmartphoneOrderStatus from '@/components/merchandise/SmartphoneOrderStatus';

// Merchandise tables aren't in generated types yet.
const db = supabase as any;

interface CatalogItem {
  id: string;
  item_name: string;
  description: string | null;
  unit_price: number;
  image_url: string | null;
  is_active: boolean;
}

interface RecoveryPlan {
  id: string;
  item_name: string;
  original_amount: number;
  outstanding_balance: number;
  amount_recovered: number;
  status: 'active' | 'completed' | 'cancelled';
  last_recovery_at: string | null;
  created_at: string;
}

interface Deduction {
  id: string;
  item_name: string | null;
  amount: number;
  outstanding_after: number;
  created_at: string;
}

export default function MerchandiseStore() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [ordering, setOrdering] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneAmount, setPhoneAmount] = useState('');
  const [orderingPhone, setOrderingPhone] = useState(false);
  const { withdrawableBalance } = useAgentBalances(user?.id);
  const availableWallet = Math.max(0, withdrawableBalance);

  const { data: catalog = [], isLoading: loadingCatalog } = useQuery<CatalogItem[]>({
    queryKey: ['merchandise-catalog'],
    queryFn: async () => {
      const { data, error } = await db
        .from('merchandise_catalog')
        .select('*')
        .eq('is_active', true)
        .order('item_name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: plans = [] } = useQuery<RecoveryPlan[]>({
    queryKey: ['my-merchandise-plans', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('merchandise_recovery_plans')
        .select('*')
        .eq('customer_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: deductions = [] } = useQuery<Deduction[]>({
    queryKey: ['my-merchandise-deductions', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from('merchandise_recovery_deductions')
        .select('id, item_name, amount, outstanding_after, created_at')
        .eq('customer_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
  });

  const totalOwing = plans
    .filter((p) => p.status === 'active')
    .reduce((s, p) => s + Number(p.outstanding_balance), 0);
  const totalRecovered = plans.reduce((s, p) => s + Number(p.amount_recovered), 0);

  const qty = Math.max(1, parseInt(quantity || '1', 10) || 1);
  const orderTotal = selected ? Number(selected.unit_price) * qty : 0;

  const placeOrder = async () => {
    if (!selected) return;
    setOrdering(true);
    const { data, error } = await db.rpc('agent_order_merchandise', {
      p_catalog_id: selected.id,
      p_quantity: qty,
    });
    setOrdering(false);
    if (error) {
      toast.error(error.message || 'Could not place order');
      return;
    }
    toast.success(`Ordered ${selected.item_name}. ${formatUGX(orderTotal)} will be recovered from your wallet.`);
    setSelected(null);
    setQuantity('1');
    queryClient.invalidateQueries({ queryKey: ['my-merchandise-plans', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['my-merchandise-deductions', user?.id] });
  };

  const phoneAmountNum = Math.max(0, parseInt(phoneAmount || '0', 10) || 0);

  const orderSmartphone = async () => {
    if (phoneAmountNum < 1000) {
      toast.error('Enter an amount of at least UGX 1,000');
      return;
    }
    if (phoneAmountNum > availableWallet) {
      toast.error(
        `Amount exceeds your available wallet balance of ${formatUGX(availableWallet)}. Enter ${formatUGX(availableWallet)} or less.`
      );
      return;
    }
    setOrderingPhone(true);
    const { error } = await db.rpc('agent_order_smartphone', { p_amount: phoneAmountNum });
    setOrderingPhone(false);
    if (error) {
      toast.error(error.message || 'Could not place smartphone order');
      return;
    }
    toast.success(`Welile Smartphone requested. ${formatUGX(phoneAmountNum)} will be recovered from your wallet.`);
    setPhoneOpen(false);
    setPhoneAmount('');
    queryClient.invalidateQueries({ queryKey: ['my-merchandise-plans', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['my-merchandise-deductions', user?.id] });
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-base font-bold flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" /> Merchandise Store
            </h1>
            <p className="text-[11px] text-muted-foreground">Buy branded gear — paid off from your wallet</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        {/* My payments summary */}
        {plans.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <Card>
              <CardContent className="p-3">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Wallet className="h-3 w-3" /> Still to repay
                </p>
                <p className="text-lg font-bold text-amber-600">{formatUGX(totalOwing)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Repaid so far
                </p>
                <p className="text-lg font-bold text-emerald-600">{formatUGX(totalRecovered)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="rounded-xl bg-primary/5 border border-primary/15 px-3 py-2 flex gap-2 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <p>Anything you order is repaid automatically — 15% of your withdrawable wallet is deducted up to 4 times a day until it's cleared. You'll get a notification each time.</p>
        </div>

        {/* Order a Welile Smartphone */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight">Order a Welile Smartphone</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Get a company smartphone on credit. Choose how much can be deducted from your wallet — final price is set by marketing.
              </p>
            </div>
            <Button size="sm" className="h-8 text-xs gap-1 shrink-0" onClick={() => { setPhoneAmount(''); setPhoneOpen(true); }}>
              Order
            </Button>
          </CardContent>
        </Card>

        {/* Smartphone order status */}
        <SmartphoneOrderStatus userId={user?.id} />

        {/* Catalog */}
        <div>
          <h2 className="text-sm font-bold mb-2 flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" /> Available items
          </h2>
          {loadingCatalog ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
          ) : catalog.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No merchandise available right now.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {catalog.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.item_name} className="w-full h-28 object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-28 bg-muted flex items-center justify-center">
                      <Package className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}
                  <CardContent className="p-3 space-y-1.5">
                    <p className="text-sm font-semibold leading-tight line-clamp-1">{item.item_name}</p>
                    {item.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{item.description}</p>
                    )}
                    <p className="text-sm font-bold text-primary">{formatUGX(Number(item.unit_price))}</p>
                    <Button size="sm" className="w-full h-8 text-xs gap-1" onClick={() => { setSelected(item); setQuantity('1'); }}>
                      <ShoppingBag className="h-3.5 w-3.5" /> Buy
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Recent deductions */}
        {deductions.length > 0 && (
          <div>
            <h2 className="text-sm font-bold mb-2 flex items-center gap-2">
              <Repeat className="h-4 w-4 text-primary" /> Wallet deductions for merchandise
            </h2>
            <Card>
              <CardContent className="p-0 divide-y divide-border/60">
                {deductions.map((d) => (
                  <div key={d.id} className="flex items-center justify-between px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium line-clamp-1">{d.item_name || 'Merchandise'}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {d.created_at ? format(new Date(d.created_at), 'dd MMM yyyy, HH:mm') : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-destructive">- {formatUGX(Number(d.amount))}</p>
                      <p className="text-[10px] text-muted-foreground">Left: {formatUGX(Number(d.outstanding_after))}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* My orders (plans) */}
        {plans.length > 0 && (
          <div>
            <h2 className="text-sm font-bold mb-2">My merchandise orders</h2>
            <Card>
              <CardContent className="p-0 divide-y divide-border/60">
                {plans.map((p) => (
                  <div key={p.id} className="px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">{p.item_name}</p>
                      <Badge variant={p.status === 'completed' ? 'default' : 'secondary'} className="text-[10px]">
                        {p.status === 'completed' ? 'Paid off' : 'Repaying'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                      <span>Cost {formatUGX(Number(p.original_amount))}</span>
                      <span className="text-emerald-600">Repaid {formatUGX(Number(p.amount_recovered))}</span>
                      <span className="text-amber-600">Left {formatUGX(Number(p.outstanding_balance))}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Order confirm dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirm order</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {selected.image_url ? (
                  <img src={selected.image_url} alt={selected.item_name} className="w-14 h-14 rounded-lg object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center">
                    <Package className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-sm">{selected.item_name}</p>
                  <p className="text-xs text-muted-foreground">{formatUGX(Number(selected.unit_price))} each</p>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantity</Label>
                <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className="rounded-lg bg-muted/50 px-3 py-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Total (repaid from wallet)</span>
                <span className="font-bold">{formatUGX(orderTotal)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                This amount will be recovered from your withdrawable wallet — 15% up to 4 times a day until fully paid.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)} disabled={ordering}>Cancel</Button>
            <Button onClick={placeOrder} disabled={ordering}>{ordering ? 'Ordering…' : 'Confirm order'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Smartphone order dialog */}
      <Dialog open={phoneOpen} onOpenChange={(o) => { if (!o) setPhoneOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary" /> Order a Welile Smartphone
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Marketing sets the final phone price. Enter the amount you're comfortable having recovered
              from your wallet toward the smartphone.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Amount to deduct (UGX)</Label>
              <Input
                type="number"
                min={1000}
                step={1000}
                inputMode="numeric"
                placeholder="e.g. 50000"
                value={phoneAmount}
                onChange={(e) => setPhoneAmount(e.target.value)}
              />
            </div>
            {phoneAmountNum > 0 && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Will be recovered from wallet</span>
                <span className="font-bold">{formatUGX(phoneAmountNum)}</span>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              This amount is recovered from your withdrawable wallet — 15% up to 4 times a day until fully paid.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhoneOpen(false)} disabled={orderingPhone}>Cancel</Button>
            <Button onClick={orderSmartphone} disabled={orderingPhone || phoneAmountNum < 1000}>
              {orderingPhone ? 'Ordering…' : 'Confirm order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
