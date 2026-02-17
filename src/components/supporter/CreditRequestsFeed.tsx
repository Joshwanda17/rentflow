import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

interface CreditRequest {
  id: string;
  amount: number;
  status: string;
  borrower_id: string;
  borrower_name: string;
  borrower_phone: string;
  created_at: string;
  due_date: string;
  total_repayment: number;
  interest_rate: number;
}

interface CreditRequestsFeedProps {
  onFundRequest?: (request: CreditRequest) => void;
  isLocked?: boolean;
  onLockedClick?: () => void;
}

const CACHE_KEY = 'welile_credit_requests';
const CACHE_TTL = 2 * 60 * 1000;

export function CreditRequestsFeed({ onFundRequest, isLocked, onLockedClick }: CreditRequestsFeedProps) {
  const { formatAmount } = useCurrency();
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL && data?.length >= 0) {
          setRequests(data);
          setLoading(false);
          return;
        }
      }
    } catch {}

    setLoading(true);

    const { data, error } = await supabase
      .from('user_loans')
      .select('id, amount, status, borrower_id, created_at, due_date, total_repayment, interest_rate')
      .in('status', ['pending', 'active', 'approved'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[CreditRequestsFeed] Error:', error);
      setLoading(false);
      return;
    }

    const borrowerIds = [...new Set((data || []).map(d => d.borrower_id))];
    let profileMap: Record<string, { full_name: string; phone: string }> = {};

    if (borrowerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', borrowerIds);

      if (profiles) {
        profiles.forEach(p => {
          profileMap[p.id] = { full_name: p.full_name, phone: p.phone };
        });
      }
    }

    const enriched: CreditRequest[] = (data || []).map(r => ({
      id: r.id,
      amount: Number(r.amount),
      status: r.status,
      borrower_id: r.borrower_id,
      borrower_name: profileMap[r.borrower_id]?.full_name || 'Unknown',
      borrower_phone: profileMap[r.borrower_id]?.phone || '',
      created_at: r.created_at,
      due_date: r.due_date,
      total_repayment: Number(r.total_repayment),
      interest_rate: Number(r.interest_rate),
    }));

    setRequests(enriched);
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: enriched, timestamp: Date.now() }));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="h-24 rounded-2xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return { icon: <CheckCircle2 className="h-4 w-4" />, label: '✅ Approved', cls: 'bg-success/15 text-success border-success/30' };
      case 'rejected': return { icon: <XCircle className="h-4 w-4" />, label: '❌ Rejected', cls: 'bg-destructive/15 text-destructive border-destructive/30' };
      default: return { icon: <Clock className="h-4 w-4" />, label: '⏳ Pending', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30' };
    }
  };

  return (
    <div className="space-y-5">
      {/* Section header - BIGGER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent/50">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-black text-foreground text-base">Welile AI Credit Requests</h3>
            <p className="text-xs text-muted-foreground font-medium">{requests.length} active requests</p>
          </div>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-8 text-base text-muted-foreground rounded-2xl border-2 border-dashed border-border/60 font-medium">
          No credit requests at the moment
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req, i) => {
            const statusBadge = getStatusBadge(req.status);
            return (
              <motion.button
                key={req.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.2 }}
                onClick={() => {
                  if (isLocked) { onLockedClick?.(); return; }
                  onFundRequest?.(req);
                }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-border/60 bg-card hover:bg-accent/30 hover:border-primary/30 shadow-sm transition-all text-left touch-manipulation active:scale-[0.97] min-h-[80px]"
              >
                {/* Icon - BIGGER */}
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl shrink-0">
                  💳
                </div>

                {/* Info - BIGGER */}
                <div className="flex-1 min-w-0">
                  <p className="font-black text-base text-foreground truncate">{req.borrower_name}</p>
                  <p className="text-base font-bold text-foreground mt-0.5">{formatAmount(req.amount)}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className={`text-xs font-bold px-2 py-0.5 border ${statusBadge.cls}`}>
                      {statusBadge.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>

                {/* Return info - BIGGER */}
                <div className="shrink-0 text-right px-3 py-2 rounded-xl bg-success/10 border border-success/20">
                  <p className="text-[11px] text-muted-foreground font-semibold">Return</p>
                  <p className="text-base font-black text-success">
                    +{formatAmount(req.total_repayment - req.amount)}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
