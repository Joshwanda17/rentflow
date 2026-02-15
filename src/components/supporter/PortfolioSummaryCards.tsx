import { motion } from 'framer-motion';
import { useCurrency } from '@/hooks/useCurrency';

interface PortfolioSummaryCardsProps {
  housesFunded: number;
  rentSecured: number;
  portfolioHealth: 'stable' | 'at_risk' | 'growing';
}

export function PortfolioSummaryCards({ housesFunded, rentSecured, portfolioHealth }: PortfolioSummaryCardsProps) {
  const { formatAmount } = useCurrency();

  const healthConfig = {
    stable: { label: 'Stable', color: 'text-success', dot: 'bg-success', bg: 'bg-success/10' },
    growing: { label: 'Growing', color: 'text-primary', dot: 'bg-primary', bg: 'bg-primary/10' },
    at_risk: { label: 'At Risk', color: 'text-destructive', dot: 'bg-destructive', bg: 'bg-destructive/10' },
  };

  const health = healthConfig[portfolioHealth];

  const cards = [
    {
      emoji: '🏠',
      value: `${housesFunded}`,
      label: 'Houses Funded',
      sublabel: 'Active',
    },
    {
      emoji: '💰',
      value: formatAmount(rentSecured),
      label: 'Rent Secured',
      sublabel: '/ month',
    },
    {
      emoji: '',
      value: health.label,
      label: 'Portfolio Health',
      sublabel: '',
      isHealth: true,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, duration: 0.3 }}
          className="rounded-2xl border border-border/60 bg-card p-3 text-center"
        >
          {card.isHealth ? (
            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full ${health.bg} mb-1`}>
              <span className={`h-2 w-2 rounded-full ${health.dot} animate-pulse`} />
              <span className={`text-[10px] font-bold uppercase tracking-wider ${health.color}`}>{health.label}</span>
            </div>
          ) : (
            <span className="text-xl block mb-1">{card.emoji}</span>
          )}
          {!card.isHealth && (
            <p className="text-sm font-black text-foreground truncate">{card.value}</p>
          )}
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">
            {card.label}
          </p>
          {card.sublabel && !card.isHealth && (
            <p className="text-[9px] text-muted-foreground/70">{card.sublabel}</p>
          )}
        </motion.div>
      ))}
    </div>
  );
}
