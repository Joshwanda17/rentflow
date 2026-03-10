import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, MoreHorizontal, TrendingUp, Trash2, Wallet, Pencil } from 'lucide-react';
import COODetailLayout, { KPICard, SectionTitle } from '@/components/coo/COODetailLayout';
import COODataTable, { COOColumn } from '@/components/coo/COODataTable';
import { formatUGX } from '@/lib/rentCalculations';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface PartnerRow {
  id: string;
  name: string;
  phone: string;
  funded: number;
  activeDeals: number;
  avgDeal: number;
  walletBalance: number;
  roiPercentage: number;
}

const MIN_INVEST = 50000;

export default function ActivePartnersDetail() {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Invest dialog state
  const [investPartner, setInvestPartner] = useState<PartnerRow | null>(null);
  const [investAmount, setInvestAmount] = useState('');
  const [payoutDay, setPayoutDay] = useState('15');
  const [investing, setInvesting] = useState(false);

  // Delete dialog state
  const [deletePartner, setDeletePartner] = useState<PartnerRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit dialog state
  const [editPartner, setEditPartner] = useState<PartnerRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRoi, setEditRoi] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !roles.includes('manager'))) { navigate('/dashboard'); return; }
    if (user && roles.includes('manager')) fetchData();
  }, [user, loading, roles]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: supporterRoles } = await supabase
        .from('user_roles').select('user_id').eq('role', 'supporter');
      const supporterIds = (supporterRoles || []).map(r => r.user_id);
      if (supporterIds.length === 0) {
        setData({ activePartners: 0, totalSupporters: 0, totalFunded: 0, totalWalletBalance: 0, tableRows: [] });
        return;
      }

      const ids = supporterIds.slice(0, 200);
      const [ledgerRes, profilesRes, walletsRes, portfoliosRes] = await Promise.all([
        supabase.from('general_ledger')
          .select('user_id, amount, direction, category')
          .in('user_id', ids)
          .in('category', ['supporter_rent_fund', 'supporter_facilitation_capital', 'coo_proxy_investment']),
        supabase.from('profiles').select('id, full_name, phone').in('id', ids),
        supabase.from('wallets').select('user_id, balance').in('user_id', ids),
        supabase.from('investor_portfolios')
          .select('investor_id, roi_percentage, created_at')
          .in('investor_id', ids)
          .order('created_at', { ascending: false }),
      ]);

      const ledgerData = ledgerRes.data || [];
      const profileMap = new Map((profilesRes.data || []).map(p => [p.id, { name: p.full_name, phone: p.phone }]));
      const walletMap = new Map((walletsRes.data || []).map(w => [w.user_id, w.balance || 0]));

      // ROI: use the most recent portfolio per investor
      const roiMap = new Map<string, number>();
      (portfoliosRes.data || []).forEach(p => {
        if (p.investor_id && !roiMap.has(p.investor_id)) {
          roiMap.set(p.investor_id, p.roi_percentage ?? 15);
        }
      });

      const partnerMap = new Map<string, { capitalIn: number; poolFunded: number; deals: number }>();
      ledgerData.forEach(entry => {
        if (!entry.user_id) return;
        const existing = partnerMap.get(entry.user_id) || { capitalIn: 0, poolFunded: 0, deals: 0 };
        if (entry.direction === 'cash_in') {
          existing.capitalIn += (entry.amount || 0);
        } else if (entry.direction === 'cash_out') {
          existing.poolFunded += (entry.amount || 0);
          existing.deals += 1;
        }
        partnerMap.set(entry.user_id, existing);
      });

      const tableRows: PartnerRow[] = ids.map(id => {
        const agg = partnerMap.get(id) || { capitalIn: 0, poolFunded: 0, deals: 0 };
        const profile = profileMap.get(id);
        return {
          id,
          name: profile?.name || id.slice(0, 8),
          phone: profile?.phone || '',
          funded: agg.poolFunded,
          activeDeals: agg.deals,
          avgDeal: agg.deals > 0 ? Math.round(agg.poolFunded / agg.deals) : 0,
          walletBalance: walletMap.get(id) || 0,
          roiPercentage: roiMap.get(id) ?? 15,
        };
      }).sort((a, b) => b.funded - a.funded);

      const totalFunded = tableRows.reduce((s, r) => s + r.funded, 0);
      const totalWalletBalance = tableRows.reduce((s, r) => s + r.walletBalance, 0);
      const activePartners = tableRows.filter(r => r.activeDeals > 0).length;

      setData({ activePartners, totalSupporters: supporterIds.length, totalFunded, totalWalletBalance, tableRows });
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, []);

  // --- Invest handler ---
  async function handleInvest() {
    if (!investPartner) return;
    const amt = Number(investAmount);
    if (isNaN(amt) || amt < MIN_INVEST) {
      toast.error(`Minimum investment is ${formatUGX(MIN_INVEST)}`);
      return;
    }
    if (amt > investPartner.walletBalance) {
      toast.error(`Partner only has ${formatUGX(investPartner.walletBalance)} in wallet`);
      return;
    }
    const day = Number(payoutDay);
    if (isNaN(day) || day < 1 || day > 28) {
      toast.error('Payout day must be 1-28');
      return;
    }

    setInvesting(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('coo-invest-for-partner', {
        body: { partner_id: investPartner.id, amount: amt, payout_day: day },
      });
      if (error) {
        const errMsg = typeof result === 'object' && result?.error ? result.error : error.message;
        throw new Error(errMsg);
      }
      if (result?.error) throw new Error(result.error);

      toast.success(`Invested ${formatUGX(amt)} for ${investPartner.name}`, {
        description: `Ref: ${result.reference_id} - First payout: ${result.first_payout_date}`,
      });
      setInvestPartner(null);
      setInvestAmount('');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Investment failed');
    } finally {
      setInvesting(false);
    }
  }

  // --- Delete handler ---
  async function handleDelete() {
    if (!deletePartner) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', deletePartner.id)
        .eq('role', 'supporter');
      if (error) throw error;
      toast.success(`Removed supporter role from ${deletePartner.name}`);
      setDeletePartner(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  // --- Edit handler ---
  function openEditDialog(r: PartnerRow) {
    setEditPartner(r);
    setEditName(r.name);
    setEditPhone(r.phone);
    setEditRoi(String(r.roiPercentage));
  }

  async function handleSaveEdit() {
    if (!editPartner) return;
    setSaving(true);
    try {
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ full_name: editName.trim(), phone: editPhone.trim() })
        .eq('id', editPartner.id);
      if (profileErr) throw profileErr;

      const newRoi = Number(editRoi);
      if (!isNaN(newRoi) && newRoi !== editPartner.roiPercentage && newRoi > 0 && newRoi <= 100) {
        // Update ALL active portfolios for this partner (by investor_id or agent_id)
        const { data: updated1, error: roiErr1 } = await supabase
          .from('investor_portfolios')
          .update({ roi_percentage: newRoi })
          .eq('investor_id', editPartner.id)
          .in('status', ['active', 'pending'])
          .select('id');
        if (roiErr1) throw roiErr1;

        // Also update portfolios where agent_id matches but investor_id is null
        const { data: updated2, error: roiErr2 } = await supabase
          .from('investor_portfolios')
          .update({ roi_percentage: newRoi })
          .eq('agent_id', editPartner.id)
          .is('investor_id', null)
          .in('status', ['active', 'pending'])
          .select('id');
        if (roiErr2) throw roiErr2;

        const totalUpdated = (updated1?.length || 0) + (updated2?.length || 0);
        if (totalUpdated === 0) {
          toast.warning(`No active investment portfolios found for ${editName.trim()} — ROI not changed`);
        }
      }

      toast.success(`Updated ${editName.trim()}`);
      setEditPartner(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  const columns: COOColumn<PartnerRow>[] = [
    { key: 'name', label: 'Partner' },
    { key: 'walletBalance', label: 'Wallet', align: 'right', render: (r) => (
      <span className={r.walletBalance >= MIN_INVEST ? 'text-emerald-600 font-semibold' : 'text-muted-foreground'}>
        {formatUGX(r.walletBalance)}
      </span>
    )},
    { key: 'funded', label: 'Total Funded', align: 'right', render: (r) => formatUGX(r.funded) },
    { key: 'activeDeals', label: 'Deals', align: 'right' },
    { key: 'avgDeal', label: 'Avg Deal', align: 'right', render: (r) => formatUGX(r.avgDeal) },
    { key: 'roiPercentage', label: 'ROI %', align: 'right', render: (r) => (
      <span className="font-semibold text-primary">{r.roiPercentage}%</span>
    )},
    {
      key: 'actions',
      label: 'Action',
      sortable: false,
      render: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              disabled={r.walletBalance < MIN_INVEST}
              onClick={(e) => { e.stopPropagation(); setInvestPartner(r); }}
              className="gap-2"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Invest ({r.walletBalance >= MIN_INVEST ? 'Ready' : 'Low bal'})</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); openEditDialog(r); }}
              className="gap-2"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>Edit Partner</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); setDeletePartner(r); }}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove Partner</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!data) return null;

  const status = data.activePartners > 3 ? 'green' as const : data.activePartners > 0 ? 'yellow' as const : 'red' as const;

  return (
    <COODetailLayout title="Active Partners" subtitle="Partner Performance & Contribution" status={status}>
      <div className="grid grid-cols-2 gap-3">
        <KPICard label="Active Partners" value={data.activePartners} status={status} />
        <KPICard label="Total Supporters" value={data.totalSupporters} status="green" />
        <KPICard label="Total Funded" value={formatUGX(data.totalFunded)} status="green" />
        <KPICard label="Total Wallet Balance" value={formatUGX(data.totalWalletBalance)} status="green" />
      </div>

      <COODataTable
        title="Partner Performance"
        columns={columns}
        data={data.tableRows}
        pageSize={15}
        exportFilename="active-partners"
      />

      {/* Invest Dialog */}
      <Dialog open={!!investPartner} onOpenChange={(open) => { if (!open) { setInvestPartner(null); setInvestAmount(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Invest for {investPartner?.name}
            </DialogTitle>
            <DialogDescription>
              Invest from this partner's wallet into the Rent Management Pool. Minimum: {formatUGX(MIN_INVEST)}.
            </DialogDescription>
          </DialogHeader>

          {investPartner && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border/60">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Available:</span>
                <span className="text-sm font-bold">{formatUGX(investPartner.walletBalance)}</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invest-amount">Investment Amount (UGX)</Label>
                <Input
                  id="invest-amount"
                  type="number"
                  min={MIN_INVEST}
                  max={investPartner.walletBalance}
                  value={investAmount}
                  onChange={(e) => setInvestAmount(e.target.value)}
                  placeholder={`Min ${MIN_INVEST.toLocaleString()}`}
                />
                <div className="flex gap-2 flex-wrap">
                  {[50000, 100000, 200000, 500000].filter(a => a <= investPartner.walletBalance).map(a => (
                    <Button key={a} variant="outline" size="sm" className="text-xs h-7"
                      onClick={() => setInvestAmount(String(a))}>
                      {(a / 1000).toFixed(0)}K
                    </Button>
                  ))}
                  <Button variant="outline" size="sm" className="text-xs h-7"
                    onClick={() => setInvestAmount(String(investPartner.walletBalance))}>
                    Max
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payout-day">Monthly Payout Day (1-28)</Label>
                <Input
                  id="payout-day"
                  type="number"
                  min={1}
                  max={28}
                  value={payoutDay}
                  onChange={(e) => setPayoutDay(e.target.value)}
                />
              </div>

              {investAmount && Number(investAmount) >= MIN_INVEST && (
                <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 space-y-1">
                  <p>Monthly reward ({investPartner.roiPercentage}%): <strong>{formatUGX(Math.round(Number(investAmount) * (investPartner.roiPercentage / 100)))}</strong></p>
                  <p>Payout every <strong>{payoutDay}{getOrdinalSuffix(Number(payoutDay))}</strong> for 12 months</p>
                  <p>Remaining wallet: <strong>{formatUGX(investPartner.walletBalance - Number(investAmount))}</strong></p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setInvestPartner(null)}>Cancel</Button>
            <Button onClick={handleInvest} disabled={investing || !investAmount || Number(investAmount) < MIN_INVEST}>
              {investing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Investment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Partner Dialog */}
      <Dialog open={!!editPartner} onOpenChange={(open) => { if (!open) setEditPartner(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Edit Partner
            </DialogTitle>
            <DialogDescription>Update partner information and ROI percentage.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone Number</Label>
              <Input id="edit-phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-roi">ROI Percentage (%)</Label>
              <Input id="edit-roi" type="number" min={1} max={100} value={editRoi} onChange={(e) => setEditRoi(e.target.value)} />
              <div className="flex gap-2">
                {[10, 15, 20, 25].map(v => (
                  <Button key={v} variant={editRoi === String(v) ? 'default' : 'outline'} size="sm" className="text-xs h-7"
                    onClick={() => setEditRoi(String(v))}>
                    {v}%
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPartner(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editName.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletePartner} onOpenChange={(open) => { if (!open) setDeletePartner(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Partner</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the supporter role from <strong>{deletePartner?.name}</strong>. 
              They will lose access to partner features. This cannot be undone easily.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </COODetailLayout>
  );
}

function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}
