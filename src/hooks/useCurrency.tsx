import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface Currency {
  code: string;
  symbol: string;
  name: string;
  flag: string;
  locale: string;
  rate: number; // Exchange rate relative to UGX (base)
}

// Comprehensive list of world currencies with exchange rates relative to UGX
export const currencies: Currency[] = [
  // Africa
  { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling', flag: '🇺🇬', locale: 'en-UG', rate: 1 },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', flag: '🇰🇪', locale: 'en-KE', rate: 0.029 },
  { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling', flag: '🇹🇿', locale: 'sw-TZ', rate: 0.69 },
  { code: 'RWF', symbol: 'FRw', name: 'Rwandan Franc', flag: '🇷🇼', locale: 'rw-RW', rate: 0.35 },
  { code: 'ETB', symbol: 'Br', name: 'Ethiopian Birr', flag: '🇪🇹', locale: 'am-ET', rate: 0.015 },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', flag: '🇳🇬', locale: 'en-NG', rate: 0.42 },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi', flag: '🇬🇭', locale: 'en-GH', rate: 0.0035 },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', flag: '🇿🇦', locale: 'en-ZA', rate: 0.0048 },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound', flag: '🇪🇬', locale: 'ar-EG', rate: 0.013 },
  { code: 'MAD', symbol: 'DH', name: 'Moroccan Dirham', flag: '🇲🇦', locale: 'ar-MA', rate: 0.0027 },
  { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc', flag: '🇸🇳', locale: 'fr-SN', rate: 0.16 },
  { code: 'XAF', symbol: 'FCFA', name: 'Central African CFA Franc', flag: '🇨🇲', locale: 'fr-CM', rate: 0.16 },
  
  // Americas
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸', locale: 'en-US', rate: 0.00027 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', flag: '🇨🇦', locale: 'en-CA', rate: 0.00037 },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', flag: '🇲🇽', locale: 'es-MX', rate: 0.0046 },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', flag: '🇧🇷', locale: 'pt-BR', rate: 0.0013 },
  { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso', flag: '🇦🇷', locale: 'es-AR', rate: 0.24 },
  { code: 'COP', symbol: 'CO$', name: 'Colombian Peso', flag: '🇨🇴', locale: 'es-CO', rate: 1.1 },
  
  // Europe
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺', locale: 'de-DE', rate: 0.00025 },
  { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧', locale: 'en-GB', rate: 0.00021 },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc', flag: '🇨🇭', locale: 'de-CH', rate: 0.00024 },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', flag: '🇸🇪', locale: 'sv-SE', rate: 0.0028 },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', flag: '🇳🇴', locale: 'nb-NO', rate: 0.0029 },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty', flag: '🇵🇱', locale: 'pl-PL', rate: 0.0011 },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', flag: '🇹🇷', locale: 'tr-TR', rate: 0.0092 },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble', flag: '🇷🇺', locale: 'ru-RU', rate: 0.024 },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia', flag: '🇺🇦', locale: 'uk-UA', rate: 0.011 },
  
  // Asia
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', flag: '🇨🇳', locale: 'zh-CN', rate: 0.0019 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵', locale: 'ja-JP', rate: 0.041 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳', locale: 'hi-IN', rate: 0.023 },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee', flag: '🇵🇰', locale: 'ur-PK', rate: 0.075 },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', flag: '🇧🇩', locale: 'bn-BD', rate: 0.029 },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', flag: '🇮🇩', locale: 'id-ID', rate: 4.3 },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', flag: '🇲🇾', locale: 'ms-MY', rate: 0.0012 },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', flag: '🇵🇭', locale: 'fil-PH', rate: 0.015 },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', flag: '🇹🇭', locale: 'th-TH', rate: 0.0094 },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', flag: '🇻🇳', locale: 'vi-VN', rate: 6.6 },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', flag: '🇰🇷', locale: 'ko-KR', rate: 0.37 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', flag: '🇸🇬', locale: 'en-SG', rate: 0.00036 },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', flag: '🇭🇰', locale: 'zh-HK', rate: 0.0021 },
  { code: 'TWD', symbol: 'NT$', name: 'Taiwan Dollar', flag: '🇹🇼', locale: 'zh-TW', rate: 0.0086 },
  
  // Middle East
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', flag: '🇦🇪', locale: 'ar-AE', rate: 0.00099 },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', flag: '🇸🇦', locale: 'ar-SA', rate: 0.001 },
  { code: 'ILS', symbol: '₪', name: 'Israeli Shekel', flag: '🇮🇱', locale: 'he-IL', rate: 0.001 },
  { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal', flag: '🇶🇦', locale: 'ar-QA', rate: 0.00098 },
  { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar', flag: '🇰🇼', locale: 'ar-KW', rate: 0.000083 },
  
  // Oceania
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺', locale: 'en-AU', rate: 0.00041 },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', flag: '🇳🇿', locale: 'en-NZ', rate: 0.00045 },
];

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  formatAmount: (amountInUGX: number, showSymbol?: boolean) => string;
  formatAmountCompact: (amountInUGX: number) => string;
  convertFromUGX: (amountInUGX: number) => number;
  convertToUGX: (amount: number) => number;
  getCurrencyByCode: (code: string) => Currency | undefined;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const STORAGE_KEY = 'welile-currency';

