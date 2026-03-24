import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { Landmark, ArrowRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface AgentLandlordFloatCardProps {
  onPayLandlord: () => void;
}

export function AgentLandlordFloatCard({ onPayLandlord }: AgentLandlordFloatCardProps) {
  const { user } = useAuth();

  const { data: floatData, isLoading } = useQuery({
    queryKey: ['agent-landlord-float', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('agent_landlord_float')
        .select('*')
        .eq('agent_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['agent-float-pending-count', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from('agent_float_withdrawals')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', user.id)
        .in('status', ['pending_agent_ops', 'agent_ops_approved']);
      return count || 0;
    },
    enabled: !!user,
  });

  // Don't show card if agent has no float allocated
  if (!isLoading && !floatData) return null;

  const balance = floatData?.balance ?? 0;

  return (
    <button
      onClick={onPayLandlord}
      className="w-full rounded-2xl border-2 border-purple-400/50 bg-gradient-to-br from-purple-600/15 via-purple-500/10 to-purple-400/5 p-4 hover:border-purple-400/70 hover:shadow-lg hover:shadow-purple-500/10 transition-all touch-manipulation active:scale-[0.98] animate-fade-in text-left ring-1 ring-purple-500/20"
    >
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-purple-500/15 shrink-0">
          <Landmark className="h-5 w-5 text-purple-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-purple-400 font-bold uppercase tracking-wider">Welile Capital</p>
            {pendingCount > 0 && (
              <Badge className="text-[9px] px-1.5 py-0 bg-purple-500/20 text-purple-300 border-purple-500/30">
                {pendingCount} pending
              </Badge>
            )}
          </div>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-purple-400 mt-1" />
          ) : (
            <p className="font-bold text-xl text-foreground truncate mt-0.5">{formatUGX(balance)}</p>
          )}
          <p className="text-[10px] text-muted-foreground">Ring-fenced for landlord payouts only</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-purple-400 font-semibold">Pay</span>
          <ArrowRight className="h-4 w-4 text-purple-400" />
        </div>
      </div>
    </button>
  );
}
