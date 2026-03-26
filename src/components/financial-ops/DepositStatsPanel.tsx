import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Clock, CheckCircle2, XCircle, ArrowRight, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

interface DepositStats {
  pending: number;
  approved: number;
  rejected: number;
  pendingAmount: number;
  approvedAmount: number;
  todayCount: number;
  todayAmount: number;
}

interface DepositStatsPanelProps {
  onOpenVerification: () => void;
}

export function DepositStatsPanel({ onOpenVerification }: DepositStatsPanelProps) {
  const [stats, setStats] = useState<DepositStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const today = new Date().toISOString().split('T')[0];

        const [pendingRes, approvedRes, rejectedRes, todayRes] = await Promise.all([
          supabase
            .from('deposit_requests')
            .select('amount')
            .eq('status', 'pending'),
          supabase
            .from('deposit_requests')
            .select('amount')
            .eq('status', 'approved'),
          supabase
            .from('deposit_requests')
            .select('id')
            .eq('status', 'rejected'),
          supabase
            .from('deposit_requests')
            .select('amount, status')
            .gte('created_at', today),
        ]);

        const pendingData = pendingRes.data || [];
        const approvedData = approvedRes.data || [];
        const rejectedData = rejectedRes.data || [];
        const todayData = todayRes.data || [];

        setStats({
          pending: pendingData.length,
          approved: approvedData.length,
          rejected: rejectedData.length,
          pendingAmount: pendingData.reduce((sum, d) => sum + (d.amount || 0), 0),
          approvedAmount: approvedData.reduce((sum, d) => sum + (d.amount || 0), 0),
          todayCount: todayData.length,
          todayAmount: todayData.reduce((sum, d) => sum + (d.amount || 0), 0),
        });
      } catch (err) {
        console.error('Failed to fetch deposit stats:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden"
    >
      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
        {/* Today's summary */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">Today</span>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold">{formatUGX(stats.todayAmount)}</p>
            <p className="text-[10px] text-muted-foreground">{stats.todayCount} deposits</p>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-center">
            <Clock className="h-4 w-4 text-warning mx-auto mb-1" />
            <p className="text-lg font-bold text-warning">{stats.pending}</p>
            <p className="text-[10px] text-muted-foreground">Pending</p>
            <p className="text-[10px] font-medium text-warning">{formatUGX(stats.pendingAmount)}</p>
          </div>
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-center">
            <CheckCircle2 className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-lg font-bold text-primary">{stats.approved}</p>
            <p className="text-[10px] text-muted-foreground">Approved</p>
            <p className="text-[10px] font-medium text-primary">{formatUGX(stats.approvedAmount)}</p>
          </div>
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-center">
            <XCircle className="h-4 w-4 text-destructive mx-auto mb-1" />
            <p className="text-lg font-bold text-destructive">{stats.rejected}</p>
            <p className="text-[10px] text-muted-foreground">Rejected</p>
          </div>
        </div>

        {/* CTA */}
        <Button onClick={onOpenVerification} className="w-full gap-2" size="sm">
          Open Verification
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}
