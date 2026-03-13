import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Wallet, Search, Edit2, Check, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';

interface PortfolioRow {
  id: string;
  portfolio_code: string;
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

  const fetchPortfolios = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('investor_portfolios')
      .select('id, portfolio_code, investment_amount, roi_percentage, status, created_at, investor_id, agent_id')
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

    setPortfolios((data || []).map(p => ({
      ...p,
      investor_name: p.investor_id ? nameMap.get(p.investor_id) || 'Unknown' : undefined,
      agent_name: nameMap.get(p.agent_id) || 'Unknown',
    })));
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
      .update({ portfolio_code: trimmed })
      .eq('id', portfolioId);

    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
    } else {
      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'edit_portfolio_name',
        table_name: 'investor_portfolios',
        record_id: portfolioId,
        metadata: { new_name: trimmed },
      });
      toast({ title: 'Account name updated' });
      setPortfolios(prev => prev.map(p => p.id === portfolioId ? { ...p, portfolio_code: trimmed } : p));
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

  return (
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
              <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  {editingId === p.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="h-8 text-sm"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSave(p.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => handleSave(p.id)} disabled={saving}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-foreground truncate">{p.portfolio_code}</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground hover:text-primary"
                        onClick={() => { setEditingId(p.id); setEditName(p.portfolio_code); }}
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
