import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, Store, Phone, CheckCircle2, Loader2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap } from '@/lib/haptics';
import { useToast } from '@/hooks/use-toast';

interface ClaimBreadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reducedPrice: number;
  basePrice: number;
  freeBreads: number;
  hasReceipt: boolean;
}

interface NearbySeller {
  id: string;
  name: string;
  distanceKm: number;
  address: string;
  phone: string;
  inStock: boolean;
}

const SELLERS: NearbySeller[] = [
  { id: 's1', name: 'Welile Bakery — Kololo', distanceKm: 0.4, address: 'Plot 22, Acacia Ave', phone: '+256700111222', inStock: true },
  { id: 's2', name: 'Quick Mart — Ntinda', distanceKm: 1.1, address: 'Ntinda Shopping Complex', phone: '+256700333444', inStock: true },
  { id: 's3', name: 'Daily Loaf — Bukoto', distanceKm: 1.8, address: 'Bukoto Main St', phone: '+256700555666', inStock: false },
  { id: 's4', name: 'Fresh Oven — Naguru', distanceKm: 2.6, address: 'Naguru Hill Rd', phone: '+256700777888', inStock: true },
];

export function ClaimBreadDialog({ open, onOpenChange, reducedPrice, basePrice, freeBreads, hasReceipt }: ClaimBreadDialogProps) {
  const { toast } = useToast();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimedId, setClaimedId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setClaimedId(null);
      setClaimingId(null);
    }
  }, [open]);

  const sortedSellers = useMemo(() => [...SELLERS].sort((a, b) => a.distanceKm - b.distanceKm), []);

  const requestLocation = () => {
    if (!('geolocation' in navigator)) {
      toast({ title: 'Location not supported', description: 'Your device does not support location.', variant: 'destructive' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast({ title: 'Location updated', description: 'Showing closest sellers.' });
      },
      () => {
        setLocating(false);
        toast({ title: 'Location unavailable', description: 'Showing default nearby list.', variant: 'destructive' });
      },
      { timeout: 8000 }
    );
  };

  const handleClaim = (seller: NearbySeller) => {
    if (!seller.inStock) return;
    hapticTap();
    setClaimingId(seller.id);
    setTimeout(() => {
      setClaimingId(null);
      setClaimedId(seller.id);
      toast({
        title: 'Bread reserved',
        description: `Show this confirmation at ${seller.name} to collect.`,
      });
    }, 700);
  };

  const priceLabel = freeBreads > 0 ? 'FREE' : formatUGX(reducedPrice);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Store className="h-5 w-5" /> Claim your discounted bread
          </DialogTitle>
          <DialogDescription className="text-white/90 text-xs">
            Pick a nearby seller. Your price today:{' '}
            <span className="font-bold">{priceLabel}</span>
            {reducedPrice < basePrice && (
              <span className="line-through opacity-80 ml-1">{formatUGX(basePrice)}</span>
            )}
            {!hasReceipt && (
              <span className="block mt-1 opacity-90">Tip: add a Welile receipt to unlock 5% off.</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {coords ? `Near ${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}` : 'Showing nearby sellers'}
            </span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={requestLocation} disabled={locating}>
            {locating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Navigation className="h-3 w-3" />}
            <span className="ml-1">Use my location</span>
          </Button>
        </div>

        <ul className="max-h-[55vh] overflow-y-auto divide-y divide-border">
          {sortedSellers.map((seller) => {
            const isClaiming = claimingId === seller.id;
            const isClaimed = claimedId === seller.id;
            return (
              <li key={seller.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-foreground truncate">{seller.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{seller.address}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px]">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {seller.distanceKm.toFixed(1)} km
                    </span>
                    {seller.inStock ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">In stock</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">Out of stock</span>
                    )}
                    <a
                      href={`tel:${seller.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Phone className="h-3 w-3" /> Call
                    </a>
                  </div>
                </div>
                <Button
                  size="sm"
                  className={`shrink-0 ${isClaimed ? 'bg-emerald-600 hover:bg-emerald-600' : ''}`}
                  disabled={!seller.inStock || isClaiming || isClaimed}
                  onClick={() => handleClaim(seller)}
                >
                  {isClaiming ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isClaimed ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Reserved
                    </>
                  ) : (
                    'Claim'
                  )}
                </Button>
              </li>
            );
          })}
        </ul>

        <div className="px-5 py-3 border-t border-border bg-muted/30">
          <p className="text-[10px] text-muted-foreground text-center">
            Reservations hold your bread for 2 hours. Show this screen at pickup.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}