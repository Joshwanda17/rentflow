import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  ArrowLeft, ShoppingBag, Package, Wallet, CheckCircle2, Repeat, Info, Smartphone, Bike, AlertCircle, Share2,
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import SmartphoneOrderStatus from '@/components/merchandise/SmartphoneOrderStatus';
import { StorageImage } from '@/components/ui/StorageImage';

// Merchandise tables aren't in generated types yet.
const db = supabase as any;

interface CatalogItem {
  id: string;
  item_name: string;
  description: string | null;
  unit_price: number;
  image_url: string | null;
  image_urls: string[] | null;
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

const PAGE_SIZE = 8;

export default function MerchandiseStore() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [ordering, setOrdering] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneAmount, setPhoneAmount] = useState('');
  const [orderingPhone, setOrderingPhone] = useState(false);
  const [bikeOpen, setBikeOpen] = useState(false);
  const [bikeAmount, setBikeAmount] = useState('');
  const [orderingBike, setOrderingBike] = useState(false);
  const [catalogPage, setCatalogPage] = useState(1);
  const [shareItem, setShareItem] = useState<CatalogItem | null>(null);
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
  const insufficient = selected ? orderTotal > availableWallet : false;

  const pickImage = (item: CatalogItem | null): string | null => {
    if (!item) return null;
    if (item.image_urls && item.image_urls.length > 0) return item.image_urls[0];
    return item.image_url || null;
  };

  const buildShare = (item: CatalogItem) => {
    const url = `${window.location.origin}/merchandise?item=${item.id}`;
    const text = `Check out ${item.item_name} — ${formatUGX(Number(item.unit_price))} on Welile Merchandise.`;
    return { url, text, full: `${text} ${url}` };
  };

  const handleShare = async (item: CatalogItem) => {
    const { url, text, full } = buildShare(item);
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: item.item_name, text, url });
        return;
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
      }
    }
    setShareItem(item);
  };

  const copyShareLink = async (item: CatalogItem) => {
    const { full } = buildShare(item);
    try {
      await navigator.clipboard.writeText(full);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const totalPages = Math.max(1, Math.ceil(catalog.length / PAGE_SIZE));
  const safePage = Math.min(catalogPage, totalPages);
  const catalogSlice = catalog.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Deep-link: /merchandise?item=<id> auto-opens the checkout for that product.
  useEffect(() => {
    const itemId = searchParams.get('item');
    if (!itemId || catalog.length === 0 || selected) return;
    const match = catalog.find((c) => c.id === itemId);
    if (match) {
      setSelected(match);
      setQuantity('1');
    }
    // Clear the param so refreshes/back-navigation don't reopen unexpectedly.
    const next = new URLSearchParams(searchParams);
    next.delete('item');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, searchParams]);

  const placeOrder = async () => {
    if (!selected) return;
    if (insufficient) {
      toast.error('Insufficient balance', {
        description: `Your wallet has ${formatUGX(availableWallet)} but this order needs ${formatUGX(orderTotal)}.`,
      });
      return;
    }
    setOrdering(true);
    const { error } = await db.rpc('agent_purchase_merchandise', {
      p_catalog_id: selected.id,
      p_quantity: qty,
    });
    setOrdering(false);
    if (error) {
      const msg = error.message || 'Could not place order';
      if (msg.includes('INSUFFICIENT_BALANCE')) {
        toast.error('Insufficient balance', {
          description: `Your wallet has ${formatUGX(availableWallet)} but this order needs ${formatUGX(orderTotal)}.`,
        });
      } else {
        toast.error(msg);
      }
      return;
    }
    toast.success(`${selected.item_name} ordered. ${formatUGX(orderTotal)} will be recovered from your wallet.`);
    setSelected(null);
    setQuantity('1');
    queryClient.invalidateQueries({ queryKey: ['my-merchandise-plans', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['my-merchandise-deductions', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['wallet-view', user?.id] });
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

  const bikeAmountNum = Math.max(0, parseInt(bikeAmount || '0', 10) || 0);

  const orderSpiroBike = async () => {
    if (bikeAmountNum < 1000) {
      toast.error('Enter an amount of at least UGX 1,000');
      return;
    }
    if (bikeAmountNum > availableWallet) {
      toast.error(
        `Amount exceeds your available wallet balance of ${formatUGX(availableWallet)}. Enter ${formatUGX(availableWallet)} or less.`
      );
      return;
    }
    setOrderingBike(true);
    const { error } = await db.rpc('agent_order_spiro_bike', { p_amount: bikeAmountNum });
    setOrderingBike(false);
    if (error) {
      toast.error(error.message || 'Could not place Spiro bike order');
      return;
    }
    toast.success(`Welile Spiro Bike requested. ${formatUGX(bikeAmountNum)} will be recovered from your wallet.`);
    setBikeOpen(false);
    setBikeAmount('');
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

        {/* Order a Welile Spiro Bike */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Bike className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight">Order a Welile Spiro Bike</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Get a Spiro bike on credit. Choose how much can be deducted from your wallet — final price is set by marketing.
              </p>
            </div>
            <Button size="sm" className="h-8 text-xs gap-1 shrink-0" onClick={() => { setBikeAmount(''); setBikeOpen(true); }}>
              Order
            </Button>
          </CardContent>
        </Card>

        {/* Spiro bike order status */}
        <SmartphoneOrderStatus userId={user?.id} itemName="Welile Spiro Bike" title="Spiro bike order status" />

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
            <>
            <div className="grid grid-cols-2 gap-3">
              {catalogSlice.map((item) => {
                const img = pickImage(item);
                return (
                <Card
                  key={item.id}
                  className="overflow-hidden cursor-pointer transition hover:shadow-md hover:border-primary/40 focus-within:ring-2 focus-within:ring-primary/40"
                  role="button"
                  tabIndex={0}
                  onClick={() => { setSelected(item); setQuantity('1'); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(item);
                      setQuantity('1');
                    }
                  }}
                  aria-label={`Buy ${item.item_name}`}
                >
                  {img ? (
                    <StorageImage src={img} alt={item.item_name} className="w-full h-28 object-cover" loading="lazy" />
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
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="flex-1 h-8 text-xs gap-1"
                        onClick={(e) => { e.stopPropagation(); setSelected(item); setQuantity('1'); }}
                      >
                        <ShoppingBag className="h-3.5 w-3.5" /> Buy
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0 shrink-0"
                        aria-label={`Share ${item.item_name}`}
                        onClick={(e) => { e.stopPropagation(); handleShare(item); }}
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 text-xs">
                <Button variant="outline" size="sm" className="h-7" disabled={safePage <= 1} onClick={() => setCatalogPage(safePage - 1)}>Previous</Button>
                <span className="text-muted-foreground">Page {safePage} of {totalPages}</span>
                <Button variant="outline" size="sm" className="h-7" disabled={safePage >= totalPages} onClick={() => setCatalogPage(safePage + 1)}>Next</Button>
              </div>
            )}
            </>
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
          <DialogHeader>
            <DialogTitle>Confirm your purchase</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {pickImage(selected) ? (
                  <StorageImage src={pickImage(selected)} alt={selected.item_name} className="w-14 h-14 rounded-lg object-cover" />
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
                <Input
                  type="number"
                  min={1}
                  step={1}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const digits = raw.replace(/[^0-9]/g, '');
                    setQuantity(digits === '' ? '' : String(parseInt(digits, 10)));
                  }}
                />
              </div>
              <div className="rounded-lg bg-muted/50 px-3 py-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Wallet balance</span>
                <span className="font-semibold">{formatUGX(availableWallet)}</span>
              </div>
              <div className={`rounded-lg px-3 py-2 flex justify-between text-sm ${insufficient ? 'bg-destructive/10 text-destructive' : 'bg-primary/5 text-foreground'}`}>
                <span className="text-muted-foreground">Total to debit now</span>
                <span className="font-bold">{formatUGX(orderTotal)}</span>
              </div>
              {insufficient ? (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 flex gap-2 text-[11px] text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <p><span className="font-semibold">Amount exceeds your available wallet balance of {formatUGX(availableWallet)}.</span> Reduce the quantity to continue.</p>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  This amount is recovered from your withdrawable wallet — 15% up to 4 times a day until fully paid.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)} disabled={ordering}>Cancel</Button>
            <Button onClick={placeOrder} disabled={ordering || insufficient}>
              {ordering ? 'Ordering…' : insufficient ? 'Amount exceeds balance' : `Confirm order · ${formatUGX(orderTotal)}`}
            </Button>
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
              <p className="text-[11px] text-muted-foreground">
                Available wallet balance: <span className="font-semibold">{formatUGX(availableWallet)}</span>
              </p>
            </div>
            {phoneAmountNum > 0 && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Will be recovered from wallet</span>
                <span className="font-bold">{formatUGX(phoneAmountNum)}</span>
              </div>
            )}
            {phoneAmountNum > availableWallet && (
              <p className="text-[11px] font-medium text-destructive">
                Amount exceeds your available wallet balance of {formatUGX(availableWallet)}.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              This amount is recovered from your withdrawable wallet — 15% up to 4 times a day until fully paid.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhoneOpen(false)} disabled={orderingPhone}>Cancel</Button>
            <Button onClick={orderSmartphone} disabled={orderingPhone || phoneAmountNum < 1000 || phoneAmountNum > availableWallet}>
              {orderingPhone ? 'Ordering…' : 'Confirm order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Spiro bike order dialog */}
      <Dialog open={bikeOpen} onOpenChange={(o) => { if (!o) setBikeOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bike className="h-4 w-4 text-primary" /> Order a Welile Spiro Bike
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Marketing sets the final bike price. Enter the amount you're comfortable having recovered
              from your wallet toward the Spiro bike.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Amount to deduct (UGX)</Label>
              <Input
                type="number"
                min={1000}
                step={1000}
                inputMode="numeric"
                placeholder="e.g. 50000"
                value={bikeAmount}
                onChange={(e) => setBikeAmount(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Available wallet balance: <span className="font-semibold">{formatUGX(availableWallet)}</span>
              </p>
            </div>
            {bikeAmountNum > 0 && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Will be recovered from wallet</span>
                <span className="font-bold">{formatUGX(bikeAmountNum)}</span>
              </div>
            )}
            {bikeAmountNum > availableWallet && (
              <p className="text-[11px] font-medium text-destructive">
                Amount exceeds your available wallet balance of {formatUGX(availableWallet)}.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              This amount is recovered from your withdrawable wallet — 15% up to 4 times a day until fully paid.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBikeOpen(false)} disabled={orderingBike}>Cancel</Button>
            <Button onClick={orderSpiroBike} disabled={orderingBike || bikeAmountNum < 1000 || bikeAmountNum > availableWallet}>
              {orderingBike ? 'Ordering…' : 'Confirm order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share fallback dialog */}
      <Dialog open={!!shareItem} onOpenChange={(o) => { if (!o) setShareItem(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-primary" /> Share {shareItem?.item_name}
            </DialogTitle>
          </DialogHeader>
          {shareItem && (() => {
            const { url, text, full } = buildShare(shareItem);
            const enc = encodeURIComponent;
            const targets: { label: string; href: string; className: string }[] = [
              { label: 'WhatsApp', href: `https://wa.me/?text=${enc(full)}`, className: 'bg-emerald-500 hover:bg-emerald-600 text-white' },
              { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(text)}`, className: 'bg-blue-600 hover:bg-blue-700 text-white' },
              { label: 'X (Twitter)', href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`, className: 'bg-black hover:bg-neutral-800 text-white' },
              { label: 'Telegram', href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`, className: 'bg-sky-500 hover:bg-sky-600 text-white' },
              { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`, className: 'bg-[#0A66C2] hover:bg-[#004182] text-white' },
              { label: 'Email', href: `mailto:?subject=${enc(shareItem.item_name)}&body=${enc(full)}`, className: 'bg-muted hover:bg-muted/80 text-foreground' },
            ];
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {targets.map((t) => (
                    <a
                      key={t.label}
                      href={t.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`h-9 rounded-md text-xs font-semibold inline-flex items-center justify-center ${t.className}`}
                    >
                      {t.label}
                    </a>
                  ))}
                </div>
                <div className="rounded-md border bg-muted/40 px-2.5 py-2 text-[11px] break-all">
                  {url}
                </div>
                <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => copyShareLink(shareItem)}>
                  Copy link
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
