import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Shield } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

export interface VirtualHouse {
  id: string;
  shortId: string;
  area: string;
  city: string;
  rentAmount: number;
  paymentHealth: 'green' | 'amber' | 'red';
  agentManaged: boolean;
  updatedAt: string;
  status: string;
  durationDays: number;
}

interface VirtualHouseCardProps {
  house: VirtualHouse;
  onTap?: (id: string) => void;
  index?: number;
}

const healthConfig = {
  green: { label: '✅ Good', dot: 'bg-success', text: 'text-success', bg: 'bg-success/15 border-success/30' },
  amber: { label: '⏳ Pending', dot: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-500/15 border-amber-500/30' },
  red: { label: '⚠️ At Risk', dot: 'bg-destructive', text: 'text-destructive', bg: 'bg-destructive/15 border-destructive/30' },
};

export function VirtualHouseCard({ house, onTap, index = 0 }: VirtualHouseCardProps) {
  const { formatAmount } = useCurrency();
  const health = healthConfig[house.paymentHealth];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
    >
      <Card
        className="border-2 border-border/60 bg-card cursor-pointer active:scale-[0.97] transition-transform touch-manipulation"
        onClick={() => onTap?.(house.id)}
      >
        <CardContent className="p-5 space-y-3">
          {/* Top row: House ID + Health badge - BIGGER */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🏠</span>
              <span className="font-black text-base text-foreground">House #{house.shortId}</span>
            </div>
            <Badge variant="outline" className={`text-xs px-3 py-1 font-bold ${health.bg} ${health.text} border-2`}>
              {health.label}
            </Badge>
          </div>

          {/* Location - BIGGER */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span className="font-medium">{house.area}, {house.city}</span>
          </div>

          {/* Rent + Meta - BIGGER */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Rent Amount</p>
              <p className="text-xl font-black text-foreground">{formatAmount(house.rentAmount)}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 text-xs text-muted-foreground">
              {house.agentManaged && (
                <span className="flex items-center gap-1.5 font-medium">
                  <Shield className="h-4 w-4 text-primary" />
                  Agent Managed
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {formatDistanceToNow(new Date(house.updatedAt), { addSuffix: true })}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
