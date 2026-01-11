import { useState, useEffect, useRef } from 'react';
import { motion, useSpring } from 'framer-motion';
import { useCurrency } from '@/hooks/useCurrency';

interface AnimatedBalanceProps {
  value: number;
  className?: string;
}

export function AnimatedBalance({ value, className = '' }: AnimatedBalanceProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValue = useRef(value);
  const { formatAmount, formatAmountCompact, currency } = useCurrency();
  
  // Spring animation for smooth number transitions
  const springValue = useSpring(value, {
    stiffness: 100,
    damping: 30,
    mass: 1,
  });

  useEffect(() => {
    springValue.set(value);
  }, [value, springValue]);

  useEffect(() => {
    const unsubscribe = springValue.on('change', (latest) => {
      setDisplayValue(Math.round(latest));
    });
    return unsubscribe;
  }, [springValue]);

  const formatBalance = (amount: number) => {
    // Use compact format for large numbers
    if (amount >= 1000000) {
      return formatAmountCompact(amount);
    }
    return formatAmount(amount);
  };

  const isIncreasing = value > prevValue.current;
  
  useEffect(() => {
    prevValue.current = value;
  }, [value]);

  return (
    <motion.span
      className={className}
      initial={{ scale: 1 }}
      animate={{ 
        scale: [1, 1.02, 1],
        color: isIncreasing ? ['inherit', 'hsl(var(--success))', 'inherit'] : undefined
      }}
      transition={{ duration: 0.3 }}
      key={`${value}-${currency.code}`}
    >
      {formatBalance(displayValue)}
    </motion.span>
  );
}
