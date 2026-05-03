import { useEffect, useState } from 'react';

export const WELILE_BREAD_PRICE = 6500;
const DISCOUNT_RATE = 0.05;
const MIN_PAYABLE = 500;
const RECEIPT_STORAGE_KEY = 'welile.bread.receipt.v1';
export const BREAD_RECEIPT_EVENT = 'welile-bread-receipt-changed';

interface BreadReceipt {
  number: string;
  amount: number;
  savedAt: number;
}

export interface BreadPriceState {
  basePrice: number;
  reducedPrice: number;
  freeBreads: number;
  hasReceipt: boolean;
  receiptAmount: number;
}

function compute(): BreadPriceState {
  const base: BreadPriceState = {
    basePrice: WELILE_BREAD_PRICE,
    reducedPrice: WELILE_BREAD_PRICE,
    freeBreads: 0,
    hasReceipt: false,
    receiptAmount: 0,
  };
  if (typeof window === 'undefined') return base;
  try {
    const raw = localStorage.getItem(RECEIPT_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as BreadReceipt;
    if (!parsed?.amount || parsed.amount <= 0) return base;
    const credit = Math.round(parsed.amount * DISCOUNT_RATE);
    const freeBreads = Math.floor(credit / WELILE_BREAD_PRICE);
    const remainder = credit - freeBreads * WELILE_BREAD_PRICE;
    const nextDiscount = Math.min(remainder, Math.max(0, WELILE_BREAD_PRICE - MIN_PAYABLE));
    const reducedPrice = freeBreads > 0 ? 0 : Math.max(MIN_PAYABLE, WELILE_BREAD_PRICE - nextDiscount);
    return {
      basePrice: WELILE_BREAD_PRICE,
      reducedPrice,
      freeBreads,
      hasReceipt: true,
      receiptAmount: parsed.amount,
    };
  } catch {
    return base;
  }
}

export function useBreadReceiptPrice(): BreadPriceState {
  const [state, setState] = useState<BreadPriceState>(() => compute());

  useEffect(() => {
    const refresh = () => setState(compute());
    window.addEventListener(BREAD_RECEIPT_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(BREAD_RECEIPT_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return state;
}