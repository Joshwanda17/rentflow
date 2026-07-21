import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, Pencil, Info } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  calculateAccessFee,
  calculateRegistrationFee,
  calculateDailyPayment,
  formatUGX,
  REPAYMENT_PERIODS,
} from '@/lib/agentAdvanceCalculations';

type Row = {
  id: string;
  agent_id: string;
  principal: number;
  access_fee: number;
  registration_fee: number;
  outstanding_balance: number;
  arrears_balance: number;
  daily_installment: number;
  monthly_rate: number;
  cycle_days: number;
  status: string;
  issued_at: string;
  expires_at: string;
  agent_name?: string;
  agent_phone?: string;
};

const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  repaying: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-rose-100 text-rose-700',
  pending: 'bg-amber-100 text-amber-700',
  completed: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-slate-100 text-slate-500',
};

export function ActiveAdvancesPanel() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [editing, setEditing] = useState<Row | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['active-advances', statusFilter],
    queryFn: async (): Promise<Row[]> => {
      let q = supabase
        .from('agent_advances')
        .select('id, agent_id, principal, access_fee, registration_fee, outstanding_balance, arrears_balance, daily_installment, monthly_rate, cycle_days, status, issued_at, expires_at')
        .order('issued_at', { ascending: false })
        .limit(500);
      if (statusFilter !== 'all') {
        if (statusFilter === 'active') {
          q = q.in('status', ['active', 'repaying', 'overdue']);
        } else {
          q = q.eq('status', statusFilter);
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      const advances = (data || []) as any[];
      const ids = [...new Set(advances.map(a => a.agent_id))];
      if (ids.length === 0) return advances as Row[];
      const profiles: Record<string, any> = {};
      const BATCH = 50;
      for (let i = 0; i < ids.length; i += BATCH) {
        const { data: pdata } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', ids.slice(i, i + BATCH));
        (pdata || []).forEach(p => { profiles[p.id] = p; });
      }
      return advances.map(a => ({
        ...a,
        agent_name: profiles[a.agent_id]?.full_name || '—',
        agent_phone: profiles[a.agent_id]?.phone || '',
      })) as Row[];
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      (r.agent_name || '').toLowerCase().includes(s) ||
      (r.agent_phone || '').toLowerCase().includes(s) ||
      r.id.toLowerCase().includes(s),
    );
  }, [rows, search]);

  const totalOutstanding = rows.reduce((s, r) => s + Number(r.outstanding_balance || 0), 0);
  const totalArrears = rows.reduce((s, r) => s + Number(r.arrears_balance || 0), 0);
  const totalDaily = rows.reduce((s, r) => s + Number(r.daily_installment || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Advances" value={rows.length.toLocaleString()} />
        <StatCard label="Outstanding" value={formatUGX(totalOutstanding)} />
        <StatCard label="Arrears" value={formatUGX(totalArrears)} tone="rose" />
        <StatCard label="Expected Daily" value={formatUGX(totalDaily)} tone="emerald" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <CardTitle className="text-base">Active Advances</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, phone or ID…"
                  className="pl-8 w-56"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active + Overdue</SelectItem>
                  <SelectItem value="repaying">Repaying only</SelectItem>
                  <SelectItem value="overdue">Overdue only</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading advances…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No advances match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Daily</TableHead>
                    <TableHead className="text-center">Cycle</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.agent_name}</div>
                        <div className="text-xs text-muted-foreground">{r.agent_phone}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatUGX(r.principal)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatUGX(r.outstanding_balance)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatUGX(r.daily_installment)}</TableCell>
                      <TableCell className="text-center">{r.cycle_days}d</TableCell>
                      <TableCell className="text-xs">{r.issued_at ? format(new Date(r.issued_at), 'dd MMM yy') : '—'}</TableCell>
                      <TableCell className="text-xs">{r.expires_at ? format(new Date(r.expires_at), 'dd MMM yy') : '—'}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_TONE[r.status] || 'bg-slate-100 text-slate-600'} variant="secondary">
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EditAdvanceDialog
        advance={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['active-advances'] });
          setEditing(null);
        }}
      />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'rose' | 'emerald' }) {
  const toneClass = tone === 'rose' ? 'text-rose-600' : tone === 'emerald' ? 'text-emerald-600' : 'text-foreground';
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function EditAdvanceDialog({
  advance,
  onClose,
  onSaved,
}: {
  advance: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [days, setDays] = useState<number>(advance?.cycle_days ?? 30);
  const [reprice, setReprice] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  // Reset when advance changes
  useMemo(() => {
    if (advance) {
      setDays(advance.cycle_days || 30);
      setReprice(true);
    }
  }, [advance?.id]);

  if (!advance) return null;

  const principal = Number(advance.principal || 0);
  const rate = Number(advance.monthly_rate || 0.33);
  const regFee = Number(advance.registration_fee || calculateRegistrationFee(principal));
  const oldAccessFee = Number(advance.access_fee || 0);
  const oldTotalPayable = principal + oldAccessFee + regFee;
  const alreadyPaid = Math.max(0, oldTotalPayable - Number(advance.outstanding_balance || 0));

  const newAccessFee = reprice ? calculateAccessFee(principal, days, rate) : oldAccessFee;
  const newTotalPayable = principal + newAccessFee + regFee;
  const newOutstanding = Math.max(0, newTotalPayable - alreadyPaid);
  const newDaily = days > 0 ? Math.ceil(newOutstanding / days) : 0;
  const freshDaily = calculateDailyPayment(principal, days, rate);

  const handleSave = async () => {
    setSaving(true);
    try {
      const issued = advance.issued_at ? new Date(advance.issued_at) : new Date();
      const newExpires = new Date(issued.getTime() + days * 86400_000).toISOString();
      const { error } = await supabase
        .from('agent_advances')
        .update({
          cycle_days: days,
          expires_at: newExpires,
          access_fee: newAccessFee,
          outstanding_balance: newOutstanding,
          daily_installment: newDaily,
        })
        .eq('id', advance.id);
      if (error) throw error;
      toast.success(`Advance updated — ${days} days at ${formatUGX(newDaily)}/day`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update advance');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!advance} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Advance — {advance.agent_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Principal" value={formatUGX(principal)} />
            <Field label="Monthly Rate" value={`${(rate * 100).toFixed(0)}%`} />
            <Field label="Current Access Fee" value={formatUGX(oldAccessFee)} />
            <Field label="Registration Fee" value={formatUGX(regFee)} />
            <Field label="Already Paid" value={formatUGX(alreadyPaid)} />
            <Field label="Current Outstanding" value={formatUGX(Number(advance.outstanding_balance))} />
          </div>

          <div className="space-y-2">
            <Label>Repayment Period (days)</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {REPAYMENT_PERIODS.map(p => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={days === p ? 'default' : 'outline'}
                  onClick={() => setDays(p)}
                >
                  {p}d
                </Button>
              ))}
              <Input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={e => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                className="w-24"
              />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={reprice}
              onChange={e => setReprice(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Reprice access fee for new period</span>
              <span className="block text-xs text-muted-foreground">
                Recomputes fee at {(rate * 100).toFixed(0)}%/month compounded for {days} days. Uncheck to keep the originally
                capitalized fee and just compress the schedule.
              </span>
            </span>
          </label>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
              <Info className="h-3.5 w-3.5" /> Recalculation preview
            </div>
            <PreviewRow label="New Access Fee" value={formatUGX(newAccessFee)} />
            <PreviewRow label="New Total Payable" value={formatUGX(newTotalPayable)} />
            <PreviewRow label="Outstanding to Collect" value={formatUGX(newOutstanding)} bold />
            <PreviewRow label={`Daily × ${days} days`} value={`${formatUGX(newDaily)} / day`} bold />
            {reprice && (
              <PreviewRow
                label={`(Fresh advance daily for reference)`}
                value={formatUGX(freshDaily)}
                muted
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || days < 1}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save & Recalculate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}

function PreviewRow({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-sm ${muted ? 'text-muted-foreground text-xs' : ''}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  );
}