// Detect currency based on browser locale/timezone
const detectUserCurrency = (): Currency => {
  if (typeof navigator === 'undefined') return currencies[0]; // UGX
  
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const locale = navigator.language;
    
    // Map timezones/locales to currencies
    const timezoneMap: Record<string, string> = {
      'Africa/Kampala': 'UGX',
      'Africa/Nairobi': 'KES',
      'Africa/Dar_es_Salaam': 'TZS',
      'Africa/Kigali': 'RWF',
      'Africa/Addis_Ababa': 'ETB',
      'Africa/Lagos': 'NGN',
      'Africa/Accra': 'GHS',
      'Africa/Johannesburg': 'ZAR',
      'Africa/Cairo': 'EGP',
      'Africa/Casablanca': 'MAD',
      'America/New_York': 'USD',
      'America/Los_Angeles': 'USD',
      'America/Chicago': 'USD',
      'America/Toronto': 'CAD',
      'America/Mexico_City': 'MXN',
      'America/Sao_Paulo': 'BRL',
      'Europe/London': 'GBP',
      'Europe/Paris': 'EUR',
      'Europe/Berlin': 'EUR',
      'Europe/Rome': 'EUR',
      'Europe/Madrid': 'EUR',
      'Europe/Amsterdam': 'EUR',
      'Europe/Zurich': 'CHF',
      'Europe/Stockholm': 'SEK',
      'Europe/Oslo': 'NOK',
      'Europe/Warsaw': 'PLN',
      'Europe/Istanbul': 'TRY',
      'Europe/Moscow': 'RUB',
      'Europe/Kiev': 'UAH',
      'Asia/Shanghai': 'CNY',
      'Asia/Tokyo': 'JPY',
      'Asia/Kolkata': 'INR',
      'Asia/Karachi': 'PKR',
      'Asia/Dhaka': 'BDT',
      'Asia/Jakarta': 'IDR',
      'Asia/Kuala_Lumpur': 'MYR',
      'Asia/Manila': 'PHP',
      'Asia/Bangkok': 'THB',
      'Asia/Ho_Chi_Minh': 'VND',
      'Asia/Seoul': 'KRW',
      'Asia/Singapore': 'SGD',
      'Asia/Hong_Kong': 'HKD',
      'Asia/Taipei': 'TWD',
      'Asia/Dubai': 'AED',
      'Asia/Riyadh': 'SAR',
      'Asia/Jerusalem': 'ILS',
      'Australia/Sydney': 'AUD',
      'Pacific/Auckland': 'NZD',
    };
    
    const detectedCode = timezoneMap[timezone];
    if (detectedCode) {
      const currency = currencies.find(c => c.code === detectedCode);
      if (currency) return currency;
    }
    
    // Fallback to locale-based detection
    const localeCountry = locale.split('-')[1]?.toUpperCase();
    const localeMap: Record<string, string> = {
      'UG': 'UGX', 'KE': 'KES', 'TZ': 'TZS', 'RW': 'RWF', 'ET': 'ETB',
      'NG': 'NGN', 'GH': 'GHS', 'ZA': 'ZAR', 'EG': 'EGP', 'MA': 'MAD',
      'US': 'USD', 'CA': 'CAD', 'MX': 'MXN', 'BR': 'BRL', 'AR': 'ARS',
      'GB': 'GBP', 'DE': 'EUR', 'FR': 'EUR', 'IT': 'EUR', 'ES': 'EUR',
      'CH': 'CHF', 'SE': 'SEK', 'NO': 'NOK', 'PL': 'PLN', 'TR': 'TRY',
      'RU': 'RUB', 'UA': 'UAH', 'CN': 'CNY', 'JP': 'JPY', 'IN': 'INR',
      'PK': 'PKR', 'BD': 'BDT', 'ID': 'IDR', 'MY': 'MYR', 'PH': 'PHP',
      'TH': 'THB', 'VN': 'VND', 'KR': 'KRW', 'SG': 'SGD', 'HK': 'HKD',
      'TW': 'TWD', 'AE': 'AED', 'SA': 'SAR', 'IL': 'ILS', 'AU': 'AUD',
      'NZ': 'NZD',
    };
    
    const localeCode = localeMap[localeCountry];
    if (localeCode) {
      const currency = currencies.find(c => c.code === localeCode);
      if (currency) return currency;
    }
  } catch {
    // Ignore errors
  }
  
  return currencies[0]; // Default to UGX
};

