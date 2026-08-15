import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Home, UserPlus, Coins, Percent, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import heroImg from '@/assets/agent-list-register-earn.jpg';

const STORAGE_KEY = 'welile.listRegisterEarnDialog.dismissedAt';
const SUPPRESS_MS = 12 * 60 * 60 * 1000; // once every 12 hours

interface Props {
  onListHouse: () => void;
  onRegisterTenant: () => void;
}

/**
 * On-load earnings dialog for agents: list an empty house + register the tenant
 * on it and earn UGX 12,000 plus the standard rent commissions (8% / 10%).
 */
export function ListRegisterEarnDialog({ onListHouse, onRegisterTenant }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const dismissedAt = Number(localStorage.getItem(STORAGE_KEY) || '0');
      if (dismissedAt && Date.now() - dismissedAt < SUPPRESS_MS) return;
    } catch {}
    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {}
    setOpen(false);
  };

  const act = (fn: () => void) => {
    close();
    setTimeout(fn, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent
        className="w-[calc(100vw-1.5rem)] sm:w-full max-w-md p-0 gap-0 overflow-hidden max-h-[92vh] flex flex-col"
        hideCloseButton
      >
        <div className="relative shrink-0">
          <img
            src={heroImg}
            alt="Welile agent listing a house and registering a happy tenant family"
            width={1280}
            height={640}
            loading="lazy"
            className="w-full h-36 sm:h-44 object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
          <button
            onClick={close}
            aria-label="Close"
            className="absolute top-2 right-2 h-8 w-8 rounded-full flex items-center justify-center bg-background/80 text-foreground hover:bg-background"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-3 right-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Agent earnings</p>
            <h2 className="text-lg sm:text-xl font-bold leading-tight text-foreground">
              List a house, register the tenant, get paid twice
            </h2>
          </div>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          {/* Headline amounts */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-warning/40 bg-warning/10 p-3">
              <div className="flex items-center gap-1.5 text-warning">
                <Coins className="h-3.5 w-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">One-off bonus</span>
              </div>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">UGX 12,000</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Paid once you list an empty house and a tenant is registered into it.
              </p>
            </div>
            <div className="rounded-2xl border border-success/40 bg-success/10 p-3">
              <div className="flex items-center gap-1.5 text-success">
                <Percent className="h-3.5 w-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Plus commission</span>
              </div>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">8% – 10%</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Earned on the rent that tenant repays — every cycle, not once.
              </p>
            </div>
          </div>

          {/* How it works */}
          <div className="rounded-2xl border bg-muted/30 p-3 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              How you earn it
            </p>
            <ol className="space-y-2 text-[12px] text-foreground">
              <li className="flex gap-2">
                <span className="h-5 w-5 shrink-0 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center">1</span>
                <span>
                  <strong>List the empty house</strong> with photos, GPS and the landlord's details
                  (daytime only, 6:00 AM – 6:00 PM).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="h-5 w-5 shrink-0 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center">2</span>
                <span>
                  <strong>Register the tenant</strong> who moves in and submit their rent request
                  for review.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="h-5 w-5 shrink-0 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center">3</span>
                <span>
                  <strong>UGX 12,000</strong> lands in your withdrawable wallet, then
                  <strong> 8%–10% commission</strong> keeps coming as the tenant repays rent.
                </span>
              </li>
            </ol>
          </div>

          <p className="text-[11px] text-muted-foreground leading-snug">
            The bonus is paid per verified house-and-tenant match. Duplicate or unverified
            listings do not qualify.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <Button onClick={() => act(onListHouse)} className="gap-2 font-semibold">
              <Home className="h-4 w-4" /> List a house
            </Button>
            <Button variant="outline" onClick={() => act(onRegisterTenant)} className="gap-2 font-semibold">
              <UserPlus className="h-4 w-4" /> Register a tenant
            </Button>
          </div>
          <button
            onClick={close}
            className="w-full text-[12px] text-muted-foreground py-1 hover:text-foreground"
          >
            Maybe later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ListRegisterEarnDialog;