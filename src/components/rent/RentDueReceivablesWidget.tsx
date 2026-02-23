import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock, Home, MapPin, Loader2, User, Pencil,
  TrendingUp, Calendar, ChevronDown, ChevronUp,
  CalendarDays, Receipt
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
  amount_repaid: number;
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
  const remaining = Math.max(0, req.total_repayment - (req.amount_repaid || 0));

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
              <div className="text-right">
                <p className={`font-extrabold text-sm ${remaining > 0 ? 'text-warning' : 'text-success'}`}>
                  {remaining > 0 ? formatUGX(remaining) : '✓ Paid'}
                </p>
                {req.amount_repaid > 0 && remaining > 0 && (
                  <p className="text-[9px] text-success">+{formatUGX(req.amount_repaid)} paid</p>
                )}
              </div>
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
                      <div className="w-2 h-2 rounded-full bg-warning" />
                      <span className="text-xs text-muted-foreground">Access Fee (33%/mo)</span>
                    </div>
                    <span className="text-xs font-bold text-warning">{formatUGX(req.access_fee || 0)}</span>
                  </div>
                  {/* Platform/Request Fee */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-accent" />
                      <span className="text-xs text-muted-foreground">Platform Fee</span>
                    </div>
                    <span className="text-xs font-bold text-accent-foreground">{formatUGX(req.request_fee || 0)}</span>
                  </div>
                  {/* Collected + Remaining */}
                  <div className="border-t border-success/30 pt-2 space-y-1">
                    {req.amount_repaid > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-success">✓ Collected</span>
                        <span className="text-xs font-bold text-success">{formatUGX(req.amount_repaid)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-extrabold ${remaining > 0 ? 'text-warning' : 'text-success'}`}>
                        {remaining > 0 ? 'Outstanding' : '✓ Fully Repaid'}
                      </span>
                      <span className={`text-sm font-extrabold ${remaining > 0 ? 'text-warning' : 'text-success'}`}>
                        {formatUGX(remaining)}
                      </span>
                    </div>
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
  const [fieldCollections, setFieldCollections] = useState(0);
  const [fieldCollectionCount, setFieldCollectionCount] = useState(0);

  const fetchRequests = useCallback(async () => {
    if (!user) return;

    let query = supabase
      .from('rent_requests')
      .select('id, rent_amount, duration_days, status, approved_at, created_at, house_category, request_city, access_fee, request_fee, total_repayment, daily_repayment, number_of_payments, amount_repaid, tenant_id, agent_id')
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
        amount_repaid: r.amount_repaid ?? 0,
        tenant: profileMap.get(r.tenant_id) ? { full_name: profileMap.get(r.tenant_id)!.full_name, phone: profileMap.get(r.tenant_id)!.phone } : null,
        agent: r.agent_id && profileMap.get(r.agent_id) ? { full_name: profileMap.get(r.agent_id)!.full_name } : null,
      }));

      setRequests(enriched);

      // Fetch field collections (tenant_merchant_payments)
      let fieldQuery = supabase
        .from('tenant_merchant_payments')
        .select('amount');
      
      if (mode === 'agent') {
        fieldQuery = fieldQuery.eq('agent_id', user.id);
      }

      const { data: fieldPayments } = await fieldQuery;
      const fieldTotal = (fieldPayments || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
      setFieldCollections(fieldTotal);
      setFieldCollectionCount((fieldPayments || []).length);

      // Notify parent of total REMAINING receivable (not yet repaid)
      const total = enriched.reduce((sum: number, r: any) => sum + Math.max(0, (r.total_repayment || 0) - (r.amount_repaid || 0)), 0);
      onTotalChange?.(total);
    }
    setLoading(false);
  }, [user, mode, onTotalChange]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Aggregate totals — use REMAINING balance (total - repaid)
  const totalCollected = requests.reduce((sum, r) => sum + (r.amount_repaid || 0), 0);
  const totalReceivable = requests.reduce((sum, r) => sum + Math.max(0, (r.total_repayment || 0) - (r.amount_repaid || 0)), 0);
  const totalGross = requests.reduce((sum, r) => sum + (r.total_repayment || 0), 0);
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

  // Income statement aggregates
  const totalPrincipal = requests.reduce((sum, r) => sum + (r.rent_amount || 0), 0);
  const totalAccessFees = requests.reduce((sum, r) => sum + (r.access_fee || 0), 0);
  const totalPlatformFees = requests.reduce((sum, r) => sum + (r.request_fee || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-2 border-success/60 overflow-hidden shadow-lg shadow-success/10">
        <CardContent className="p-0">

          {/* ── Statement Header ── */}
          <div className="flex items-center gap-3 px-4 py-3 bg-success/20 border-b border-success/30">
            <div className="p-2 rounded-full bg-success/30">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-base text-success">Receivables Statement</h3>
              <p className="text-[10px] text-success/70">
                {requests.length} approved {requests.length === 1 ? 'request' : 'requests'} · {formatUGX(totalCollected)} collected
              </p>
            </div>
          </div>

          {requests.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No approved rent requests yet
            </div>
          ) : (
            <>
              {/* ── Income Statement Body ── */}
              <div className="px-5 py-4 space-y-5">

                {/* SECTION: Rent Receivables */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-success uppercase tracking-wider border-b border-success/20 pb-1">
                    Rent Receivables
                  </p>

                  <div className="space-y-1.5 pl-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Principal (Rent Facilitated)</span>
                      <span className="font-mono font-medium">{formatUGX(totalPrincipal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Access Fee Income (33%/mo)</span>
                      <span className="font-mono font-medium">{formatUGX(totalAccessFees)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Platform Fee Income</span>
                      <span className="font-mono font-medium">{formatUGX(totalPlatformFees)}</span>
                    </div>
                  </div>

                  {/* Collected vs Remaining */}
                  <div className="space-y-1 pt-1.5 border-t border-border/60">
                    <div className="flex justify-between text-sm text-success font-medium">
                      <span>✓ Collected</span>
                      <span className="font-mono">{formatUGX(totalCollected)}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span className="text-sm">Remaining Receivable</span>
                      <span className={`font-mono ${totalReceivable > 0 ? 'text-warning' : 'text-success'}`}>{formatUGX(totalReceivable)}</span>
                    </div>
                  </div>
                </div>

                {/* SECTION: Agent Field Collections */}
                {fieldCollections > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider border-b border-emerald-500/20 pb-1 flex items-center gap-1">
                      <Receipt className="h-3 w-3" />
                      Agent Field Collections
                    </p>
                    <div className="space-y-1.5 pl-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Payments Recorded</span>
                        <span className="font-mono font-medium">{fieldCollectionCount} payments</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold">
                        <span className="text-emerald-600">Total Field Collections</span>
                        <span className="font-mono text-emerald-600">{formatUGX(fieldCollections)}</span>
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground italic">
                      Off-ledger cash collected by agents via "Record Payment" — not yet reconciled with receivables
                    </p>
                  </div>
                )}

                {/* SECTION: Expected Collections */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-primary uppercase tracking-wider border-b border-primary/20 pb-1">
                    Expected Collections
                  </p>
                  <div className="space-y-1.5 pl-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Per Day</span>
                      <span className="font-mono font-medium">{formatUGX(totalDaily)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Per Week</span>
                      <span className="font-mono font-medium">{formatUGX(totalWeekly)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Per Month</span>
                      <span className="font-mono font-medium">{formatUGX(totalMonthly)}</span>
                    </div>
                  </div>
                </div>

                {/* ── NET TOTAL ── */}
                <div className="space-y-1 pt-3 border-t-2 border-success/40">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-muted-foreground">Gross Receivable</span>
                    <span className="font-mono text-sm text-muted-foreground">{formatUGX(totalGross)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-muted-foreground">Wallet Collections</span>
                    <span className="font-mono text-sm text-success">-{formatUGX(totalCollected)}</span>
                  </div>
                  {fieldCollections > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-muted-foreground">Field Collections (off-ledger)</span>
                      <span className="font-mono text-sm text-emerald-600">-{formatUGX(fieldCollections)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-1 border-t border-success/20">
                    <span className="text-base font-bold text-success">Net Outstanding</span>
                    <span className={`font-mono text-lg font-extrabold ${(totalReceivable - fieldCollections) > 0 ? 'text-warning' : 'text-success'}`}>
                      {formatUGX(Math.max(0, totalReceivable - fieldCollections))}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Per-request detail list ── */}
              <div className="border-t border-border/50">
                <div className="px-4 py-2 bg-muted/30">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                    Line Items · tap to expand
                  </p>
                </div>
                <div className="divide-y divide-border/40">
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
