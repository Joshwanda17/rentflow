import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, User, Phone, Calendar, ChevronDown, ChevronUp, FileDown, MessageCircle, Banknote } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, startOfDay } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadRepaymentPdf, shareRepaymentPdfWhatsApp } from '@/lib/repaymentSchedulePdf';
import { useToast } from '@/hooks/use-toast';

interface Tenant {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  created_at: string;
  monthly_rent: number | null;
  verified: boolean;
}

interface TenantRentRequest {
  id: string;
  rent_amount: number;
  total_repayment: number;
  duration_days: number;
  daily_repayment: number;
  amount_repaid: number;
  status: string | null;
  created_at: string;
  disbursed_at: string | null;
  landlord?: { name: string; property_address: string } | null;
}

interface AgentTenantsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function buildScheduleDays(startDate: string, durationDays: number) {
  const start = startOfDay(new Date(startDate));
  const days = [];
  for (let i = 0; i < Math.min(durationDays, 10); i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

export function AgentTenantsSheet({ open, onOpenChange }: AgentTenantsSheetProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);
  const [tenantRequests, setTenantRequests] = useState<Record<string, TenantRentRequest[]>>({});
  const [loadingRequests, setLoadingRequests] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      fetchTenants();
    }
    if (!open) {
      setExpandedTenantId(null);
    }
  }, [open, user]);

  const fetchTenants = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone, email, created_at, monthly_rent, verified')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTenants(data || []);
    } catch (err) {
      console.error('Failed to fetch tenants:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTenantRequests = useCallback(async (tenantId: string) => {
    if (tenantRequests[tenantId]) return; // already loaded
    setLoadingRequests(tenantId);
    try {
      const { data, error } = await supabase
        .from('rent_requests')
        .select('id, rent_amount, total_repayment, duration_days, daily_repayment, amount_repaid, status, created_at, disbursed_at, landlord:landlords(name, property_address)')
        .eq('tenant_id', tenantId)
        .in('status', ['approved', 'disbursed', 'repaying', 'completed'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setTenantRequests(prev => ({ ...prev, [tenantId]: (data as unknown as TenantRentRequest[]) || [] }));
    } catch (err) {
      console.error('Failed to fetch tenant requests:', err);
    } finally {
      setLoadingRequests(null);
    }
  }, [tenantRequests]);

  const toggleExpand = (tenantId: string) => {
    if (expandedTenantId === tenantId) {
      setExpandedTenantId(null);
    } else {
      setExpandedTenantId(tenantId);
      fetchTenantRequests(tenantId);
    }
  };

  const handleDownloadPdf = async (tenant: Tenant, req: TenantRentRequest) => {
    try {
      const scheduleDays = [];
      const start = startOfDay(new Date(req.disbursed_at || req.created_at));
      for (let i = 0; i < req.duration_days; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        scheduleDays.push({
          date: format(d, 'yyyy-MM-dd'),
          amount: req.daily_repayment,
          status: 'pending' as const,
        });
      }
      await downloadRepaymentPdf({
        tenantName: tenant.full_name,
        phone: tenant.phone,
        landlordName: req.landlord?.name || 'N/A',
        propertyAddress: req.landlord?.property_address || 'N/A',
        rentAmount: req.rent_amount,
        totalRepayment: req.total_repayment,
        dailyRepayment: req.daily_repayment,
        durationDays: req.duration_days,
        status: req.status || 'approved',
        paidAmount: req.amount_repaid,
        startDate: format(new Date(req.disbursed_at || req.created_at), 'dd MMM yyyy'),
        schedule: scheduleDays,
      });
      toast({ title: 'PDF Downloaded', description: 'Repayment schedule saved.' });
    } catch {
      toast({ title: 'Error', description: 'Could not generate PDF.', variant: 'destructive' });
    }
  };

  const handleShareWhatsApp = async (tenant: Tenant, req: TenantRentRequest) => {
    try {
      const scheduleDays = [];
      const start = startOfDay(new Date(req.disbursed_at || req.created_at));
      for (let i = 0; i < req.duration_days; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        scheduleDays.push({
          date: format(d, 'yyyy-MM-dd'),
          amount: req.daily_repayment,
          status: 'pending' as const,
        });
      }
      await shareRepaymentPdfWhatsApp({
        tenantName: tenant.full_name,
        phone: tenant.phone,
        landlordName: req.landlord?.name || 'N/A',
        propertyAddress: req.landlord?.property_address || 'N/A',
        rentAmount: req.rent_amount,
        totalRepayment: req.total_repayment,
        dailyRepayment: req.daily_repayment,
        durationDays: req.duration_days,
        status: req.status || 'approved',
        paidAmount: req.amount_repaid,
        startDate: format(new Date(req.disbursed_at || req.created_at), 'dd MMM yyyy'),
        schedule: scheduleDays,
      }, tenant.phone);
    } catch {
      toast({ title: 'Error', description: 'Could not share schedule.', variant: 'destructive' });
    }
  };

  const filtered = tenants.filter(t =>
    t.full_name.toLowerCase().includes(search.toLowerCase()) ||
    t.phone.includes(search)
  );

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'approved': return 'bg-blue-500/20 text-blue-600';
      case 'disbursed': case 'repaying': return 'bg-success/20 text-success';
      case 'completed': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl flex flex-col">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            My Tenants ({tenants.length})
          </SheetTitle>
        </SheetHeader>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            style={{ fontSize: '16px' }}
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {search ? 'No tenants match your search' : 'No tenants registered yet'}
            </div>
          ) : (
            filtered.map((tenant) => {
              const isExpanded = expandedTenantId === tenant.id;
              const requests = tenantRequests[tenant.id] || [];
              const isLoadingThis = loadingRequests === tenant.id;

              return (
                <div
                  key={tenant.id}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  {/* Tenant header - clickable to view schedule */}
                  <button
                    onClick={() => toggleExpand(tenant.id)}
                    className="w-full p-3 text-left hover:bg-muted/30 active:bg-primary/5 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate text-primary underline underline-offset-2 decoration-primary/30">{tenant.full_name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Tap to view repayment schedule</p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{tenant.phone}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {tenant.verified ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/20 text-success font-medium">Verified</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Pending</span>
                        )}
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 ml-[52px] text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(tenant.created_at), 'dd MMM yyyy')}
                      </span>
                      {tenant.monthly_rent && (
                        <span className="text-success font-medium">
                          Rent: {formatUGX(tenant.monthly_rent)}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Expanded repayment schedule */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-border"
                      >
                        <div className="p-3 space-y-3 bg-muted/20">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                            <Banknote className="h-3 w-3" />
                            Rent Repayment Schedules
                          </p>

                          {isLoadingThis ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          ) : requests.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-3">No active rent requests found</p>
                          ) : (
                            requests.map((req) => {
                              const progress = req.total_repayment > 0 ? Math.min((req.amount_repaid / req.total_repayment) * 100, 100) : 0;
                              const previewDays = buildScheduleDays(req.disbursed_at || req.created_at, req.duration_days);

                              return (
                                <div key={req.id} className="bg-card rounded-lg border border-border p-3 space-y-2">
                                  {/* Request header */}
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-xs font-medium">{req.landlord?.name || 'Landlord'}</p>
                                      <p className="text-[10px] text-muted-foreground">{req.landlord?.property_address || ''}</p>
                                    </div>
                                    <Badge className={`text-[10px] ${getStatusColor(req.status)}`}>
                                      {req.status}
                                    </Badge>
                                  </div>

                                  {/* Amount info */}
                                  <div className="grid grid-cols-3 gap-2 text-center">
                                    <div>
                                      <p className="text-[10px] text-muted-foreground">Rent</p>
                                      <p className="text-xs font-bold">{formatUGX(req.rent_amount)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-muted-foreground">Daily</p>
                                      <p className="text-xs font-bold text-primary">{formatUGX(req.daily_repayment)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-muted-foreground">Repaid</p>
                                      <p className="text-xs font-bold text-success">{formatUGX(req.amount_repaid)}</p>
                                    </div>
                                  </div>

                                  {/* Progress bar */}
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                      <span>{req.duration_days} days</span>
                                      <span>{progress.toFixed(0)}%</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-primary transition-all"
                                        style={{ width: `${progress}%` }}
                                      />
                                    </div>
                                  </div>

                                  {/* 10-day preview */}
                                  <div className="flex gap-1 overflow-x-auto pb-1">
                                    {previewDays.map((day, i) => (
                                      <div
                                        key={i}
                                        className="flex flex-col items-center min-w-[32px] px-1 py-1 rounded bg-muted/50 text-[9px]"
                                      >
                                        <span className="text-muted-foreground">{format(day, 'dd')}</span>
                                        <span className="text-muted-foreground">{format(day, 'MMM')}</span>
                                      </div>
                                    ))}
                                    {req.duration_days > 10 && (
                                      <div className="flex items-center text-[9px] text-muted-foreground px-1">
                                        +{req.duration_days - 10}
                                      </div>
                                    )}
                                  </div>

                                  {/* Actions */}
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1 text-xs h-8"
                                      onClick={() => handleDownloadPdf(tenant, req)}
                                    >
                                      <FileDown className="h-3 w-3 mr-1" />
                                      PDF
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1 text-xs h-8"
                                      onClick={() => handleShareWhatsApp(tenant, req)}
                                    >
                                      <MessageCircle className="h-3 w-3 mr-1" />
                                      WhatsApp
                                    </Button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
