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

/**
 * Normalize a phone number by removing all non-digit characters
 */
export function cleanPhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Generate all possible email variants for a phone number
 * This helps users who may have registered with different formats
 * Returns objects with email and display format
 */
export function generatePhoneEmailVariantsWithDisplay(phone: string): { email: string; display: string }[] {
  const cleaned = cleanPhoneNumber(phone);
  const variants: { email: string; display: string }[] = [];
  const seen = new Set<string>();
  
  const addVariant = (num: string, suffix: string) => {
    const email = `${num}@welile.${suffix}`;
    if (!seen.has(email)) {
      seen.add(email);
      // Format display nicely
      let display = num;
      if (num.startsWith('256') && num.length >= 12) {
        display = `+256 ${num.slice(3)}`;
      } else if (num.startsWith('0')) {
        display = num;
      } else if (num.length === 9) {
        display = `0${num}`;
      }
      variants.push({ email, display: `${display} (${suffix})` });
    }
  };
  
  // Original cleaned version
  addVariant(cleaned, 'user');
  
  // If starts with country code (256 for Uganda), also try without
  if (cleaned.startsWith('256') && cleaned.length > 9) {
    const withoutCountryCode = cleaned.slice(3);
    addVariant(withoutCountryCode, 'user');
    addVariant(`0${withoutCountryCode}`, 'user');
  }
  
  // If starts with 0, also try without the 0
  if (cleaned.startsWith('0') && cleaned.length >= 10) {
    const withoutLeadingZero = cleaned.slice(1);
    addVariant(withoutLeadingZero, 'user');
    addVariant(`256${withoutLeadingZero}`, 'user');
  }
  
  // If doesn't start with 0 or 256, try adding them
  if (!cleaned.startsWith('0') && !cleaned.startsWith('256') && cleaned.length >= 9) {
    addVariant(`0${cleaned}`, 'user');
    addVariant(`256${cleaned}`, 'user');
  }
  
  // Also check for agent emails
  addVariant(cleaned, 'agent');
  if (cleaned.startsWith('0')) {
    addVariant(cleaned.slice(1), 'agent');
    addVariant(`256${cleaned.slice(1)}`, 'agent');
  }
  
  return variants;
}

/**
 * Get display-friendly list of phone formats being tried
 */
export function getTriedPhoneFormats(phone: string): string[] {
  const variants = generatePhoneEmailVariantsWithDisplay(phone);
  // Return unique display formats (without the email suffix)
  const formats = new Set<string>();
  for (const v of variants) {
    const displayWithoutSuffix = v.display.replace(/ \(user\)| \(agent\)/g, '');
    formats.add(displayWithoutSuffix);
  }
  return [...formats];
}

/**
 * Generate all possible email variants for a phone number (string array version)
 */
export function generatePhoneEmailVariants(phone: string): string[] {
  return generatePhoneEmailVariantsWithDisplay(phone).map(v => v.email);
}

/**
 * Validate if phone number looks valid
 */
export function isValidPhoneNumber(phone: string): boolean {
  const cleaned = cleanPhoneNumber(phone);
  // Accept 9-12 digits (local or with country code)
  return cleaned.length >= 9 && cleaned.length <= 12;
}

/**
 * Validate any global phone number.
 * Accepts numbers with country codes, or bare local numbers (9+ digits).
 * Detects fake numbers like sequential/repeated digits.
 */
export function isValidPhoneNumberGlobal(phone: string): {
  valid: boolean;
  reason?: string;
} {
  const cleaned = cleanPhoneNumber(phone);

  // Must be 7+ digits (some countries have short numbers)
  if (cleaned.length < 7) {
    return { valid: false, reason: 'Phone number must have at least 7 digits' };
  }

  if (cleaned.length > 15) {
    return { valid: false, reason: 'Phone number is too long' };
  }

  // Reject all-same digits (e.g. 0000000000, 1111111111)
  const lastDigits = cleaned.slice(-7);
  if (/^(\d)\1{6,}$/.test(lastDigits)) {
    return { valid: false, reason: 'Phone number looks invalid (repeated digits)' };
  }

  // Reject sequential ascending/descending (1234567, 7654321)
  const isSequential = (s: string) => {
    let asc = true, desc = true;
    for (let i = 1; i < s.length; i++) {
      if (parseInt(s[i]) !== parseInt(s[i-1]) + 1) asc = false;
      if (parseInt(s[i]) !== parseInt(s[i-1]) - 1) desc = false;
    }
    return asc || desc;
  };
  if (isSequential(lastDigits)) {
    return { valid: false, reason: 'Phone number looks invalid (sequential digits)' };
  }

  return { valid: true };
}

/**
 * @deprecated Use isValidPhoneNumberGlobal instead. Kept for backward compatibility.
 */
export function isValidUgandanPhoneNumber(phone: string): {
  valid: boolean;
  reason?: string;
} {
  return isValidPhoneNumberGlobal(phone);
}
