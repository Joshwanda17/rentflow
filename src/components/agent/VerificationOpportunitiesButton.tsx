import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { formatUGX } from '@/lib/rentCalculations';
import { VerifyTenantButton } from '@/components/verification';
import { Skeleton } from '@/components/ui/skeleton';

interface UnverifiedRequest {
  id: string;
  rent_amount: number;
  created_at: string;
  landlord_id: string;
  tenant?: { full_name: string; city: string } | null;
  landlord?: { name: string; property_address: string } | null;
}

export function VerificationOpportunitiesButton() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<UnverifiedRequest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCount();

    const channel = supabase
      .channel('unverified-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rent_requests' }, () => {
        fetchCount();
        if (open) fetchRequests();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [open]);

  const fetchCount = async () => {
    const { count } = await supabase
      .from('rent_requests')
      .select('*', { count: 'exact', head: true })
      .eq('agent_verified', false)
      .in('status', ['pending', 'approved']);
    setCount(count || 0);
  };

  const fetchRequests = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('rent_requests')
      .select('id, rent_amount, created_at, landlord_id, tenant:profiles!rent_requests_tenant_id_fkey(full_name, city), landlord:landlords!rent_requests_landlord_id_fkey(name, property_address)')
      .eq('agent_verified', false)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false });
    setRequests((data as any) || []);
    setLoading(false);
  };

  const handleOpen = () => {
    hapticTap();
    setOpen(true);
    fetchRequests();
  };

  if (count === 0) return null;

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={handleOpen}
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-destructive text-destructive-foreground shadow-lg touch-manipulation"
      >
        <Shield className="h-4 w-4" />
        <span className="text-sm font-bold">Verify & Earn</span>
        <Badge variant="outline" className="bg-white/20 border-white/30 text-destructive-foreground text-xs px-1.5">
          {count}
        </Badge>
      </motion.button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl p-0">
          <SheetHeader className="p-4 pb-2">
            <SheetTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-destructive" />
              Verification Opportunities
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              Verify tenants to earn <span className="font-bold text-success">UGX 10,000</span> + <span className="font-bold text-success">5%</span> of every repayment
            </p>
          </SheetHeader>

          <ScrollArea className="flex-1 h-[calc(85vh-100px)] px-4 pb-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
              </div>
            ) : requests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No requests to verify right now</p>
            ) : (
              <div className="space-y-3">
                {requests.map(req => (
                  <Card key={req.id} className="border-border/60">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">{req.tenant?.full_name || 'Unknown Tenant'}</p>
                          <p className="text-xs text-muted-foreground">{req.tenant?.city || 'No location'}</p>
                        </div>
                        <p className="font-bold text-primary">{formatUGX(req.rent_amount)}</p>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <p>Landlord: {req.landlord?.name || 'Unknown'}</p>
                        <p>Property: {req.landlord?.property_address || 'N/A'}</p>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="text-xs space-y-0.5">
                          <p className="text-success font-medium">💰 UGX 10,000 bonus</p>
                          <p className="text-success font-medium">📈 5% ongoing commission</p>
                        </div>
                        <VerifyTenantButton
                          requestId={req.id}
                          landlordId={req.landlord_id}
                          variant="agent"
                          onVerified={() => {
                            fetchCount();
                            fetchRequests();
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
