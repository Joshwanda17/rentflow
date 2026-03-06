import { useState, useEffect, useRef } from 'react';
import { useCurrency } from '@/hooks/useCurrency';

interface AnimatedBalanceProps {
  value: number;
  className?: string;
}

export function AnimatedBalance({ value, className = '' }: AnimatedBalanceProps) {
  const { formatAmount, formatAmountCompact } = useCurrency();

  const formatBalance = (amount: number) => {
    if (amount >= 1000000) {
      return formatAmountCompact(amount);
    }
    return formatAmount(amount);
  };

  return (
    <span className={className}>
      {formatBalance(value)}
    </span>
  );
}
