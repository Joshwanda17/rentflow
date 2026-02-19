import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock, Home, MapPin, Loader2, User, Pencil,
  TrendingUp, Calendar, ChevronDown, ChevronUp,
  CalendarDays, Banknote
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { addDays, format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { EditApprovedRentDialog } from './EditApprovedRentDialog';
import { useAuth } from '@/hooks/useAuth';

interface ApprovedRequest {
  id: string;
  rent_amount: number;
  duration_days: number;
  status: string;
  approved_at: string | null;
  created_at: string;
  house_category: string | null;
  request_city: string | null;
  access_fee: number;
  request_fee: number;
  total_repayment: number;
  daily_repayment: number;
  number_of_payments: number | null;
  tenant: { full_name: string; phone: string } | null;
  agent: { full_name: string } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  'single-room': '🚪 Single Room',
  'double-room': '🛏️ Double Room',
  '1-bed': '🏠 1 Bed House',
  '2-bed': '🏡 2 Bedroom',
  '2-bed-full': '🏘️ 2 Bed Full',
  '3-bed': '🏢 3 Bedroom',
  '3-bed-luxury': '🏰 3 Bed Luxury',
  '4-bed': '🏛️ 4+ Bed Villa',
  'commercial': '🏪 Commercial',
};

interface RentDueReceivablesWidgetProps {
  mode: 'manager' | 'agent';
  /** Called with total receivable amount so parent can show it on the button */
  onTotalChange?: (total: number) => void;
}

function RequestBreakdownRow({ req }: { req: ApprovedRequest }) {
  const [open, setOpen] = useState(false);

  const weeklyRepayment = Math.ceil(req.total_repayment / Math.ceil(req.duration_days / 7));
  const monthlyRepayment = Math.ceil(req.total_repayment / Math.ceil(req.duration_days / 30));
  const dueDate = req.approved_at
    ? format(addDays(new Date(req.approved_at), req.duration_days), 'dd MMM yyyy')
    : '—';
  const approvedDate = req.approved_at ? format(new Date(req.approved_at), 'dd MMM yyyy') : '—';

  return (
    <div className="border-b border-success/20 last:border-b-0">
      {/* Summary row */}
      <button
        className="w-full text-left px-4 py-3 hover:bg-success/10 transition-colors flex items-start gap-2"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-sm truncate">
              {req.tenant?.full_name || 'Unknown Tenant'}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              <p className="font-extrabold text-sm text-success">{formatUGX(req.total_repayment)}</p>
              {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {req.house_category && (
              <Badge variant="success" className="text-[10px] px-1.5 py-0 gap-0.5">
                <Home className="h-2.5 w-2.5" />
                {CATEGORY_LABELS[req.house_category] || req.house_category}
              </Badge>
            )}
            {req.request_city && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <MapPin className="h-2.5 w-2.5" />
                {req.request_city}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">•</span>
            <span className="text-[10px] text-muted-foreground">{req.duration_days}d</span>
            <span className="text-[10px] text-muted-foreground">• Due {dueDate}</span>
          </div>
        </div>
      </button>

      {/* Expanded breakdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Dates */}
              <div className="flex gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2.5 py-1.5">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  <div>
                    <p className="text-[9px] text-muted-foreground">Approved</p>
                    <p className="text-[11px] font-semibold">{approvedDate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-destructive/10 rounded-lg px-2.5 py-1.5">
                  <CalendarDays className="h-3 w-3 text-destructive" />
                  <div>
                    <p className="text-[9px] text-muted-foreground">Due Date</p>
                    <p className="text-[11px] font-semibold text-destructive">{dueDate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2.5 py-1.5">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <div>
                    <p className="text-[9px] text-muted-foreground">Duration</p>
                    <p className="text-[11px] font-semibold">{req.duration_days} days</p>
                  </div>
                </div>
              </div>

              {/* Fee Breakdown */}
              <div className="rounded-xl border border-success/30 bg-success/5 overflow-hidden">
                <div className="px-3 py-2 bg-success/15 border-b border-success/20">
                  <p className="text-[10px] font-bold text-success uppercase tracking-wide">Fee Breakdown</p>
                </div>
                <div className="p-3 space-y-2">
                  {/* Principal */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-xs text-muted-foreground">Principal (Rent)</span>
                    </div>
                    <span className="text-xs font-bold">{formatUGX(req.rent_amount)}</span>
                  </div>
                  {/* Access Fee */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-xs text-muted-foreground">Access Fee (33%/mo)</span>
                    </div>
                    <span className="text-xs font-bold text-amber-600">{formatUGX(req.access_fee || 0)}</span>
                  </div>
                  {/* Platform/Request Fee */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-xs text-muted-foreground">Platform Fee</span>
                    </div>
                    <span className="text-xs font-bold text-blue-600">{formatUGX(req.request_fee || 0)}</span>
                  </div>
                  {/* Divider */}
                  <div className="border-t border-success/30 pt-2 flex items-center justify-between">
                    <span className="text-xs font-extrabold text-success">Total Repayment</span>
                    <span className="text-sm font-extrabold text-success">{formatUGX(req.total_repayment)}</span>
                  </div>
                </div>
              </div>

              {/* Repayment Schedule Summary */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
                <div className="px-3 py-2 bg-primary/10 border-b border-primary/20">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-wide">Expected Collections</p>
                </div>
                <div className="grid grid-cols-3 divide-x divide-primary/20">
                  <div className="p-2.5 text-center">
                    <p className="text-[9px] text-muted-foreground mb-0.5">Per Day</p>
                    <p className="text-[11px] font-extrabold text-primary">{formatUGX(req.daily_repayment || 0)}</p>
                  </div>
                  <div className="p-2.5 text-center">
                    <p className="text-[9px] text-muted-foreground mb-0.5">Per Week</p>
                    <p className="text-[11px] font-extrabold text-primary">{formatUGX(weeklyRepayment)}</p>
                  </div>
                  <div className="p-2.5 text-center">
                    <p className="text-[9px] text-muted-foreground mb-0.5">Per Month</p>
                    <p className="text-[11px] font-extrabold text-primary">{formatUGX(monthlyRepayment)}</p>
                  </div>
                </div>
              </div>

              {/* Tenant contact */}
              {req.tenant?.phone && (
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span>{req.tenant.full_name}</span>
                  <span>•</span>
                  <span>{req.tenant.phone}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function RentDueReceivablesWidget({ mode, onTotalChange }: RentDueReceivablesWidgetProps) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ApprovedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRequest, setEditingRequest] = useState<ApprovedRequest | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const fetchRequests = useCallback(async () => {
    if (!user) return;

    let query = supabase
      .from('rent_requests')
      .select('id, rent_amount, duration_days, status, approved_at, created_at, house_category, request_city, access_fee, request_fee, total_repayment, daily_repayment, number_of_payments, tenant_id, agent_id')
      .eq('status', 'approved')
      .order('approved_at', { ascending: false })
      .limit(50);

    if (mode === 'agent') {
      query = query.eq('agent_id', user.id);
    }

    const { data, error } = await query;

    if (!error && data) {
      const tenantIds = [...new Set(data.map((r: any) => r.tenant_id))];
      const agentIds = [...new Set(data.map((r: any) => r.agent_id).filter(Boolean))] as string[];
      const allIds = [...new Set([...tenantIds, ...agentIds])];

      const { data: profiles } = allIds.length > 0
        ? await supabase.from('profiles').select('id, full_name, phone').in('id', allIds)
        : { data: [] };

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      const enriched = data.map((r: any) => ({
        ...r,
        tenant: profileMap.get(r.tenant_id) ? { full_name: profileMap.get(r.tenant_id)!.full_name, phone: profileMap.get(r.tenant_id)!.phone } : null,
        agent: r.agent_id && profileMap.get(r.agent_id) ? { full_name: profileMap.get(r.agent_id)!.full_name } : null,
      }));

      setRequests(enriched);

      // Notify parent of total receivable
      const total = enriched.reduce((sum: number, r: any) => sum + (r.total_repayment || 0), 0);
      onTotalChange?.(total);
    }
    setLoading(false);
  }, [user, mode, onTotalChange]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Aggregate totals
  const totalReceivable = requests.reduce((sum, r) => sum + (r.total_repayment || 0), 0);
  const totalDaily = requests.reduce((sum, r) => sum + (r.daily_repayment || 0), 0);
  const totalWeekly = requests.reduce((sum, r) => {
    const w = Math.ceil(r.total_repayment / Math.ceil(r.duration_days / 7));
    return sum + w;
  }, 0);
  const totalMonthly = requests.reduce((sum, r) => {
    const m = Math.ceil(r.total_repayment / Math.ceil(r.duration_days / 30));
    return sum + m;
  }, 0);

  if (loading) {
    return (
      <Card className="border-2 border-success/50 bg-success/5">
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-success" />
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-2 border-success bg-gradient-to-br from-success/15 via-success/10 to-emerald-500/5 shadow-lg shadow-success/10 overflow-hidden">
        <CardContent className="p-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-success/20 border-b border-success/30">
            <div className="p-2 rounded-full bg-success/30">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-base text-success">
                💰 Rent Due — Receivables {requests.length > 0 ? `(${requests.length})` : ''}
              </h3>
              <p className="text-[10px] text-success/70">Approved requests awaiting repayment</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-success/70">Total</p>
              <p className="font-extrabold text-success">{formatUGX(totalReceivable)}</p>
            </div>
          </div>

          {requests.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No approved rent requests yet
            </div>
          ) : (
            <>
              {/* Aggregate Collection Summary */}
              <div className="grid grid-cols-3 divide-x divide-success/20 bg-success/10 border-b border-success/20">
                <div className="p-3 text-center">
                  <p className="text-[9px] text-muted-foreground uppercase font-medium mb-1">Daily</p>
                  <p className="text-[11px] font-extrabold text-success">{formatUGX(totalDaily)}</p>
                  <p className="text-[8px] text-muted-foreground">expected/day</p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-[9px] text-muted-foreground uppercase font-medium mb-1">Weekly</p>
                  <p className="text-[11px] font-extrabold text-success">{formatUGX(totalWeekly)}</p>
                  <p className="text-[8px] text-muted-foreground">expected/week</p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-[9px] text-muted-foreground uppercase font-medium mb-1">Monthly</p>
                  <p className="text-[11px] font-extrabold text-success">{formatUGX(totalMonthly)}</p>
                  <p className="text-[8px] text-muted-foreground">expected/month</p>
                </div>
              </div>

              {/* Per-request breakdown (tap to expand) */}
              <div className="divide-y divide-success/10">
                <div className="px-4 py-2 bg-muted/30 flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Tap a request for full breakdown</p>
                  <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                {requests.map((req) => (
                  <div key={req.id} className="relative">
                    <RequestBreakdownRow req={req} />
                    {mode === 'manager' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2.5 right-10 h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingRequest(req);
                          setEditOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <EditApprovedRentDialog
        request={editingRequest}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={fetchRequests}
      />
    </motion.div>
  );
}
