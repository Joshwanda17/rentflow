import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDynamic } from '@/lib/currencyFormat';
import { Home, MapPin, Phone, ShieldCheck, User } from 'lucide-react';
import tenantPhotoPlaceholder from '@/assets/tenant-photo-placeholder.jpg';

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
  tenant_has_photo?: boolean | null;
  landlord_name: string | null;
  landlord_phone: string | null;
  lc1_chairperson_name: string | null;
  house_image_urls: string[] | null;
  request_latitude?: number | string | null;
  request_longitude?: number | string | null;
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  if (!plan) return null;
  const photos = (plan.house_image_urls ?? []).filter(Boolean);
  const name = plan.tenant_full_name || plan.tenant_first_name || 'Tenant';
  // "Budumbuli, Bugembe Town, Jinja, Eastern" -> address = whole string, region = last segment
  const addressParts = (plan.tenant_location || plan.request_city || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const fullAddress = addressParts.length
    ? `${addressParts.join(', ')}, Uganda`
    : 'Location not captured yet';
  const regionLabel = addressParts.length
    ? addressParts[addressParts.length - 1]
    : 'Uganda';
  const endLabel = plan.projected_end_date
    ? new Date(plan.projected_end_date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
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

        {/* Photo carousel */}
        <div className="relative w-full h-56 bg-muted">
          {photos.length > 0 ? (
            <Carousel className="w-full h-56" opts={{ loop: photos.length > 1 }}>
              <CarouselContent className="ml-0 h-56">
                {photos.map((url, i) => (
                  <CarouselItem key={url + i} className="pl-0 basis-full">
                    <button
                      type="button"
                      onClick={() => setLightboxIndex(i)}
                      aria-label={`Expand house photo ${i + 1}`}
                      className="block w-full h-56"
                    >
                      <img
                        src={url}
                        alt={`House photo ${i + 1}`}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <span className="absolute bottom-3 right-3 rounded-md bg-foreground/70 px-2 py-1 text-[11px] font-semibold text-background">
                      {i + 1} / {photos.length}
                    </span>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {photos.length > 1 && (
                <>
                  <CarouselPrevious className="left-3 h-8 w-8" />
                  <CarouselNext className="right-3 h-8 w-8" />
                </>
              )}
            </Carousel>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Home className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Expanded image card */}
        <Dialog open={lightboxIndex !== null} onOpenChange={(v) => !v && setLightboxIndex(null)}>
          <DialogContent className="max-w-3xl p-0 overflow-hidden">
            <DialogHeader className="sr-only">
              <DialogTitle>House photo</DialogTitle>
            </DialogHeader>
            {lightboxIndex !== null && (
              <Carousel
                className="w-full"
                opts={{ loop: photos.length > 1, startIndex: lightboxIndex }}
              >
                <CarouselContent className="ml-0">
                  {photos.map((url, i) => (
                    <CarouselItem key={`lb-${url}-${i}`} className="pl-0 basis-full">
                      <img
                        src={url}
                        alt={`House photo ${i + 1} enlarged`}
                        className="w-full max-h-[75vh] object-contain bg-muted"
                      />
                      <p className="px-4 py-3 text-xs text-muted-foreground">
                        Photo {i + 1} of {photos.length}
                      </p>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {photos.length > 1 && (
                  <>
                    <CarouselPrevious className="left-3" />
                    <CarouselNext className="right-3" />
                  </>
                )}
              </Carousel>
            )}
          </DialogContent>
        </Dialog>

        {/* Title card overlapping the hero */}
        <div className="relative -mt-6 rounded-t-3xl bg-background px-5 pt-6 pb-5">
          <h2 className="text-2xl font-extrabold leading-tight tracking-tight">
            {plan.house_category ? `${plan.house_category} in ` : 'Rent plan in '}
            {regionLabel}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground flex items-start gap-1">
            <MapPin className="h-3.5 w-3.5 flex-none mt-0.5" />
            <span>{fullAddress}</span>
          </p>

          {/* Key details */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl bg-primary/5 px-4 py-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Rent amount</p>
              <p className="text-xl font-black text-primary truncate">{formatDynamic(plan.funding_amount)}</p>
            </div>
            <div className="rounded-2xl bg-muted/50 px-4 py-3 flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground flex-none" />
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">Landlord</p>
                <p className="text-sm font-bold truncate">{plan.landlord_name ?? 'Landlord'}</p>
              </div>
            </div>
            <div className="rounded-2xl bg-muted/50 px-4 py-3 flex items-center gap-3">
              <Phone className="h-5 w-5 text-muted-foreground flex-none" />
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">Contact</p>
                <p className="text-sm font-bold truncate">{plan.landlord_phone ?? '—'}</p>
              </div>
            </div>
            <div className="rounded-2xl bg-muted/50 px-4 py-3 flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-muted-foreground flex-none" />
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">LC Name</p>
                <p className="text-sm font-bold truncate">{plan.lc1_chairperson_name ?? '—'}</p>
              </div>
            </div>
          </div>

          {/* Tenant row */}
          <div className="mt-6 border-t border-border pt-4 flex items-center gap-3">
            {/* Privacy: the tenant photo is never sent to the client for this
                view, so there is no image URL to reveal via devtools. */}
            <div
              aria-label="Tenant photo protected"
              className="relative w-12 h-12 rounded-full overflow-hidden bg-muted flex-none"
            >
              <img
                src={tenantPhotoPlaceholder}
                alt="Tenant photo hidden for privacy"
                loading="lazy"
                width={512}
                height={640}
                className="h-full w-full scale-110 object-cover blur-[5px]"
              />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">Plan for {name}</p>
              <p className="text-xs text-muted-foreground truncate">
                Landlord: {plan.landlord_name ?? 'Landlord'}
              </p>
            </div>
          </div>

          {/* Thumbnails */}
          {photos.length > 1 && (
            <div className="mt-5">
              <p className="text-sm font-bold mb-2">More photos</p>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((url, i) => (
                  <button
                    type="button"
                    key={`thumb-${url}-${i}`}
                    onClick={() => setLightboxIndex(i)}
                    aria-label={`Expand house photo ${i + 1}`}
                    className="rounded-xl overflow-hidden"
                  >
                    <img
                      src={url}
                      alt={`House photo ${i + 1}`}
                      loading="lazy"
                      className="w-full h-24 object-cover bg-muted"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Privacy notice band */}
          <div className="mt-4 -mx-5 bg-muted/50 px-5 py-3 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground flex-none mt-0.5" />
            <p className="text-xs text-muted-foreground">
              {isFunded
                ? 'You already support this tenant. The landlord and tenant have agreed to share this information through Welile.'
                : 'Summary only. Photo and contact details stay hidden until you support this tenant.'}
            </p>
          </div>

          {/* Sticky price footer */}
          <div className="sticky bottom-0 -mx-5 mt-6 border-t border-border bg-background px-5 py-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-extrabold underline underline-offset-4 truncate">
                {formatDynamic(plan.funding_amount)}
              </p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}