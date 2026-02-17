import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Clock, CheckCircle2, XCircle, Banknote } from 'lucide-react';
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
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

export function CreditRequestsFeed({ onFundRequest, isLocked, onLockedClick }: CreditRequestsFeedProps) {
  const { formatAmount } = useCurrency();
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    // Try cache first
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

    // Fetch borrower profiles
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
          <div key={i} className="h-20 rounded-2xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
      case 'rejected': return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-warning" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved': return 'Approved';
      case 'active': return 'Active';
      case 'rejected': return 'Rejected';
      default: return 'Pending';
    }
  };

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-accent/50">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-sm">Welile AI Credit Requests</h3>
            <p className="text-[10px] text-muted-foreground">{requests.length} active requests</p>
          </div>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground rounded-2xl border border-dashed border-border/60">
          No credit requests at the moment
        </div>
      ) : (
        <div className="space-y-2.5">
          {requests.map((req, i) => (
            <motion.button
              key={req.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.2 }}
              onClick={() => {
                if (isLocked) { onLockedClick?.(); return; }
                onFundRequest?.(req);
              }}
              className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-border/60 bg-card hover:bg-accent/30 hover:border-primary/30 shadow-sm transition-all text-left touch-manipulation active:scale-[0.98]"
            >
              {/* Icon */}
              <div className="w-12 h-12 rounded-xl bg-primary/8 flex items-center justify-center text-2xl shrink-0">
                💳
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-foreground truncate">{req.borrower_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-semibold text-foreground">{formatAmount(req.amount)}</span>
                  <Badge variant="secondary" className="text-[10px] gap-0.5 px-1.5 py-0">
                    {getStatusIcon(req.status)}
                    {getStatusLabel(req.status)}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                </p>
              </div>

              {/* Return info */}
              <div className="shrink-0 text-right">
                <p className="text-[10px] text-muted-foreground">Return</p>
                <p className="text-sm font-bold text-success">
                  +{formatAmount(req.total_repayment - req.amount)}
                </p>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
