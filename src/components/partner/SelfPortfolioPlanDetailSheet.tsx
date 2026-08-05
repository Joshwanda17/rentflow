import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatDynamic } from '@/lib/currencyFormat';
import { Home, Lock, MapPin, ShieldCheck } from 'lucide-react';

export interface PlanDetail {
  rent_request_id: string;
  funding_amount: number;
  duration_days: number | null;
  daily_repayment: number | null;
  request_city: string | null;
  house_category: string | null;
  projected_end_date: string | null;
  repayment_cadence: string | null;
  tenant_full_name: string | null;
  tenant_first_name: string | null;
  tenant_location: string | null;
  tenant_avatar_url: string | null;
  landlord_name: string | null;
  house_image_urls: string[] | null;
}

/**
 * Read-only plan detail view for self-managed partners.
 * Privacy: tenant photo stays blurred and no phone number or contact detail is
 * ever rendered. Full tenant records unlock only after the partner supports the
 * tenant.
 */
export function SelfPortfolioPlanDetailSheet({
  plan,
  open,
  onOpenChange,
  isFunded,
}: {
  plan: PlanDetail | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isFunded: boolean;
}) {
  if (!plan) return null;
  const photos = (plan.house_image_urls ?? []).filter(Boolean);
  const name = plan.tenant_full_name || plan.tenant_first_name || 'Tenant';
  const hero = photos[0];
  const restPhotos = photos.slice(1);
  const endLabel = plan.projected_end_date
    ? new Date(plan.projected_end_date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

  const stats = [
    { value: plan.daily_repayment ? formatDynamic(plan.daily_repayment) : '—', label: 'Daily' },
    { value: `${plan.duration_days ?? 30}`, label: 'Days term' },
    { value: endLabel, label: 'Ends' },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Rent plan details</SheetTitle>
        </SheetHeader>

        {/* Hero photo */}
        <div className="relative w-full h-56 bg-muted">
          {hero ? (
            <img src={hero} alt="House photo 1" loading="lazy" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Home className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          {photos.length > 0 && (
            <span className="absolute bottom-3 right-3 rounded-md bg-foreground/70 px-2 py-1 text-[11px] font-semibold text-background">
              1 / {photos.length}
            </span>
          )}
        </div>

        {/* Title card overlapping the hero */}
        <div className="relative -mt-6 rounded-t-3xl bg-background px-5 pt-6 pb-5">
          <h2 className="text-2xl font-extrabold leading-tight tracking-tight">
            {plan.house_category ? `${plan.house_category} in ` : 'Rent plan in '}
            {plan.tenant_location || plan.request_city || 'Uganda'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 flex-none" />
            {plan.request_city || 'Uganda'}
          </p>
          <p className="text-sm text-muted-foreground">
            {plan.duration_days ?? 30} day term
            {plan.repayment_cadence ? ` · Collected ${plan.repayment_cadence}` : ''}
          </p>

          {/* Stat strip */}
          <div className="mt-6 grid grid-cols-3 divide-x divide-border">
            {stats.map((s) => (
              <div key={s.label} className="px-2 text-center min-w-0">
                <p className="text-sm font-extrabold truncate">{s.value}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Tenant row */}
          <div className="mt-6 border-t border-border pt-4 flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-full overflow-hidden bg-muted flex-none">
              {plan.tenant_avatar_url ? (
                <img
                  src={plan.tenant_avatar_url}
                  alt="Tenant profile photo"
                  loading="lazy"
                  className="w-full h-full object-cover blur-md scale-110"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">
                  {name.charAt(0)}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-background/30">
                <Lock className="h-4 w-4 text-foreground" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">Plan for {name}</p>
              <p className="text-xs text-muted-foreground truncate">
                Landlord: {plan.landlord_name ?? 'Landlord'}
              </p>
            </div>
          </div>

          {/* Privacy notice band */}
          <div className="mt-4 -mx-5 bg-muted/50 px-5 py-3 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground flex-none mt-0.5" />
            <p className="text-xs text-muted-foreground">
              {isFunded
                ? 'You already support this tenant. Tenant contact details stay with the agent.'
                : 'Summary only. The tenant photo stays blurred and contact details are hidden until you support this tenant.'}
            </p>
          </div>

          {/* Remaining photos */}
          {restPhotos.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-bold mb-2">More photos</p>
              <div className="grid grid-cols-3 gap-2">
                {restPhotos.map((url, i) => (
                  <img
                    key={url + i}
                    src={url}
                    alt={`House photo ${i + 2}`}
                    loading="lazy"
                    className="w-full h-24 object-cover rounded-xl bg-muted"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sticky price footer */}
          <div className="sticky bottom-0 -mx-5 mt-6 border-t border-border bg-background px-5 py-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-extrabold underline underline-offset-4 truncate">
                {formatDynamic(plan.funding_amount)}
              </p>
              <p className="text-xs text-muted-foreground truncate">Rent needed · ends {endLabel}</p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}