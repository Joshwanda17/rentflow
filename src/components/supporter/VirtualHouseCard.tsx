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
  green: { label: 'Assured', dot: 'bg-success', text: 'text-success', bg: 'bg-success/10 border-success/20' },
  amber: { label: 'Processing', dot: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-500/10 border-amber-500/20' },
  red: { label: 'Under Management', dot: 'bg-primary', text: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
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
        className="border border-border/60 bg-card cursor-pointer active:scale-[0.98] transition-transform touch-manipulation"
        onClick={() => onTap?.(house.id)}
      >
        <CardContent className="p-4 space-y-3">
          {/* Top row: House ID + Health badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏠</span>
              <span className="font-bold text-sm text-foreground">House #{house.shortId}</span>
            </div>
            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${health.bg} ${health.text} border`}>
              <span className={`h-1.5 w-1.5 rounded-full ${health.dot} mr-1 inline-block`} />
              {health.label}
            </Badge>
          </div>

          {/* Location */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>{house.area}, {house.city}</span>
          </div>

          {/* Rent + Meta */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Rent</p>
              <p className="text-base font-bold text-foreground">{formatAmount(house.rentAmount)}</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {house.agentManaged && (
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3 text-primary" />
                  Agent Managed
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(house.updatedAt), { addSuffix: true })}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
