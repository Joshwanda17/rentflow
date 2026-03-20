import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Wallet, Search, Edit2, Check, X, Loader2, ArrowRightLeft, FileText, Share2, RefreshCw } from 'lucide-react';
import { downloadPortfolioPdf, sharePortfolioViaWhatsApp } from '@/lib/portfolioPdf';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import { FundInvestmentAccountDialog } from './FundInvestmentAccountDialog';
import { RenewPortfolioDialog } from './RenewPortfolioDialog';

interface PortfolioRow {
  id: string;
  portfolio_code: string;
  account_name: string | null;
  investment_amount: number;
  roi_percentage: number;
  status: string;
  created_at: string;
  investor_id: string | null;
  agent_id: string;
  investor_name?: string;
  agent_name?: string;
}

export function InvestmentAccountsManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [portfolios, setPortfolios] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [topUpAccount, setTopUpAccount] = useState<PortfolioRow | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [renewPortfolio, setRenewPortfolio] = useState<PortfolioRow | null>(null);
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewalCounts, setRenewalCounts] = useState<Record<string, number>>({});

  const fetchPortfolios = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('investor_portfolios')
      .select('id, portfolio_code, account_name, investment_amount, roi_percentage, status, created_at, investor_id, agent_id')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Failed to fetch portfolios:', error);
      setLoading(false);
      return;
    }

    // Gather unique user IDs for name lookup
    const userIds = new Set<string>();
    (data || []).forEach(p => {
      if (p.investor_id) userIds.add(p.investor_id);
      userIds.add(p.agent_id);
    });

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', Array.from(userIds));

    const nameMap = new Map<string, string>();
    (profiles || []).forEach(p => nameMap.set(p.id, p.full_name));

    const portfolioList = (data || []).map(p => ({
      ...p,
      investor_name: p.investor_id ? nameMap.get(p.investor_id) || 'Unknown' : undefined,
      agent_name: nameMap.get(p.agent_id) || 'Unknown',
    }));
    setPortfolios(portfolioList);

    // Fetch renewal counts
    const pIds = portfolioList.map(p => p.id);
    if (pIds.length > 0) {
      const { data: renewals } = await supabase
        .from('portfolio_renewals')
        .select('portfolio_id')
        .in('portfolio_id', pIds);
      const counts: Record<string, number> = {};
      (renewals || []).forEach(r => { counts[r.portfolio_id] = (counts[r.portfolio_id] || 0) + 1; });
      setRenewalCounts(counts);
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchPortfolios(); }, [fetchPortfolios]);

  const handleSave = async (portfolioId: string) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      toast({ title: 'Name cannot be empty', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('investor_portfolios')
      .update({ account_name: trimmed })
      .eq('id', portfolioId);

    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
    } else {
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'edit_portfolio_name',
        table_name: 'investor_portfolios',
        record_id: portfolioId,
        metadata: { new_name: trimmed },
      });
      toast({ title: 'Account name updated' });
      setPortfolios(prev => prev.map(p => p.id === portfolioId ? { ...p, account_name: trimmed } : p));
    }
    setEditingId(null);
    setSaving(false);
  };

  const statusColor = (s: string) => {
    if (s === 'active') return 'bg-success/10 text-success border-success/30';
    if (s === 'pending_approval') return 'bg-warning/10 text-warning border-warning/30';
    return 'bg-muted text-muted-foreground';
  };

  const filtered = portfolios.filter(p => {
    const q = search.toLowerCase();
    return !q || p.portfolio_code.toLowerCase().includes(q)
      || (p.investor_name || '').toLowerCase().includes(q)
      || (p.agent_name || '').toLowerCase().includes(q);
  });

  const handleTopUpClick = (p: PortfolioRow) => {
    setTopUpAccount(p);
    setTopUpOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-5 w-5 text-primary" />
            Investment Accounts
          </CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, code, or user..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">No accounts found</p>
          ) : (
             <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
              {filtered.map(p => (
                <div key={p.id} className="px-4 py-3 hover:bg-muted/30 transition-colors space-y-2">
                  {/* Name row */}
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {editingId === p.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="h-9 text-sm flex-1 min-w-0"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSave(p.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <Button size="icon" variant="ghost" className="h-9 w-9 text-success shrink-0" onClick={() => handleSave(p.id)} disabled={saving}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => setEditingId(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-foreground truncate">{p.account_name || p.portfolio_code}</p>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-primary shrink-0"
                            onClick={() => { setEditingId(p.id); setEditName(p.account_name || p.portfolio_code); }}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {p.investor_name || p.agent_name} · {formatUGX(p.investment_amount)} · {p.roi_percentage}% ROI
                      </p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${statusColor(p.status)}`}>
                      {p.status === 'active' ? 'Active' : p.status === 'pending_approval' ? 'Pending' : p.status}
                    </Badge>
                  </div>
                  {/* Action buttons - mobile grid */}
                  <div className="flex flex-wrap gap-1.5">
                    {p.status === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 text-xs font-medium border-primary/30 text-primary hover:bg-primary/10 min-h-[36px]"
                        onClick={() => handleTopUpClick(p)}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
                        Top Up
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-xs gap-1.5 min-h-[36px] border-border/40"
                      title="Download PDF"
                      onClick={() => downloadPortfolioPdf({
                        portfolioCode: p.portfolio_code, accountName: p.account_name,
                        investmentAmount: p.investment_amount, roiPercentage: p.roi_percentage,
                        roiMode: 'monthly_payout', totalRoiEarned: 0,
                        status: p.status, createdAt: p.created_at,
                        durationMonths: 12, ownerName: p.investor_name || p.agent_name,
                      })}
                    >
                      <FileText className="h-3.5 w-3.5" /> PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-xs gap-1.5 min-h-[36px] border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                      title="Renew Portfolio"
                      onClick={() => { setRenewPortfolio(p); setRenewOpen(true); }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Renew
                      {(renewalCounts[p.id] || 0) > 0 && (
                        <Badge variant="outline" className="ml-1 text-[9px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-600">
                          ×{renewalCounts[p.id]}
                        </Badge>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-xs gap-1.5 min-h-[36px] border-success/30 text-success hover:bg-success/5"
                      title="Share via WhatsApp"
                      onClick={() => sharePortfolioViaWhatsApp({
                        portfolioCode: p.portfolio_code, accountName: p.account_name,
                        investmentAmount: p.investment_amount, roiPercentage: p.roi_percentage,
                        roiMode: 'monthly_payout', totalRoiEarned: 0,
                        status: p.status, createdAt: p.created_at,
                        durationMonths: 12, ownerName: p.investor_name || p.agent_name,
                      })}
                    >
                      <Share2 className="h-3.5 w-3.5" /> WhatsApp
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FundInvestmentAccountDialog
        open={topUpOpen}
        onOpenChange={setTopUpOpen}
        account={topUpAccount}
        onSuccess={fetchPortfolios}
      />

      <RenewPortfolioDialog
        open={renewOpen}
        onOpenChange={setRenewOpen}
        portfolio={renewPortfolio}
        onSuccess={() => {
          fetchPortfolios();
          if (renewPortfolio) {
            setRenewalCounts(prev => ({ ...prev, [renewPortfolio.id]: (prev[renewPortfolio.id] || 0) + 1 }));
          }
        }}
      />
    </>
  );
}
