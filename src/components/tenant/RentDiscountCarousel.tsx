import { useEffect, useMemo, useState } from 'react';
import { Home, BadgePercent, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap } from '@/lib/haptics';
import { useToast } from '@/hooks/use-toast';
import { useDemoRentalTargets, type DemoRentalCardId } from '@/hooks/useDemoRentalTargets';
import rental1 from '@/assets/rental-1.jpg';
import rental2 from '@/assets/rental-2.jpg';
import rental3 from '@/assets/rental-3.jpg';

interface RentalCard {
  id: string;
  title: string;
  area: string;
  monthlyRent: number;
  image: string;
}

const RENTALS: RentalCard[] = [
  { id: 'r1', title: 'Modern Apartments', area: 'Ntinda · Kampala', monthlyRent: 850000, image: rental1 },
  { id: 'r2', title: 'Family House',       area: 'Kabale Town',     monthlyRent: 450000, image: rental2 },
  { id: 'r3', title: 'City Studio',        area: 'Bukoto · Kampala', monthlyRent: 600000, image: rental3 },
];

interface RentDiscountCarouselProps {
  /** Same percentage discount the tenant earned on bread (e.g. 0.05 for 5%). */
  discountPct: number;
  /** Optional: invoked when the user taps a house card (image/title area). */
  onSelectHouse?: () => void;
}

const STORAGE_KEY = 'welile.tenant.rentDiscount.appliedId';

export function RentDiscountCarousel({ discountPct, onSelectHouse }: RentDiscountCarouselProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: targets } = useDemoRentalTargets();
  const [appliedId, setAppliedId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      return v && RENTALS.some((r) => r.id === v) ? v : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (appliedId) window.localStorage.setItem(STORAGE_KEY, appliedId);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [appliedId]);
  const pct = useMemo(() => Math.max(0, Math.min(0.5, discountPct)), [discountPct]);
  const pctLabel = `${Math.round(pct * 100)}%`;

  const handleApply = (r: RentalCard) => {
    hapticTap();
    setAppliedId(r.id);
    toast({
      title: 'Discount applied',
      description: `${pctLabel} off ${r.title} — saves ${formatUGX(Math.round(r.monthlyRent * pct))} this month.`,
    });
  };

  return (
    <section className="space-y-2" aria-label="Apply your bread discount to rent">
      <div className="flex items-center justify-between px-1">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <BadgePercent className="h-4 w-4 text-emerald-600" />
            Use your {pctLabel} on rent
          </p>
          <p className="text-[11px] text-muted-foreground">
            Apply the same discount to your monthly rent at any of these rentals.
          </p>
        </div>
      </div>
      <div className="-mx-4 px-4 overflow-x-auto no-scrollbar">
        <ul className="flex gap-3 snap-x snap-mandatory pb-1">
          {RENTALS.map((r) => {
            const saving = Math.round(r.monthlyRent * pct);
            const newRent = r.monthlyRent - saving;
            const applied = appliedId === r.id;
            return (
              <li
                key={r.id}
                className="snap-start shrink-0 w-[78%] sm:w-[280px] rounded-2xl overflow-hidden border border-border bg-card shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => {
                    hapticTap();
                    const houseId = targets?.[r.id as DemoRentalCardId] ?? null;
                    if (houseId) {
                      navigate(`/house/${houseId}`);
                    } else {
                      onSelectHouse?.();
                    }
                  }}
                  aria-label={`View available houses like ${r.title}`}
                  className="block w-full text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                <div className="relative h-32 w-full bg-muted">
                  <img
                    src={r.image}
                    alt={`${r.title} in ${r.area}`}
                    loading="lazy"
                    width={1024}
                    height={640}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 text-white px-2 py-0.5 text-[10px] font-bold shadow">
                    <BadgePercent className="h-3 w-3" /> {pctLabel} OFF
                  </span>
                </div>
                <div className="px-3 pt-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1">
                      <Home className="h-3.5 w-3.5 text-muted-foreground" /> {r.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{r.area}</p>
                  </div>
                </div>
                </button>
                <div className="p-3 pt-2 space-y-2">
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Monthly rent</p>
                      <p className="text-sm font-bold text-foreground leading-tight">
                        {formatUGX(newRent)}
                      </p>
                      {pct > 0 && (
                        <p className="text-[10px] text-muted-foreground line-through leading-tight">
                          {formatUGX(r.monthlyRent)}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApply(r)}
                      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                        applied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300'
                      }`}
                      aria-label={`Apply ${pctLabel} discount to ${r.title}`}
                    >
                      {applied ? (
                        <><CheckCircle2 className="h-3.5 w-3.5" /> Applied</>
                      ) : (
                        <>Apply {pctLabel}</>
                      )}
                    </button>
                  </div>
                  {pct > 0 && (
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                      You save {formatUGX(saving)} / month
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}