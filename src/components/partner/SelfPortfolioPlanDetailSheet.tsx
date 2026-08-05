import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
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

  const facts = [
    { label: 'Rent needed', value: formatDynamic(plan.funding_amount) },
    { label: 'Daily repayment', value: plan.daily_repayment ? formatDynamic(plan.daily_repayment) : '—' },
    { label: 'Term', value: `${plan.duration_days ?? 30} days` },
    {
      label: 'Ends',
      value: plan.projected_end_date
        ? new Date(plan.projected_end_date).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : '—',
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">Rent plan details</SheetTitle>
        </SheetHeader>

        <div className="mt-3 flex items-start gap-3">
          <div className="relative w-14 h-14 rounded-full overflow-hidden bg-muted flex-none">
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
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm">{name}</p>
            <p className="text-[11px] text-muted-foreground">Landlord: {plan.landlord_name ?? 'Landlord'}</p>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
              <MapPin className="h-3 w-3 flex-none" />
              <span>{plan.tenant_location || plan.request_city || 'Uganda'}</span>
            </div>
            {plan.house_category && (
              <Badge variant="secondary" className="text-[10px] mt-1">
                {plan.house_category}
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {facts.map((f) => (
            <div key={f.label} className="rounded-xl bg-muted/40 px-3 py-2 min-w-0">
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">{f.label}</p>
              <p className="text-xs font-bold text-foreground mt-0.5 truncate">{f.value}</p>
            </div>
          ))}
        </div>

        {plan.repayment_cadence && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Repayments collected {plan.repayment_cadence}.
          </p>
        )}

        <div className="mt-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Home className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[11px] font-semibold text-muted-foreground">House photos</p>
          </div>
          {photos.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {photos.map((url, i) => (
                <img
                  key={url + i}
                  src={url}
                  alt={`House photo ${i + 1}`}
                  loading="lazy"
                  className="w-full h-28 object-cover rounded-xl bg-muted"
                />
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">No house photos posted for this plan yet.</p>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-border p-3 flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground flex-none mt-0.5" />
          <p className="text-[10px] text-muted-foreground">
            {isFunded
              ? 'You already support this tenant. Tenant contact details stay with the agent.'
              : 'This is a summary only. The tenant photo stays blurred and contact details are hidden until you support this tenant.'}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}