/**
 * Uganda Commercial Banks — for payout method selection
 */
export const UGANDA_BANKS = [
  'Stanbic Bank Uganda',
  'Standard Chartered Bank Uganda',
  'ABSA Bank Uganda',
  'Centenary Bank',
  'DFCU Bank',
  'Equity Bank Uganda',
  'Bank of Africa Uganda',
  'Housing Finance Bank',
  'Orient Bank',
  'Cairo International Bank',
  'Tropical Bank',
  'Finance Trust Bank',
  'Post Bank Uganda',
  'Guaranty Trust Bank Uganda',
  'United Bank for Africa (UBA)',
  'Ecobank Uganda',
  'Bank of India Uganda',
  'Citibank Uganda',
  'Bank of Baroda Uganda',
  'NC Bank Uganda',
  'Opportunity Bank Uganda',
  'KCB Bank Uganda',
  'Diamond Trust Bank Uganda',
  'Prime Capital Holdings',
] as const;

export const PAYOUT_METHODS = [
  { value: 'mobile_money', label: 'Mobile Money', icon: '📱' },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: '🏦' },
  { value: 'cash', label: 'Cash Pickup', icon: '💵' },
] as const;

export type PayoutMethod = typeof PAYOUT_METHODS[number]['value'];
