import { PaymentMethod } from '@/components/payments/PaymentMethodCard';

export const LOCAL_PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'mtn-momo',
    name: 'MTN Mobile Money',
    type: 'momo',
    region: 'local',
    fee: '1%',
    feeAmount: 0.01,
    eta: 'Instant',
  },
  {
    id: 'airtel-money',
    name: 'Airtel Money',
    type: 'airtel',
    region: 'local',
    fee: '1%',
    feeAmount: 0.01,
    eta: 'Instant',
  },
  {
    id: 'bank-transfer-local',
    name: 'Bank Transfer (UGX)',
    type: 'bank',
    region: 'local',
    fee: '0.5%',
    feeAmount: 0.005,
    eta: '1-2 hours',
    currencies: ['UGX'],
  },
  {
    id: 'welile-wallet',
    name: 'Welile Wallet',
    type: 'wallet',
    region: 'local',
    fee: 'Free',
    feeAmount: 0,
    eta: 'Instant',
  },
];

export const INTERNATIONAL_PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'card-visa-mc',
    name: 'Visa / Mastercard',
    type: 'card',
    region: 'international',
    fee: '2.9%',
    feeAmount: 0.029,
    eta: 'Instant',
    currencies: ['USD', 'EUR', 'GBP'],
  },
  {
    id: 'bank-transfer-intl',
    name: 'International Bank Transfer',
    type: 'bank',
    region: 'international',
    fee: '1.5%',
    feeAmount: 0.015,
    eta: '2-5 days',
    currencies: ['USD', 'EUR', 'GBP'],
  },
  {
    id: 'mobile-money-africa',
    name: 'Mobile Money (Africa)',
    type: 'international',
    region: 'international',
    fee: '2%',
    feeAmount: 0.02,
    eta: '1-24 hours',
    currencies: ['KES', 'TZS', 'GHS', 'ZAR'],
  },
];

export const ALL_PAYMENT_METHODS = [...LOCAL_PAYMENT_METHODS, ...INTERNATIONAL_PAYMENT_METHODS];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  UGX: 'UGX',
  USD: '$',
  EUR: '€',
  GBP: '£',
  KES: 'KES',
  TZS: 'TZS',
  GHS: 'GHS',
  ZAR: 'ZAR',
};

export const SUPPORTED_CURRENCIES = ['UGX', 'USD', 'EUR', 'GBP'];

export function formatCurrency(amount: number, currency: string = 'UGX'): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  return `${symbol} ${amount.toLocaleString()}`;
}

export function calculateFee(amount: number, method: PaymentMethod): number {
  if (!method.feeAmount) return 0;
  return Math.round(amount * method.feeAmount);
}
