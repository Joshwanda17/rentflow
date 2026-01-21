import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap } from '@/lib/haptics';

interface FloatingPortfolioButtonProps {
  totalBalance: number;
}

export function FloatingPortfolioButton({ totalBalance }: FloatingPortfolioButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    hapticTap();
    navigate('/investment-portfolio');
  };

  // Format balance for compact display
  const formatCompact = (amount: number) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(0)}K`;
    }
    return amount.toString();
  };

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleClick}
      className="fixed bottom-24 sm:bottom-28 right-4 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-shadow"
    >
      <Wallet className="h-4 w-4" />
      <span className="text-sm font-semibold">Portfolio</span>
      {totalBalance > 0 && (
        <span className="px-2 py-0.5 text-[10px] font-bold bg-white/20 rounded-full">
          {formatCompact(totalBalance)}
        </span>
      )}
    </motion.button>
  );
}
