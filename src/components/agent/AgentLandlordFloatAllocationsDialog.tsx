import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatUGX } from '@/lib/rentCalculations';
import { useLandlordFloatAllocations, type LandlordFloatAllocation } from '@/hooks/useLandlordFloatAllocations';
import { Loader2, Landmark, ArrowRight, Inbox, User, Phone } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAllocation: (allocation: LandlordFloatAllocation) => void;
}

/**
 * Phase 1 — Per-tenant allocations browser.
 * Shows the agent which tenants currently have ring-fenced float ready to be paid
 * to a landlord. Tapping an allocation hands off to the existing payout wizard.
 */
export function AgentLandlordFloatAllocationsDialog({ open, onOpenChange, onSelectAllocation }: Props) {
  const { data: allocations = [], isLoading } = useLandlordFloatAllocations({ onlyOpen: true });

  const totalRemaining = allocations.reduce((sum, a) => sum + a.remaining_amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-[#9234EA]" />
            Pick a Tenant to Pay Their Landlord
          </DialogTitle>
          <DialogDescription className="text-xs">
            {allocations.length > 0
              ? <>Your float is ring-fenced per tenant. Tap a row to start the landlord payout.</>
              : <>No open allocations. Float is credited automatically when CFO disburses a rent request.</>}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : allocations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-6 text-center text-muted-foreground">
            <Inbox className="h-10 w-10 mb-2 opacity-50" />
            <p className="text-sm font-medium text-foreground">No tenants pending payout</p>
            <p className="text-xs mt-1">Once a rent request is fully approved and CFO disburses, it will appear here.</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total ring-fenced</span>
              <span className="font-bold text-foreground">{formatUGX(totalRemaining)}</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {allocations.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onSelectAllocation(a)}
                    className="w-full text-left p-3 rounded-xl border-2 border-border bg-card hover:border-[#9234EA]/40 hover:bg-[#9234EA]/5 transition-colors active:scale-[0.99] touch-manipulation"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground truncate">
                          <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                          Landlord: {a.landlord_name}
                        </div>
                        {a.landlord_phone && (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5 truncate">
                            <Phone className="h-3 w-3 shrink-0" />
                            {a.landlord_phone}
                          </div>
                        )}
                      </div>
                      {a.status === 'partially_paid' && (
                        <Badge variant="secondary" className="text-[9px] shrink-0">Partial</Badge>
                      )}
                      {a.source === 'legacy_backfill' && (
                        <Badge variant="outline" className="text-[9px] shrink-0">Legacy</Badge>
                      )}
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Remaining</div>
                        <div className="font-bold text-base text-[#9234EA]">{formatUGX(a.remaining_amount)}</div>
                        {a.paid_out_amount > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            Paid: {formatUGX(a.paid_out_amount)} / {formatUGX(a.allocated_amount)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs font-semibold text-[#9234EA]">
                        Withdraw
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <div className="border-t p-3">
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
