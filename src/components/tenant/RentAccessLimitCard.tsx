import { useState, useEffect } from 'react';
import { Wallet, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface RentAccessLimitCardProps {
  userId: string;
}

const formatShort = (amount: number): string => {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toString();
};

export function RentAccessLimitCard({ userId }: RentAccessLimitCardProps) {
  const [limit, setLimit] = useState({ availableLimit: 0, usedLimit: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLimit({ availableLimit: 0, usedLimit: 0 });
    setLoading(false);
  }, [userId]);

  const remainingLimit = limit.availableLimit - limit.usedLimit;

  if (loading) {
    return <div className="h-10 rounded-xl bg-muted/50 animate-pulse" />;
  }

  return (
    <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground shadow-sm active:scale-[0.98] transition-transform">
      <div className="p-1.5 rounded-lg bg-white/15">
        <Wallet className="h-4 w-4" />
      </div>
      <div className="flex-1 text-left">
        <p className="text-[10px] font-medium opacity-70 leading-none">Rent Fee Available</p>
        <p className="text-sm font-bold leading-tight">UGX {formatShort(remainingLimit)}</p>
      </div>
      <ChevronRight className="h-4 w-4 opacity-50" />
    </button>
  );
}