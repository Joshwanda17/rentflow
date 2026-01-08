// Country codes for common East African and nearby countries
const COUNTRY_PREFIXES: Record<string, { code: string; name: string; flag: string }> = {
  '256': { code: '256', name: 'Uganda', flag: '🇺🇬' },
  '254': { code: '254', name: 'Kenya', flag: '🇰🇪' },
  '255': { code: '255', name: 'Tanzania', flag: '🇹🇿' },
  '250': { code: '250', name: 'Rwanda', flag: '🇷🇼' },
  '257': { code: '257', name: 'Burundi', flag: '🇧🇮' },
  '211': { code: '211', name: 'South Sudan', flag: '🇸🇸' },
  '243': { code: '243', name: 'DR Congo', flag: '🇨🇩' },
  '234': { code: '234', name: 'Nigeria', flag: '🇳🇬' },
  '27': { code: '27', name: 'South Africa', flag: '🇿🇦' },
  '44': { code: '44', name: 'UK', flag: '🇬🇧' },
  '1': { code: '1', name: 'USA/Canada', flag: '🇺🇸' },
};

export interface PhoneInfo {
  original: string;
  formatted: string;
  whatsappLink: string;
  countryCode: string;
  countryName: string;
  countryFlag: string;
  isUgandan: boolean;
}

/**
 * Parse and format a phone number for WhatsApp
 * Assumes Ugandan numbers if no country code is provided
 */
export function parsePhoneNumber(phone: string): PhoneInfo {
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Remove leading + if present
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  
  // Default to Uganda
  let countryCode = '256';
  let countryName = 'Uganda';
  let countryFlag = '🇺🇬';
  let isUgandan = true;
  let nationalNumber = cleaned;
  
  // Check if number starts with a known country code
  for (const [prefix, info] of Object.entries(COUNTRY_PREFIXES)) {
    if (cleaned.startsWith(prefix)) {
      countryCode = info.code;
      countryName = info.name;
      countryFlag = info.flag;
      isUgandan = prefix === '256';
      nationalNumber = cleaned.substring(prefix.length);
      break;
    }
  }
  
  // If number starts with 0, it's likely a local Ugandan number
  if (cleaned.startsWith('0')) {
    nationalNumber = cleaned.substring(1);
    countryCode = '256';
    countryName = 'Uganda';
    countryFlag = '🇺🇬';
    isUgandan = true;
  }
  
  // If number is 9-10 digits and doesn't start with a country code, assume Uganda
  if (cleaned.length >= 9 && cleaned.length <= 10 && !Object.keys(COUNTRY_PREFIXES).some(p => cleaned.startsWith(p))) {
    nationalNumber = cleaned.startsWith('0') ? cleaned.substring(1) : cleaned;
    countryCode = '256';
    countryName = 'Uganda';
    countryFlag = '🇺🇬';
    isUgandan = true;
  }
  
  // Build the full international number
  const fullNumber = countryCode + nationalNumber;
  
  // Format for display
  const formatted = `+${countryCode} ${nationalNumber}`;
  
  // WhatsApp link
  const whatsappLink = `https://wa.me/${fullNumber}`;
  
  return {
    original: phone,
    formatted,
    whatsappLink,
    countryCode,
    countryName,
    countryFlag,
    isUgandan
  };
}

/**
 * Get WhatsApp link for a phone number
 */
export function getWhatsAppLink(phone: string): string {
  return parsePhoneNumber(phone).whatsappLink;
}