export const CurrencyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const found = currencies.find(c => c.code === stored);
        if (found) return found;
      }
    }
    return detectUserCurrency();
  });

  const setCurrency = (newCurrency: Currency) => {
    setCurrencyState(newCurrency);
    localStorage.setItem(STORAGE_KEY, newCurrency.code);
  };

  const convertFromUGX = (amountInUGX: number): number => {
    return amountInUGX * currency.rate;
  };

  const convertToUGX = (amount: number): number => {
    return amount / currency.rate;
  };

  const formatAmount = (amountInUGX: number, showSymbol = true): string => {
    const converted = convertFromUGX(amountInUGX);
    
    try {
      const formatted = new Intl.NumberFormat(currency.locale, {
        style: showSymbol ? 'currency' : 'decimal',
        currency: currency.code,
        minimumFractionDigits: currency.code === 'UGX' || currency.code === 'JPY' || currency.code === 'KRW' ? 0 : 2,
        maximumFractionDigits: currency.code === 'UGX' || currency.code === 'JPY' || currency.code === 'KRW' ? 0 : 2,
      }).format(converted);
      return formatted;
    } catch {
      return `${currency.symbol}${converted.toFixed(2)}`;
    }
  };

  const formatAmountCompact = (amountInUGX: number): string => {
    const converted = convertFromUGX(amountInUGX);
    
    if (converted >= 1000000000) {
      return `${currency.symbol}${(converted / 1000000000).toFixed(1)}B`;
    }
    if (converted >= 1000000) {
      return `${currency.symbol}${(converted / 1000000).toFixed(1)}M`;
    }
    if (converted >= 1000) {
      return `${currency.symbol}${(converted / 1000).toFixed(0)}K`;
    }
    return `${currency.symbol}${converted.toFixed(0)}`;
  };

  const getCurrencyByCode = (code: string): Currency | undefined => {
    return currencies.find(c => c.code === code);
  };

  const value: CurrencyContextType = {
    currency,
    setCurrency,
    formatAmount,
    formatAmountCompact,
    convertFromUGX,
    convertToUGX,
    getCurrencyByCode,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = (): CurrencyContextType => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};
