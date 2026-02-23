import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { Loader2, Receipt, ChevronDown, ChevronUp, Users, Phone, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { buildReceiptText, shareViaWhatsApp } from '@/lib/shareReceipt';

const formatUGX = (value: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', minimumFractionDigits: 0 }).format(value);

interface MerchantPayment {
  id: string;
  agent_id: string;
  amount: number;
  merchant_name: string;
  notes: string | null;
  payment_date: string;
  tenant_phone: string;
  transaction_id: string;
  created_at: string;
  agent_name?: string;
  tenant_name?: string;
}

interface AgentGroup {
  agent_id: string;
  agent_name: string;
  total: number;
  count: number;
  payments: MerchantPayment[];
}

export function AgentCollectionsWidget() {
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [grandTotal, setGrandTotal] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: payments, error } = await supabase
        .from('tenant_merchant_payments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!payments || payments.length === 0) {
        setGroups([]);
        setGrandTotal(0);
        setLoading(false);
        return;
      }

      // Get agent profiles
      const agentIds = [...new Set(payments.map(p => p.agent_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', agentIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

      // Group by agent
      const agentMap = new Map<string, AgentGroup>();
      let total = 0;
      for (const p of payments) {
        total += p.amount;
        const existing = agentMap.get(p.agent_id);
        const enriched: MerchantPayment = { ...p, agent_name: profileMap.get(p.agent_id) || 'Unknown' };
        if (existing) {
          existing.total += p.amount;
          existing.count++;
          existing.payments.push(enriched);
        } else {
          agentMap.set(p.agent_id, {
            agent_id: p.agent_id,
            agent_name: profileMap.get(p.agent_id) || 'Unknown',
            total: p.amount,
            count: 1,
            payments: [enriched],
          });
        }
      }

      setGrandTotal(total);
      setGroups(Array.from(agentMap.values()).sort((a, b) => b.total - a.total));
    } catch (err) {
      console.error('Agent collections fetch error:', err);
      toast.error('Failed to load agent collections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="p-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        <p className="text-xs text-muted-foreground mt-1">Loading collections...</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No agent-recorded payments found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Receipt className="h-4 w-4 text-emerald-600" />
          Agent Field Collections
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">
          Payments recorded by agents via the old "Record Payment" feature
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Grand Total */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total Collected</p>
            <p className="text-lg font-black text-emerald-600">{formatUGX(grandTotal)}</p>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {groups.reduce((s, g) => s + g.count, 0)} payments
          </Badge>
        </div>

        {/* Agent Groups */}
        <div className="divide-y divide-border rounded-lg border overflow-hidden">
          {groups.map(group => (
            <div key={group.agent_id}>
              <button
                onClick={() => setExpandedAgent(expandedAgent === group.agent_id ? null : group.agent_id)}
                className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Users className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{group.agent_name}</p>
                    <p className="text-[10px] text-muted-foreground">{group.count} payment{group.count !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="font-bold text-sm text-emerald-600">{formatUGX(group.total)}</p>
                  {expandedAgent === group.agent_id ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {expandedAgent === group.agent_id && (
                <div className="bg-muted/20 divide-y divide-border/50">
                  {group.payments.map(p => (
                    <div key={p.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium truncate">{p.tenant_phone}</span>
                            {p.merchant_name && (
                              <span className="text-[10px] text-muted-foreground">• {p.merchant_name}</span>
                            )}
                          </div>
                          {p.notes && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{p.notes}</p>
                          )}
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                            <span>{format(new Date(p.created_at), 'MMM d, h:mm a')}</span>
                            {p.transaction_id && (
                              <span className="font-mono">Txn: {p.transaction_id.substring(0, 15)}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <p className="font-bold text-sm text-foreground">{formatUGX(p.amount)}</p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const text = buildReceiptText({
                                type: 'collection',
                                amount: p.amount,
                                agentName: p.agent_name,
                                tenantPhone: p.tenant_phone,
                                merchantName: p.merchant_name,
                                transactionId: p.transaction_id,
                                date: format(new Date(p.created_at), 'MMM d, yyyy h:mm a'),
                                description: p.notes || undefined,
                              });
                              shareViaWhatsApp(text);
                              toast.success('Opening WhatsApp...');
                            }}
                            className="p-1 rounded-md hover:bg-emerald-500/10 text-emerald-600 transition-colors"
                            title="Share on WhatsApp"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
