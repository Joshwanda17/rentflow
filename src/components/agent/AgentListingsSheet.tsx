import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Home, MapPin, DoorOpen, CheckCircle, Clock } from 'lucide-react';
import { useHouseListings, HouseListing } from '@/hooks/useHouseListings';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';

interface AgentListingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentListingsSheet({ open, onOpenChange }: AgentListingsSheetProps) {
  const { user } = useAuth();
  const { listings, loading } = useHouseListings({
    agentId: user?.id,
    status: undefined, // show all statuses for agent
    limit: 100,
  });

  // Override default status filter - fetch all for this agent
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            My Listed Houses
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))
          ) : listings.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <Home className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground text-sm">No houses listed yet</p>
            </div>
          ) : (
            listings.map(l => (
              <motion.div
                key={l.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-xl border border-border bg-card p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{l.title}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{l.address}, {l.region}</span>
                    </div>
                  </div>
                  <Badge variant={l.status === 'available' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                    {l.status === 'available' ? (
                      <><CheckCircle className="h-3 w-3 mr-1" /> Available</>
                    ) : l.status === 'occupied' ? (
                      <><DoorOpen className="h-3 w-3 mr-1" /> Occupied</>
                    ) : (
                      <><Clock className="h-3 w-3 mr-1" /> {l.status}</>
                    )}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{formatUGX(l.monthly_rent)}/mo</span>
                  <span className="text-sm font-bold text-success">{formatUGX(l.daily_rate)}/day</span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
