import { useState, useEffect, useRef } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

interface AnimatedBalanceProps {
  value: number;
  className?: string;
}

export function AnimatedBalance({ value, className = '' }: AnimatedBalanceProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValue = useRef(value);
  
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
    if (amount >= 1000000) {
      return `UGX ${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `UGX ${(amount / 1000).toFixed(0)}K`;
    }
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(amount);
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
      key={value}
    >
      {formatBalance(displayValue)}
    </motion.span>
  );
}
